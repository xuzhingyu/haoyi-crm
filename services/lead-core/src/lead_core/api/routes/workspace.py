from __future__ import annotations

import secrets
from datetime import UTC, datetime
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from lead_core.api.routes.leads import _build_claim_detail, _owned_claim
from lead_core.api.schemas import OpportunityUpdate
from lead_core.db import apply_rls_context, get_session
from lead_core.intelligence.legacy import legacy_overview
from lead_core.intelligence.models import (
    Article,
    ArticleNote,
    IntegrationCursor,
    NewsSource,
    Proposal,
    Research,
    SavedArticle,
    WorkspaceMember,
    WorkTask,
)
from lead_core.intelligence.research import (
    budget_read,
    claim_next,
    dispatch_research,
    execute_research,
    research_runtime,
)
from lead_core.intelligence.source_metadata import source_metadata
from lead_core.intelligence.sources import ensure_sources, refresh_sources
from lead_core.models import (
    Claim,
    Franchisee,
    Interaction,
    LeadListing,
    Opportunity,
    RepairBusiness,
)
from lead_core.security.auth import Principal, get_principal, require_hq_role
from lead_core.services.events import enqueue_outbox, record_audit

router = APIRouter(tags=["workspace"])


def hq(principal: Principal = Depends(get_principal)) -> Principal:
    if not principal.is_hq:
        raise HTTPException(403, "总部工作台权限不足")
    return principal


def commit(session: Session, principal: Principal):
    session.commit()
    apply_rls_context(session, org_id=principal.org_id, is_hq=principal.is_hq)


def permissions(principal: Principal):
    result = ["crm:read"]
    if principal.has_any_role("franchise_owner", "franchise_member", "hq_admin", "hq_franchise_manager"):
        result.append("crm:write")
    if principal.is_hq:
        result += ["research:write", "tasks:write"]
    if principal.has_any_role("hq_admin"):
        result.append("sources:write")
    if principal.has_any_role("hq_admin", "hq_franchise_manager", "hq_executive"):
        result.append("proposals:confirm")
    return result


def article_read(session, row, user_id):
    source = session.get(NewsSource, row.source_id)
    saved = session.scalar(select(SavedArticle.id).where(SavedArticle.user_id == user_id, SavedArticle.article_id == row.id))
    note = session.scalar(select(ArticleNote.note).where(ArticleNote.user_id == user_id, ArticleNote.article_id == row.id))
    return {"note": note or "", "content": row.content, "content_kind": row.content_kind, "upstream_updated_at": row.upstream_updated_at, "snapshot_hash": row.snapshot_hash, "source_nature": source_metadata(session, source)["nature"] if source else "unknown", "id": row.id, "title": row.title, "url": row.url, "source_name": source.name if source else "", "source_id": row.source_id, "topic": row.topic, "published_at": row.published_at, "fetched_at": row.fetched_at, "summary": row.summary, "analysis": row.analysis, "analysis_status": row.analysis_status, "saved": bool(saved)}


def source_read(session, row):
    return {"nature": source_metadata(session, row)["nature"], "metadata": source_metadata(session, row), "id": row.id, "name": row.name, "url": row.url, "topic": row.topic, "status": row.status, "adapter": row.adapter, "last_fetched_at": row.last_fetched_at, "last_error": row.last_error, "article_count": session.scalar(select(func.count()).select_from(Article).where(Article.source_id == row.id, Article.analysis_status != "source_removed"))}


def research_read(row):
    return {key: getattr(row, key) for key in ("id", "title", "question", "status", "phase", "report", "citations", "error", "created_at", "updated_at", "cost_cny", "created_by", "watch", "parent_id", "include_business_context", "business_context")}


def task_read(row):
    return {key: getattr(row, key) for key in ("id", "title", "description", "status", "assignee_id", "research_id", "due_at", "created_at", "created_by")}


def proposal_read(row):
    return {key: getattr(row, key) for key in ("id", "research_id", "kind", "target_id", "target_system", "target_version", "execution_result", "last_error", "payload", "status", "created_at", "confirmed_by", "confirmed_at")}


