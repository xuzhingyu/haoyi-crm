"""Real OIDC acceptance, restricted to disposable validation services.

Run inside haoyi-core-validation with the mounted script and temporary auth
JSON. Prints only check names/status/counts, never bodies, credentials or URLs.
No model, research, or remote ingestion endpoint is invoked.
"""
import argparse
import base64
import json
import os
import sys
import time
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener
from uuid import UUID, uuid4

LEGACY = "http://haoyi-legacy-validation:8000/api"
CORE = "http://haoyi-core-validation:8000/api/v1"
SUBJECTS = {"operator": "00000000-0000-4000-8000-000000000011",
            "ceo": "00000000-0000-4000-8000-000000000012"}


class CheckFailure(Exception):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Runner:
    def __init__(self):
        self.passed = 0
        self.current = "initialization"
        self.opener = build_opener(ProxyHandler({}), NoRedirect())
        self.tokens = {}
        self.run_id = uuid4().hex[:12]

    def check(self, name, condition, status=None):
        self.current = name
        if not condition:
            print(json.dumps({"check": name, "status": status, "passed": False}), flush=True)
            raise CheckFailure()
        self.passed += 1
        print(json.dumps({"check": name, "status": status, "passed": True}), flush=True)

    def http(self, name, base, path, *, method="GET", account="operator", data=None,
             raw=None, content_type=None, expected=(200,), binary=False):
        self.current = name
        if base not in {LEGACY, CORE} or not path.startswith("/") or ".." in path or "://" in path:
            raise CheckFailure()
        if method != "GET" and ("/assistance" in path or "/ai/" in path or "/research" in path):
            raise CheckFailure()
        headers = {"Accept": "application/json", "X-Request-ID": str(uuid4())}
        if account:
            headers["Authorization"] = "Bearer " + self.tokens[account]
        if data is not None:
            raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json"
        elif content_type:
            headers["Content-Type"] = content_type
        try:
            with self.opener.open(Request(base + path, data=raw, headers=headers, method=method), timeout=40) as response:
                status, body = response.status, response.read(16 * 1024 * 1024)
        except HTTPError as exc:
            status, body = exc.code, exc.read(1024 * 1024)
        except (URLError, TimeoutError, OSError):
            self.check(name, False)
        self.check(name, status in expected, status)
        if binary or not body:
            return body
        try:
            return json.loads(body)
        except (ValueError, UnicodeError):
            self.check(name + ".json", False, status)

    def studio(self, kind, data, *, name=None, key=None, expected=(200,)):
        return self.http(name or "studio.create." + kind, LEGACY, "/studio/records/" + kind,
            method="POST", data={"data": data, "request_key": key or str(uuid4())}, expected=expected)

    def edit(self, kind, row, data, *, name=None, expected=(200,)):
        return self.http(name or "studio.edit." + kind, LEGACY, f"/studio/records/{kind}/{row['id']}",
            method="PATCH", data={"data": data, "version": row["version"], "request_key": str(uuid4())}, expected=expected)


def load_accounts(r, filename):
    r.current = "auth-file"
    value = json.loads(Path(filename).read_text(encoding="utf-8-sig"))
    for account in value.get("accounts", []):
        token = account.get("access_token", "")
        try:
            encoded = token.split(".")[1]
            claims = json.loads(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)))
        except (ValueError, IndexError, UnicodeError):
            continue
        for name, subject in SUBJECTS.items():
            if claims.get("sub") == subject:
                r.check("token-lifetime." + name, claims.get("exp", 0) > time.time() + 90)
                r.tokens[name] = token
    r.check("two-accounts-present", set(r.tokens) == set(SUBJECTS))


