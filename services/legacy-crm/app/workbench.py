import json
from datetime import date, datetime, timedelta

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from .auth import CurrentUser
from .lifecycle import persist, record_event, touch
from .models import (
    ActionItem,
    AiDraft,
    BatchRow,
    DeliveryItem,
    Franchise,
    LeadBatch,
    MonthlySnapshot,
    Opportunity,
    PersonalGoal,
    RepairShopLead,
    SupportRecord,
    TerritoryAuthorization,
    TrainingRecord,
)


def _batch_status(batch: LeadBatch, today: datetime | None = None) -> str:
    if batch.status in {"archived", "confirmed"}:
        return batch.status
    if not batch.dispatched_at:
        return batch.status or "new"
    if batch.confirmed_feedback_json:
        return "confirmed"
    elapsed = (today or datetime.utcnow()) - batch.dispatched_at
    if elapsed.days >= 14:
        return "decision"
    if elapsed.days >= 7:
        return "high_risk"
    if elapsed.days >= 3:
        return "overdue"
    return "dispatched"


def get_batch(session: Session, batch_id: int) -> dict:
    batch = session.get(LeadBatch, batch_id)
    if batch is None:
        raise ValueError("batch not found")
    payload = serialize_batch(session, batch)
    rows = list(session.scalars(select(BatchRow).where(BatchRow.batch_id == batch.id)))
    payload["rows"] = [
        {
            "id": row.id,
            "lead_id": row.lead_id,
            "source_row": row.source_row,
            "shop_name": row.shop_name,
            "status": row.status,
        }
        for row in rows
    ]
    payload["candidates"] = franchise_candidates(session, batch.target_region)
    return payload


def serialize_batch(session: Session, batch: LeadBatch) -> dict:
    rows = list(session.scalars(select(BatchRow).where(BatchRow.batch_id == batch.id)))
    franchise = session.get(Franchise, batch.franchise_id) if batch.franchise_id else None
    return {
        "id": batch.id,
        "target_region": batch.target_region,
        "status": _batch_status(batch),
        "quality": batch.quality,
        "quality_reason": batch.quality_reason,
        "franchise_id": batch.franchise_id,
        "dispatched_at": batch.dispatched_at.isoformat() if batch.dispatched_at else None,
        "raw_feedback": batch.raw_feedback,
        "confirmed_feedback": json.loads(batch.confirmed_feedback_json) if batch.confirmed_feedback_json else None,
        "row_count": len(rows),
        "franchise_code": franchise.franchise_code if franchise else None,
    }


def list_batches(session: Session) -> list[dict]:
    batches = list(session.scalars(select(LeadBatch).order_by(LeadBatch.id.desc())))
    return [serialize_batch(session, batch) for batch in batches]


def review_batch(session: Session, batch_id: int, user: CurrentUser | None = None) -> dict:
    batch = session.get(LeadBatch, batch_id)
    if batch is None:
        raise ValueError("batch not found")
    before = batch.status or "new"
    from .lifecycle import BATCH_TRANSITIONS, assert_transition
    assert_transition(BATCH_TRANSITIONS, before, "reviewed")
    batch.status = "reviewed"
    record_event(session, entity_type="lead_batch", entity_id=batch.id, action="review", user=user, before={"status": before}, after={"status": "reviewed"})
    persist(session, user, "batch.review", f"batch_id={batch.id}")
    return serialize_batch(session, batch)