def integrations(session, settings):
    cursor = session.get(IntegrationCursor, "aihot")
    return {
        "aihot": {"configured": bool(settings.aihot_base_url), "status": "error" if cursor and cursor.last_error else "connected" if cursor and cursor.last_success_at else "not_verified" if settings.aihot_base_url else "not_configured", "last_success_at": cursor.last_success_at if cursor else None, "error": cursor.last_error if cursor else None, "mode": "raw_snapshot_incremental" if settings.aihot_admin_password and cursor and '"watermark"' in cursor.value else "raw_snapshot_pending" if settings.aihot_admin_password else "selected_sync"},
        "autoloop": research_runtime(session, settings),
        "model": {"configured": bool(settings.llm_api_key), "status": "configured" if settings.llm_api_key and settings.llm_input_cny_per_million > 0 and settings.llm_output_cny_per_million > 0 else "not_configured", "name": settings.llm_model},
    }


@router.get("/me")
def me(principal: Principal = Depends(get_principal), session: Session = Depends(get_session)):
    display = principal.display_name or principal.user_id
    organization = session.get(Franchisee, principal.org_id) if principal.org_id else None
    if principal.is_hq:
        member = session.get(WorkspaceMember, principal.user_id)
        if member is None:
            session.add(WorkspaceMember(user_id=principal.user_id, display_name=display))
        else:
            member.display_name, member.last_seen_at = display, datetime.now(UTC)
        commit(session, principal)
    return {"user_id": principal.user_id, "display_name": display, "org_id": principal.org_id, "org_name": organization.name if organization else "浩宜总部" if principal.is_hq else principal.org_id, "roles": sorted(principal.roles), "is_hq": principal.is_hq, "permissions": permissions(principal)}


@router.get("/workspace/members")
def members(principal: Principal = Depends(hq), session: Session = Depends(get_session)):
    return {"items": [{"user_id": row.user_id, "display_name": row.display_name} for row in session.scalars(select(WorkspaceMember).order_by(WorkspaceMember.display_name)).all()]}


@router.get("/workspace/settings")
def workspace_settings(request: Request, principal: Principal = Depends(hq), session: Session = Depends(get_session)):
    settings = request.app.state.settings
    ensure_sources(session)
    result = {"budget": budget_read(session, settings), "integrations": integrations(session, settings), "limits": {"max_rounds": settings.ai_max_rounds, "task_timeout_minutes": settings.ai_task_timeout_minutes, "task_budget_cny": settings.ai_task_budget_cny}, "schedule": {"crawl": "每 10 分钟同步", "briefing": "工作日 08:30（北京时间）"}, "sources": [source_read(session, row) for row in session.scalars(select(NewsSource)).all()]}
    commit(session, principal)
    return result


@router.get("/workspace/overview")
def overview(request: Request, principal: Principal = Depends(get_principal), session: Session = Depends(get_session)):
    claim_filter = [] if principal.is_hq else [Claim.org_id == principal.org_id]
    opp_filter = [] if principal.is_hq else [Opportunity.org_id == principal.org_id]
    if not principal.is_hq and not principal.org_id:
        raise HTTPException(403, "组织信息缺失")
    def count(model, *conds):
        return session.scalar(select(func.count()).select_from(model).where(*conds)) or 0
    stats = {"available_leads": count(LeadListing, LeadListing.status == "available"), "active_claims": count(Claim, Claim.status == "active", *claim_filter), "overdue_followups": count(Claim, Claim.status == "active", Claim.activity_due < datetime.now(UTC), *claim_filter), "opportunities": count(Opportunity, Opportunity.stage.notin_(["none", "lost"]), *opp_filter), "open_tasks": count(WorkTask, WorkTask.status.in_(["open", "in_progress"])) if principal.is_hq else 0, "articles": count(Article) if principal.is_hq else 0}
    stage_counts = dict(session.execute(select(Opportunity.stage, func.count()).where(*opp_filter).group_by(Opportunity.stage)).all())
    result = {"stats": stats, "pipeline": [{"stage": stage, "count": stage_counts.get(stage, 0)} for stage in ["none", "connected", "qualified", "proposal", "won", "lost"]], "recent_articles": [article_read(session, row, principal.user_id) for row in session.scalars(select(Article).where(Article.analysis_status != "source_removed").order_by(func.coalesce(Article.published_at, Article.fetched_at).desc()).limit(4)).all()] if principal.is_hq else [], "recent_research": [research_read(row) for row in session.scalars(select(Research).order_by(Research.created_at.desc()).limit(4)).all()] if principal.is_hq else [], "budget": budget_read(session, request.app.state.settings) if principal.is_hq else None, "integrations": integrations(session, request.app.state.settings) if principal.is_hq else None}
    if principal.is_hq:
        result["legacy_crm"] = legacy_overview(request.app.state.settings)
    return result


