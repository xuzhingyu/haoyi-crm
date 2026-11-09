from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from lead_core.models import Base, new_id, utc_now


class MonitoredCompany(Base):
    __tablename__ = "monitored_companies"
    id: Mapped[str] = mapped_column(String(60), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    verification_status: Mapped[str] = mapped_column(String(50), default="pending_verification")
    relationship_note: Mapped[str] = mapped_column(Text, default="子公司及当前股权关系待核验")


class CompanyRecord(Base):
    __tablename__ = "company_intelligence_records"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    company_id: Mapped[str] = mapped_column(ForeignKey("monitored_companies.id"), index=True)
    dedupe_key: Mapped[str] = mapped_column(String(64), unique=True)
    title: Mapped[str] = mapped_column(String(500))
    category: Mapped[str] = mapped_column(String(30), index=True)
    summary: Mapped[str] = mapped_column(Text, default="")
    source_name: Mapped[str] = mapped_column(String(200))
    source_url: Mapped[str] = mapped_column(Text)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)
    verification_status: Mapped[str] = mapped_column(String(60), default="pending_verification")


class CompanyCollectionRun(Base):
    __tablename__ = "company_intelligence_runs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    mode: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default="queued")
    active_slot: Mapped[str | None] = mapped_column(String(20), unique=True)
    scheduled_day: Mapped[str | None] = mapped_column(String(10), unique=True)
    created_by: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    new_records: Mapped[int] = mapped_column(Integer, default=0)
    errors: Mapped[list[str]] = mapped_column(JSON, default=list)


class CompanyBriefing(Base):
    __tablename__ = "company_intelligence_briefings"
    day: Mapped[str] = mapped_column(String(10), primary_key=True)
    news_count: Mapped[int] = mapped_column(Integer, default=0)
    business_count: Mapped[int] = mapped_column(Integer, default=0)
    sentiment_count: Mapped[int] = mapped_column(Integer, default=0)
    summary: Mapped[str] = mapped_column(Text)
