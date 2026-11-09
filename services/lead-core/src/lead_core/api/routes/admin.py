from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from lead_core.api.schemas import (
    CandidateCreate,
    CandidateDecisionUpdate,
    CandidateDetailRead,
    CandidateRead,
    DncLiftCreate,
    FranchiseeCreate,
    FranchiseeRead,
    ListingStatusRead,
    MembershipCreate,
    MembershipRead,
    PublicationCreate,
    PublicationRead,
    SourceCreate,
    SourceDetailRead,
    SourceIngestCreate,
    SourceIngestRead,
    SourceRead,
    SourceUpdate,
)
from lead_core.db import get_session
from lead_core.domain.classification import RepairBusinessClassifier
from lead_core.ingestion.parsers import ParseFormat
from lead_core.ingestion.service import DuplicateDocumentError
from lead_core.ingestion.source_policy import SourceAccessPolicy, SourceDefinition
from lead_core.models import (
    Evidence,
    ExtractionCandidate,
    Franchisee,
    LeadListing,
    Membership,
    RepairBusiness,
    Source,
    SourceDocument,
)
from lead_core.security.auth import Principal, get_principal, require_hq_role
from lead_core.services.events import enqueue_outbox, record_audit
from lead_core.services.inventory import publication_status_for_city
from lead_core.services.memberships import MembershipLimitError, add_membership

router = APIRouter(prefix="/admin", tags=["admin"])
HQ_DATA_ROLES = ("hq_admin", "hq_data_reviewer")
HQ_FRANCHISE_ROLES = ("hq_admin", "hq_franchise_manager")
KNOWN_CATEGORIES = {
    "comprehensive_repair",
    "quick_maintenance",
    "tire_electrical",
    "beauty_maintenance",
}


def _source_detail(source: Source) -> SourceDetailRead:
    return SourceDetailRead(
        id=source.id,
        name=source.name,
        status=source.status,
        base_url=source.base_url,
        allowed_domains=source.allowed_domains,
        allowed_path_prefixes=source.allowed_path_prefixes,
        allowed_fields=source.allowed_fields,
        rate_limit_per_minute=source.rate_limit_per_minute,
        personal_fields_approved=source.personal_fields_approved,
        terms_checked_at=source.terms_checked_at,
    )


def _candidate_detail(
    candidate: ExtractionCandidate,
    *,
    request: Request,
    principal: Principal,
) -> CandidateDetailRead:
    business = dict(candidate.business_data)
    if principal.has_any_role("hq_admin", "hq_franchise_manager"):
        business = request.app.state.cipher.reveal_mapping(business)
    else:
        for field in ("representative_name", "representative_role", "business_phone"):
            business.pop(field, None)
    return CandidateDetailRead(
        id=candidate.id,
        status=candidate.status,
        source_id=candidate.source_id,
        business=business,
        created_at=candidate.created_at,
    )


@router.post("/sources", response_model=SourceRead, status_code=status.HTTP_201_CREATED)
def create_source(
    payload: SourceCreate,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> SourceRead:
    require_hq_role(principal, *HQ_DATA_ROLES)
    if payload.personal_fields_approved:
        require_hq_role(principal, "hq_admin")
    source = Source(
        name=payload.name,
        base_url=str(payload.base_url),
        allowed_domains=payload.allowed_domains,
        allowed_path_prefixes=payload.allowed_path_prefixes,
        allowed_fields=payload.allowed_fields,
        rate_limit_per_minute=payload.rate_limit_per_minute,
        status=payload.status,
        personal_fields_approved=payload.personal_fields_approved,
    )
    session.add(source)
    try:
        session.flush()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "source already exists") from exc
    record_audit(
        session,
        principal=principal,
        action="source.created",
        entity_type="source",
        entity_id=source.id,
        details={"status": source.status},
    )
    session.commit()
    return SourceRead(id=source.id, name=source.name, status=source.status)


