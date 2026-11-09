from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, field_validator


class SourceCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    base_url: HttpUrl
    allowed_domains: list[str] = Field(min_length=1)
    allowed_path_prefixes: list[str] = Field(min_length=1)
    allowed_fields: list[str] = Field(min_length=1)
    rate_limit_per_minute: int = Field(default=6, ge=1, le=60)
    status: Literal["candidate", "approved", "paused", "revoked"] = "candidate"
    personal_fields_approved: bool = False

    @field_validator("allowed_domains")
    @classmethod
    def reject_wildcard_domains(cls, values: list[str]) -> list[str]:
        if any("*" in value or "/" in value for value in values):
            raise ValueError("allowed_domains must contain exact domain suffixes")
        return [value.lower().strip() for value in values]


class SourceRead(BaseModel):
    id: str
    name: str
    status: str


class SourceDetailRead(SourceRead):
    base_url: str
    allowed_domains: list[str]
    allowed_path_prefixes: list[str]
    allowed_fields: list[str]
    rate_limit_per_minute: int
    personal_fields_approved: bool
    terms_checked_at: datetime


class SourceUpdate(BaseModel):
    allowed_domains: list[str] | None = Field(default=None, min_length=1)
    allowed_path_prefixes: list[str] | None = Field(default=None, min_length=1)
    allowed_fields: list[str] | None = Field(default=None, min_length=1)
    rate_limit_per_minute: int | None = Field(default=None, ge=1, le=60)
    status: Literal["candidate", "approved", "paused", "revoked"] | None = None
    personal_fields_approved: bool | None = None

    @field_validator("allowed_domains")
    @classmethod
    def reject_wildcard_domains(cls, values: list[str] | None) -> list[str] | None:
        if values is None:
            return None
        if any("*" in value or "/" in value for value in values):
            raise ValueError("allowed_domains must contain exact domain suffixes")
        return [value.lower().strip() for value in values]


class SourceIngestCreate(BaseModel):
    url: HttpUrl
    format: Literal["csv", "html", "xlsx", "pdf"]
    parser_version: str = Field(min_length=2, max_length=100)
    field_mapping: dict[str, str] = Field(min_length=1)
    value_mapping: dict[str, dict[str, str]] = Field(default_factory=dict)


class SourceIngestRead(BaseModel):
    document_id: str
    candidates_created: int
    requires_manual_review: bool
    review_reason: str | None


class CandidateBusiness(BaseModel):
    business_name: str
    city: str
    district: str
    category: str
    full_address: str | None = None
    filing_number: str | None = None
    unified_social_credit_code: str | None = None
    representative_name: str | None = None
    representative_role: str | None = None
    business_phone: str | None = None
    business_scope: str | None = None


class EvidenceInput(BaseModel):
    field: str
    value: str


class CandidateCreate(BaseModel):
    source_id: str
    source_url: HttpUrl
    document_hash: str = Field(min_length=3, max_length=128)
    parser_version: str = Field(min_length=2, max_length=100)
    business: CandidateBusiness
    evidence: list[EvidenceInput] = Field(min_length=1)


class CandidateRead(BaseModel):
    id: str
    status: str


class CandidateDetailRead(CandidateRead):
    source_id: str
    business: dict[str, object]
    created_at: datetime


class CandidateDecisionUpdate(BaseModel):
    status: Literal["pending", "rejected"]
    reason: str | None = Field(default=None, max_length=1000)


class PublicationCreate(BaseModel):
    candidate_id: str


class PublicationRead(BaseModel):
    candidate_id: str
    business_id: str
    listing_id: str


class DncLiftCreate(BaseModel):
    basis: Literal["active_request", "new_consent"]
    evidence_reference: str = Field(min_length=10, max_length=500)


class ListingStatusRead(BaseModel):
    id: str
    status: str


class FranchiseeCreate(BaseModel):
    id: str = Field(min_length=2, max_length=100)
    name: str = Field(min_length=2, max_length=200)


class FranchiseeRead(BaseModel):
    id: str
    name: str
    status: str


class MembershipCreate(BaseModel):
    user_id: str = Field(min_length=2, max_length=100)
    role: Literal["franchise_owner", "franchise_member"]


class MembershipRead(BaseModel):
    id: str
    franchisee_id: str
    user_id: str
    role: str


class LeadCard(BaseModel):
    id: str
    business_name: str
    city: str
    district: str
    categories: list[str]
    freshness_date: date
    completeness_grade: str
    status: str


class PoolRead(BaseModel):
    items: list[LeadCard]
    next_cursor: str | None = None


class ClaimRead(BaseModel):
    id: str
    listing_id: str
    status: str
    claimed_at: datetime
    first_touch_due: datetime
    activity_due: datetime
    protected_until: datetime


class RepresentativeRead(BaseModel):
    name: str
    role: str


class BusinessContactRead(BaseModel):
    kind: str
    value: str


class EvidenceRead(BaseModel):
    field: str
    value: str
    source_url: str
    captured_at: datetime


class ClaimDetailRead(ClaimRead):
    business_name: str
    city: str
    district: str
    category: str
    full_address: str | None
    filing_number: str | None
    unified_social_credit_code: str | None
    representative: RepresentativeRead | None
    business_contacts: list[BusinessContactRead]
    evidence: list[EvidenceRead]


class ClaimListRead(BaseModel):
    items: list[ClaimDetailRead]
    next_cursor: str | None = None


class InteractionCreate(BaseModel):
    channel: Literal["phone", "wechat", "visit"]
    outcome: Literal[
        "no_answer",
        "busy",
        "connected",
        "wechat_replied",
        "appointment",
        "quoted",
        "soft_reject",
        "hard_optout",
    ]
    notes: str | None = Field(default=None, max_length=2000)
    next_follow_up_at: datetime | None = None


class InteractionRead(BaseModel):
    id: str
    channel: str
    outcome: str
    occurred_at: datetime
    next_follow_up_at: datetime | None


class OpportunityUpdate(BaseModel):
    stage: Literal["none", "connected", "qualified", "proposal", "won", "lost"]
    expected_value: Decimal | None = Field(default=None, ge=0)


class OpportunityRead(BaseModel):
    stage: str
    expected_value: str | None


class ContactPreferenceCreate(BaseModel):
    kind: Literal["soft_reject", "hard_optout"]
    reason: str | None = Field(default=None, max_length=1000)


class ContactPreferenceRead(BaseModel):
    id: str
    kind: str
    listing_status: str
    cooldown_until: datetime | None


class HealthRead(BaseModel):
    status: Literal["ok"]