def dispatch_batch(session: Session, batch_id: int, franchise_id: int, user: CurrentUser | None = None) -> dict:
    batch = session.get(LeadBatch, batch_id)
    franchise = session.get(Franchise, franchise_id)
    if batch is None or franchise is None:
        raise ValueError("batch or franchise not found")
    from .lifecycle import BATCH_TRANSITIONS, assert_transition
    before = batch.status or "new"
    assert_transition(BATCH_TRANSITIONS, before, "dispatched")
    lead = session.get(RepairShopLead, franchise.lead_id)
    conflict = exclusive_conflict(session, franchise_id, batch.target_region)
    if conflict:
        raise PermissionError(conflict)
    batch.franchise_id = franchise_id
    batch.status = "dispatched"
    batch.dispatched_at = datetime.utcnow()
    batch.feedback_due_at = batch.dispatched_at + timedelta(days=3)
    session.add(ActionItem(
        kind="batch_feedback",
        title=f"等待{lead.shop_name if lead else franchise.franchise_code}反馈",
        detail=f"批次 {batch.id} 已分发",
        province=lead.province if lead else None,
        city=lead.city if lead else None,
        due_date=(batch.dispatched_at + timedelta(days=3)).date(),
        source_type="lead_batch",
        source_id=batch.id,
    ))
    record_event(session, entity_type="lead_batch", entity_id=batch.id, action="dispatch", user=user, before={"status": before}, after={"status": "dispatched"})
    persist(session, user, "batch.dispatch", f"batch_id={batch.id}")
    return serialize_batch(session, batch)


def exclusive_conflict(session: Session, franchise_id: int, region: str | None) -> str | None:
    if not region:
        return None
    today = date.today()
    rows = session.scalars(select(TerritoryAuthorization).where(TerritoryAuthorization.exclusive.is_(True))).all()
    for item in rows:
        if item.franchise_id == franchise_id:
            continue
        if item.ends_on and item.ends_on < today:
            continue
        label = item.city or item.province
        if label and label in region:
            owner = session.get(Franchise, item.franchise_id)
            return f"{label} 已被 {owner.franchise_code if owner else item.franchise_id} 独家授权"
    return None


def franchise_candidates(session: Session, region: str | None) -> list[dict]:
    franchises = list(session.scalars(select(Franchise).order_by(Franchise.id)))
    items = []
    for franchise in franchises:
        lead = session.get(RepairShopLead, franchise.lead_id)
        conflict = exclusive_conflict(session, franchise.id, region)
        recent = session.scalar(select(func.count(LeadBatch.id)).where(LeadBatch.franchise_id == franchise.id)) or 0
        reason = "区域匹配且近期分配较少" if recent < 3 and not conflict else (conflict or "可分配")
        items.append({
            "franchise_id": franchise.id,
            "franchise_code": franchise.franchise_code,
            "shop_name": lead.shop_name if lead else None,
            "status": franchise.status,
            "recent_batches": recent,
            "conflict": conflict,
            "suggested": conflict is None,
            "reason": reason,
        })
    return sorted(items, key=lambda item: (item["conflict"] is not None, item["recent_batches"]))


def save_raw_feedback(session: Session, batch_id: int, text: str, user: CurrentUser | None = None) -> dict:
    batch = session.get(LeadBatch, batch_id)
    if batch is None:
        raise ValueError("batch not found")
    batch.raw_feedback = text
    record_event(session, entity_type="lead_batch", entity_id=batch.id, action="feedback", user=user, after={"raw_feedback": text[:80]})
    persist(session, user, "batch.feedback", f"batch_id={batch.id}")
    return serialize_batch(session, batch)


def create_feedback_draft(session: Session, batch_id: int, user: CurrentUser | None = None) -> dict:
    batch = session.get(LeadBatch, batch_id)
    if batch is None or not batch.raw_feedback:
        raise ValueError("feedback text is required")
    draft_payload = {
        "contacted": "联系" in batch.raw_feedback or "打过" in batch.raw_feedback,
        "named_shops": [line.strip() for line in batch.raw_feedback.splitlines() if "店" in line][:5],
        "direction": "franchise" if "加盟" in batch.raw_feedback else "channel" if "合作" in batch.raw_feedback else "unknown",
        "evidence": batch.raw_feedback[:240],
    }
    draft = AiDraft(mode="feedback", source_type="lead_batch", source_id=batch_id, raw_input=batch.raw_feedback, draft_json=json.dumps(draft_payload, ensure_ascii=False))
    session.add(draft)
    session.flush()
    session.add(ActionItem(kind="confirm_draft", title=f"确认批次 {batch_id} 反馈草稿", detail="AI 草稿尚未入账", source_type="ai_draft", source_id=draft.id, due_date=date.today()))
    persist(session, user, "batch.draft", f"draft_id={draft.id}")
    session.refresh(draft)
    return {"id": draft.id, "draft": draft_payload, "confirmed": False}


