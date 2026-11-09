"""Confirmed internal bridge. Service authentication never substitutes for a user."""
import hashlib
import hmac
import json
import os
from datetime import timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import write_audit
from .integration_models import ExternalLeadLink, ExternalOperation
from .lifecycle import record_event, touch
from .models import Opportunity, RepairShopLead
from .studio import lock


def version_of(row) -> str:
    return row.updated_at.replace(tzinfo=timezone.utc).isoformat(timespec="microseconds")


def bridge_service(request: Request):
    configured = os.getenv("CRM_BRIDGE_TOKEN", "")
    supplied = request.headers.get("X-Haoyi-Bridge-Token", "")
    if not configured or not hmac.compare_digest(supplied, configured):
        raise HTTPException(401, "internal service authentication required")


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Confirmation(Input):
    request_id: UUID
    confirmed: Literal[True]


class LeadFields(Input):
    shop_name: str = Field(min_length=1, max_length=200)
    province: str | None = Field(default=None, max_length=50)
    city: str | None = Field(default=None, max_length=50)
    district: str | None = Field(default=None, max_length=50)
    address: str | None = Field(default=None, max_length=300)
    source: str | None = Field(default=None, max_length=100)


class LeadImport(Confirmation):
    source_system: Literal["lead_core"]
    source_id: UUID
    lead: LeadFields
    bind_lead_id: int | None = Field(default=None, gt=0)


class StageUpdate(Input):
    stage: str = Field(min_length=1, max_length=40)
    stage_reason: str = Field(min_length=1, max_length=1000)


class Operation(Confirmation):
    entity_type: Literal["opportunity"]
    entity_id: int = Field(gt=0)
    action: Literal["update_stage"]
    expected_version: str = Field(min_length=10, max_length=40)
    payload: StageUpdate


def begin_operation(session, user, body):
    if not user.subject:
        raise HTTPException(403, "an explicitly mapped unified account is required")
    lock(session)  # SQLite write lock: effect and dedup record commit together.
    data = {"actor_sub": user.subject, "body": body.model_dump(mode="json")}
    digest = hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    existing = session.get(ExternalOperation, str(body.request_id))
    if existing:
        if existing.request_digest != digest:
            raise HTTPException(409, "request_id has already been used with different input")
        return {**json.loads(existing.result_json), "replayed": True}, digest
    return None, digest


def finish_operation(session, user, body, digest, entity_type, row):
    result = {"request_id": str(body.request_id), "status": "applied", "entity_type": entity_type,
              "entity_id": row.id, "version": version_of(row), "replayed": False}
    session.add(ExternalOperation(request_id=str(body.request_id), request_digest=digest,
        actor_sub=user.subject, actor_id=user.id, result_json=json.dumps(result)))
    write_audit(session, user, "integration.confirmed", f"request={body.request_id};entity={entity_type}:{row.id}", commit=False)
    session.commit()
    return result


def install(app, get_session, current_user, operator_user):
    router = APIRouter(prefix="/api/integrations", dependencies=[Depends(bridge_service)])

    @router.get("/operations/{request_id}")
    def result(request_id: UUID, session: Session = Depends(get_session)):
        row = session.get(ExternalOperation, str(request_id))
        if not row:
            raise HTTPException(404, "operation has not been applied")
        return {"actor_sub": row.actor_sub, "result": json.loads(row.result_json)}

    @router.get("/entities/opportunity/{entity_id}")
    def opportunity_version(entity_id: int, session: Session = Depends(get_session), user=Depends(operator_user)):
        row = session.get(Opportunity, entity_id)
        if not row:
            raise HTTPException(404, "opportunity not found")
        return {"entity_type": "opportunity", "entity_id": row.id, "version": version_of(row), "status": row.status, "stage": row.stage}

    @router.post("/import-lead")
    def import_lead(body: LeadImport, session: Session = Depends(get_session), user=Depends(operator_user)):
        replay, digest = begin_operation(session, user, body)
        if replay:
            return replay
        link = session.scalar(select(ExternalLeadLink).where(ExternalLeadLink.source_system == body.source_system, ExternalLeadLink.source_id == str(body.source_id)))
        if link:
            row = session.get(RepairShopLead, link.lead_id)
            if body.bind_lead_id and body.bind_lead_id != row.id:
                raise HTTPException(409, "source is already linked to another CRM lead")
        elif body.bind_lead_id:
            row = session.get(RepairShopLead, body.bind_lead_id)
            if not row or row.status != "active":
                raise HTTPException(409, "target lead is not active")
        else:
            data = body.lead.model_dump(exclude_none=True)
            data["source"] = data.get("source") or "公开线索池确认转入"
            row = RepairShopLead(**data, status="active", updated_by_id=user.id)
            session.add(row)
            session.flush()
            record_event(session, entity_type="lead", entity_id=row.id, action="create", user=user, after={"source_system": body.source_system, "source_id": str(body.source_id)})
        if not link:
            session.add(ExternalLeadLink(source_system=body.source_system, source_id=str(body.source_id), lead_id=row.id))
        session.flush()
        return finish_operation(session, user, body, digest, "lead", row)

    @router.post("/confirmed-operations")
    def confirmed_operation(body: Operation, session: Session = Depends(get_session), user=Depends(operator_user)):
        replay, digest = begin_operation(session, user, body)
        if replay:
            return replay
        row = session.get(Opportunity, body.entity_id)
        if not row or row.status != "active":
            raise HTTPException(409, "opportunity is no longer active")
        if version_of(row) != body.expected_version:
            raise HTTPException(409, "opportunity changed; review the latest record before confirming")
        if body.payload.stage in {"已签约", "已关闭"}:
            raise HTTPException(422, "use the original signing or closing workflow")
        before = {"stage": row.stage}
        row.stage = body.payload.stage
        touch(row, user)
        record_event(session, entity_type="opportunity", entity_id=row.id, action="update", user=user, before=before,
                     after={"stage": row.stage}, reason=body.payload.stage_reason)
        session.flush()
        return finish_operation(session, user, body, digest, "opportunity", row)

    app.include_router(router)
