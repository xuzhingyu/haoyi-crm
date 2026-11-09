"""Additive bridge records; original CRM rows and keys remain authoritative."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class ExternalOperation(Base):
    __tablename__ = "external_operations"
    request_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    request_digest: Mapped[str] = mapped_column(String(64))
    actor_sub: Mapped[str] = mapped_column(String(100))
    actor_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    result_json: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ExternalLeadLink(Base):
    __tablename__ = "external_lead_links"
    __table_args__ = (UniqueConstraint("source_system", "source_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    source_system: Mapped[str] = mapped_column(String(40))
    source_id: Mapped[str] = mapped_column(String(100))
    lead_id: Mapped[int] = mapped_column(ForeignKey("repair_shop_leads.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