def confirm_feedback_draft(session: Session, draft_id: int, payload: dict | None = None, user: CurrentUser | None = None) -> dict:
    draft = session.get(AiDraft, draft_id)
    if draft is None:
        raise ValueError("draft not found")
    confirmed = payload or json.loads(draft.draft_json)
    draft.confirmed_at = datetime.utcnow()
    batch = session.get(LeadBatch, draft.source_id) if draft.source_id else None
    if batch is not None:
        from .lifecycle import BATCH_TRANSITIONS, assert_transition
        before = batch.status or "dispatched"
        assert_transition(BATCH_TRANSITIONS, before, "confirmed")
        batch.confirmed_feedback_json = json.dumps(confirmed, ensure_ascii=False)
        batch.status = "confirmed"
        record_event(session, entity_type="lead_batch", entity_id=batch.id, action="confirm", user=user, before={"status": before}, after={"status": "confirmed"})
    for item in session.scalars(select(ActionItem).where(ActionItem.source_type == "ai_draft", ActionItem.source_id == draft.id)):
        item.done = True
    persist(session, user, "batch.confirm", f"draft_id={draft.id}")
    return {"id": draft.id, "draft": confirmed, "confirmed": True}


def set_batch_quality(session: Session, batch_id: int, quality: str, reason: str | None = None, user: CurrentUser | None = None) -> dict:
    if quality not in {"较差", "一般", "较好"}:
        raise ValueError("invalid quality")
    batch = session.get(LeadBatch, batch_id)
    if batch is None:
        raise ValueError("batch not found")
    if not batch.confirmed_feedback_json:
        raise ValueError("quality can only be set after feedback is confirmed")
    batch.quality = quality
    batch.quality_reason = reason
    record_event(session, entity_type="lead_batch", entity_id=batch.id, action="quality", user=user, after={"quality": quality}, reason=reason or "")
    persist(session, user, "batch.quality", f"batch_id={batch.id}")
    return serialize_batch(session, batch)


def archive_batch(session: Session, batch_id: int, user: CurrentUser | None = None) -> dict:
    batch = session.get(LeadBatch, batch_id)
    if batch is None:
        raise ValueError("batch not found")
    from .lifecycle import BATCH_TRANSITIONS, assert_transition
    before = batch.status or "new"
    assert_transition(BATCH_TRANSITIONS, before, "archived")
    batch.status = "archived"
    record_event(session, entity_type="lead_batch", entity_id=batch.id, action="archive", user=user, before={"status": before}, after={"status": "archived"})
    persist(session, user, "batch.archive", f"batch_id={batch.id}")
    return serialize_batch(session, batch)


def serialize_opportunity(session: Session, opportunity: Opportunity) -> dict:
    lead = session.get(RepairShopLead, opportunity.lead_id)
    return {
        "id": opportunity.id,
        "lead_id": opportunity.lead_id,
        "shop_name": lead.shop_name if lead else None,
        "province": lead.province if lead else None,
        "city": lead.city if lead else None,
        "opportunity_type": opportunity.opportunity_type,
        "stage": opportunity.stage,
        "estimated_value": opportunity.estimated_value or 0,
        "next_action": opportunity.next_action,
        "next_action_date": opportunity.next_action_date.isoformat() if opportunity.next_action_date else None,
        "willingness": opportunity.willingness,
        "shop_capacity": opportunity.shop_capacity,
        "customer_base": opportunity.customer_base,
        "exit_reason": opportunity.exit_reason,
        "status": opportunity.status or "active",
    }


