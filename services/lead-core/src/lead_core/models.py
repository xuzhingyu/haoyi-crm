from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def new_id() -> str:
    return str(uuid4())


def utc_now() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class Source(Base):
    __tablename__ = "sources"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    base_url: Mapped[str] = mapped_column(Text)
    allowed_domains: Mapped[list[str]] = mapped_column(JSON)
    allowed_path_prefixes: Mapped[list[str]] = mapped_column(JSON)
    allowed_fields: Mapped[list[str]] = mapped_column(JSON)
    rate_limit_per_minute: Mapped[int] = mapped_column(Integer, default=6)
    status: Mapped[str] = mapped_column(String(32), default="candidate", index=True)
    personal_fields_approved: Mapped[bool] = mapped_column(Boolean, default=False)
    terms_checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class SourceDocument(Base):
    __tablename__ = "source_documents"
    __table_args__ = (UniqueConstraint("source_id", "document_hash", name="uq_source_document_hash"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    source_id: Mapped[str] = mapped_column(ForeignKey("sources.id"), index=True)
    source_url: Mapped[str] = mapped_column(Text)
    document_hash: Mapped[str] = mapped_column(String(128))
    parser_version: Mapped[str] = mapped_column(String(100))
    object_key: Mapped[str | None] = mapped_column(Text)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    purge_after: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ExtractionCandidate(Base):
    __tablename__ = "extraction_candidates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    source_id: Mapped[str] = mapped_column(ForeignKey("sources.id"), index=True)
    source_document_id: Mapped[str] = mapped_column(ForeignKey("source_documents.id"), index=True)
    business_data: Mapped[dict[str, Any]] = mapped_column(JSON)
    evidence_data: Mapped[list[dict[str, str]]] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class RepairBusiness(Base):
    __tablename__ = "repair_businesses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    business_name: Mapped[str] = mapped_column(String(300), index=True)
    city: Mapped[str] = mapped_column(String(50), index=True)
    district: Mapped[str] = mapped_column(String(80), index=True)
    category: Mapped[str] = mapped_column(String(80), index=True)
    full_address: Mapped[str | None] = mapped_column(Text)
    filing_number: Mapped[str | None] = mapped_column(String(100), unique=True)
    unified_social_credit_code: Mapped[str | None] = mapped_column(String(30), unique=True)
    representative_name_encrypted: Mapped[str | None] = mapped_column(Text)
    representative_role: Mapped[str | None] = mapped_column(String(100))
    business_phone_encrypted: Mapped[str | None] = mapped_column(Text)
    freshness_date: Mapped[date] = mapped_column(Date, default=date.today, index=True)
    completeness_grade: Mapped[str] = mapped_column(String(1), default="B")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class Evidence(Base):
    __tablename__ = "evidence"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    business_id: Mapped[str] = mapped_column(ForeignKey("repair_businesses.id"), index=True)
    source_id: Mapped[str] = mapped_column(ForeignKey("sources.id"), index=True)
    source_document_id: Mapped[str] = mapped_column(ForeignKey("source_documents.id"), index=True)
    field_name: Mapped[str] = mapped_column(String(100))
    source_value: Mapped[str | None] = mapped_column(Text)
    source_value_encrypted: Mapped[str | None] = mapped_column(Text)
    source_url: Mapped[str] = mapped_column(Text)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class Franchisee(Base):
    __tablename__ = "franchisees"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(32), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("franchisee_id", "user_id", name="uq_franchise_user"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    franchisee_id: Mapped[str] = mapped_column(ForeignKey("franchisees.id"), index=True)
    user_id: Mapped[str] = mapped_column(String(100), index=True)
    role: Mapped[str] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class LeadListing(Base):
    __tablename__ = "lead_listings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    business_id: Mapped[str] = mapped_column(ForeignKey("repair_businesses.id"), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(32), default="available", index=True)
    claimed_by_org_id: Mapped[str | None] = mapped_column(String(100), index=True)
    available_since: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    cooldown_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    dnc_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Claim(Base):
    __tablename__ = "claims"
    __table_args__ = (
        UniqueConstraint("org_id", "user_id", "idempotency_key", name="uq_claim_idempotency"),
        Index("ix_claim_org_status", "org_id", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    listing_id: Mapped[str] = mapped_column(ForeignKey("lead_listings.id"), index=True)
    org_id: Mapped[str] = mapped_column(String(100), index=True)
    user_id: Mapped[str] = mapped_column(String(100))
    idempotency_key: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(32), default="active", index=True)
    claimed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    first_touch_due: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    activity_due: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    protected_until: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    release_reason: Mapped[str | None] = mapped_column(String(100))


class Interaction(Base):
    __tablename__ = "interactions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    claim_id: Mapped[str] = mapped_column(ForeignKey("claims.id"), index=True)
    org_id: Mapped[str] = mapped_column(String(100), index=True)
    user_id: Mapped[str] = mapped_column(String(100))
    channel: Mapped[str] = mapped_column(String(50))
    outcome: Mapped[str] = mapped_column(String(50))
    notes_encrypted: Mapped[str | None] = mapped_column(Text)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    next_follow_up_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class FranchiseContact(Base):
    __tablename__ = "franchise_contacts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    business_id: Mapped[str] = mapped_column(ForeignKey("repair_businesses.id"), index=True)
    org_id: Mapped[str] = mapped_column(String(100), index=True)
    kind: Mapped[str] = mapped_column(String(30))
    value_encrypted: Mapped[str] = mapped_column(Text)
    source_attestation: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class Opportunity(Base):
    __tablename__ = "opportunities"
    __table_args__ = (UniqueConstraint("claim_id", name="uq_opportunity_claim"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    claim_id: Mapped[str] = mapped_column(ForeignKey("claims.id"), index=True)
    org_id: Mapped[str] = mapped_column(String(100), index=True)
    stage: Mapped[str] = mapped_column(String(50), default="none")
    expected_value: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class ContactPreference(Base):
    __tablename__ = "contact_preferences"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    business_id: Mapped[str] = mapped_column(ForeignKey("repair_businesses.id"), index=True)
    claim_id: Mapped[str] = mapped_column(ForeignKey("claims.id"), index=True)
    org_id: Mapped[str] = mapped_column(String(100), index=True)
    kind: Mapped[str] = mapped_column(String(50))
    reason_encrypted: Mapped[str | None] = mapped_column(Text)
    cooldown_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    globally_blocked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    actor_user_id: Mapped[str] = mapped_column(String(100), index=True)
    actor_org_id: Mapped[str | None] = mapped_column(String(100), index=True)
    action: Mapped[str] = mapped_column(String(100), index=True)
    entity_type: Mapped[str] = mapped_column(String(100))
    entity_id: Mapped[str] = mapped_column(String(100), index=True)
    details: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)


class OutboxEvent(Base):
    __tablename__ = "outbox_events"
    __table_args__ = (UniqueConstraint("dedupe_key", name="uq_outbox_dedupe_key"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    dedupe_key: Mapped[str] = mapped_column(String(250))
    aggregate_type: Mapped[str] = mapped_column(String(100))
    aggregate_id: Mapped[str] = mapped_column(String(100), index=True)
    event_type: Mapped[str] = mapped_column(String(100), index=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)


class TwentyMirror(Base):
    __tablename__ = "twenty_mirrors"
    __table_args__ = (
        UniqueConstraint("aggregate_type", "aggregate_id", name="uq_twenty_mirror_aggregate"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    aggregate_type: Mapped[str] = mapped_column(String(100), index=True)
    aggregate_id: Mapped[str] = mapped_column(String(100), index=True)
    remote_id: Mapped[str] = mapped_column(String(100), unique=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)