@router.get("/hq/claims")
def hq_claims(request: Request, cursor: str | None = None, limit: int = Query(30, ge=1, le=100), principal: Principal = Depends(hq), session: Session = Depends(get_session)):
    query = select(Claim).order_by(Claim.id).limit(limit + 1)
    if cursor:
        query = query.where(Claim.id > cursor)
    rows = session.scalars(query).all()
    return {"items": [_build_claim_detail(session, row, request.app.state.cipher) for row in rows[:limit]], "next_cursor": rows[limit-1].id if len(rows) > limit else None}


@router.get("/hq/franchisees")
def franchisees(principal: Principal = Depends(hq), session: Session = Depends(get_session)):
    return {"items": [{"id": row.id, "name": row.name, "status": row.status} for row in session.scalars(select(Franchisee).order_by(Franchisee.name)).all()]}


@router.get("/opportunities")
def opportunities(cursor: str | None = None, limit: int = Query(30, ge=1, le=100), principal: Principal = Depends(get_principal), session: Session = Depends(get_session)):
    if not principal.is_hq and not principal.org_id:
        raise HTTPException(403, "组织信息缺失")
    query = select(Opportunity, RepairBusiness.business_name).join(Claim, Claim.id == Opportunity.claim_id).join(LeadListing, LeadListing.id == Claim.listing_id).join(RepairBusiness, RepairBusiness.id == LeadListing.business_id).order_by(Opportunity.id).limit(limit + 1)
    if not principal.is_hq:
        query = query.where(Opportunity.org_id == principal.org_id)
    if cursor:
        query = query.where(Opportunity.id > cursor)
    rows = session.execute(query).all()
    return {"items": [{"id": row.id, "claim_id": row.claim_id, "business_name": name, "org_id": row.org_id, "stage": row.stage, "expected_value": str(row.expected_value) if row.expected_value is not None else None, "updated_at": row.updated_at} for row, name in rows[:limit]], "next_cursor": rows[limit-1][0].id if len(rows) > limit else None}


@router.get("/claims/{claim_id}/interactions")
def interactions(claim_id: str, request: Request, principal: Principal = Depends(get_principal), session: Session = Depends(get_session)):
    _owned_claim(session, claim_id, principal, allow_hq=True)
    return [{"id": row.id, "channel": row.channel, "outcome": row.outcome, "notes": request.app.state.cipher.decrypt(row.notes_encrypted), "occurred_at": row.occurred_at, "next_follow_up_at": row.next_follow_up_at} for row in session.scalars(select(Interaction).where(Interaction.claim_id == claim_id).order_by(Interaction.occurred_at.desc())).all()]


@router.get("/intelligence/sources")
def sources(principal: Principal = Depends(hq), session: Session = Depends(get_session)):
    ensure_sources(session)
    result = [source_read(session, row) for row in session.scalars(select(NewsSource)).all()]
    commit(session, principal)
    return result


class SourcePatch(BaseModel):
    status: Literal["active", "paused"]


@router.patch("/intelligence/sources/{source_id}")
def update_source(source_id: str, payload: SourcePatch, request: Request, principal: Principal = Depends(hq), session: Session = Depends(get_session)):
    require_hq_role(principal, "hq_admin")
    row = session.get(NewsSource, source_id)
    if row is None:
        raise HTTPException(404, "来源不存在")
    if row.adapter == "aihot":
        from lead_core.intelligence.sources import set_aihot_source_status
        try:
            set_aihot_source_status(request.app.state.settings, row, payload.status)
        except (httpx.HTTPError, ValueError, KeyError):
            raise HTTPException(502, "上游来源状态修改失败，本地未修改") from None
    row.status, row.last_error = payload.status, None
    record_audit(session, principal=principal, action="intelligence.source_updated", entity_type="news_source", entity_id=row.id, details={"status": row.status})
    commit(session, principal)
    return source_read(session, row)