def list_opportunity_records(session: Session, opportunity_type: str | None = None) -> list[dict]:
    query = select(Opportunity).order_by(Opportunity.id)
    if opportunity_type:
        query = query.where(Opportunity.opportunity_type == opportunity_type)
    return [serialize_opportunity(session, item) for item in session.scalars(query)]


def create_opportunity(session: Session, payload: dict, user: CurrentUser | None = None, commit: bool = True) -> dict:
    opportunity = Opportunity(
        lead_id=payload["lead_id"],
        opportunity_type=payload.get("opportunity_type", "franchise"),
        stage=payload.get("stage", "待核实"),
        estimated_value=payload.get("estimated_value"),
        next_action=payload.get("next_action"),
        next_action_date=date.fromisoformat(payload["next_action_date"]) if payload.get("next_action_date") else None,
        willingness=payload.get("willingness"),
        shop_capacity=payload.get("shop_capacity"),
        customer_base=payload.get("customer_base"),
        status="active",
        updated_by_id=user.id if user else None,
    )
    session.add(opportunity)
    session.flush()
    record_event(session, entity_type="opportunity", entity_id=opportunity.id, action="create", user=user, after=serialize_opportunity(session, opportunity))
    if commit:
        persist(session, user, "opportunity.create", f"opportunity_id={opportunity.id}")
        session.refresh(opportunity)
    return serialize_opportunity(session, opportunity)


def update_opportunity(session: Session, opportunity_id: int, payload: dict, user: CurrentUser | None = None) -> dict:
    opportunity = session.get(Opportunity, opportunity_id)
    if opportunity is None:
        raise ValueError("opportunity not found")
    if (opportunity.status or "active") not in {"active"}:
        raise ValueError("closed opportunities cannot be edited")
    before = {"stage": opportunity.stage, "next_action": opportunity.next_action}
    reason = str(payload.get("stage_reason") or "").strip()
    if "stage" in payload and payload["stage"] != opportunity.stage and not reason:
        raise ValueError("stage change reason is required")
    for field in ("stage", "next_action", "willingness", "shop_capacity", "customer_base", "exit_reason", "opportunity_type"):
        if field in payload:
            setattr(opportunity, field, payload[field])
    if "next_action_date" in payload:
        opportunity.next_action_date = date.fromisoformat(payload["next_action_date"]) if payload["next_action_date"] else None
    if "estimated_value" in payload:
        opportunity.estimated_value = payload["estimated_value"]
    touch(opportunity, user)
    record_event(session, entity_type="opportunity", entity_id=opportunity.id, action="update", user=user, before=before, after={"stage": opportunity.stage}, reason=reason)
    persist(session, user, "opportunity.update", f"opportunity_id={opportunity.id}")
    return serialize_opportunity(session, opportunity)


def serialize_franchise(session: Session, franchise: Franchise) -> dict:
    lead = session.get(RepairShopLead, franchise.lead_id)
    territories = list(session.scalars(select(TerritoryAuthorization).where(TerritoryAuthorization.franchise_id == franchise.id)))
    batches = list(session.scalars(select(LeadBatch).where(LeadBatch.franchise_id == franchise.id)))
    delivery = list(session.scalars(select(DeliveryItem).where(DeliveryItem.franchise_id == franchise.id)))
    support = list(session.scalars(select(SupportRecord).where(SupportRecord.franchise_id == franchise.id)))
    return {
        "id": franchise.id,
        "franchise_code": franchise.franchise_code,
        "status": franchise.status,
        "signed_at": franchise.signed_at.isoformat() if franchise.signed_at else None,
        "shop_name": lead.shop_name if lead else None,
        "province": lead.province if lead else None,
        "city": lead.city if lead else None,
        "territories": [
            {"id": item.id, "province": item.province, "city": item.city, "exclusive": item.exclusive}
            for item in territories
        ],
        "batches": [serialize_batch(session, item) for item in batches],
        "delivery": [
            {"id": item.id, "name": item.name, "kind": item.kind, "status": item.status, "planned_on": item.planned_on.isoformat() if item.planned_on else None, "evidence": item.evidence}
            for item in delivery
        ],
        "support": [
            {"id": item.id, "milestone": item.milestone, "due_on": item.due_on.isoformat() if item.due_on else None, "completed_on": item.completed_on.isoformat() if item.completed_on else None, "notes": item.notes}
            for item in support
        ],
    }