@router.get("/sources", response_model=list[SourceDetailRead])
def list_sources(
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> list[SourceDetailRead]:
    require_hq_role(principal, *HQ_DATA_ROLES)
    return [_source_detail(source) for source in session.scalars(select(Source).order_by(Source.name))]


@router.get("/sources/{source_id}", response_model=SourceDetailRead)
def get_source(
    source_id: str,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> SourceDetailRead:
    require_hq_role(principal, *HQ_DATA_ROLES)
    source = session.get(Source, source_id)
    if source is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "source not found")
    return _source_detail(source)


@router.patch("/sources/{source_id}", response_model=SourceDetailRead)
def update_source(
    source_id: str,
    payload: SourceUpdate,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> SourceDetailRead:
    require_hq_role(principal, *HQ_DATA_ROLES)
    source = session.get(Source, source_id)
    if source is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "source not found")
    changes = payload.model_dump(exclude_unset=True)
    if "personal_fields_approved" in changes:
        require_hq_role(principal, "hq_admin")
    for field, value in changes.items():
        setattr(source, field, value)
    source.terms_checked_at = datetime.now(UTC)
    record_audit(
        session,
        principal=principal,
        action="source.updated",
        entity_type="source",
        entity_id=source.id,
        details={"changed_fields": sorted(changes), "status": source.status},
    )
    session.commit()
    return _source_detail(source)


@router.post(
    "/sources/{source_id}/ingest",
    response_model=SourceIngestRead,
    status_code=status.HTTP_201_CREATED,
)
def ingest_source(
    source_id: str,
    payload: SourceIngestCreate,
    request: Request,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> SourceIngestRead:
    require_hq_role(principal, *HQ_DATA_ROLES)
    source = session.get(Source, source_id)
    if source is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "source not found")
    if not request.app.state.source_rate_limiter.allow(
        source.id,
        limit=source.rate_limit_per_minute,
    ):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "source rate limit exceeded")

    try:
        result = request.app.state.ingestion_service.ingest_url(
            session,
            source=source,
            url=str(payload.url),
            format_=ParseFormat(payload.format),
            parser_version=payload.parser_version,
            field_mapping=payload.field_mapping,
            value_mapping=payload.value_mapping,
        )
    except DuplicateDocumentError as exc:
        session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except ValueError as exc:
        session.rollback()
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    except httpx.HTTPError as exc:
        session.rollback()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "source download failed") from exc

    record_audit(
        session,
        principal=principal,
        action="source.ingested",
        entity_type="source_document",
        entity_id=result.document_id,
        details={
            "source_id": source.id,
            "candidates_created": result.candidates_created,
            "requires_manual_review": result.requires_manual_review,
        },
    )
    session.commit()
    return SourceIngestRead(
        document_id=result.document_id,
        candidates_created=result.candidates_created,
        requires_manual_review=result.requires_manual_review,
        review_reason=result.review_reason,
    )


@router.post("/candidates", response_model=CandidateRead, status_code=status.HTTP_201_CREATED)
def create_candidate(
    payload: CandidateCreate,
    request: Request,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> CandidateRead:
    require_hq_role(principal, *HQ_DATA_ROLES)
    source = session.get(Source, payload.source_id)
    if source is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "source not found")
    policy = SourceAccessPolicy(
        SourceDefinition(
            status=source.status,
            allowed_domains=tuple(source.allowed_domains),
            allowed_path_prefixes=tuple(source.allowed_path_prefixes),
            allowed_fields=frozenset(source.allowed_fields),
        )
    )
    try:
        policy.assert_url_allowed(str(payload.source_url))
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    document = SourceDocument(
        source_id=source.id,
        source_url=str(payload.source_url),
        document_hash=payload.document_hash,
        parser_version=payload.parser_version,
        purge_after=datetime.now(UTC) + timedelta(days=30),
    )
    session.add(document)
    try:
        session.flush()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "document already ingested") from exc

    allowed_business = request.app.state.cipher.protect_mapping(
        policy.filter_fields(payload.business.model_dump(exclude_none=True))
    )
    allowed_evidence = []
    for item in payload.evidence:
        if item.field not in source.allowed_fields:
            continue
        if item.field in {"representative_name", "business_phone"}:
            allowed_evidence.append(
                {
                    "field": item.field,
                    "value_encrypted": request.app.state.cipher.encrypt(item.value),
                }
            )
        else:
            allowed_evidence.append(item.model_dump())
    candidate = ExtractionCandidate(
        source_id=source.id,
        source_document_id=document.id,
        business_data=allowed_business,
        evidence_data=allowed_evidence,
    )
    session.add(candidate)
    session.flush()
    record_audit(
        session,
        principal=principal,
        action="candidate.created",
        entity_type="candidate",
        entity_id=candidate.id,
        details={"source_id": source.id},
    )
    session.commit()
    return CandidateRead(id=candidate.id, status=candidate.status)


