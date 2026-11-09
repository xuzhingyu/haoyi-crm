from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from lead_core.api.schemas import (
    BusinessContactRead,
    ClaimDetailRead,
    ClaimListRead,
    ClaimRead,
    ContactPreferenceCreate,
    ContactPreferenceRead,
    EvidenceRead,
    InteractionCreate,
    InteractionRead,
    LeadCard,
    OpportunityRead,
    OpportunityUpdate,
    PoolRead,
    RepresentativeRead,
)
from lead_core.db import get_session
from lead_core.domain.claims import ClaimPolicy
from lead_core.domain.preferences import ContactPreferencePolicy, PreferenceKind
from lead_core.models import (
    Claim,
    ContactPreference,
    Evidence,
    Interaction,
    LeadListing,
    Opportunity,
    RepairBusiness,
)
from lead_core.security.auth import (
    Principal,
    get_principal,
    require_franchise_principal,
    require_hq_role,
)
from lead_core.services.events import enqueue_outbox, record_audit

router = APIRouter(tags=["leads"])


def _apply_contact_preference(
    session: Session,
    *,
    claim: Claim,
    principal: Principal,
    kind: str,
    reason: str | None,
    cipher,
    now: datetime,
) -> tuple[ContactPreference, LeadListing]:
    listing = session.get(LeadListing, claim.listing_id)
    if listing is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "listing not found")
    decision = ContactPreferencePolicy().apply(PreferenceKind(kind), now)
    preference = ContactPreference(
        business_id=listing.business_id,
        claim_id=claim.id,
        org_id=claim.org_id,
        kind=kind,
        reason_encrypted=cipher.encrypt(reason),
        cooldown_until=decision.cooldown_until,
        globally_blocked=decision.globally_blocked,
    )
    session.add(preference)
    claim.status = "released"
    claim.released_at = now
    claim.release_reason = kind
    listing.claimed_by_org_id = None
    if decision.globally_blocked:
        listing.status = "dnc"
        listing.dnc_at = now
    else:
        listing.status = "cooldown"
        listing.cooldown_until = decision.cooldown_until
    session.flush()
    record_audit(
        session,
        principal=principal,
        action="contact_preference.created",
        entity_type="business",
        entity_id=listing.business_id,
        details={"kind": kind, "listing_status": listing.status},
    )
    enqueue_outbox(
        session,
        dedupe_key=f"contact_preference.created:{preference.id}",
        aggregate_type="contact_preference",
        aggregate_id=preference.id,
        event_type="contact_preference.created",
        payload={
            "preference_id": preference.id,
            "business_id": listing.business_id,
            "kind": preference.kind,
            "globally_blocked": preference.globally_blocked,
        },
    )
    return preference, listing


def _claim_read(claim: Claim) -> ClaimRead:
    return ClaimRead(
        id=claim.id,
        listing_id=claim.listing_id,
        status=claim.status,
        claimed_at=claim.claimed_at,
        first_touch_due=claim.first_touch_due,
        activity_due=claim.activity_due,
        protected_until=claim.protected_until,
    )


def _owned_claim(
    session: Session,
    claim_id: str,
    principal: Principal,
    *,
    allow_hq: bool = False,
    require_active: bool = False,
) -> Claim:
    claim = session.get(Claim, claim_id)
    if claim is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "claim not found")
    if allow_hq and principal.is_hq:
        require_hq_role(principal, *(["hq_admin", "hq_franchise_manager"] if require_active else ["hq_admin", "hq_franchise_manager", "hq_executive", "hq_auditor"]))
        if require_active and claim.status != "active":
            raise HTTPException(status.HTTP_409_CONFLICT, "claim is no longer active")
        return claim
    require_franchise_principal(principal)
    if claim.org_id != principal.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "claim not found")
    if require_active and claim.status != "active":
        raise HTTPException(status.HTTP_409_CONFLICT, "claim is no longer active")
    return claim


def _build_claim_detail(session: Session, claim: Claim, cipher) -> ClaimDetailRead:
    listing = session.get(LeadListing, claim.listing_id)
    if listing is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "listing not found")
    business = session.get(RepairBusiness, listing.business_id)
    if business is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "business not found")
    evidence = session.scalars(
        select(Evidence).where(Evidence.business_id == business.id).order_by(Evidence.captured_at)
    ).all()
    representative = None
    representative_name = cipher.decrypt(business.representative_name_encrypted)
    business_phone = cipher.decrypt(business.business_phone_encrypted)
    if representative_name and business.representative_role:
        representative = RepresentativeRead(
            name=representative_name,
            role=business.representative_role,
        )
    contacts = []
    if business_phone:
        contacts.append(BusinessContactRead(kind="phone", value=business_phone))
    return ClaimDetailRead(
        **_claim_read(claim).model_dump(),
        business_name=business.business_name,
        city=business.city,
        district=business.district,
        category=business.category,
        full_address=business.full_address,
        filing_number=business.filing_number,
        unified_social_credit_code=business.unified_social_credit_code,
        representative=representative,
        business_contacts=contacts,
        evidence=[
            EvidenceRead(
                field=item.field_name,
                value=(
                    cipher.decrypt(item.source_value_encrypted)
                    if item.source_value_encrypted
                    else item.source_value or ""
                ),
                source_url=item.source_url,
                captured_at=item.captured_at,
            )
            for item in evidence
        ],
    )


