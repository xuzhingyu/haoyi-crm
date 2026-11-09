from __future__ import annotations

import http.client

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from lead_core.api.routes.workspace import commit, hq
from lead_core.db import get_session
from lead_core.intelligence.models import NewsSource
from lead_core.intelligence.source_config import (
    SourceConfigError,
    SourceDraft,
    admin_client,
    read_config,
    save_config,
    validate_source,
)
from lead_core.security.auth import Principal, require_hq_role
from lead_core.services.events import record_audit

router = APIRouter(prefix="/intelligence/source-config", tags=["source-configuration"])


def administrator(request: Request, principal: Principal = Depends(hq)) -> Principal:
    require_hq_role(principal, "hq_admin")
    if not request.app.state.source_rate_limiter.allow("source-config:" + principal.user_id, limit=10):
        raise HTTPException(429, "操作较频繁，请稍后重试")
    return principal


def run(request, operation):
    try:
        with admin_client(request.app.state.settings) as client:
            return operation(client)
    except SourceConfigError as exc:
        raise HTTPException(exc.status, str(exc)) from None
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 409:
            raise HTTPException(409, "信源配置冲突，请重新打开后再保存") from None
        raise HTTPException(502, "AIHOT 未完成操作，请检查来源地址或采集规则后重试") from None
    except (httpx.HTTPError, OSError, http.client.HTTPException, KeyError, TypeError):
        raise HTTPException(502, "信源连接未完成，请稍后重试") from None
    except ValueError:
        raise HTTPException(422, "信源验证未通过，请确认是可直接访问的公开 RSS 或网页列表") from None


@router.post("/validate")
def validate(payload: SourceDraft, request: Request, principal: Principal = Depends(administrator)):
    return run(request, lambda client: validate_source(payload, client))


@router.get("/{source_id}")
def detail(source_id: str, request: Request, principal: Principal = Depends(administrator), session: Session = Depends(get_session)):
    row = session.get(NewsSource, source_id)
    if not row:
        raise HTTPException(404, "信源不存在")
    return run(request, lambda client: read_config(row, client))


def persist(payload, request, principal, session, row=None):
    result = run(request, lambda client: save_config(session, payload, client, row=row))
    record_audit(session, principal=principal, action="intelligence.source_configured",
                 entity_type="news_source", entity_id=result["id"],
                 details={"name": payload.name, "url": payload.url, "kind": payload.kind,
                          "topic": payload.topic, "interval_minutes": payload.interval_minutes, "enabled": payload.enabled})
    commit(session, principal)
    return result


@router.post("")
def create(payload: SourceDraft, request: Request, principal: Principal = Depends(administrator), session: Session = Depends(get_session)):
    return persist(payload, request, principal, session)


@router.put("/{source_id}")
def update(source_id: str, payload: SourceDraft, request: Request, principal: Principal = Depends(administrator), session: Session = Depends(get_session)):
    row = session.get(NewsSource, source_id)
    if not row:
        raise HTTPException(404, "信源不存在")
    return persist(payload, request, principal, session, row)