@router.post("/intelligence/refresh")
def refresh(request: Request, principal: Principal = Depends(hq), session: Session = Depends(get_session)):
    require_hq_role(principal, "hq_admin")
    if not request.app.state.source_rate_limiter.allow("manual-collection:" + principal.user_id, limit=3):
        raise HTTPException(429, "采集请求已提交，请稍后再试")
    settings = request.app.state.settings
    requested = 0
    if settings.aihot_base_url:
        from lead_core.intelligence.source_config import SourceConfigError, request_collection
        try:
            requested = request_collection(session, settings)
        except (SourceConfigError, httpx.HTTPError, ValueError, KeyError):
            raise HTTPException(502, "部分采集请求未完成，请检查信源状态后重试") from None
    result = refresh_sources(session, settings)
    return {**result, "collection_requested": requested}


@router.get("/intelligence/articles")
def articles(topic: str | None = None, q: str | None = None, source_id: str | None = None, followed: bool = False, saved: bool = False, cursor: str | None = None, limit: int = Query(30, ge=1, le=100), principal: Principal = Depends(hq), session: Session = Depends(get_session)):
    sort_time = func.coalesce(Article.published_at, Article.fetched_at)
    query = select(Article).where(Article.analysis_status != "source_removed").order_by(sort_time.desc(), Article.id.desc()).limit(limit + 1)
    if source_id:
        query = query.where(Article.source_id == source_id)
    if followed:
        from lead_core.api.routes.intelligence_engagement import followed_filter
        query = query.where(followed_filter(principal.user_id))
    if topic:
        query = query.where(Article.topic == topic)
    if q:
        query = query.where(Article.title.contains(q, autoescape=True))
    if cursor:
        anchor = session.get(Article, cursor)
        if anchor:
            stamp = anchor.published_at or anchor.fetched_at
            query = query.where((sort_time < stamp) | ((sort_time == stamp) & (Article.id < anchor.id)))
    if saved:
        query = query.join(SavedArticle, SavedArticle.article_id == Article.id).where(SavedArticle.user_id == principal.user_id)
    rows = session.scalars(query).all()
    return {"items": [article_read(session, row, principal.user_id) for row in rows[:limit]], "next_cursor": rows[limit-1].id if len(rows) > limit else None}


@router.get("/intelligence/articles/{article_id}")
def article(article_id: str, principal: Principal = Depends(hq), session: Session = Depends(get_session)):
    row = session.get(Article, article_id)
    if row is None:
        raise HTTPException(404, "资料不存在")
    return article_read(session, row, principal.user_id)


class SavePatch(BaseModel):
    saved: bool


@router.post("/intelligence/articles/{article_id}/save")
def save_article(article_id: str, payload: SavePatch, principal: Principal = Depends(hq), session: Session = Depends(get_session)):
    row = session.get(Article, article_id)
    if row is None:
        raise HTTPException(404, "资料不存在")
    existing = session.scalar(select(SavedArticle).where(SavedArticle.article_id == article_id, SavedArticle.user_id == principal.user_id))
    if payload.saved and existing is None:
        session.add(SavedArticle(article_id=article_id, user_id=principal.user_id))
    elif not payload.saved and existing is not None:
        session.delete(existing)
    commit(session, principal)
    return {"saved": payload.saved}


class ResearchCreate(BaseModel):
    question: str = Field(min_length=3, max_length=4000)
    title: str | None = Field(default=None, max_length=300)
    article_ids: list[str] = Field(default_factory=list, max_length=12)
    create_task: bool = False
    include_business_context: bool = False
    watch: bool = False


