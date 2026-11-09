from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from lead_core.api.routes.workspace import hq
from lead_core.company_intelligence.models import (
    CompanyBriefing,
    CompanyCollectionRun,
    CompanyRecord,
    MonitoredCompany,
)
from lead_core.company_intelligence.service import COVERAGE_MESSAGE, as_utc, day_range, queue_run
from lead_core.db import apply_rls_context, get_session
from lead_core.security.auth import Principal, require_hq_role
from lead_core.services.events import record_audit

router = APIRouter(tags=["company-intelligence"])


def run_read(run):
    result = {key: getattr(run, key) for key in (
        "id", "status", "mode", "created_at", "started_at", "finished_at", "new_records", "errors",
    )}
    result["error"] = "；".join(run.errors or [])
    for key in ("created_at", "started_at", "finished_at"):
        result[key] = as_utc(result[key])
    return result


@router.get("/company-intelligence")
def overview(
    request: Request,
    company_id: str | None = None,
    category: Literal["news", "business", "sentiment"] | None = None,
    observed_day: date | None = Query(None, alias="date"),
    page: int = Query(1, ge=1),
    limit: int = Query(30, ge=1, le=100),
    principal: Principal = Depends(hq),
    session: Session = Depends(get_session),
):
    companies = session.scalars(select(MonitoredCompany).order_by(MonitoredCompany.id)).all()
    names = {company.id: company.name for company in companies}
    conditions = []
    if company_id:
        conditions.append(CompanyRecord.company_id == company_id)
    if category:
        conditions.append(CompanyRecord.category == category)
    if observed_day:
        start, end = day_range(observed_day)
        conditions.extend([CompanyRecord.observed_at >= start, CompanyRecord.observed_at < end])
    total = session.scalar(select(func.count()).select_from(CompanyRecord).where(*conditions))
    records = session.scalars(select(CompanyRecord).where(*conditions).order_by(
        CompanyRecord.observed_at.desc(), CompanyRecord.id,
    ).offset((page - 1) * limit).limit(limit)).all()
    runs = session.scalars(select(CompanyCollectionRun).order_by(CompanyCollectionRun.created_at.desc()).limit(10)).all()
    briefings = session.scalars(select(CompanyBriefing).order_by(CompanyBriefing.day.desc()).limit(30)).all()
    return {
        "companies": [{key: getattr(company, key) for key in ("id", "name", "verification_status", "relationship_note")} for company in companies],
        "items": [{**{key: getattr(record, key) for key in (
            "id", "company_id", "title", "category", "summary", "source_name", "source_url",
            "verification_status",
        )}, "published_at": as_utc(record.published_at), "observed_at": as_utc(record.observed_at),
            "company_name": names.get(record.company_id, "")} for record in records],
        "total": total, "page": page, "limit": limit,
        "coverage": {
            "message": COVERAGE_MESSAGE,
            "last_run_at": as_utc(runs[0].finished_at) if runs else None,
            "status": runs[0].status if runs else "not_started",
            "tianyan_status": "configured" if request.app.state.settings.company_intelligence_tianyan_enabled else "not_configured",
            "schedule": "每天 08:45（北京时间）",
        },
        "briefings": [{key: getattr(row, key) for key in ("day", "news_count", "business_count", "sentiment_count", "summary")} for row in briefings],
        "runs": [run_read(run) for run in runs],
    }


class CollectInput(BaseModel):
    mode: Literal["baseline", "daily"] = "daily"


@router.post("/company-intelligence/collect", status_code=202)
def collect(
    body: CollectInput,
    request: Request,
    principal: Principal = Depends(hq),
    session: Session = Depends(get_session),
):
    require_hq_role(principal, "hq_admin")
    if principal.has_any_role("hq_executive"):
        raise HTTPException(403, "经营查看账号仅可阅读企业动态")
    run, created = queue_run(session, body.mode, principal.user_id)
    if not created and run.status not in {"queued", "running"}:
        raise HTTPException(429, "最近一次采集已结束，请间隔 5 分钟后重试")
    if created:
        record_audit(session, principal=principal, action="company_intelligence.collect", entity_type="company_collection_run", entity_id=run.id, details={"mode": body.mode})
    session.commit()
    apply_rls_context(session, org_id=principal.org_id, is_hq=True)
    if created:
        from lead_core.company_intelligence.jobs import company_collection
        try:
            company_collection.delay(run.id)
        except Exception as exc:
            from datetime import UTC, datetime
            run.status, run.active_slot, run.finished_at = "failed", None, datetime.now(UTC)
            run.errors = ["采集队列未连接，请检查任务服务"]
            session.commit()
            raise HTTPException(503, "采集队列未连接，任务未开始") from exc
    return run_read(run)