def clone_database(r, seed, existing_claim):
    from sqlalchemy import func, select
    from sqlalchemy.engine import make_url
    from lead_core.config import get_settings
    from lead_core.db import apply_rls_context, build_engine, build_session_factory
    from lead_core.domain.claims import ClaimPolicy
    from lead_core.intelligence.models import ModelCall
    from lead_core.models import Claim, Franchisee, LeadListing, Membership, RepairBusiness

    settings = get_settings()
    database_name = make_url(settings.database_url).database or ""
    r.check("clone-database-guard", os.getenv("HAOYI_CLONE_VALIDATION") == "1"
        and database_name == "haoyi_validation_upgrade")
    target = urlparse(settings.legacy_crm_api_url)
    r.check("clone-bridge-target", target.hostname == "haoyi-legacy-validation"
        and target.port == 8000 and target.path in {"", "/"})
    r.check("model-disabled", not settings.llm_api_key and not settings.autoloop_base_url)
    engine = build_engine(settings.database_url)
    factory = build_session_factory(engine)

    def model_count():
        with factory() as session:
            apply_rls_context(session, is_worker=True)
            return session.scalar(select(func.count()).select_from(ModelCall))

    initial_calls = model_count()
    if seed:
        with factory() as session:
            apply_rls_context(session, is_worker=True)
            org_id, user_id = str(uuid4()), str(uuid4())
            session.add(Franchisee(id=org_id, name="Clone acceptance " + r.run_id, status="active"))
            session.flush()
            session.add(Membership(franchisee_id=org_id, user_id=user_id, role="franchise_owner"))
            business = RepairBusiness(business_name="Clone bridge " + r.run_id, city="验收市", district="验收区", category="维修")
            session.add(business)
            session.flush()
            listing = LeadListing(business_id=business.id, status="claimed", claimed_by_org_id=org_id)
            session.add(listing)
            session.flush()
            deadlines = ClaimPolicy().deadlines_for(datetime.now(UTC))
            claim = Claim(listing_id=listing.id, org_id=org_id, user_id=user_id, idempotency_key=r.run_id,
                first_touch_due=deadlines.first_touch_due, activity_due=deadlines.activity_due, protected_until=deadlines.protected_until)
            session.add(claim)
            session.commit()
            existing_claim = claim.id
        r.check("clone-claim-fixture", bool(existing_claim))
    r.check("claim-fixture-present", bool(existing_claim))
    UUID(existing_claim)
    return existing_claim, model_count, initial_calls, engine


def identity_checks(r):
    for account, expected_id, role in (("operator", 1, "operator"), ("ceo", 2, "executive")):
        legacy = r.http("identity.legacy." + account, LEGACY, "/auth/me", account=account)
        r.check("mapping." + account, legacy["id"] == expected_id and legacy["role"] == role)
        core = r.http("identity.core." + account, CORE, "/me", account=account)
        r.check("subject." + account, core["user_id"] == SUBJECTS[account] and core["is_hq"])
    r.http("anonymous-denied", LEGACY, "/leads", account=None, expected=(401,))
    r.http("old-password-disabled", LEGACY, "/auth/login", method="POST", account=None,
        data={"username": "invalid-validation-user", "password": "not-a-real-credential"}, expected=(410,))
    r.http("ceo-create-denied", LEGACY, "/leads", method="POST", account="ceo",
        data={"shop_name": "Must never be created"}, expected=(403,))
    r.http("ceo-private-studio-denied", LEGACY, "/studio/records/contract", account="ceo", expected=(403,))


