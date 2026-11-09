from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class LeadListItem(BaseModel):
    id: int
    shop_name: str
    province: str | None
    city: str | None
    district: str | None
    social_credit_code: str | None
    address: str | None
    new_energy_lifts: int | None
    monthly_order_count: int | None
    source: str
    status: str = "active"


class ExecutiveLeadItem(BaseModel):
    id: int
    shop_name: str
    province: str | None
    city: str | None
    district: str | None
    social_credit_code: str | None
    address: str | None
    new_energy_lifts: int | None
    monthly_order_count: int | None
    source: str


class KnowledgeDocumentCreate(BaseModel):
    title: str
    category: str
    content: str
    version: str = "v1"
    status: str = "draft"
    effective_on: date | None = None

    @field_validator("content")
    @classmethod
    def require_nonblank_content(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("content must contain non-whitespace text")
        return value


class KnowledgeDocumentItem(KnowledgeDocumentCreate):
    id: int
    parent_id: int | None = None
    archived_at: datetime | None = None
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AssistanceRegionKey(BaseModel):
    province: str | None = None
    city: str | None = None


class AssistanceRegion(AssistanceRegionKey):
    constituent_regions: list[AssistanceRegionKey] = Field(default_factory=list)


class AssistanceHistoryItem(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class AssistanceRequest(BaseModel):
    question: str
    mode: Literal[
        "operations",
        "knowledge",
        "visit_prep",
        "weekly_report",
        "feedback",
        "opportunity",
        "review",
    ] = "knowledge"
    period: str | None = None
    lead_id: int | None = None
    region: AssistanceRegion | None = None
    history: list[AssistanceHistoryItem] = Field(default_factory=list)


class ReportCreate(BaseModel):
    report_name: str
    period: str


class LoginRequest(BaseModel):
    username: str
    password: str
