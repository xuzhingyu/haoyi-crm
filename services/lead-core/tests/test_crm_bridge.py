import json
from datetime import UTC, datetime, timedelta
from uuid import UUID

import httpx
import pytest
from conftest import auth_headers
from sqlalchemy import func, select

from lead_core.domain.claims import ClaimPolicy
from lead_core.intelligence import crm_bridge
from lead_core.intelligence.models import Proposal
from lead_core.models import AuditEvent, Claim, ContactPreference, LeadListing, RepairBusiness

SUBJECT = "00000000-0000-4000-8000-000000000011"
ADMIN = {**auth_headers(user=SUBJECT, roles="hq_admin,hq_franchise_manager"), "Authorization": "Bearer test-operator-token"}
CEO = {**auth_headers(user="00000000-0000-4000-8000-000000000012", roles="hq_executive"), "Authorization": "Bearer test-ceo-token"}
FRANCHISE = auth_headers(user="franchise", org="org-a", roles="franchise_owner")


def seed_claim(client):
    with client.app.state.session_factory() as session:
        business = RepairBusiness(business_name="Public repair business", city="南京市", district="浦口区", category="维修", full_address="Business premises")
        session.add(business)
        session.flush()
        listing = LeadListing(business_id=business.id, status="claimed", claimed_by_org_id="org-a")
        session.add(listing)
        session.flush()
        dates = ClaimPolicy().deadlines_for(datetime.now(UTC))
        claim = Claim(listing_id=listing.id, org_id="org-a", user_id="franchise", idempotency_key="bridge-test",
            first_touch_due=dates.first_touch_due, activity_due=dates.activity_due, protected_until=dates.protected_until)
        session.add(claim)
        session.commit()
        return claim.id


class LegacyService:
    """Implements the frozen legacy bridge HTTP contract, including request replay."""
    def __init__(self):
        self.posts = []
        self.gets = []
        self.receipts = {}
        self.fail_after_apply = False
        self.fail_before_apply = False
        self.version = "2026-11-05T01:00:00.000001+00:00"

    def response(self, method, url, status, value):
        return httpx.Response(status, json=value, request=httpx.Request(method, url))

    def post(self, url, *, headers, json, **kwargs):
        assert headers["X-Haoyi-Bridge-Token"] == "test-bridge-service"
        assert headers["Authorization"] == ADMIN["Authorization"]
        assert json["confirmed"] is True
        UUID(json["request_id"])
        self.posts.append({"url": url, "body": json.copy()})
        if self.fail_before_apply:
            self.fail_before_apply = False
            raise httpx.ConnectError("connection lost")
        existing = self.receipts.get(json["request_id"])
        if existing:
            assert existing["body"] == json
            return self.response("POST", url, 200, {**existing["result"], "replayed": True})
        entity_type = "lead" if url.endswith("/import-lead") else "opportunity"
        if entity_type == "opportunity" and json["expected_version"] != self.version:
            return self.response("POST", url, 409, {"detail": "stale version"})
        result = {"request_id": json["request_id"], "status": "applied", "entity_type": entity_type,
                  "entity_id": 71 if entity_type == "lead" else json["entity_id"], "version": self.version, "replayed": False}
        self.receipts[json["request_id"]] = {"actor_sub": SUBJECT, "result": result, "body": json.copy()}
        if self.fail_after_apply:
            self.fail_after_apply = False
            raise httpx.ReadTimeout("response lost after commit")
        return self.response("POST", url, 200, result)

    def get(self, url, *, headers, **kwargs):
        assert headers["X-Haoyi-Bridge-Token"] == "test-bridge-service"
        self.gets.append({"url": url, "headers": headers.copy()})
        if "/entities/opportunity/" in url:
            return self.response("GET", url, 200, {"entity_type": "opportunity", "entity_id": int(url.rsplit("/", 1)[1]), "version": self.version, "status": "active", "stage": "待核实"})
        # Reconciliation only ever uses the service token, never a retained user JWT.
        assert "Authorization" not in headers
        receipt = self.receipts.get(url.rsplit("/", 1)[1])
        return self.response("GET", url, 200 if receipt else 404, {"actor_sub": receipt["actor_sub"], "result": receipt["result"]} if receipt else {})