@router.get("/pool", response_model=PoolRead)
def get_pool(
    city: str | None = None,
    district: str | None = None,
    category: str | None = None,
    cursor: str | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> PoolRead:
    if not principal.is_hq:
        require_franchise_principal(principal)
    query = (
        select(LeadListing, RepairBusiness)
        .join(RepairBusiness, RepairBusiness.id == LeadListing.business_id)
        .where(LeadListing.status == "available")
        .order_by(LeadListing.id)
        .limit(limit + 1)
    )
    if city:
        query = query.where(RepairBusiness.city == city)
    if district:
        query = query.where(RepairBusiness.district == district)
    if category:
        query = query.where(RepairBusiness.category == category)
    if cursor:
        query = query.where(LeadListing.id > cursor)
    rows = session.execute(query).all()
    page = rows[:limit]
    next_cursor = page[-1][0].id if len(rows) > limit else None
    return PoolRead(
        items=[
            LeadCard(
                id=listing.id,
                business_name=business.business_name,
                city=business.city,
                district=business.district,
                categories=[business.category],
                freshness_date=business.freshness_date,
                completeness_grade=business.completeness_grade,
                status=listing.status,
            )
            for listing, business in page
        ],
        next_cursor=next_cursor,
    )


@router.post("/leads/{listing_id}/claim", response_model=ClaimRead, status_code=status.HTTP_201_CREATED)
def claim_lead(
    listing_id: str,
    response: Response,
    request: Request,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=1, max_length=200),
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> ClaimRead:
    require_franchise_principal(principal)
    replay = session.scalar(
        select(Claim).where(
            Claim.org_id == principal.org_id,
            Claim.user_id == principal.user_id,
            Claim.idempotency_key == idempotency_key,
        )
    )
    if replay is not None:
        if replay.listing_id != listing_id:
            raise HTTPException(status.HTTP_409_CONFLICT, "idempotency key reused")
        response.status_code = status.HTTP_200_OK
        return _claim_read(replay)

    if not request.app.state.claim_rate_limiter.allow(principal.user_id):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "claim rate limit exceeded")

    exists = session.get(LeadListing, listing_id)
    if exists is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "listing not found")
    claimed = session.execute(
        update(LeadListing)
        .where(LeadListing.id == listing_id, LeadListing.status == "available")
        .values(status="claimed", claimed_by_org_id=principal.org_id)
    )
    if claimed.rowcount != 1:
        session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "lead is no longer available")

    now = datetime.now(UTC)
    deadlines = ClaimPolicy().deadlines_for(now)
    claim = Claim(
        listing_id=listing_id,
        org_id=principal.org_id,
        user_id=principal.user_id,
        idempotency_key=idempotency_key,
        claimed_at=now,
        first_touch_due=deadlines.first_touch_due,
        activity_due=deadlines.activity_due,
        protected_until=deadlines.protected_until,
    )
    session.add(claim)
    session.flush()
    record_audit(
        session,
        principal=principal,
        action="lead.claimed",
        entity_type="claim",
        entity_id=claim.id,
        details={"listing_id": listing_id},
    )
    enqueue_outbox(
        session,
        dedupe_key=f"claim.created:{claim.id}",
        aggregate_type="claim",
        aggregate_id=claim.id,
        event_type="claim.created",
        payload={
            "claim_id": claim.id,
            "listing_id": listing_id,
            "org_id": claim.org_id,
            "status": claim.status,
        },
    )
    session.commit()
    return _claim_read(claim)