def create_research_row(payload, principal, session, settings):
    for ident in payload.article_ids:
        if session.get(Article, ident) is None:
            raise HTTPException(404, "引用资料不存在")
    row = Research(title=payload.title or payload.question[:80], question=payload.question, article_ids=payload.article_ids, created_by=principal.user_id, create_task=payload.create_task, watch=payload.watch, include_business_context=payload.include_business_context)
    session.add(row)
    commit(session, principal)
    dispatch_research(session, settings, row)
    apply_rls_context(session, is_hq=True)
    return row


@router.post("/research", status_code=201)
def create_research(payload: ResearchCreate, request: Request, principal: Principal = Depends(hq), session: Session = Depends(get_session)):
    return research_read(create_research_row(payload, principal, session, request.app.state.settings))


@router.post("/intelligence/articles/{article_id}/analyze", status_code=202)
def analyze(article_id: str, request: Request, principal: Principal = Depends(hq), session: Session = Depends(get_session)):
    article = session.get(Article, article_id)
    if article is None:
        raise HTTPException(404, "资料不存在")
    article.analysis_status = "queued"
    row = create_research_row(ResearchCreate(question="分析这条信息对浩宜新能源售后、保险业务的可能影响，区分事实与推测。", title=article.title[:300], article_ids=[article_id]), principal, session, request.app.state.settings)
    if row.status == "blocked":
        article.analysis_status = "blocked"
        commit(session, principal)
    return research_read(row)


@router.get("/research")
def researches(cursor: str | None = None, limit: int = Query(30, ge=1, le=100), status: Literal["queued", "running", "completed", "failed", "blocked", "cancelled"] | None = None, watch: bool | None = None, principal: Principal = Depends(hq), session: Session = Depends(get_session)):
    query = select(Research).order_by(Research.created_at.desc(), Research.id.desc())
    if status:
        query = query.where(Research.status == status)
    if watch is not None:
        query = query.where(Research.watch.is_(watch))
    if cursor:
        anchor = session.get(Research, cursor)
        if anchor:
            query = query.where((Research.created_at < anchor.created_at) | ((Research.created_at == anchor.created_at) & (Research.id < anchor.id)))
    rows = session.scalars(query.limit(limit + 1)).all()
    return {"items": [research_read(row) for row in rows[:limit]], "next_cursor": rows[limit-1].id if len(rows) > limit else None}


@router.get("/research/{research_id}")
def research_detail(research_id: str, principal: Principal = Depends(hq), session: Session = Depends(get_session)):
    row = session.get(Research, research_id)
    if row is None:
        raise HTTPException(404, "研究任务不存在")
    return research_read(row)


class ResearchPatch(BaseModel):
    watch: bool


@router.patch("/research/{research_id}")
def research_patch(research_id: str, payload: ResearchPatch, principal: Principal = Depends(hq), session: Session = Depends(get_session)):
    row = session.get(Research, research_id)
    if row is None:
        raise HTTPException(404, "研究任务不存在")
    row.watch = payload.watch
    commit(session, principal)
    return research_read(row)


@router.post("/research/{research_id}/retry")
def retry_research(research_id: str, request: Request, principal: Principal = Depends(hq), session: Session = Depends(get_session)):
    row = session.get(Research, research_id)
    if row is None:
        raise HTTPException(404, "研究任务不存在")
    if row.status not in {"blocked", "failed", "cancelled"}:
        raise HTTPException(409, "任务当前不可重试")
    # New identity avoids replaying an already-consumed autoloop event and keeps costs auditable.
    return research_read(create_research_row(ResearchCreate(title=row.title, question=row.question, article_ids=row.article_ids, create_task=row.create_task, include_business_context=row.include_business_context), principal, session, request.app.state.settings))


@router.post("/research/{research_id}/cancel")
def cancel_research(research_id: str, principal: Principal = Depends(hq), session: Session = Depends(get_session)):
    row = session.scalar(select(Research).where(Research.id == research_id).with_for_update())
    if row is None:
        raise HTTPException(404, "研究任务不存在")
    if row.status in {"queued", "running", "blocked"}:
        row.status, row.phase, row.watch = "cancelled", "已停止；已发出的模型请求会结算，后续步骤不再执行", False
        record_audit(session, principal=principal, action="research.cancelled", entity_type="research", entity_id=row.id, details={})
        commit(session, principal)
    return research_read(row)


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    description: str = Field(default="", max_length=5000)
    research_id: str | None = None
    assignee_id: str | None = None
    due_at: datetime | None = None


class TaskPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    description: str | None = Field(default=None, max_length=5000)
    status: Literal["open", "in_progress", "done", "cancelled"] | None = None
    assignee_id: str | None = None
    due_at: datetime | None = None


@router.get("/work-tasks")
def tasks(cursor: str | None = None, limit: int = Query(50, ge=1, le=100), task_status: Literal["open", "in_progress", "done", "cancelled"] | None = Query(None, alias="status"), principal: Principal = Depends(hq), session: Session = Depends(get_session)):
    query = select(WorkTask).order_by(WorkTask.id).limit(limit + 1)
    if task_status:
        query = query.where(WorkTask.status == task_status)
    if cursor:
        query = query.where(WorkTask.id > cursor)
    rows = session.scalars(query).all()
    return {"items": [task_read(row) for row in rows[:limit]], "next_cursor": rows[limit-1].id if len(rows) > limit else None}


def check_assignee(session, principal, assignee):
    if assignee != principal.user_id and not session.get(WorkspaceMember, assignee):
        raise HTTPException(422, "只能分配给已登录工作台的总部成员")


@router.post("/work-tasks", status_code=201)
def create_task(payload: TaskCreate, principal: Principal = Depends(hq), session: Session = Depends(get_session)):
    if payload.research_id and not session.get(Research, payload.research_id):
        raise HTTPException(404, "研究任务不存在")
    if payload.research_id:
        existing = session.scalar(select(WorkTask).where(WorkTask.research_id == payload.research_id))
        if existing:
            return task_read(existing)
    assignee = payload.assignee_id or principal.user_id
    check_assignee(session, principal, assignee)
    row = WorkTask(**payload.model_dump(exclude={"assignee_id"}), assignee_id=assignee, created_by=principal.user_id)
    session.add(row)
    commit(session, principal)
    return task_read(row)


