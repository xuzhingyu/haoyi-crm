import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from lead_core.api.routes.workspace import Confirmation, commit, hq, proposal_read
from lead_core.db import get_session
from lead_core.intelligence import crm_bridge
from lead_core.intelligence.models import Proposal, Research
from lead_core.models import Claim
from lead_core.security.auth import Principal, require_hq_role

router = APIRouter(tags=["CRM integration"])


@router.post("/claims/{claim_id}/import-crm")
def import_crm(claim_id: str, payload: Confirmation, request: Request,
               principal: Principal = Depends(hq), session: Session = Depends(get_session)):
    require_hq_role(principal, "hq_admin", "hq_franchise_manager")
    claim = session.scalar(select(Claim).where(Claim.id == claim_id).with_for_update())
    if not claim:
        raise HTTPException(409, "领取记录不存在")
    row = session.scalar(select(Proposal).where(Proposal.kind == "import_crm_lead", Proposal.target_id == claim_id,
                         Proposal.target_system == "legacy_crm").order_by(Proposal.created_at.desc()))
    if row is None:
        crm_bridge.import_payload(session, claim_id)
        row = Proposal(kind="import_crm_lead", target_system="legacy_crm", target_id=claim_id,
                       payload={}, created_by=principal.user_id)
        session.add(row)
    # Release the creation lock, then use the same proposal -> claim order as
    # the general confirm endpoint. Avoid a cross-endpoint lock inversion.
    commit(session, principal)
    row = session.scalar(select(Proposal).where(Proposal.id == row.id).with_for_update())
    return proposal_read(crm_bridge.confirm(session, request.app.state.settings, row, principal, request.headers.get("Authorization")))


class LegacyProposal(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    target_id: int = Field(gt=0)
    stage: str = Field(min_length=1, max_length=40)
    stage_reason: str = Field(min_length=1, max_length=1000)
    research_id: str | None = None


@router.post("/legacy-proposals", status_code=201)
def propose(payload: LegacyProposal, request: Request, principal: Principal = Depends(hq), session: Session = Depends(get_session)):
    require_hq_role(principal, "hq_admin", "hq_franchise_manager")
    if payload.stage in {"已签约", "已关闭"}:
        raise HTTPException(422, "请使用原有签约或关闭流程")
    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer ") or not authorization[7:].strip():
        raise HTTPException(401, "请重新登录后操作")
    if payload.research_id and session.get(Research, payload.research_id) is None:
        raise HTTPException(404, "研究任务不存在")
    settings = request.app.state.settings
    headers = crm_bridge.bridge_headers(settings, authorization)
    try:
        response = httpx.get(settings.legacy_crm_api_url.rstrip("/") + "/api/integrations/entities/opportunity/" + str(payload.target_id), headers=headers, timeout=10)
        response.raise_for_status()
        current = response.json()
        if not isinstance(current, dict) or current.get("entity_type") != "opportunity" or current.get("entity_id") != payload.target_id or not isinstance(current.get("version"), str) or not 1 <= len(current["version"]) <= 100:
            raise ValueError("invalid opportunity response")
    except (httpx.HTTPError, ValueError):
        raise HTTPException(409, "无法核对当前商机状态") from None
    if current.get("status") != "active":
        raise HTTPException(409, "商机当前不可修改")
    row = Proposal(kind="legacy_opportunity_stage", target_system="legacy_crm", target_id=str(payload.target_id),
        target_version=current["version"], payload={"stage":payload.stage,"stage_reason":payload.stage_reason},
        research_id=payload.research_id, created_by=principal.user_id)
    session.add(row)
    commit(session, principal)
    return proposal_read(row)