def business_checks(r):
    today = date.today().isoformat()
    province, city = "验收省" + r.run_id, "验收市" + r.run_id

    def franchise(suffix):
        lead = r.http("lead.create." + suffix, LEGACY, "/leads", method="POST",
            data={"shop_name": "验收门店" + r.run_id + suffix, "province": province, "city": city, "source": "isolated validation"})
        follow = r.http("followup.create." + suffix, LEGACY, f"/leads/{lead['id']}/follow-ups", method="POST",
            data={"status": "跟进中", "note": "CLONE-PRIVATE-NOTE", "due_date": today})
        r.http("followup.complete." + suffix, LEGACY, f"/follow-ups/{follow['id']}/complete", method="POST")
        hidden = r.http("ceo.lead-view." + suffix, LEGACY, f"/leads/{lead['id']}", account="ceo")
        r.check("ceo.private-note-hidden." + suffix, "CLONE-PRIVATE-NOTE" not in json.dumps(hidden))
        opportunity = r.http("lead.convert." + suffix, LEGACY, f"/leads/{lead['id']}/convert", method="POST",
            data={"opportunity_type": "franchise", "stage": "合格加盟机会"})
        signed = r.http("opportunity.sign." + suffix, LEGACY, f"/opportunities/{opportunity['id']}/sign", method="POST")
        r.check("sign.delivery-plan." + suffix, signed["status"] == "筹建中" and bool(signed["delivery"]) and bool(signed["support"]))
        return lead, signed

    lead, first = franchise("A")
    _, second = franchise("B")
    training = r.http("training.create", LEGACY, "/trainings", method="POST", data={"franchise_id": first["id"], "training_name": "验收培训"})
    done = r.http("training.complete", LEGACY, f"/trainings/{training['id']}/complete", method="POST")
    r.check("training.completed-state", done["status"] == "已完成")
    r.http("territory.exclusive", LEGACY, f"/franchises/{first['id']}/territories", method="POST", data={"province": province, "city": city, "exclusive": True})
    r.http("territory.conflict-denied", LEGACY, f"/franchises/{second['id']}/territories", method="POST", data={"province": province, "city": city, "exclusive": True}, expected=(409,))
    fields = r.http("opportunity.full-list", LEGACY, "/opportunities?detail=true")
    r.check("opportunity.full-fields", bool(fields) and all("opportunity_type" in x and "lead_id" in x for x in fields))

    boundary = "ValidationBoundary" + r.run_id
    csv = f"门店名称,省份,城市\n验收导入店{r.run_id},{province},{city}\n".encode("utf-8-sig")
    multipart = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="validation.csv"\r\nContent-Type: text/csv\r\n\r\n'.encode() + csv + f"\r\n--{boundary}--\r\n".encode())
    content_type = "multipart/form-data; boundary=" + boundary
    preview = r.http("import.preview", LEGACY, "/imports/preview", method="POST", raw=multipart, content_type=content_type)
    r.check("import.preview-count", preview["valid_rows"] == 1)
    uploaded = r.http("import.upload", LEGACY, "/imports/upload", method="POST", raw=multipart, content_type=content_type, expected=(201,))
    replay = r.http("import.file-replay", LEGACY, "/imports/upload", method="POST", raw=multipart, content_type=content_type)
    r.check("import.file-idempotency", replay["id"] == uploaded["id"] and replay["idempotent"])
    batches = r.http("batch.list", LEGACY, "/batches")
    batch = next(x for x in batches if x["target_region"] == city)
    r.http("batch.review", LEGACY, f"/batches/{batch['id']}/review", method="POST")
    r.http("batch.exclusive-dispatch-denied", LEGACY, f"/batches/{batch['id']}/dispatch", method="POST", data={"franchise_id": second["id"]}, expected=(409,))
    r.http("batch.dispatch", LEGACY, f"/batches/{batch['id']}/dispatch", method="POST", data={"franchise_id": first["id"]})
    r.http("batch.feedback", LEGACY, f"/batches/{batch['id']}/feedback", method="POST", data={"text": "已联系验收门店，有加盟意向"})
    draft = r.http("batch.rule-draft", LEGACY, f"/batches/{batch['id']}/draft", method="POST")
    confirmed = r.http("batch.confirm", LEGACY, f"/drafts/{draft['id']}/confirm", method="POST")
    r.check("batch.confirmed", confirmed["confirmed"] is True)
    r.http("batch.quality", LEGACY, f"/batches/{batch['id']}/quality", method="POST", data={"quality": "较好", "reason": "隔离验收记录"})
    return lead