@router.patch("/work-tasks/{task_id}")
def patch_task(task_id: str, payload: TaskPatch, principal: Principal = Depends(hq), session: Session = Depends(get_session)):
    row = session.get(WorkTask, task_id)
    if row is None:
        raise HTTPException(404, "待办不存在")
    if payload.assignee_id:
        check_assignee(session, principal, payload.assignee_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is None and key != "due_at":
            continue
        setattr(row, key, value)
    record_audit(session, principal=principal, action="work_task.updated", entity_type="work_task", entity_id=row.id, details={"status": row.status})
    commit(session, principal)
    return task_read(row)


class ProposalCreate(BaseModel):
    kind: Literal["opportunity_stage"]
    target_id: str
    payload: OpportunityUpdate
    research_id: str | None = None


@router.post("/proposals", status_code=201)
def create_proposal(payload: ProposalCreate, principal: Principal = Depends(hq), session: Session = Depends(get_session)):
    claim = session.get(Claim, payload.target_id)
    if not claim or claim.status != "active":
        raise HTTPException(409, "有效领取记录不存在")
    if payload.research_id and not session.get(Research, payload.research_id):
        raise HTTPException(404, "研究任务不存在")
    opportunity = session.scalar(select(Opportunity).where(Opportunity.claim_id == claim.id))
    data = payload.payload.model_dump(mode="json")
    data["before_stage"] = opportunity.stage if opportunity else "none"
    data["before_updated_at"] = opportunity.updated_at.isoformat() if opportunity else None
    row = Proposal(kind=payload.kind, target_id=claim.id, payload=data, research_id=payload.research_id, created_by=principal.user_id)
    session.add(row)
    commit(session, principal)
    return proposal_read(row)


@router.get("/proposals")
def proposals(research_id: str | None = None, principal: Principal = Depends(hq), session: Session = Depends(get_session)):
    query = select(Proposal).order_by(Proposal.created_at.desc()).limit(100)
    if research_id:
        query = query.where(Proposal.research_id == research_id)
    return {"items": [proposal_read(row) for row in session.scalars(query).all()], "next_cursor": None}


class Confirmation(BaseModel):
    confirmed: Literal[True]


@router.post("/proposals/{proposal_id}/confirm")
def confirm_proposal(proposal_id: str, payload: Confirmation, request: Request, principal: Principal = Depends(hq), session: Session = Depends(get_session)):
    require_hq_role(principal, "hq_admin", "hq_franchise_manager", "hq_executive")
    row = session.scalar(select(Proposal).where(Proposal.id == proposal_id).with_for_update())
    if not row:
        raise HTTPException(404, "待确认操作不存在")
    if row.target_system == "legacy_crm":
        from lead_core.intelligence.crm_bridge import confirm
        return proposal_read(confirm(session, request.app.state.settings, row, principal, request.headers.get("Authorization")))
    if row.status == "confirmed":
        return proposal_read(row)
    if row.status != "pending":
        raise HTTPException(409, "操作已处理")
    claim = session.scalar(select(Claim).where(Claim.id == row.target_id).with_for_update())
    if not claim or claim.status != "active":
        raise HTTPException(409, "领取状态已变化，请重新核对")
    changed = session.execute(update(Proposal).where(Proposal.id == row.id, Proposal.status == "pending").values(status="confirming"))
    if changed.rowcount != 1:
        raise HTTPException(409, "操作已被其他人处理")
    opportunity = session.scalar(select(Opportunity).where(Opportunity.claim_id == claim.id).with_for_update())
    current_stamp = opportunity.updated_at.isoformat() if opportunity else None
    if row.payload.get("before_updated_at") != current_stamp:
        raise HTTPException(409, "商机已更新，请重新提出建议")
    values = OpportunityUpdate.model_validate(row.payload)
    if opportunity is None:
        opportunity = Opportunity(claim_id=claim.id, org_id=claim.org_id)
        session.add(opportunity)
    before = {"stage": opportunity.stage, "expected_value": str(opportunity.expected_value)}
    opportunity.stage, opportunity.expected_value = values.stage, values.expected_value
    row.status, row.confirmed_by, row.confirmed_at = "confirmed", principal.user_id, datetime.now(UTC)
    session.flush()
    record_audit(session, principal=principal, action="proposal.confirmed", entity_type="opportunity", entity_id=opportunity.id, details={"proposal_id": row.id, "before": before, "after": values.model_dump(mode="json")})
    enqueue_outbox(session, dedupe_key="proposal:" + row.id, aggregate_type="opportunity", aggregate_id=opportunity.id, event_type="opportunity.updated", payload={"opportunity_id": opportunity.id, "claim_id": claim.id, "org_id": claim.org_id, "stage": opportunity.stage, "expected_value": str(opportunity.expected_value) if opportunity.expected_value is not None else None})
    commit(session, principal)
    return proposal_read(row)


@router.post("/proposals/{proposal_id}/reject")
def reject_proposal(proposal_id: str, principal: Principal = Depends(hq), session: Session = Depends(get_session)):
    require_hq_role(principal, "hq_admin", "hq_franchise_manager", "hq_executive")
    row = session.get(Proposal, proposal_id)
    if row is None:
        raise HTTPException(404, "待确认操作不存在")
    if row.status == "pending":
        session.execute(update(Proposal).where(Proposal.id == row.id, Proposal.status == "pending").values(status="rejected", confirmed_by=principal.user_id, confirmed_at=datetime.now(UTC)))
        commit(session, principal)
        session.refresh(row)
    return proposal_read(row)


@router.post("/internal/research/run-next", include_in_schema=False)
def run_next(request: Request):
    settings = request.app.state.settings
    supplied = request.headers.get("Authorization", "").removeprefix("Bearer ")
    if not settings.worker_token or not secrets.compare_digest(supplied, settings.worker_token):
        raise HTTPException(401, "worker authorization required")
    with request.app.state.session_factory() as session:
        apply_rls_context(session, is_worker=True)
        row = claim_next(session, settings)
        if row is None:
            if session.scalar(select(Research.id).where(Research.status == "queued").limit(1)):
                return {"outcome": "failed", "error": "研究并发已满，请稍后重试"}
            return {"outcome": "nothing", "summary": "没有待处理的研究任务"}
        return execute_research(session, settings, row)
