"""Confirmed cross-database operations with a durable, actor-bound request identity."""
from datetime import UTC, datetime

import httpx
from fastapi import HTTPException
from sqlalchemy import select

from lead_core.db import apply_rls_context
from lead_core.domain.claims import ClaimPolicy, FollowUpSignal, InteractionOutcome
from lead_core.intelligence.models import Proposal
from lead_core.jobs.lifecycle import ACTIVE_OPPORTUNITY_STAGES
from lead_core.models import (
    AuditEvent,
    Claim,
    ContactPreference,
    Interaction,
    LeadListing,
    Opportunity,
    RepairBusiness,
)
from lead_core.security.auth import require_hq_role
from lead_core.services.events import record_audit


def bridge_headers(settings, authorization=None):
    if not settings.legacy_crm_api_url or not settings.legacy_bridge_token:
        raise HTTPException(503, "CRM 连接尚未配置")
    headers = {"X-Haoyi-Bridge-Token": settings.legacy_bridge_token}
    if authorization:
        headers["Authorization"] = authorization
    return headers


def import_payload(session, claim_id):
    claim = session.scalar(select(Claim).where(Claim.id == claim_id).with_for_update())
    if not claim or claim.status != "active":
        raise HTTPException(409, "有效领取记录不存在")
    listing = session.scalar(select(LeadListing).where(LeadListing.id == claim.listing_id).with_for_update())
    if not listing or listing.dnc_at or listing.status != "claimed" or listing.claimed_by_org_id != claim.org_id:
        raise HTTPException(409, "线索已退订或停止联系，不能转入")
    now = datetime.now(UTC)
    if listing.cooldown_until and aware(listing.cooldown_until) > now:
        raise HTTPException(409, "线索处于暂停联系状态")
    interactions = session.scalars(select(Interaction).where(Interaction.claim_id == claim.id)).all()
    opportunity = session.scalar(select(Opportunity).where(Opportunity.claim_id == claim.id))
    decision = ClaimPolicy().evaluate(now=now, claimed_at=aware(claim.claimed_at),
        protected_until=aware(claim.protected_until),
        interactions=[FollowUpSignal(occurred_at=aware(item.occurred_at), outcome=InteractionOutcome(item.outcome)) for item in interactions],
        opportunity_active=bool(opportunity and opportunity.stage in ACTIVE_OPPORTUNITY_STAGES))
    if decision.release:
        raise HTTPException(409, "领取已不满足保护条件，请先核对领取状态")
    latest_lift = session.scalar(select(AuditEvent.created_at).where(AuditEvent.action == "listing.dnc_lifted",
        AuditEvent.entity_type == "listing", AuditEvent.entity_id == listing.id).order_by(AuditEvent.created_at.desc()).limit(1))
    for preference in session.scalars(select(ContactPreference).where(ContactPreference.business_id == listing.business_id)).all():
        # HQ lifting with recorded evidence preserves old preference history.
        # Only preferences after that explicit reset remain effective.
        if latest_lift and aware(preference.created_at) < aware(latest_lift):
            continue
        until = preference.cooldown_until
        if until and not until.tzinfo:
            until = until.replace(tzinfo=UTC)
        if preference.globally_blocked or (until and until > now):
            raise HTTPException(409, "线索存在退订或暂停联系状态")
    business = session.get(RepairBusiness, listing.business_id)
    if not business:
        raise HTTPException(409, "原始企业资料不存在")
    return {"source_system": "lead_core", "source_id": listing.id,
            "lead": {"shop_name": business.business_name, "city": business.city,
                     "district": business.district, "address": business.full_address,
                     "source": "公开线索池确认转入"}}


def aware(value):
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def restore_scope(session, principal=None):
    if principal:
        apply_rls_context(session, org_id=principal.org_id, is_hq=principal.is_hq)
    else:
        apply_rls_context(session, is_worker=True)


def finish(session, proposal, result, principal=None):
    if not isinstance(result, dict):
        raise ValueError("CRM 返回的执行凭据无效")
    if result.get("request_id") != proposal.id or result.get("status") != "applied":
        raise ValueError("CRM 返回的执行凭据不匹配")
    if type(result.get("entity_id")) is not int or result["entity_id"] < 1 or not isinstance(result.get("version"), str) or not 1 <= len(result["version"]) <= 100:
        raise ValueError("CRM 返回的执行凭据不完整")
    if proposal.kind == "legacy_opportunity_stage" and (result.get("entity_type") != "opportunity" or str(result.get("entity_id")) != proposal.target_id):
        raise ValueError("CRM 返回的目标不匹配")
    if proposal.kind == "import_crm_lead" and result.get("entity_type") != "lead":
        raise ValueError("CRM 返回的目标不匹配")
    proposal = session.scalar(select(Proposal).where(Proposal.id == proposal.id).with_for_update().execution_options(populate_existing=True))
    if proposal.status == "confirmed":
        return False
    if proposal.status != "confirming":
        raise ValueError("确认状态已变化")
    result = {**{key: result[key] for key in ("request_id", "status", "entity_type", "entity_id", "version")},
              "replayed": result.get("replayed") is True}
    proposal.execution_result = result
    proposal.status, proposal.confirmed_at, proposal.last_error = "confirmed", datetime.now(UTC), None
    if principal:
        record_audit(session, principal=principal, action="legacy_crm.confirmed", entity_type=result["entity_type"],
                     entity_id=str(result["entity_id"]), details={"request_id": proposal.id, "replayed": result.get("replayed", False)})
    session.commit()
    restore_scope(session, principal)
    return True