def studio_checks(r):
    today = date.today().isoformat()
    party = r.studio("party", {"name": "验收合作方" + r.run_id, "category": "加盟店"})
    partner = r.studio("party", {"name": "验收机构" + r.run_id, "category": "机构"})
    r.studio("relationship", {"from_id": party["id"], "to_id": partner["id"], "relationship": "合资", "headquarters_share": 70, "partner_share": 40}, name="relationship.invalid-share", expected=(422,))
    r.studio("relationship", {"from_id": party["id"], "to_id": partner["id"], "relationship": "服务区域"})
    contract = r.studio("contract", {"party_id": party["id"], "name": "验收合同", "signed_on": today, "basis": "到账"})
    key = str(uuid4())
    payment_data = {"contract_id": contract["id"], "amount": "100.10", "paid_on": today, "evidence": "隔离验收凭证"}
    payment = r.studio("payment", payment_data, key=key)
    replay = r.studio("payment", payment_data, key=key, name="payment.replay")
    r.check("payment.idempotency", replay["id"] == payment["id"])
    r.studio("payment", {**payment_data, "direction": "退款", "amount": "101"}, name="payment.over-refund-denied", expected=(400,))
    r.studio("payment", {**payment_data, "direction": "退款", "amount": "0.10"}, name="payment.refund")
    r.edit("payment", payment, {"amount": "1"}, name="payment.immutable", expected=(400,))
    one = r.studio("enrollment", {"contract_id": contract["id"], "name": "验收学员甲"})
    r.studio("enrollment", {"contract_id": contract["id"], "name": "验收学员乙"})
    r.studio("enrollment", {"contract_id": contract["id"], "name": "验收学员丙"}, name="enrollment.capacity-denied", expected=(400,))
    extra = r.studio("enrollment", {"contract_id": contract["id"], "name": "验收学员丁", "category": "额外"})
    r.check("enrollment.price-snapshot", Decimal(extra["price"]) == Decimal("6800"))
    r.edit("enrollment", one, {"status": "已完成", "completed_on": today}, name="enrollment.complete")
    repair = r.studio("repair", {"contract_id": contract["id"], "name": "验收维修单", "dispatched": "60000", "dispatched_on": today, "evidence": "隔离验收派单凭证"})
    amounts = {name: "60000" for name in ("completed", "settled", "received")}
    amounts.update({name + "_on": today for name in ("completed", "settled", "received")})
    r.edit("repair", repair, amounts, name="repair.settle-and-receive")
    totals = r.http("contract.totals", LEGACY, f"/studio/contracts/{contract['id']}/totals")
    r.check("contract.money-and-capacity", Decimal(totals["franchise_paid"]) == Decimal("100") and totals["seats_remaining"] == 0 and totals["fulfillment"] == "已兑现")
    updated = r.edit("party", party, {"status": "合作中"}, name="party.update")
    r.check("party.version-increment", updated["version"] > party["version"])
    r.edit("party", party, {"status": "已暂停"}, name="party.stale-version-denied", expected=(409,))
    note = r.studio("note", {"party_id": party["id"], "summary": "隔离验收沟通事实", "next_action": "隔离验收待办", "due_date": today})
    r.http("studio.action-complete", LEGACY, f"/studio/actions/{note['action_id']}", method="PATCH",
        data={"title": "隔离验收待办", "status": "已完成", "result": "隔离验收完成", "due_date": today})
    actions = r.http("actions.completed-visible", LEGACY, "/actions?include_done=true")
    r.check("actions.completed-persisted", any(x["id"] == note["action_id"] and x["done"] for x in actions))
    report = r.studio("report", {"name": "验收经营报告" + r.run_id, "start": today, "end": today})
    hidden = r.http("studio.report-unpublished-hidden", LEGACY, "/studio/records/report", account="ceo")
    r.check("studio.report-draft-boundary", all(x["id"] != report["id"] for x in hidden))
    r.edit("report", report, {"status": "已发布"}, name="studio.report-publish")
    visible = r.http("studio.report-ceo-read", LEGACY, "/studio/records/report", account="ceo")
    r.check("studio.report-published-visible", any(x["id"] == report["id"] for x in visible))
    template = r.http("report.template-create", LEGACY, "/reports", method="POST", data={"report_name": "验收快照" + r.run_id, "period": "本月"}, expected=(201,))
    r.http("report.unpublished-export-denied", LEGACY, f"/reports/{template['id']}.pdf", account="ceo", expected=(403,))
    r.http("report.template-publish", LEGACY, f"/reports/{template['id']}/publish", method="POST")
    pdf = r.http("report.pdf-export", LEGACY, f"/reports/{template['id']}.pdf", account="ceo", binary=True)
    pptx = r.http("report.pptx-export", LEGACY, f"/reports/{template['id']}.pptx", account="ceo", binary=True)
    r.check("report.export-file-signatures", pdf.startswith(b"%PDF") and pptx.startswith(b"PK"))


