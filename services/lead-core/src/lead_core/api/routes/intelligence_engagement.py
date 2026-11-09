"""Personal intelligence state belongs to CRM, never to the upstream collector."""
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from lead_core.api.routes.workspace import commit, hq, source_read
from lead_core.db import get_session
from lead_core.intelligence.models import (
    Article,
    ArticleNote,
    IntegrationCursor,
    IntelligenceFollow,
    NewsSource,
    SavedArticle,
)
from lead_core.security.auth import Principal

router = APIRouter(tags=["intelligence"])


def followed_filter(user_id: str):
    sources = select(IntelligenceFollow.value).where(IntelligenceFollow.user_id == user_id, IntelligenceFollow.kind == "source")
    topics = select(IntelligenceFollow.value).where(IntelligenceFollow.user_id == user_id, IntelligenceFollow.kind == "topic")
    return or_(Article.source_id.in_(sources), Article.topic.in_(topics))


class NotePatch(BaseModel):
    note: str = Field(max_length=4000)


@router.patch("/intelligence/articles/{article_id}/note")
def note_patch(article_id: str, payload: NotePatch, principal: Principal = Depends(hq), session: Session = Depends(get_session)):
    if session.get(Article, article_id) is None:
        raise HTTPException(404, "资料不存在")
    row = session.scalar(select(ArticleNote).where(ArticleNote.user_id == principal.user_id, ArticleNote.article_id == article_id))
    if row is None:
        row = ArticleNote(user_id=principal.user_id, article_id=article_id)
        session.add(row)
    row.note = payload.note.strip()
    commit(session, principal)
    return {"note": row.note, "updated_at": row.updated_at}


def follow_read(session: Session, row: IntelligenceFollow):
    source = session.get(NewsSource, row.value) if row.kind == "source" else None
    return {"id": row.id, "kind": row.kind, "value": row.value, "label": source.name if source else row.value, "created_at": row.created_at}


@router.get("/intelligence/follows")
def follows(principal: Principal = Depends(hq), session: Session = Depends(get_session)):
    return {"items": [follow_read(session, row) for row in session.scalars(select(IntelligenceFollow).where(IntelligenceFollow.user_id == principal.user_id).order_by(IntelligenceFollow.created_at)).all()]}


class FollowCreate(BaseModel):
    kind: Literal["topic", "source"]
    value: str = Field(min_length=1, max_length=100)


@router.post("/intelligence/follows")
def follow_create(payload: FollowCreate, principal: Principal = Depends(hq), session: Session = Depends(get_session)):
    if payload.kind == "source" and session.get(NewsSource, payload.value) is None:
        raise HTTPException(404, "来源不存在")
    if payload.kind == "topic" and payload.value not in {"保险科技", "车险理赔", "三电维修", "新能源售后", "维修服务网络"}:
        raise HTTPException(422, "不支持的关注主题")
    row = session.scalar(select(IntelligenceFollow).where(IntelligenceFollow.user_id == principal.user_id, IntelligenceFollow.kind == payload.kind, IntelligenceFollow.value == payload.value))
    if row is None:
        row = IntelligenceFollow(user_id=principal.user_id, kind=payload.kind, value=payload.value)
        session.add(row)
        commit(session, principal)
    return follow_read(session, row)


@router.delete("/intelligence/follows/{follow_id}")
def follow_delete(follow_id: str, principal: Principal = Depends(hq), session: Session = Depends(get_session)):
    row = session.get(IntelligenceFollow, follow_id)
    if row is None or row.user_id != principal.user_id:
        raise HTTPException(404, "关注记录不存在")
    session.delete(row)
    commit(session, principal)
    return {"deleted": True}


@router.get("/intelligence/overview")
def intelligence_overview(principal: Principal = Depends(hq), session: Session = Depends(get_session)):
    visible = Article.analysis_status != "source_removed"
    base = select(func.count()).select_from(Article).where(visible)
    cursor = session.get(IntegrationCursor, "aihot")
    return {"total": session.scalar(base) or 0,
            "saved": session.scalar(base.join(SavedArticle, SavedArticle.article_id == Article.id).where(SavedArticle.user_id == principal.user_id)) or 0,
            "followed": session.scalar(base.where(followed_filter(principal.user_id))) or 0,
            "topics": [{"topic": topic, "count": count} for topic, count in session.execute(select(Article.topic, func.count()).where(visible).group_by(Article.topic).order_by(func.count().desc()))],
            "sources": [source_read(session, row) for row in session.scalars(select(NewsSource).order_by(NewsSource.name))],
            "latest_sync_at": cursor.last_success_at if cursor else None,
            "sync_error": cursor.last_error if cursor else None}