@pytest.fixture
def legacy(settings, monkeypatch):
    settings.legacy_crm_api_url = "http://legacy-crm:8000"
    settings.legacy_bridge_token = "test-bridge-service"
    service = LegacyService()
    monkeypatch.setattr(crm_bridge.httpx, "get", service.get)
    monkeypatch.setattr(crm_bridge.httpx, "post", service.post)
    return service


def test_import_requires_confirmation_and_operator(client, legacy):
    claim = seed_claim(client)
    path = f"/api/v1/claims/{claim}/import-crm"
    for headers in (CEO, FRANCHISE):
        assert client.post(path, headers=headers, json={"confirmed": True}).status_code == 403
    assert client.post(path, headers=ADMIN, json={"confirmed": False}).status_code == 422
    assert client.post(path, headers=auth_headers(user=SUBJECT, roles="hq_admin"), json={"confirmed": True}).status_code == 401
    assert legacy.posts == []


@pytest.mark.parametrize("blocked", ["released", "dnc", "available", "wrong_org", "listing_cooldown", "preference_dnc", "preference_cooldown", "expired_untouched"])
def test_import_enforces_claim_and_contact_eligibility(client, legacy, blocked):
    ident = seed_claim(client)
    with client.app.state.session_factory() as session:
        claim = session.get(Claim, ident)
        listing = session.get(LeadListing, claim.listing_id)
        if blocked == "released":
            claim.status = "released"
        elif blocked == "dnc":
            listing.dnc_at = datetime.now(UTC)
        elif blocked == "available":
            listing.status = "available"
        elif blocked == "wrong_org":
            listing.claimed_by_org_id = "org-b"
        elif blocked == "listing_cooldown":
            listing.cooldown_until = datetime.now(UTC) + timedelta(days=1)
        elif blocked == "expired_untouched":
            claim.claimed_at = datetime.now(UTC) - timedelta(days=8)
            claim.first_touch_due = datetime.now(UTC) - timedelta(days=5)
        else:
            session.add(ContactPreference(business_id=listing.business_id, claim_id=claim.id, org_id=claim.org_id,
                kind="hard_optout" if blocked == "preference_dnc" else "soft_reject", globally_blocked=blocked == "preference_dnc",
                cooldown_until=datetime.now(UTC) + timedelta(days=1) if blocked == "preference_cooldown" else None))
        session.commit()
    result = client.post(f"/api/v1/claims/{ident}/import-crm", headers=ADMIN, json={"confirmed": True})
    assert result.status_code == 409, result.text
    assert legacy.posts == []


def test_import_success_replay_and_dnc_after_success(client, legacy):
    ident = seed_claim(client)
    path = f"/api/v1/claims/{ident}/import-crm"
    first = client.post(path, headers=ADMIN, json={"confirmed": True})
    assert first.status_code == 200, first.text
    assert first.json()["status"] == "confirmed"
    payload = legacy.posts[0]["body"]
    assert set(payload["lead"]) == {"shop_name", "city", "district", "address", "source"}
    with client.app.state.session_factory() as session:
        claim = session.get(Claim, ident)
        assert payload["source_id"] == claim.listing_id
        claim.status = "released"
        session.get(LeadListing, claim.listing_id).dnc_at = datetime.now(UTC)
        session.commit()
    again = client.post(path, headers=ADMIN, json={"confirmed": True})
    assert again.json()["id"] == first.json()["id"]
    assert len(legacy.posts) == 1  # Completed request is a read, not another import.