def bridge_checks(r, claim_id):
    path = f"/claims/{claim_id}/import-crm"
    r.http("bridge.ceo-import-denied", CORE, path, method="POST", account="ceo", data={"confirmed": True}, expected=(403,))
    r.http("bridge.confirmation-required", CORE, path, method="POST", data={"confirmed": False}, expected=(422,))
    first = r.http("bridge.import", CORE, path, method="POST", data={"confirmed": True})
    second = r.http("bridge.import-replay", CORE, path, method="POST", data={"confirmed": True})
    r.check("bridge.single-import", first["status"] == "confirmed" and second["id"] == first["id"]
        and first["execution_result"]["entity_id"] == second["execution_result"]["entity_id"])
    lead_id = first["execution_result"]["entity_id"]
    imported = r.http("bridge.old-record-present", LEGACY, f"/leads/{lead_id}")
    opportunity = r.http("bridge.imported-lead-convert", LEGACY, f"/leads/{imported['id']}/convert", method="POST", data={"opportunity_type": "franchise", "stage": "待核实"})
    suggestion = r.http("bridge.stage-proposal", CORE, "/legacy-proposals", method="POST",
        data={"target_id": opportunity["id"], "stage": "方案沟通", "stage_reason": "隔离验收人工确认"}, expected=(201,))
    confirm = f"/proposals/{suggestion['id']}/confirm"
    r.http("bridge.ceo-stage-denied", CORE, confirm, method="POST", account="ceo", data={"confirmed": True}, expected=(403,))
    completed = r.http("bridge.stage-confirm", CORE, confirm, method="POST", data={"confirmed": True})
    replay = r.http("bridge.stage-replay", CORE, confirm, method="POST", data={"confirmed": True})
    r.check("bridge.single-stage-operation", completed["status"] == "confirmed" and replay["execution_result"] == completed["execution_result"])
    history = r.http("bridge.old-audit-present", LEGACY, f"/opportunities/{opportunity['id']}/history")
    r.check("bridge.one-stage-event", sum(x["action"] == "update" for x in history) == 1)
    changed = r.http("bridge.old-stage-read", LEGACY, "/opportunities?detail=true")
    r.check("bridge.stage-persisted", next(x for x in changed if x["id"] == opportunity["id"])["stage"] == "方案沟通")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--auth-file", default="/opt/haoyi-workspace/shared/integration-auth.json")
    parser.add_argument("--seed-claim", action="store_true")
    parser.add_argument("--claim-id")
    args = parser.parse_args()
    r = Runner()
    engine = None
    try:
        load_accounts(r, args.auth_file)
        claim, count_models, calls_before, engine = clone_database(r, args.seed_claim, args.claim_id)
        identity_checks(r)
        business_checks(r)
        studio_checks(r)
        bridge_checks(r, claim)
        r.check("zero-model-calls", count_models() == calls_before)
        print(json.dumps({"summary": "passed", "passed": r.passed, "failed": 0}), flush=True)
        return 0
    except Exception:
        # Error strings can contain URLs, payloads or tokens. Do not print them.
        print(json.dumps({"summary": "failed", "check": r.current, "passed": r.passed, "failed": 1}), flush=True)
        return 1
    finally:
        if engine is not None:
            engine.dispose()


if __name__ == "__main__":
    sys.exit(main())