def list_franchises(session: Session) -> list[dict]:
    return [serialize_franchise(session, item) for item in session.scalars(select(Franchise).order_by(Franchise.id))]


def add_territory(session: Session, franchise_id: int, payload: dict, user: CurrentUser | None = None) -> dict:
    # A write lock works for SQLite as well as row-locking databases. Acquire it
    # before checking existing authorizations so concurrent retries cannot insert twice.
    locked = session.execute(update(Franchise).where(Franchise.id == franchise_id).values(id=Franchise.id))
    if not locked.rowcount:
        raise ValueError("franchise not found")
    franchise = session.get(Franchise, franchise_id, populate_existing=True)
    province = payload["province"].strip()
    city = (payload.get("city") or "").strip() or None
    exclusive = bool(payload.get("exclusive"))
    starts_on = date.fromisoformat(payload["starts_on"]) if payload.get("starts_on") else date.today()
    existing = session.scalar(select(TerritoryAuthorization).where(
        TerritoryAuthorization.franchise_id == franchise_id,
        TerritoryAuthorization.province == province,
        func.coalesce(TerritoryAuthorization.city, "") == (city or ""),
        TerritoryAuthorization.exclusive == exclusive,
        TerritoryAuthorization.starts_on == starts_on,
        (TerritoryAuthorization.ends_on.is_(None)) | (TerritoryAuthorization.ends_on >= date.today()),
    ))
    if existing is not None:
        session.commit()
        return serialize_franchise(session, franchise)
    region = city or province
    if exclusive:
        conflict = exclusive_conflict(session, franchise_id, region)
        if conflict:
            raise PermissionError(conflict)
    item = TerritoryAuthorization(
        franchise_id=franchise_id,
        province=province,
        city=city,
        exclusive=exclusive,
        starts_on=starts_on,
    )
    session.add(item)
    record_event(session, entity_type="franchise", entity_id=franchise.id, action="territory", user=user, after={"province": item.province, "city": item.city, "exclusive": item.exclusive})
    persist(session, user, "franchise.territory", f"franchise_id={franchise.id}")
    return serialize_franchise(session, franchise)


def ensure_delivery_plan(session: Session, franchise: Franchise) -> None:
    existing = session.scalar(select(func.count(DeliveryItem.id)).where(DeliveryItem.franchise_id == franchise.id)) or 0
    if existing:
        return
    signed = franchise.signed_at or date.today()
    session.add_all(
        [
            DeliveryItem(franchise_id=franchise.id, name="合同与费用确认", kind="contract", status="planned", planned_on=signed),
            DeliveryItem(franchise_id=franchise.id, name="技术培训", kind="technical", status="planned", planned_on=signed + timedelta(days=14)),
            DeliveryItem(franchise_id=franchise.id, name="运营培训", kind="operations", status="planned", planned_on=signed + timedelta(days=21)),
            DeliveryItem(franchise_id=franchise.id, name="应用确认", kind="application", status="unknown", planned_on=signed + timedelta(days=30)),
        ]
    )
    session.add_all(
        [
            SupportRecord(franchise_id=franchise.id, milestone="d30", due_on=signed + timedelta(days=30)),
            SupportRecord(franchise_id=franchise.id, milestone="d60", due_on=signed + timedelta(days=60)),
            SupportRecord(franchise_id=franchise.id, milestone="d90", due_on=signed + timedelta(days=90)),
            SupportRecord(franchise_id=franchise.id, milestone="monthly", due_on=signed + timedelta(days=120)),
        ]
    )