@router.get("/claims", response_model=ClaimListRead)
def list_claims(
    request: Request,
    claim_status: str | None = Query(default=None, alias="status"),
    cursor: str | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> ClaimListRead:
    require_franchise_principal(principal)
    query = select(Claim).where(Claim.org_id == principal.org_id).order_by(Claim.id).limit(limit + 1)
    if cursor:
        query = query.where(Claim.id > cursor)
    if claim_status:
        query = query.where(Claim.status == claim_status)
    claims = session.scalars(query).all()
    record_audit(
        session,
        principal=principal,
        action="claim.list_viewed",
        entity_type="franchisee",
        entity_id=principal.org_id or "",
        details={"count": len(claims)},
    )
    result = ClaimListRead(items=[_build_claim_detail(session, claim, request.app.state.cipher) for claim in claims[:limit]], next_cursor=claims[limit-1].id if len(claims) > limit else None)
    session.commit()
    return result


@router.get("/claims/{claim_id}", response_model=ClaimDetailRead)
def get_claim_detail(
    claim_id: str,
    request: Request,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> ClaimDetailRead:
    claim = _owned_claim(session, claim_id, principal, allow_hq=True)
    detail = _build_claim_detail(session, claim, request.app.state.cipher)
    record_audit(
        session,
        principal=principal,
        action="claim.private_detail_viewed",
        entity_type="claim",
        entity_id=claim.id,
        details={"owner_org_id": claim.org_id},
    )
    session.commit()
    return detail


@router.post(
    "/claims/{claim_id}/interactions",
    response_model=InteractionRead,
    status_code=status.HTTP_201_CREATED,
)
def add_interaction(
    claim_id: str,
    payload: InteractionCreate,
    request: Request,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> InteractionRead:
    claim = _owned_claim(session, claim_id, principal, allow_hq=True, require_active=True)
    now = datetime.now(UTC)
    interaction = Interaction(
        claim_id=claim.id,
        org_id=claim.org_id,
        user_id=principal.user_id,
        channel=payload.channel,
        outcome=payload.outcome,
        notes_encrypted=request.app.state.cipher.encrypt(payload.notes),
        occurred_at=now,
        next_follow_up_at=payload.next_follow_up_at,
    )
    claim.activity_due = ClaimPolicy().deadlines_for(now).activity_due
    session.add(interaction)
    session.flush()
    record_audit(
        session,
        principal=principal,
        action="interaction.created",
        entity_type="interaction",
        entity_id=interaction.id,
        details={"claim_id": claim.id, "outcome": interaction.outcome},
    )
    enqueue_outbox(
        session,
        dedupe_key=f"interaction.created:{interaction.id}",
        aggregate_type="interaction",
        aggregate_id=interaction.id,
        event_type="interaction.created",
        payload={
            "interaction_id": interaction.id,
            "claim_id": claim.id,
            "org_id": claim.org_id,
            "outcome": interaction.outcome,
        },
    )
    if payload.outcome in {"soft_reject", "hard_optout"}:
        _apply_contact_preference(
            session,
            claim=claim,
            principal=principal,
            kind=payload.outcome,
            reason=payload.notes,
            cipher=request.app.state.cipher,
            now=now,
        )
    session.commit()
    return InteractionRead(
        id=interaction.id,
        channel=interaction.channel,
        outcome=interaction.outcome,
        occurred_at=interaction.occurred_at,
        next_follow_up_at=interaction.next_follow_up_at,
    )


@router.put("/claims/{claim_id}/opportunity", response_model=OpportunityRead)
def update_opportunity(
    claim_id: str,
    payload: OpportunityUpdate,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> OpportunityRead:
    claim = _owned_claim(session, claim_id, principal, allow_hq=True, require_active=True)
    opportunity = session.scalar(select(Opportunity).where(Opportunity.claim_id == claim.id))
    if opportunity is None:
        opportunity = Opportunity(claim_id=claim.id, org_id=claim.org_id)
        session.add(opportunity)
    opportunity.stage = payload.stage
    opportunity.expected_value = payload.expected_value
    session.flush()
    record_audit(
        session,
        principal=principal,
        action="opportunity.updated",
        entity_type="opportunity",
        entity_id=opportunity.id,
        details={"claim_id": claim.id, "stage": opportunity.stage},
    )
    enqueue_outbox(
        session,
        dedupe_key=f"opportunity.updated:{opportunity.id}:{opportunity.stage}:{opportunity.updated_at.isoformat()}",
        aggregate_type="opportunity",
        aggregate_id=opportunity.id,
        event_type="opportunity.updated",
        payload={
            "opportunity_id": opportunity.id,
            "claim_id": claim.id,
            "org_id": claim.org_id,
            "stage": opportunity.stage,
            "expected_value": str(opportunity.expected_value) if opportunity.expected_value is not None else None,
        },
    )
    session.commit()
    value = opportunity.expected_value
    return OpportunityRead(
        stage=opportunity.stage,
        expected_value=f"{Decimal(value):.2f}" if value is not None else None,
    )


@router.post(
    "/claims/{claim_id}/contact-preference",
    response_model=ContactPreferenceRead,
    status_code=status.HTTP_201_CREATED,
)
def set_contact_preference(
    claim_id: str,
    payload: ContactPreferenceCreate,
    request: Request,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> ContactPreferenceRead:
    claim = _owned_claim(session, claim_id, principal, require_active=True)
    preference, listing = _apply_contact_preference(
        session,
        claim=claim,
        principal=principal,
        kind=payload.kind,
        reason=payload.reason,
        cipher=request.app.state.cipher,
        now=datetime.now(UTC),
    )
    session.commit()
    return ContactPreferenceRead(
        id=preference.id,
        kind=preference.kind,
        listing_status=listing.status,
        cooldown_until=preference.cooldown_until,
    )
