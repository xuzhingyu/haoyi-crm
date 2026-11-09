import secrets
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from lead_core.db import apply_rls_context, get_session
from lead_core.intelligence.gateway import GatewayError, complete
from lead_core.intelligence.models import AiJob, WorkspaceMember
from lead_core.security.auth import Principal, get_principal

router = APIRouter(tags=["AI gateway"])


class Message(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["system", "user", "assistant"]
    content: str = Field(max_length=60000)


class GatewayRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: str = Field(min_length=8, max_length=120, pattern=r"^[A-Za-z0-9:_-]+$")
    actor_sub: str = Field(max_length=100)
    source_system: Literal["legacy_crm"]
    source_id: str | None = Field(default=None, max_length=180)
    purpose: Literal["operations", "visit_prep", "weekly_report", "studio_note", "studio_preparation", "studio_delivery", "studio_report", "industry_analysis"]
    messages: list[Message] = Field(min_length=1, max_length=12)
    max_tokens: int = Field(default=4096, ge=1, le=4096)
    response_format: dict | None = None
    data_classification: Literal["redacted_summary"] = "redacted_summary"


@router.post("/internal/ai/chat-completions", include_in_schema=False)
def chat(payload: GatewayRequest, request: Request):
    settings = request.app.state.settings
    supplied = request.headers.get("Authorization", "").removeprefix("Bearer ")
    if not settings.ai_gateway_token or not secrets.compare_digest(supplied, settings.ai_gateway_token):
        raise HTTPException(401, "service authorization required")
    if payload.actor_sub not in settings.legacy_ai_actor_subs:
        raise HTTPException(403, "未映射的业务账号")
    with request.app.state.session_factory() as session:
        apply_rls_context(session, is_worker=True)
        if session.get(WorkspaceMember, payload.actor_sub) is None:
            raise HTTPException(403, "业务账号未启用")
        try:
            return complete(session, settings, request_id="legacy:" + payload.request_id,
                actor_sub=payload.actor_sub, purpose=payload.purpose, source_system=payload.source_system,
                source_id=payload.source_id, messages=[m.model_dump() for m in payload.messages],
                max_tokens=payload.max_tokens, response_format=payload.response_format)
        except GatewayError as exc:
            raise HTTPException(exc.status_code, str(exc)) from None


@router.get("/ai/jobs")
def jobs(principal: Principal = Depends(get_principal), session: Session = Depends(get_session)):
    if not principal.is_hq:
        raise HTTPException(403, "headquarters role required")
    rows = session.scalars(select(AiJob).order_by(AiJob.created_at.desc()).limit(50)).all()
    return {"items": [{k: getattr(row, k) for k in ("id", "purpose", "source_system", "status", "cost_cny", "created_at", "finished_at")} for row in rows]}