@pytest.mark.parametrize("new_optout", [False, True])
def test_hq_dnc_lift_supersedes_old_history_but_never_a_new_optout(client, legacy, new_optout):
    ident = seed_claim(client)
    now = datetime.now(UTC)
    with client.app.state.session_factory() as session:
        claim = session.get(Claim, ident)
        listing = session.get(LeadListing, claim.listing_id)
        session.add(ContactPreference(business_id=listing.business_id, claim_id=claim.id, org_id=claim.org_id,
            kind="hard_optout", globally_blocked=True, created_at=now - timedelta(days=3)))
        session.add(AuditEvent(actor_user_id=SUBJECT, action="listing.dnc_lifted", entity_type="listing",
            entity_id=listing.id, details={"basis": "documented consent", "evidence_reference": "internal record"}, created_at=now - timedelta(days=2)))
        if new_optout:
            session.add(ContactPreference(business_id=listing.business_id, claim_id=claim.id, org_id=claim.org_id,
                kind="hard_optout", globally_blocked=True, created_at=now - timedelta(days=1)))
        session.commit()
    response = client.post(f"/api/v1/claims/{ident}/import-crm", headers=ADMIN, json={"confirmed": True})
    assert response.status_code == (409 if new_optout else 200), response.text
    assert len(legacy.posts) == (0 if new_optout else 1)


def test_lost_response_retry_recovers_receipt_even_after_optout(client, legacy):
    ident = seed_claim(client)
    legacy.fail_after_apply = True
    path = f"/api/v1/claims/{ident}/import-crm"
    assert client.post(path, headers=ADMIN, json={"confirmed": True}).status_code == 502
    with client.app.state.session_factory() as session:
        row = session.scalar(select(Proposal).where(Proposal.target_id == ident))
        assert row.status == "confirming"
        assert ADMIN["Authorization"] not in json.dumps(row.payload)
        claim = session.get(Claim, ident)
        session.get(LeadListing, claim.listing_id).dnc_at = datetime.now(UTC)
        session.commit()
    recovered = client.post(path, headers=ADMIN, json={"confirmed": True})
    assert recovered.status_code == 200 and recovered.json()["status"] == "confirmed"
    assert len(legacy.posts) == 1 and len(legacy.receipts) == 1


def test_failure_before_commit_retries_identical_request_payload(client, legacy):
    ident = seed_claim(client)
    legacy.fail_before_apply = True
    path = f"/api/v1/claims/{ident}/import-crm"
    assert client.post(path, headers=ADMIN, json={"confirmed": True}).status_code == 502
    with client.app.state.session_factory() as session:
        claim = session.get(Claim, ident)
        listing = session.get(LeadListing, claim.listing_id)
        session.get(RepairBusiness, listing.business_id).business_name = "Changed after request"
        session.commit()
    second = client.post(path, headers=ADMIN, json={"confirmed": True})
    assert second.status_code == 200, second.text
    assert legacy.posts[0]["body"] == legacy.posts[1]["body"]
    assert len(legacy.receipts) == 1


def test_background_reconciliation_only_reads_and_checks_actor(client, legacy):
    ident = seed_claim(client)
    legacy.fail_after_apply = True
    assert client.post(f"/api/v1/claims/{ident}/import-crm", headers=ADMIN, json={"confirmed": True}).status_code == 502
    request_id = legacy.posts[0]["body"]["request_id"]
    legacy.receipts[request_id]["actor_sub"] = "another-account"
    with client.app.state.session_factory() as session:
        assert crm_bridge.reconcile(session, client.app.state.settings) == {"confirmed": 0}
        assert session.get(Proposal, request_id).status == "confirming"
    legacy.receipts[request_id]["actor_sub"] = SUBJECT
    with client.app.state.session_factory() as session:
        assert crm_bridge.reconcile(session, client.app.state.settings) == {"confirmed": 1}
        assert crm_bridge.reconcile(session, client.app.state.settings) == {"confirmed": 0}
        assert session.get(Proposal, request_id).status == "confirmed"
    assert len(legacy.posts) == 1


def test_reconciliation_does_not_replay_an_unexecuted_request(client, legacy):
    ident = seed_claim(client)
    legacy.fail_before_apply = True
    client.post(f"/api/v1/claims/{ident}/import-crm", headers=ADMIN, json={"confirmed": True})
    with client.app.state.session_factory() as session:
        assert crm_bridge.reconcile(session, client.app.state.settings) == {"confirmed": 0}
        assert session.scalar(select(Proposal)).status == "confirming"
    assert len(legacy.posts) == 1 and legacy.receipts == {}