def update_delivery_item(session: Session, item_id: int, payload: dict, user: CurrentUser | None = None) -> dict:
    item = session.get(DeliveryItem, item_id)
    if item is None:
        raise ValueError("delivery item not found")
    if "status" in payload:
        item.status = payload["status"]
    if "evidence" in payload:
        item.evidence = payload["evidence"]
    if "planned_on" in payload:
        item.planned_on = date.fromisoformat(payload["planned_on"]) if payload["planned_on"] else item.planned_on
    if payload.get("status") in {"done", "applied"}:
        item.completed_on = date.today()
    record_event(session, entity_type="franchise", entity_id=item.franchise_id, action="delivery", user=user, after={"item_id": item.id, "status": item.status})
    persist(session, user, "delivery.update", f"item_id={item.id}")
    franchise = session.get(Franchise, item.franchise_id)
    return serialize_franchise(session, franchise) if franchise else {"id": item.id, "status": item.status}


def complete_support_record(session: Session, record_id: int, notes: str | None = None, user: CurrentUser | None = None) -> dict:
    # Only the transaction that completes the record may create follow-up work.
    completed = session.execute(update(SupportRecord).where(
        SupportRecord.id == record_id,
        SupportRecord.completed_on.is_(None),
    ).values(completed_on=date.today(), notes=notes))
    record = session.get(SupportRecord, record_id, populate_existing=True)
    if record is None:
        raise ValueError("support record not found")
    if not completed.rowcount:
        session.commit()
        franchise = session.get(Franchise, record.franchise_id)
        return serialize_franchise(session, franchise) if franchise else {"id": record.id}
    if record.milestone == "monthly":
        session.add(SupportRecord(franchise_id=record.franchise_id, milestone="monthly", due_on=date.today() + timedelta(days=30)))
    if notes and ("问题" in notes or "issue" in notes.lower()):
        franchise = session.get(Franchise, record.franchise_id)
        lead = session.get(RepairShopLead, franchise.lead_id) if franchise else None
        session.add(ActionItem(
            kind="support_issue",
            title=f"{record.milestone}回访问题待处理",
            detail=notes,
            province=lead.province if lead else None,
            city=lead.city if lead else None,
            due_date=date.today() + timedelta(days=7),
            source_type="support",
            source_id=record.id,
        ))
    record_event(session, entity_type="franchise", entity_id=record.franchise_id, action="support", user=user, after={"record_id": record.id, "notes": notes})
    persist(session, user, "support.complete", f"record_id={record.id}")
    franchise = session.get(Franchise, record.franchise_id)
    return serialize_franchise(session, franchise) if franchise else {"id": record.id}


def list_actions(session: Session, include_done: bool = False, *, refresh: bool = True) -> list[dict]:
    if refresh:
        refresh_actions(session)
    query = select(ActionItem).order_by(ActionItem.done, ActionItem.due_date, ActionItem.id)
    if not include_done:
        query = query.where(ActionItem.done.is_(False))
    return [
        {
            "id": item.id,
            "kind": item.kind,
            "title": item.title,
            "detail": item.detail,
            "province": item.province,
            "city": item.city,
            "due_date": item.due_date.isoformat() if item.due_date else None,
            "done": item.done,
            "source_type": item.source_type,
            "source_id": item.source_id,
            "href": _action_href(item),
        }
        for item in session.scalars(query)
    ]


def _action_href(item: ActionItem) -> str:
    mapping = {
        "lead_batch": f"#/batches?id={item.source_id}",
        "opportunity": f"#/opportunities?id={item.source_id}",
        "ai_draft": "#/batches",
        "support": "#/franchises",
        "lead": f"#/leads?id={item.source_id}",
    }
    return mapping.get(item.source_type or "", "")