def confirm(session, settings, proposal, principal, authorization):
    require_hq_role(principal, "hq_admin", "hq_franchise_manager")
    if proposal.status == "confirmed":
        return proposal
    if proposal.status not in {"pending", "confirming"}:
        raise HTTPException(409, "操作已处理")
    if proposal.confirmed_by and proposal.confirmed_by != principal.user_id:
        raise HTTPException(409, "此请求已由其他账号确认，请核对执行结果")
    if not authorization or not authorization.startswith("Bearer ") or not authorization[7:].strip():
        raise HTTPException(401, "请重新登录后确认")
    headers = bridge_headers(settings, authorization)
    if proposal.status == "confirming":
        try:
            response = httpx.get(settings.legacy_crm_api_url.rstrip("/") + "/api/integrations/operations/" + proposal.id,
                headers=bridge_headers(settings), timeout=10)
            if response.status_code != 404:
                response.raise_for_status()
                receipt = response.json()
                if not isinstance(receipt, dict) or receipt.get("actor_sub") != proposal.confirmed_by:
                    raise ValueError("CRM 返回的确认人不匹配")
                finish(session, proposal, receipt["result"], principal)
                return proposal
        except (httpx.HTTPError, ValueError, KeyError):
            raise HTTPException(502, "执行结果待核对，请稍后重试") from None
    if proposal.kind == "import_crm_lead":
        fresh = import_payload(session, proposal.target_id)
        # Once submitted, keep the original digest so a network retry is the same operation.
        if not proposal.confirmed_by:
            proposal.payload = fresh
        body = dict(proposal.payload)
        endpoint = "/api/integrations/import-lead"
    elif proposal.kind == "legacy_opportunity_stage":
        body = {"entity_type": "opportunity", "entity_id": int(proposal.target_id), "action": "update_stage",
                "expected_version": proposal.target_version, "payload": proposal.payload}
        endpoint = "/api/integrations/confirmed-operations"
    else:
        raise HTTPException(422, "不支持的业务操作")
    body.update(request_id=proposal.id, confirmed=True)
    proposal.status, proposal.confirmed_by, proposal.last_error = "confirming", principal.user_id, None
    session.commit()
    restore_scope(session, principal)
    # The durable intent is committed first. Re-lock in proposal -> claim order
    # through the request so concurrent confirmation/opt-out cannot interleave it.
    proposal = session.scalar(select(Proposal).where(Proposal.id == proposal.id).with_for_update().execution_options(populate_existing=True))
    if proposal.status == "confirmed":
        return proposal
    if proposal.kind == "import_crm_lead":
        import_payload(session, proposal.target_id)
    try:
        response = httpx.post(settings.legacy_crm_api_url.rstrip("/") + endpoint, headers=headers, json=body, timeout=25)
        if response.status_code >= 400:
            # Do not persist provider headers, credentials or arbitrary response bodies.
            proposal.last_error = "业务状态或权限已变化，请核对后重试" if response.status_code < 500 else "执行结果待核对，可安全重试"
            if response.status_code < 500:
                proposal.status = "pending"
            session.commit()
            restore_scope(session, principal)
            raise HTTPException(response.status_code, proposal.last_error)
        finish(session, proposal, response.json(), principal)
        return proposal
    except (httpx.HTTPError, ValueError, KeyError):
        proposal.last_error = "执行结果待核对；重复确认会复用同一请求编号"
        session.commit()
        restore_scope(session, principal)
        raise HTTPException(502, proposal.last_error) from None


def reconcile(session, settings) -> dict:
    if not settings.legacy_crm_api_url or not settings.legacy_bridge_token:
        return {"confirmed": 0}
    ids = session.scalars(select(Proposal.id).where(Proposal.target_system == "legacy_crm", Proposal.status == "confirming").limit(50)).all()
    count = 0
    for ident in ids:
        try:
            row = session.scalar(select(Proposal).where(Proposal.id == ident, Proposal.status == "confirming").with_for_update(skip_locked=True).execution_options(populate_existing=True))
            if not row:
                continue
            response = httpx.get(settings.legacy_crm_api_url.rstrip("/") + "/api/integrations/operations/" + row.id,
                                headers=bridge_headers(settings), timeout=10)
            if response.status_code == 404:
                session.commit()
                restore_scope(session)
                continue  # No user JWT is stored or replayed by this worker.
            response.raise_for_status()
            value = response.json()
            if not isinstance(value, dict) or value.get("actor_sub") != row.confirmed_by:
                session.commit()
                restore_scope(session)
                continue
            count += int(finish(session, row, value["result"]))
        except (httpx.HTTPError, ValueError, KeyError):
            session.rollback()
            apply_rls_context(session, is_worker=True)
    return {"confirmed": count}