@router.get("/candidates", response_model=list[CandidateDetailRead])
def list_candidates(
    request: Request,
    candidate_status: str | None = Query(default=None, alias="status"),
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> list[CandidateDetailRead]:
    require_hq_role(principal, *HQ_DATA_ROLES)
    query = select(ExtractionCandidate).order_by(ExtractionCandidate.created_at.desc())
    if candidate_status:
        query = query.where(ExtractionCandidate.status == candidate_status)
    candidates = list(session.scalars(query))
    result = [
        _candidate_detail(candidate, request=request, principal=principal)
        for candidate in candidates
    ]
    record_audit(
        session,
        principal=principal,
        action="candidate.list_viewed",
        entity_type="candidate_queue",
        entity_id=candidate_status or "all",
        details={"count": len(result)},
    )
    session.commit()
    return result


@router.get("/candidates/{candidate_id}", response_model=CandidateDetailRead)
def get_candidate(
    candidate_id: str,
    request: Request,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> CandidateDetailRead:
    require_hq_role(principal, *HQ_DATA_ROLES)
    candidate = session.get(ExtractionCandidate, candidate_id)
    if candidate is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "candidate not found")
    detail = _candidate_detail(candidate, request=request, principal=principal)
    record_audit(
        session,
        principal=principal,
        action="candidate.viewed",
        entity_type="candidate",
        entity_id=candidate.id,
        details={"personal_fields_visible": principal.has_any_role("hq_admin", "hq_franchise_manager")},
    )
    session.commit()
    return detail


@router.patch("/candidates/{candidate_id}", response_model=CandidateDetailRead)
def review_candidate(
    candidate_id: str,
    payload: CandidateDecisionUpdate,
    request: Request,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> CandidateDetailRead:
    require_hq_role(principal, *HQ_DATA_ROLES)
    candidate = session.get(ExtractionCandidate, candidate_id)
    if candidate is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "candidate not found")
    if candidate.status == "published":
        raise HTTPException(status.HTTP_409_CONFLICT, "published candidate cannot be changed")
    candidate.status = payload.status
    record_audit(
        session,
        principal=principal,
        action=f"candidate.{payload.status}",
        entity_type="candidate",
        entity_id=candidate.id,
        details={"reason": payload.reason},
    )
    session.commit()
    return _candidate_detail(candidate, request=request, principal=principal)


@router.post("/franchisees", response_model=FranchiseeRead, status_code=status.HTTP_201_CREATED)
def create_franchisee(
    payload: FranchiseeCreate,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> FranchiseeRead:
    require_hq_role(principal, *HQ_FRANCHISE_ROLES)
    franchisee = Franchisee(id=payload.id, name=payload.name)
    session.add(franchisee)
    try:
        session.flush()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "franchisee already exists") from exc
    record_audit(
        session,
        principal=principal,
        action="franchisee.created",
        entity_type="franchisee",
        entity_id=franchisee.id,
        details={"name": franchisee.name},
    )
    session.commit()
    return FranchiseeRead(id=franchisee.id, name=franchisee.name, status=franchisee.status)


@router.post(
    "/franchisees/{franchisee_id}/memberships",
    response_model=MembershipRead,
    status_code=status.HTTP_201_CREATED,
)
def create_membership(
    franchisee_id: str,
    payload: MembershipCreate,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> MembershipRead:
    require_hq_role(principal, *HQ_FRANCHISE_ROLES)
    try:
        membership = add_membership(
            session,
            franchisee_id=franchisee_id,
            user_id=payload.user_id,
            role=payload.role,
        )
    except MembershipLimitError as exc:
        session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except ValueError as exc:
        session.rollback()
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "membership already exists") from exc
    record_audit(
        session,
        principal=principal,
        action="membership.created",
        entity_type="membership",
        entity_id=membership.id,
        details={"franchisee_id": franchisee_id, "user_id": membership.user_id},
    )
    session.commit()
    return MembershipRead(
        id=membership.id,
        franchisee_id=membership.franchisee_id,
        user_id=membership.user_id,
        role=membership.role,
    )


@router.get(
    "/franchisees/{franchisee_id}/memberships",
    response_model=list[MembershipRead],
)
def list_memberships(
    franchisee_id: str,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> list[MembershipRead]:
    require_hq_role(principal, *HQ_FRANCHISE_ROLES)
    if session.get(Franchisee, franchisee_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "franchisee not found")
    return [
        MembershipRead(
            id=membership.id,
            franchisee_id=membership.franchisee_id,
            user_id=membership.user_id,
            role=membership.role,
        )
        for membership in session.scalars(
            select(Membership)
            .where(Membership.franchisee_id == franchisee_id)
            .order_by(Membership.created_at)
        )
    ]


@router.delete(
    "/franchisees/{franchisee_id}/memberships/{membership_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_membership(
    franchisee_id: str,
    membership_id: str,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> Response:
    require_hq_role(principal, *HQ_FRANCHISE_ROLES)
    membership = session.scalar(
        select(Membership).where(
            Membership.id == membership_id,
            Membership.franchisee_id == franchisee_id,
        )
    )
    if membership is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "membership not found")
    record_audit(
        session,
        principal=principal,
        action="membership.deleted",
        entity_type="membership",
        entity_id=membership.id,
        details={"franchisee_id": franchisee_id, "user_id": membership.user_id},
    )
    session.delete(membership)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/listings/{listing_id}/dnc-lift", response_model=ListingStatusRead)
def lift_listing_dnc(
    listing_id: str,
    payload: DncLiftCreate,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> ListingStatusRead:
    require_hq_role(principal, "hq_admin")
    listing = session.get(LeadListing, listing_id)
    if listing is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "listing not found")
    if listing.status != "dnc":
        raise HTTPException(status.HTTP_409_CONFLICT, "listing is not blocked")
    now = datetime.now(UTC)
    listing.status = "reserve"
    listing.dnc_at = None
    listing.cooldown_until = None
    record_audit(
        session,
        principal=principal,
        action="listing.dnc_lifted",
        entity_type="listing",
        entity_id=listing.id,
        details={
            "basis": payload.basis,
            "evidence_reference": payload.evidence_reference,
        },
    )
    enqueue_outbox(
        session,
        dedupe_key=f"listing.dnc_lifted:{listing.id}:{now.isoformat()}",
        aggregate_type="lead_listing",
        aggregate_id=listing.id,
        event_type="listing.dnc_lifted",
        payload={
            "listing_id": listing.id,
            "status": listing.status,
            "basis": payload.basis,
        },
    )
    session.commit()
    return ListingStatusRead(id=listing.id, status=listing.status)


@router.post(
    "/publications",
    response_model=PublicationRead,
    status_code=status.HTTP_201_CREATED,
)
def publish_candidate(
    payload: PublicationCreate,
    request: Request,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> PublicationRead:
    require_hq_role(principal, *HQ_DATA_ROLES)
    candidate = session.get(ExtractionCandidate, payload.candidate_id)
    if candidate is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "candidate not found")
    if candidate.status != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, "candidate is not pending")
    source = session.get(Source, candidate.source_id)
    document = session.get(SourceDocument, candidate.source_document_id)
    if source is None or document is None or source.status != "approved":
        raise HTTPException(status.HTTP_409_CONFLICT, "source is not approved")

    data = request.app.state.cipher.reveal_mapping(candidate.business_data)
    missing = [field for field in ("business_name", "city", "district", "category") if not data.get(field)]
    if missing:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"candidate missing required fields: {', '.join(missing)}",
        )
    category = str(data["category"])
    if category not in KNOWN_CATEGORIES:
        classification = RepairBusinessClassifier().classify(
            name=str(data["business_name"]),
            business_scope=str(data.get("business_scope", category)),
        )
        if not classification.publishable:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, classification.exclusion_reason)
        category = classification.category or category

    duplicate_conditions = []
    if data.get("unified_social_credit_code"):
        duplicate_conditions.append(
            RepairBusiness.unified_social_credit_code == data["unified_social_credit_code"]
        )
    if data.get("filing_number"):
        duplicate_conditions.append(RepairBusiness.filing_number == data["filing_number"])
    if duplicate_conditions and session.scalar(select(RepairBusiness).where(or_(*duplicate_conditions))):
        raise HTTPException(status.HTTP_409_CONFLICT, "business requires duplicate review")

    person_fields_enabled = (
        request.app.state.settings.person_fields_enabled and source.personal_fields_approved
    )
    full_address = data.get("full_address")
    representative_name = data.get("representative_name") if person_fields_enabled else None
    representative_role = data.get("representative_role") if person_fields_enabled else None
    business_phone = data.get("business_phone") if person_fields_enabled else None
    completeness = "A" if full_address and (representative_name or business_phone) else "B"
    business = RepairBusiness(
        business_name=str(data["business_name"]),
        city=str(data["city"]),
        district=str(data["district"]),
        category=category,
        full_address=str(full_address) if full_address else None,
        filing_number=data.get("filing_number"),
        unified_social_credit_code=data.get("unified_social_credit_code"),
        representative_name_encrypted=request.app.state.cipher.encrypt(representative_name),
        representative_role=representative_role,
        business_phone_encrypted=request.app.state.cipher.encrypt(business_phone),
        freshness_date=date.today(),
        completeness_grade=completeness,
    )
    session.add(business)
    session.flush()

    distributable_person_fields = (
        {"representative_name", "representative_role", "business_phone"}
        if person_fields_enabled
        else set()
    )
    for item in candidate.evidence_data:
        if item["field"] in {"business_name", "city", "district", "category", "full_address", "filing_number", "unified_social_credit_code"} | distributable_person_fields:
            session.add(
                Evidence(
                    business_id=business.id,
                    source_id=source.id,
                    source_document_id=document.id,
                    field_name=item["field"],
                    source_value=(
                        item.get("value")
                        if item["field"] not in {"representative_name", "business_phone"}
                        else None
                    ),
                    source_value_encrypted=(
                        item.get("value_encrypted")
                        if item["field"] in {"representative_name", "business_phone"}
                        else None
                    ),
                    source_url=document.source_url,
                )
            )

    listing = LeadListing(
        business_id=business.id,
        status=publication_status_for_city(
            session,
            city=business.city,
            target=request.app.state.settings.inventory_target_per_city,
        ),
    )
    session.add(listing)
    session.flush()
    candidate.status = "published"
    record_audit(
        session,
        principal=principal,
        action="candidate.published",
        entity_type="listing",
        entity_id=listing.id,
        details={"business_id": business.id, "source_id": source.id},
    )
    enqueue_outbox(
        session,
        dedupe_key=f"business.published:{business.id}",
        aggregate_type="repair_business",
        aggregate_id=business.id,
        event_type="business.published",
        payload={
            "business_id": business.id,
            "listing_id": listing.id,
            "business_name": business.business_name,
            "city": business.city,
            "status": listing.status,
        },
    )
    session.commit()
    return PublicationRead(
        candidate_id=candidate.id,
        business_id=business.id,
        listing_id=listing.id,
    )