def complete_action(session: Session, action_id: int, user: CurrentUser | None = None) -> dict:
    item = session.get(ActionItem, action_id)
    if item is None:
        raise ValueError("action not found")
    item.done = True
    persist(session, user, "action.complete", f"action_id={item.id}")
    return {"id": item.id, "done": True}


def refresh_actions(session: Session) -> None:
    today = date.today()
    for batch in session.scalars(select(LeadBatch).where(LeadBatch.dispatched_at.is_not(None), LeadBatch.status != "archived")):
        status = _batch_status(batch)
        if status in {"overdue", "high_risk", "decision"} and not session.scalar(select(ActionItem.id).where(ActionItem.source_type == "lead_batch", ActionItem.source_id == batch.id, ActionItem.kind == "batch_chase", ActionItem.done.is_(False))):
            session.add(ActionItem(
                kind="batch_chase",
                title=f"催问批次 {batch.id} 反馈",
                detail=status,
                due_date=today,
                source_type="lead_batch",
                source_id=batch.id,
            ))
    for opportunity in session.scalars(select(Opportunity)):
        if not opportunity.next_action:
            exists = session.scalar(select(ActionItem.id).where(ActionItem.source_type == "opportunity", ActionItem.source_id == opportunity.id, ActionItem.kind == "missing_next", ActionItem.done.is_(False)))
            if not exists:
                lead = session.get(RepairShopLead, opportunity.lead_id)
                session.add(ActionItem(
                    kind="missing_next",
                    title=f"补充{lead.shop_name if lead else opportunity.id}下一步动作",
                    province=lead.province if lead else None,
                    city=lead.city if lead else None,
                    due_date=today,
                    source_type="opportunity",
                    source_id=opportunity.id,
                ))
        elif opportunity.next_action_date and opportunity.next_action_date <= today:
            exists = session.scalar(select(ActionItem.id).where(ActionItem.source_type == "opportunity", ActionItem.source_id == opportunity.id, ActionItem.kind == "due_next", ActionItem.done.is_(False)))
            if not exists:
                lead = session.get(RepairShopLead, opportunity.lead_id)
                session.add(ActionItem(
                    kind="due_next",
                    title=opportunity.next_action,
                    province=lead.province if lead else None,
                    city=lead.city if lead else None,
                    due_date=opportunity.next_action_date,
                    source_type="opportunity",
                    source_id=opportunity.id,
                ))
    for record in session.scalars(select(SupportRecord).where(SupportRecord.completed_on.is_(None), SupportRecord.due_on.is_not(None), SupportRecord.due_on <= today)):
        exists = session.scalar(select(ActionItem.id).where(ActionItem.source_type == "support", ActionItem.source_id == record.id, ActionItem.done.is_(False)))
        if not exists:
            franchise = session.get(Franchise, record.franchise_id)
            lead = session.get(RepairShopLead, franchise.lead_id) if franchise else None
            session.add(ActionItem(
                kind="support_visit",
                title=f"完成{record.milestone}回访",
                province=lead.province if lead else None,
                city=lead.city if lead else None,
                due_date=record.due_on,
                source_type="support",
                source_id=record.id,
            ))
    session.commit()


