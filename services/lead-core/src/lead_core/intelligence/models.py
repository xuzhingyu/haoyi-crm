from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from lead_core.models import Base, new_id, utc_now


class NewsSource(Base):
    __tablename__ = "intelligence_sources"
    id: Mapped[str] = mapped_column(String(60), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    url: Mapped[str] = mapped_column(Text)
    topic: Mapped[str] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(20), default="active")
    adapter: Mapped[str] = mapped_column(String(40), default="direct_html")
    external_id: Mapped[str | None] = mapped_column(String(100))
    last_fetched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)


class Article(Base):
    __tablename__ = "intelligence_articles"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    source_id: Mapped[str] = mapped_column(ForeignKey("intelligence_sources.id"), index=True)
    title: Mapped[str] = mapped_column(String(500))
    url: Mapped[str] = mapped_column(Text)
    url_hash: Mapped[str] = mapped_column(String(64), unique=True)
    topic: Mapped[str] = mapped_column(String(80), index=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    summary: Mapped[str] = mapped_column(Text, default="")
    analysis: Mapped[str] = mapped_column(Text, default="")
    analysis_status: Mapped[str] = mapped_column(String(20), default="not_started")
    upstream_id: Mapped[str | None] = mapped_column(String(200))
    content: Mapped[str] = mapped_column(Text, default="")
    content_kind: Mapped[str] = mapped_column(String(30), default="index_only")
    upstream_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    snapshot_hash: Mapped[str | None] = mapped_column(String(64))


class ArticleNote(Base):
    __tablename__ = "intelligence_notes"
    __table_args__ = (UniqueConstraint("user_id", "article_id"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(String(100), index=True)
    article_id: Mapped[str] = mapped_column(ForeignKey("intelligence_articles.id"))
    note: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class IntelligenceFollow(Base):
    __tablename__ = "intelligence_follows"
    __table_args__ = (UniqueConstraint("user_id", "kind", "value"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(String(100), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    value: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class SavedArticle(Base):
    __tablename__ = "intelligence_saved"
    __table_args__ = (UniqueConstraint("user_id", "article_id"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(String(100), index=True)
    article_id: Mapped[str] = mapped_column(ForeignKey("intelligence_articles.id"))


class Research(Base):
    __tablename__ = "research_tasks"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    title: Mapped[str] = mapped_column(String(300))
    question: Mapped[str] = mapped_column(Text)
    created_by: Mapped[str] = mapped_column(String(100), index=True)
    status: Mapped[str] = mapped_column(String(30), default="queued", index=True)
    phase: Mapped[str] = mapped_column(String(100), default="等待调度")
    report: Mapped[str] = mapped_column(Text, default="")
    citations: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    article_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    create_task: Mapped[bool] = mapped_column(Boolean, default=False)
    include_business_context: Mapped[bool] = mapped_column(Boolean, default=False)
    business_context: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    watch: Mapped[bool] = mapped_column(Boolean, default=False)
    parent_id: Mapped[str | None] = mapped_column(String(36), index=True)
    external_event_id: Mapped[str | None] = mapped_column(String(100))
    error: Mapped[str | None] = mapped_column(Text)
    cost_cny: Mapped[Decimal] = mapped_column(Numeric(12, 6), default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class WorkTask(Base):
    __tablename__ = "workspace_tasks"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="open", index=True)
    created_by: Mapped[str] = mapped_column(String(100))
    assignee_id: Mapped[str] = mapped_column(String(100))
    research_id: Mapped[str | None] = mapped_column(ForeignKey("research_tasks.id"), unique=True)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class BudgetDay(Base):
    __tablename__ = "ai_budget_days"
    day: Mapped[str] = mapped_column(String(10), primary_key=True)
    spent: Mapped[Decimal] = mapped_column(Numeric(12, 6), default=0)
    reserved: Mapped[Decimal] = mapped_column(Numeric(12, 6), default=0)


class AiJob(Base):
    __tablename__ = "ai_jobs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    request_id: Mapped[str] = mapped_column(String(180), unique=True)
    input_hash: Mapped[str] = mapped_column(String(64), default="")
    source_system: Mapped[str] = mapped_column(String(40))
    purpose: Mapped[str] = mapped_column(String(80))
    actor_sub: Mapped[str] = mapped_column(String(100))
    source_id: Mapped[str | None] = mapped_column(String(180))
    research_id: Mapped[str | None] = mapped_column(ForeignKey("research_tasks.id"))
    status: Mapped[str] = mapped_column(String(30), default="queued", index=True)
    cost_cny: Mapped[Decimal] = mapped_column(Numeric(12, 6), default=0)
    response: Mapped[dict | None] = mapped_column(JSON)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ModelCall(Base):
    __tablename__ = "ai_model_calls"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    day: Mapped[str] = mapped_column(ForeignKey("ai_budget_days.day"), index=True)
    research_id: Mapped[str | None] = mapped_column(ForeignKey("research_tasks.id"), index=True)
    ai_job_id: Mapped[str | None] = mapped_column(ForeignKey("ai_jobs.id"), index=True)
    reserved: Mapped[Decimal] = mapped_column(Numeric(12, 6))
    cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 6))
    status: Mapped[str] = mapped_column(String(30), default="reserved")
    input_tokens: Mapped[int | None] = mapped_column(Integer)
    output_tokens: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class Proposal(Base):
    __tablename__ = "workspace_proposals"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    research_id: Mapped[str | None] = mapped_column(ForeignKey("research_tasks.id"))
    kind: Mapped[str] = mapped_column(String(60))
    target_id: Mapped[str] = mapped_column(String(36))
    target_system: Mapped[str] = mapped_column(String(40), default="lead_core")
    target_version: Mapped[str | None] = mapped_column(String(100))
    execution_result: Mapped[dict | None] = mapped_column(JSON)
    last_error: Mapped[str | None] = mapped_column(Text)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    created_by: Mapped[str] = mapped_column(String(100))
    confirmed_by: Mapped[str | None] = mapped_column(String(100))
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class IntegrationCursor(Base):
    __tablename__ = "intelligence_cursors"
    name: Mapped[str] = mapped_column(String(60), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)


class WorkspaceMember(Base):
    __tablename__ = "workspace_members"
    user_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(200))
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
