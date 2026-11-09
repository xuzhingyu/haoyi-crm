from __future__ import annotations

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from lead_core.models import LeadListing, RepairBusiness


def lock_city_inventory(session: Session, city: str) -> None:
    if session.get_bind().dialect.name == "postgresql":
        session.execute(
            text("SELECT pg_advisory_xact_lock(hashtext(:city))"),
            {"city": city},
        )


def publication_status_for_city(session: Session, *, city: str, target: int) -> str:
    lock_city_inventory(session, city)
    available = session.scalar(
        select(func.count(LeadListing.id))
        .join(RepairBusiness, RepairBusiness.id == LeadListing.business_id)
        .where(
            RepairBusiness.city == city,
            LeadListing.status == "available",
        )
    ) or 0
    return "available" if available < target else "reserve"