def map_overview(session: Session) -> list[dict]:
    regions: dict[tuple[str | None, str | None], dict] = {}
    for lead in session.scalars(select(RepairShopLead)):
        key = (lead.province, lead.city)
        item = regions.setdefault(key, {
            "province": lead.province,
            "city": lead.city,
            "lead_total": 0,
            "franchise_total": 0,
            "franchise_opportunities": 0,
            "channel_opportunities": 0,
            "pending_batches": 0,
            "delivery_risks": 0,
        })
        item["lead_total"] += 1
    for franchise in session.scalars(select(Franchise)):
        lead = session.get(RepairShopLead, franchise.lead_id)
        if not lead:
            continue
        item = regions.setdefault((lead.province, lead.city), {
            "province": lead.province,
            "city": lead.city,
            "lead_total": 0,
            "franchise_total": 0,
            "franchise_opportunities": 0,
            "channel_opportunities": 0,
            "pending_batches": 0,
            "delivery_risks": 0,
        })
        item["franchise_total"] += 1
    for opportunity in session.scalars(select(Opportunity)):
        lead = session.get(RepairShopLead, opportunity.lead_id)
        if not lead:
            continue
        item = regions.setdefault((lead.province, lead.city), {
            "province": lead.province,
            "city": lead.city,
            "lead_total": 0,
            "franchise_total": 0,
            "franchise_opportunities": 0,
            "channel_opportunities": 0,
            "pending_batches": 0,
            "delivery_risks": 0,
        })
        if opportunity.opportunity_type == "channel":
            item["channel_opportunities"] += 1
        else:
            item["franchise_opportunities"] += 1
    for batch in session.scalars(select(LeadBatch)):
        if _batch_status(batch) in {"overdue", "high_risk", "decision"}:
            for key, item in regions.items():
                if batch.target_region and ((item["city"] and item["city"] in batch.target_region) or (item["province"] and item["province"] in batch.target_region)):
                    item["pending_batches"] += 1
    for delivery in session.scalars(select(DeliveryItem).where(DeliveryItem.status.in_(["unknown", "issue", "planned"]))):
        franchise = session.get(Franchise, delivery.franchise_id)
        lead = session.get(RepairShopLead, franchise.lead_id) if franchise else None
        if not lead:
            continue
        item = regions.get((lead.province, lead.city))
        if item:
            item["delivery_risks"] += 1
    return list(regions.values())


def city_detail(session: Session, province: str, city: str) -> dict:
    leads = [lead for lead in session.scalars(select(RepairShopLead)) if lead.province == province and lead.city == city]
    lead_ids = {lead.id for lead in leads}
    opportunities = [serialize_opportunity(session, item) for item in session.scalars(select(Opportunity)) if item.lead_id in lead_ids]
    franchises = [serialize_franchise(session, item) for item in session.scalars(select(Franchise)) if item.lead_id in lead_ids]
    actions = [item for item in list_actions(session) if item["province"] == province and item["city"] == city]
    return {
        "province": province,
        "city": city,
        "leads": [{"id": lead.id, "shop_name": lead.shop_name, "source": lead.source} for lead in leads],
        "opportunities": opportunities,
        "franchises": franchises,
        "actions": actions,
    }


def current_goals(session: Session, period: str) -> dict:
    goal = session.scalar(select(PersonalGoal).where(PersonalGoal.period == period))
    if goal is None:
        goal = PersonalGoal(period=period)
        session.add(goal)
        session.commit()
        session.refresh(goal)
    return {
        "period": goal.period,
        "qualified_franchise_opportunities": goal.qualified_franchise_opportunities,
        "signed_franchises": goal.signed_franchises,
        "qualified_channel_opportunities": goal.qualified_channel_opportunities,
    }


def freeze_monthly_snapshot(session: Session, period: str, payload: dict) -> dict:
    latest = session.scalar(select(func.max(MonthlySnapshot.version)).where(MonthlySnapshot.period == period)) or 0
    snapshot = MonthlySnapshot(period=period, version=latest + 1, payload_json=json.dumps(payload, ensure_ascii=False))
    session.add(snapshot)
    session.commit()
    session.refresh(snapshot)
    return {"id": snapshot.id, "period": snapshot.period, "version": snapshot.version, "payload": payload}


def get_monthly_snapshot(session: Session, snapshot_id: int) -> dict:
    snapshot = session.get(MonthlySnapshot, snapshot_id)
    if snapshot is None:
        raise ValueError("snapshot not found")
    return {"id": snapshot.id, "period": snapshot.period, "version": snapshot.version, "payload": json.loads(snapshot.payload_json)}
