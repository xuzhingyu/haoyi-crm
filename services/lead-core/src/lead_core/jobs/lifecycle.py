from __future__ import annotations

from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from lead_core.domain.claims import ClaimPolicy, FollowUpSignal, InteractionOutcome
from lead_core.models import Claim, Interaction, LeadListing, Opportunity
from lead_core.services.events import enqueue_outbox

ACTIVE_OPPORTUNITY_STAGES = {"qualified", "proposal"}


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def process_claim_expirations(
    session: Session,
    *,
    now: datetime,
    holidays: set[date] | None = None,
) -> dict[str, int]:
    policy = ClaimPolicy(holidays=holidays)
    claims = session.scalars(
        select(Claim).where(Claim.status == "active").with_for_update(skip_locked=True)
    ).all()
    released = 0
    renewed = 0
    for claim in claims:
        interactions = session.scalars(
            select(Interaction)
            .where(Interaction.claim_id == claim.id)
            .order_by(Interaction.occurred_at)
        ).all()
        opportunity = session.scalar(
            select(Opportunity).where(Opportunity.claim_id == claim.id)
        )
        decision = policy.evaluate(
            now=_aware(now),
            claimed_at=_aware(claim.claimed_at),
            protected_until=_aware(claim.protected_until),
            interactions=[
                FollowUpSignal(
                    occurred_at=_aware(item.occurred_at),
                    outcome=InteractionOutcome(item.outcome),
                )
                for item in interactions
            ],
            opportunity_active=bool(
                opportunity and opportunity.stage in ACTIVE_OPPORTUNITY_STAGES
            ),
        )
        if decision.release:
            claim.status = "released"
            claim.released_at = now
            claim.release_reason = decision.reason
            listing = session.get(LeadListing, claim.listing_id)
            if listing and listing.status == "claimed":
                listing.status = "reserve"
                listing.claimed_by_org_id = None
            enqueue_outbox(
                session,
                dedupe_key=f"claim.released:{claim.id}:{decision.reason}",
                aggregate_type="claim",
                aggregate_id=claim.id,
                event_type="claim.released",
                payload={"claim_id": claim.id, "reason": decision.reason},
            )
            released += 1
        elif decision.renew_until:
            claim.protected_until = decision.renew_until
            enqueue_outbox(
                session,
                dedupe_key=f"claim.renewed:{claim.id}:{decision.renew_until.isoformat()}",
                aggregate_type="claim",
                aggregate_id=claim.id,
                event_type="claim.renewed",
                payload={
                    "claim_id": claim.id,
                    "protected_until": decision.renew_until.isoformat(),
                },
            )
            renewed += 1
    return {"released": released, "renewed": renewed}


def release_expired_cooldowns(session: Session, *, now: datetime) -> int:
    listings = session.scalars(
        select(LeadListing)
        .where(
            LeadListing.status == "cooldown",
            LeadListing.cooldown_until.is_not(None),
            LeadListing.cooldown_until <= now,
        )
        .with_for_update(skip_locked=True)
    ).all()
    for listing in listings:
        listing.status = "reserve"
        listing.cooldown_until = None
        enqueue_outbox(
            session,
            dedupe_key=f"listing.cooldown_released:{listing.id}:{now.date().isoformat()}",
            aggregate_type="lead_listing",
            aggregate_id=listing.id,
            event_type="listing.cooldown_released",
            payload={"listing_id": listing.id},
        )
    return len(listings)