def test_confirmation_is_bound_to_the_original_actor(client, legacy):
    ident = seed_claim(client)
    legacy.fail_before_apply = True
    path = f"/api/v1/claims/{ident}/import-crm"
    assert client.post(path, headers=ADMIN, json={"confirmed": True}).status_code == 502
    other = {**auth_headers(user="another-admin", roles="hq_admin"), "Authorization": "Bearer other-token"}
    assert client.post(path, headers=other, json={"confirmed": True}).status_code == 409
    assert len(legacy.posts) == 1


@pytest.mark.parametrize("malformed", [[], {}, {"request_id": "wrong", "status": "applied"}])
def test_malformed_execution_receipt_never_marks_confirmed(client, legacy, monkeypatch, malformed):
    ident = seed_claim(client)
    monkeypatch.setattr(crm_bridge.httpx, "post", lambda url, **kwargs: legacy.response("POST", url, 200, malformed))
    response = client.post(f"/api/v1/claims/{ident}/import-crm", headers=ADMIN, json={"confirmed": True})
    assert response.status_code == 502
    with client.app.state.session_factory() as session:
        row = session.scalar(select(Proposal))
        assert row.status == "confirming" and row.execution_result is None


def test_ceo_cannot_replay_an_already_confirmed_legacy_proposal(client, legacy):
    ident = seed_claim(client)
    response = client.post(f"/api/v1/claims/{ident}/import-crm", headers=ADMIN, json={"confirmed": True})
    request_id = response.json()["id"]
    assert client.post(f"/api/v1/proposals/{request_id}/confirm", headers=CEO, json={"confirmed": True}).status_code == 403
    assert len(legacy.posts) == 1


def test_legacy_stage_proposal_carries_version_and_operator_only_confirmation(client, legacy):
    body = {"target_id": 9, "stage": "方案沟通", "stage_reason": "已人工核实"}
    for headers in (CEO, FRANCHISE):
        assert client.post("/api/v1/legacy-proposals", headers=headers, json=body).status_code == 403
    created = client.post("/api/v1/legacy-proposals", headers=ADMIN, json=body)
    assert created.status_code == 201, created.text
    row = created.json()
    path = f"/api/v1/proposals/{row['id']}/confirm"
    assert row["target_version"] == legacy.version
    assert client.post(path, headers=CEO, json={"confirmed": True}).status_code == 403
    assert client.post(path, headers=FRANCHISE, json={"confirmed": True}).status_code == 403
    assert client.post(path, headers=ADMIN, json={"confirmed": True}).json()["status"] == "confirmed"
    assert client.post(path, headers=ADMIN, json={"confirmed": True}).json()["status"] == "confirmed"
    assert legacy.posts[0]["body"]["expected_version"] == legacy.version
    assert legacy.posts[0]["body"]["entity_id"] == 9
    assert len(legacy.posts) == 1
    with client.app.state.session_factory() as session:
        assert session.scalar(select(func.count()).select_from(AuditEvent).where(AuditEvent.action == "legacy_crm.confirmed")) == 1


def test_stale_legacy_version_does_not_report_success(client, legacy):
    row = client.post("/api/v1/legacy-proposals", headers=ADMIN, json={"target_id": 9, "stage": "方案沟通", "stage_reason": "核实"}).json()
    legacy.version = "2026-11-05T02:00:00.000001+00:00"
    response = client.post(f"/api/v1/proposals/{row['id']}/confirm", headers=ADMIN, json={"confirmed": True})
    assert response.status_code == 409
    with client.app.state.session_factory() as session:
        saved = session.get(Proposal, row["id"])
        assert saved.status == "pending" and saved.execution_result is None
    assert legacy.receipts == {}


@pytest.mark.parametrize("current", [{}, [], {"entity_type": "opportunity", "entity_id": 999, "version": "v1", "status": "active"}])
def test_proposal_rejects_invalid_or_wrong_target_version_response(client, legacy, monkeypatch, current):
    monkeypatch.setattr(crm_bridge.httpx, "get", lambda url, **kwargs: legacy.response("GET", url, 200, current))
    response = client.post("/api/v1/legacy-proposals", headers=ADMIN, json={"target_id": 9, "stage": "方案沟通", "stage_reason": "核实"})
    assert response.status_code == 409
    with client.app.state.session_factory() as session:
        assert session.scalar(select(func.count()).select_from(Proposal)) == 0
