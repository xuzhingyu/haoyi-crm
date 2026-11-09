from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from lead_core.models import LeadListing, RepairBusiness
from lead_core.services.inventory import lock_city_inventory


def replenish_city(session: Session, *, city: str, target: int = 200) -> dict[str, int | str]:
    lock_city_inventory(session, city)
    available = session.scalar(
        select(func.count(LeadListing.id))
        .join(RepairBusiness, RepairBusiness.id == LeadListing.business_id)
        .where(RepairBusiness.city == city, LeadListing.status == "available")
    ) or 0
    needed = max(target - available, 0)
    reserve = session.scalars(
        select(LeadListing)
        .join(RepairBusiness, RepairBusiness.id == LeadListing.business_id)
        .where(RepairBusiness.city == city, LeadListing.status == "reserve")
        .order_by(RepairBusiness.freshness_date.desc(), LeadListing.available_since)
        .limit(needed)
        .with_for_update(skip_locked=True)
    ).all()
    now = datetime.now(UTC)
    for listing in reserve:
        listing.status = "available"
        listing.available_since = now
    released = len(reserve)
    current = available + released
    return {
        "city": city,
        "available": current,
        "released": released,
        "shortfall": max(target - current, 0),
    }
