from datetime import date, datetime, timedelta

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .auth import CurrentUser
from .lifecycle import (
    FRANCHISE_TRANSITIONS,
    KNOWLEDGE_TRANSITIONS,
    LEAD_TRANSITIONS,
    OPPORTUNITY_TRANSITIONS,
    TRAINING_TRANSITIONS,
    assert_transition,
    list_events,
    persist,
    record_event,
    require_reason,
    touch,
)
from .models import (
    FollowUp,
    Franchise,
    KnowledgeDocument,
    Notification,
    Opportunity,
    RepairShopLead,
    ReportSnapshot,
    TrainingRecord,
    UserPreference,
)
from . import workbench
from .privacy import redact_private


def serialize_lead(lead: RepairShopLead, *, include_contacts: bool = True) -> dict:
    payload = {
        "id": lead.id,
        "shop_name": lead.shop_name,
        "province": lead.province,
        "city": lead.city,
        "district": lead.district,
        "social_credit_code": lead.social_credit_code,
        "address": lead.address,
        "new_energy_lifts": lead.new_energy_lifts,
        "monthly_order_count": lead.monthly_order_count,
        "source": lead.source,
        "status": lead.status,
        "void_reason": lead.void_reason,
        "archived_at": lead.archived_at.isoformat() if lead.archived_at else None,
        "created_at": lead.created_at.isoformat() if lead.created_at else None,
    }
    if include_contacts:
        payload.update({
            "phone": lead.phone,
            "wechat": lead.wechat,
            "contact_name": lead.contact_name,
            "private_notes": lead.private_notes,
        })
    return payload


def serialize_follow_up(item: FollowUp) -> dict:
    return {
        "id": item.id,
        "lead_id": item.lead_id,
        "status": item.status,
        "note": item.note,
        "due_date": item.due_date.isoformat() if item.due_date else None,
        "completed_at": item.completed_at.isoformat() if item.completed_at else None,
    }


def get_lead(session: Session, lead_id: int, *, include_contacts: bool = True) -> dict:
    lead = session.get(RepairShopLead, lead_id)
    if lead is None:
        raise ValueError("lead not found")
    payload = serialize_lead(lead, include_contacts=include_contacts)
    payload["follow_ups"] = [
        serialize_follow_up(item)
        for item in session.scalars(select(FollowUp).where(FollowUp.lead_id == lead.id).order_by(FollowUp.id))
    ]
    payload["history"] = list_events(session, "lead", lead.id)
    return payload if include_contacts else redact_private(payload)


def create_lead(session: Session, payload: dict, user: CurrentUser) -> dict:
    lead = RepairShopLead(
        shop_name=payload["shop_name"],
        province=payload.get("province"),
        city=payload.get("city"),
        district=payload.get("district"),
        social_credit_code=payload.get("social_credit_code"),
        phone=payload.get("phone"),
        wechat=payload.get("wechat"),
        contact_name=payload.get("contact_name"),
        private_notes=payload.get("private_notes"),
        address=payload.get("address"),
        new_energy_lifts=payload.get("new_energy_lifts"),
        monthly_order_count=payload.get("monthly_order_count"),
        source=payload.get("source") or "手工补录",
        status="active",
        updated_by_id=user.id,
    )
    session.add(lead)
    session.flush()
    record_event(session, entity_type="lead", entity_id=lead.id, action="create", user=user, after=serialize_lead(lead))
    persist(session, user, "lead.create", f"lead_id={lead.id}")
    session.refresh(lead)
    return serialize_lead(lead)


def update_lead(session: Session, lead_id: int, payload: dict, user: CurrentUser) -> dict:
    lead = session.get(RepairShopLead, lead_id)
    if lead is None:
        raise ValueError("lead not found")
    if lead.status in {"voided", "archived"}:
        raise ValueError("archived or voided leads cannot be edited")
    before = serialize_lead(lead)
    for field in (
        "shop_name", "province", "city", "district", "social_credit_code", "phone", "wechat",
        "contact_name", "private_notes", "address", "new_energy_lifts", "monthly_order_count", "source",
    ):
        if field in payload:
            setattr(lead, field, payload[field])
    touch(lead, user)
    record_event(session, entity_type="lead", entity_id=lead.id, action="update", user=user, before=before, after=serialize_lead(lead))
    persist(session, user, "lead.update", f"lead_id={lead.id}")
    return serialize_lead(lead)


def archive_lead(session: Session, lead_id: int, user: CurrentUser, reason: str = "") -> dict:
    lead = session.get(RepairShopLead, lead_id)
    if lead is None:
        raise ValueError("lead not found")
    assert_transition(LEAD_TRANSITIONS, lead.status or "active", "archived")
    before = {"status": lead.status}
    lead.status = "archived"
    lead.archived_at = datetime.utcnow()
    touch(lead, user)
    record_event(session, entity_type="lead", entity_id=lead.id, action="archive", user=user, before=before, after={"status": lead.status}, reason=reason)
    persist(session, user, "lead.archive", f"lead_id={lead.id}")
    return serialize_lead(lead)


def void_lead(session: Session, lead_id: int, user: CurrentUser, reason: str | None) -> dict:
    lead = session.get(RepairShopLead, lead_id)
    if lead is None:
        raise ValueError("lead not found")
    text = require_reason(reason, "voided")
    assert_transition(LEAD_TRANSITIONS, lead.status or "active", "voided")
    before = {"status": lead.status}
    lead.status = "voided"
    lead.void_reason = text
    lead.archived_at = datetime.utcnow()
    touch(lead, user)
    record_event(session, entity_type="lead", entity_id=lead.id, action="void", user=user, before=before, after={"status": lead.status}, reason=text)
    persist(session, user, "lead.void", f"lead_id={lead.id}")
    return serialize_lead(lead)


def add_follow_up(session: Session, lead_id: int, payload: dict, user: CurrentUser) -> dict:
    lead = session.get(RepairShopLead, lead_id)
    if lead is None:
        raise ValueError("lead not found")
    item = FollowUp(
        lead_id=lead_id,
        status=payload.get("status") or "待联系",
        note=payload.get("note"),
        due_date=date.fromisoformat(payload["due_date"]) if payload.get("due_date") else date.today(),
    )
    session.add(item)
    session.flush()
    record_event(session, entity_type="lead", entity_id=lead_id, action="follow_up", user=user, after=serialize_follow_up(item))
    persist(session, user, "lead.follow_up", f"follow_up_id={item.id}")
    return serialize_follow_up(item)


def complete_follow_up(session: Session, follow_up_id: int, user: CurrentUser) -> dict:
    item = session.get(FollowUp, follow_up_id)
    if item is None:
        raise ValueError("follow-up not found")
    item.status = "已完成"
    item.completed_at = date.today()
    record_event(session, entity_type="lead", entity_id=item.lead_id, action="follow_up_complete", user=user, after=serialize_follow_up(item))
    persist(session, user, "lead.follow_up_complete", f"follow_up_id={item.id}")
    return serialize_follow_up(item)


def convert_lead(session: Session, lead_id: int, payload: dict, user: CurrentUser) -> dict:
    lead = session.get(RepairShopLead, lead_id)
    if lead is None:
        raise ValueError("lead not found")
    if lead.status != "active":
        raise ValueError("only active leads can convert")
    opportunity_payload = {
        "lead_id": lead_id,
        "opportunity_type": payload.get("opportunity_type") or "franchise",
        "stage": payload.get("stage") or "待核实",
        "estimated_value": payload.get("estimated_value"),
        "next_action": payload.get("next_action") or "核实资格",
        "next_action_date": payload.get("next_action_date"),
        "willingness": payload.get("willingness"),
        "shop_capacity": payload.get("shop_capacity"),
        "customer_base": payload.get("customer_base"),
    }
    created = workbench.create_opportunity(session, opportunity_payload, user=user, commit=False)
    record_event(session, entity_type="lead", entity_id=lead_id, action="convert", user=user, after={"opportunity_id": created["id"]})
    persist(session, user, "lead.convert", f"lead_id={lead_id} opportunity_id={created['id']}")
    return created


def close_opportunity(session: Session, opportunity_id: int, user: CurrentUser, reason: str | None) -> dict:
    opportunity = session.get(Opportunity, opportunity_id)
    if opportunity is None:
        raise ValueError("opportunity not found")
    text = require_reason(reason, "closed")
    assert_transition(OPPORTUNITY_TRANSITIONS, opportunity.status or "active", "closed")
    before = {"status": opportunity.status, "stage": opportunity.stage}
    opportunity.status = "closed"
    opportunity.exit_reason = text
    opportunity.stage = "已关闭"
    touch(opportunity, user)
    record_event(session, entity_type="opportunity", entity_id=opportunity.id, action="close", user=user, before=before, after={"status": "closed"}, reason=text)
    persist(session, user, "opportunity.close", f"opportunity_id={opportunity.id}")
    return workbench.serialize_opportunity(session, opportunity)


def archive_opportunity(session: Session, opportunity_id: int, user: CurrentUser, reason: str = "") -> dict:
    opportunity = session.get(Opportunity, opportunity_id)
    if opportunity is None:
        raise ValueError("opportunity not found")
    assert_transition(OPPORTUNITY_TRANSITIONS, opportunity.status or "active", "archived")
    opportunity.status = "archived"
    opportunity.archived_at = datetime.utcnow()
    touch(opportunity, user)
    record_event(session, entity_type="opportunity", entity_id=opportunity.id, action="archive", user=user, after={"status": "archived"}, reason=reason)
    persist(session, user, "opportunity.archive", f"opportunity_id={opportunity.id}")
    return workbench.serialize_opportunity(session, opportunity)


def convert_opportunity_to_franchise(session: Session, opportunity_id: int, user: CurrentUser) -> dict:
    opportunity = session.get(Opportunity, opportunity_id)
    if opportunity is None:
        raise ValueError("opportunity not found")
    if (opportunity.status or "active") != "active":
        raise ValueError("only active opportunities can convert")
    existing = session.scalar(select(Franchise).where(Franchise.lead_id == opportunity.lead_id))
    if existing:
        raise ValueError("franchise already exists for this lead")
    count = session.scalar(select(Franchise.id).order_by(Franchise.id.desc()).limit(1)) or 0
    franchise = Franchise(
        lead_id=opportunity.lead_id,
        franchise_code=f"FR-{datetime.utcnow().strftime('%y%m')}-{count + 1:03d}",
        status="筹建中",
        signed_at=date.today(),
        updated_by_id=user.id,
    )
    session.add(franchise)
    session.flush()
    workbench.ensure_delivery_plan(session, franchise)
    opportunity.status = "closed"
    opportunity.stage = "已签约"
    opportunity.exit_reason = "签约转加盟商"
    touch(opportunity, user)
    record_event(
        session,
        entity_type="opportunity",
        entity_id=opportunity.id,
        action="sign",
        user=user,
        after={"franchise_id": franchise.id, "franchise_code": franchise.franchise_code},
    )
    record_event(session, entity_type="franchise", entity_id=franchise.id, action="create", user=user, after={"status": franchise.status})
    persist(session, user, "opportunity.sign", f"franchise_id={franchise.id}")
    return workbench.serialize_franchise(session, franchise)


def create_franchise_record(session: Session, payload: dict, user: CurrentUser) -> dict:
    lead_id = int(payload["lead_id"])
    if session.scalar(select(Franchise).where(Franchise.lead_id == lead_id)):
        raise ValueError("franchise already exists for this lead")
    count = session.scalar(select(Franchise.id).order_by(Franchise.id.desc()).limit(1)) or 0
    franchise = Franchise(
        lead_id=lead_id,
        franchise_code=payload.get("franchise_code") or f"FR-{datetime.utcnow().strftime('%y%m')}-{count + 1:03d}",
        status=payload.get("status") or "筹建中",
        signed_at=date.fromisoformat(payload["signed_at"]) if payload.get("signed_at") else date.today(),
        updated_by_id=user.id,
    )
    session.add(franchise)
    session.flush()
    workbench.ensure_delivery_plan(session, franchise)
    record_event(session, entity_type="franchise", entity_id=franchise.id, action="create", user=user, after={"status": franchise.status})
    persist(session, user, "franchise.create", f"franchise_id={franchise.id}")
    return workbench.serialize_franchise(session, franchise)


def update_franchise_record(session: Session, franchise_id: int, payload: dict, user: CurrentUser) -> dict:
    franchise = session.get(Franchise, franchise_id)
    if franchise is None:
        raise ValueError("franchise not found")
    if franchise.status in {"已关闭", "已归档"}:
        raise ValueError("closed franchises cannot be edited")
    before = {"status": franchise.status, "franchise_code": franchise.franchise_code}
    if "franchise_code" in payload:
        franchise.franchise_code = payload["franchise_code"]
    if "status" in payload and payload["status"] != franchise.status:
        assert_transition(FRANCHISE_TRANSITIONS, franchise.status, payload["status"])
        franchise.status = payload["status"]
    if "signed_at" in payload:
        franchise.signed_at = date.fromisoformat(payload["signed_at"]) if payload["signed_at"] else franchise.signed_at
    touch(franchise, user)
    record_event(session, entity_type="franchise", entity_id=franchise.id, action="update", user=user, before=before, after={"status": franchise.status})
    persist(session, user, "franchise.update", f"franchise_id={franchise.id}")
    return workbench.serialize_franchise(session, franchise)


def close_franchise(session: Session, franchise_id: int, user: CurrentUser, reason: str | None) -> dict:
    franchise = session.get(Franchise, franchise_id)
    if franchise is None:
        raise ValueError("franchise not found")
    text = require_reason(reason, "已关闭")
    assert_transition(FRANCHISE_TRANSITIONS, franchise.status, "已关闭")
    franchise.status = "已关闭"
    franchise.void_reason = text
    touch(franchise, user)
    record_event(session, entity_type="franchise", entity_id=franchise.id, action="close", user=user, after={"status": "已关闭"}, reason=text)
    persist(session, user, "franchise.close", f"franchise_id={franchise.id}")
    return workbench.serialize_franchise(session, franchise)


def archive_franchise(session: Session, franchise_id: int, user: CurrentUser, reason: str = "") -> dict:
    franchise = session.get(Franchise, franchise_id)
    if franchise is None:
        raise ValueError("franchise not found")
    assert_transition(FRANCHISE_TRANSITIONS, franchise.status, "已归档")
    franchise.status = "已归档"
    franchise.archived_at = datetime.utcnow()
    touch(franchise, user)
    record_event(session, entity_type="franchise", entity_id=franchise.id, action="archive", user=user, after={"status": "已归档"}, reason=reason)
    persist(session, user, "franchise.archive", f"franchise_id={franchise.id}")
    return workbench.serialize_franchise(session, franchise)


def serialize_training(session: Session, item: TrainingRecord) -> dict:
    franchise = session.get(Franchise, item.franchise_id) if item.franchise_id else None
    lead = session.get(RepairShopLead, franchise.lead_id) if franchise else None
    return {
        "id": item.id,
        "franchise_id": item.franchise_id,
        "shop_name": lead.shop_name if lead else None,
        "training_name": item.training_name,
        "status": item.status,
        "completed_at": item.completed_at.isoformat() if item.completed_at else None,
        "notes": item.notes,
        "archived_at": item.archived_at.isoformat() if item.archived_at else None,
    }


def create_training(session: Session, payload: dict, user: CurrentUser) -> dict:
    item = TrainingRecord(
        franchise_id=payload.get("franchise_id"),
        training_name=payload["training_name"],
        status=payload.get("status") or "待安排",
        notes=payload.get("notes"),
        updated_by_id=user.id,
    )
    session.add(item)
    session.flush()
    record_event(session, entity_type="training", entity_id=item.id, action="create", user=user, after=serialize_training(session, item))
    persist(session, user, "training.create", f"training_id={item.id}")
    return serialize_training(session, item)


def update_training(session: Session, training_id: int, payload: dict, user: CurrentUser) -> dict:
    item = session.get(TrainingRecord, training_id)
    if item is None:
        raise ValueError("training not found")
    if item.status in {"已取消", "已归档"}:
        raise ValueError("cancelled trainings cannot be edited")
    for field in ("training_name", "notes", "franchise_id"):
        if field in payload:
            setattr(item, field, payload[field])
    touch(item, user)
    record_event(session, entity_type="training", entity_id=item.id, action="update", user=user, after=serialize_training(session, item))
    persist(session, user, "training.update", f"training_id={item.id}")
    return serialize_training(session, item)


def complete_training(session: Session, training_id: int, user: CurrentUser) -> dict:
    item = session.get(TrainingRecord, training_id)
    if item is None:
        raise ValueError("training not found")
    assert_transition(TRAINING_TRANSITIONS, item.status, "已完成")
    item.status = "已完成"
    item.completed_at = date.today()
    touch(item, user)
    record_event(session, entity_type="training", entity_id=item.id, action="complete", user=user, after={"status": "已完成"})
    persist(session, user, "training.complete", f"training_id={item.id}")
    return serialize_training(session, item)


def cancel_training(session: Session, training_id: int, user: CurrentUser, reason: str | None) -> dict:
    item = session.get(TrainingRecord, training_id)
    if item is None:
        raise ValueError("training not found")
    text = require_reason(reason, "已取消")
    assert_transition(TRAINING_TRANSITIONS, item.status, "已取消")
    item.status = "已取消"
    item.void_reason = text
    touch(item, user)
    record_event(session, entity_type="training", entity_id=item.id, action="cancel", user=user, after={"status": "已取消"}, reason=text)
    persist(session, user, "training.cancel", f"training_id={item.id}")
    return serialize_training(session, item)


def archive_training(session: Session, training_id: int, user: CurrentUser, reason: str = "") -> dict:
    item = session.get(TrainingRecord, training_id)
    if item is None:
        raise ValueError("training not found")
    assert_transition(TRAINING_TRANSITIONS, item.status, "已归档")
    item.status = "已归档"
    item.archived_at = datetime.utcnow()
    touch(item, user)
    record_event(session, entity_type="training", entity_id=item.id, action="archive", user=user, after={"status": "已归档"}, reason=reason)
    persist(session, user, "training.archive", f"training_id={item.id}")
    return serialize_training(session, item)


def update_knowledge(session: Session, document_id: int, payload: dict, user: CurrentUser) -> KnowledgeDocument:
    document = session.get(KnowledgeDocument, document_id)
    if document is None:
        raise ValueError("document not found")
    if document.status != "draft":
        raise ValueError("only drafts can be edited")
    for field in ("title", "category", "content", "version", "effective_on"):
        if field in payload:
            value = payload[field]
            if field == "effective_on":
                value = date.fromisoformat(str(value)) if value else None
            setattr(document, field, value)
    touch(document, user)
    record_event(session, entity_type="knowledge", entity_id=document.id, action="update", user=user, after={"title": document.title})
    persist(session, user, "knowledge.update", f"document_id={document.id}")
    return document


def publish_knowledge(session: Session, document_id: int, user: CurrentUser) -> KnowledgeDocument:
    document = session.get(KnowledgeDocument, document_id)
    if document is None:
        raise ValueError("document not found")
    if document.status == "published":
        version_number = 2
        if document.version and document.version.startswith("v"):
            try:
                version_number = int(document.version[1:]) + 1
            except ValueError:
                version_number = 2
        next_doc = KnowledgeDocument(
            title=document.title,
            category=document.category,
            content=document.content,
            version=f"v{version_number}",
            status="published",
            parent_id=document.id,
            effective_on=date.today(),
            updated_by_id=user.id,
        )
        document.status = "archived"
        document.archived_at = datetime.utcnow()
        session.add(next_doc)
        session.flush()
        record_event(session, entity_type="knowledge", entity_id=next_doc.id, action="publish", user=user, after={"version": next_doc.version}, reason=f"supersedes {document.id}")
        persist(session, user, "knowledge.publish", f"document_id={next_doc.id}")
        return next_doc
    assert_transition(KNOWLEDGE_TRANSITIONS, document.status or "draft", "published")
    document.status = "published"
    document.effective_on = document.effective_on or date.today()
    touch(document, user)
    record_event(session, entity_type="knowledge", entity_id=document.id, action="publish", user=user, after={"status": "published"})
    persist(session, user, "knowledge.publish", f"document_id={document.id}")
    return document


def archive_knowledge(session: Session, document_id: int, user: CurrentUser, reason: str = "") -> KnowledgeDocument:
    document = session.get(KnowledgeDocument, document_id)
    if document is None:
        raise ValueError("document not found")
    assert_transition(KNOWLEDGE_TRANSITIONS, document.status or "draft", "archived")
    document.status = "archived"
    document.archived_at = datetime.utcnow()
    touch(document, user)
    record_event(session, entity_type="knowledge", entity_id=document.id, action="archive", user=user, after={"status": "archived"}, reason=reason)
    persist(session, user, "knowledge.archive", f"document_id={document.id}")
    return document


def search_knowledge(session: Session, query: str | None = None, category: str | None = None, published_only: bool = False) -> list[KnowledgeDocument]:
    statement = select(KnowledgeDocument).order_by(KnowledgeDocument.id.desc())
    if published_only:
        statement = statement.where(KnowledgeDocument.status == "published")
    if category:
        statement = statement.where(KnowledgeDocument.category == category)
    if query:
        like = f"%{query}%"
        statement = statement.where(or_(KnowledgeDocument.title.like(like), KnowledgeDocument.content.like(like)))
    return list(session.scalars(statement))


def void_report(session: Session, report_id: int, user: CurrentUser, reason: str | None) -> ReportSnapshot:
    snapshot = session.get(ReportSnapshot, report_id)
    if snapshot is None:
        raise ValueError("report snapshot not found")
    text = require_reason(reason, "voided")
    if snapshot.voided:
        raise ValueError("report already voided")
    snapshot.voided = True
    snapshot.void_reason = text
    record_event(session, entity_type="report", entity_id=snapshot.id, action="void", user=user, after={"voided": True}, reason=text)
    persist(session, user, "report.void", f"report_id={snapshot.id}")
    return snapshot


def update_goals(session: Session, period: str, payload: dict, user: CurrentUser) -> dict:
    current = workbench.current_goals(session, period)
    from .models import PersonalGoal
    goal = session.scalar(select(PersonalGoal).where(PersonalGoal.period == period))
    if goal is None:
        raise ValueError("goal not found")
    for field in ("qualified_franchise_opportunities", "signed_franchises", "qualified_channel_opportunities"):
        if field in payload:
            setattr(goal, field, int(payload[field]))
    record_event(session, entity_type="goal", entity_id=goal.id, action="update", user=user, before=current, after=workbench.current_goals(session, period))
    persist(session, user, "goal.update", period)
    return workbench.current_goals(session, period)


def get_or_create_preference(session: Session, user: CurrentUser) -> UserPreference:
    pref = session.scalar(select(UserPreference).where(UserPreference.user_id == user.id))
    if pref is None:
        pref = UserPreference(user_id=user.id)
        session.add(pref)
        session.commit()
        session.refresh(pref)
    return pref


def serialize_preference(pref: UserPreference) -> dict:
    return {
        "default_period": pref.default_period,
        "reminder_days": pref.reminder_days,
        "notify_overdue": pref.notify_overdue,
        "notify_batches": pref.notify_batches,
    }


def update_preference(session: Session, user: CurrentUser, payload: dict) -> dict:
    pref = get_or_create_preference(session, user)
    if "default_period" in payload:
        pref.default_period = payload["default_period"]
    if "reminder_days" in payload:
        pref.reminder_days = int(payload["reminder_days"])
    if "notify_overdue" in payload:
        pref.notify_overdue = bool(payload["notify_overdue"])
    if "notify_batches" in payload:
        pref.notify_batches = bool(payload["notify_batches"])
    persist(session, user, "settings.update")
    return serialize_preference(pref)


def serialize_notification(item: Notification) -> dict:
    return {
        "id": item.id,
        "kind": item.kind,
        "title": item.title,
        "detail": item.detail,
        "source_type": item.source_type,
        "source_id": item.source_id,
        "href": item.href,
        "read_at": item.read_at.isoformat() if item.read_at else None,
        "archived_at": item.archived_at.isoformat() if item.archived_at else None,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


def _ensure_notification(session: Session, user_id: int, kind: str, title: str, detail: str, source_type: str, source_id: int, href: str) -> None:
    exists = session.scalar(
        select(Notification.id).where(
            Notification.user_id == user_id,
            Notification.kind == kind,
            Notification.source_type == source_type,
            Notification.source_id == source_id,
            Notification.archived_at.is_(None),
        )
    )
    if exists:
        return
    session.add(Notification(
        user_id=user_id,
        kind=kind,
        title=title,
        detail=detail,
        source_type=source_type,
        source_id=source_id,
        href=href,
    ))


def refresh_notifications(session: Session, user: CurrentUser) -> None:
    pref = get_or_create_preference(session, user)
    today = date.today()
    reminder = timedelta(days=pref.reminder_days or 3)
    if pref.notify_overdue:
        for item in session.scalars(select(FollowUp).where(FollowUp.completed_at.is_(None), FollowUp.due_date.is_not(None), FollowUp.due_date <= today)):
            lead = session.get(RepairShopLead, item.lead_id)
            _ensure_notification(
                session, user.id, "overdue_follow_up",
                f"{lead.shop_name if lead else item.lead_id} 跟进已逾期",
                item.note or "",
                "lead", item.lead_id,
                f"#/leads?id={item.lead_id}",
            )
        for opportunity in session.scalars(select(Opportunity).where(Opportunity.status == "active")):
            if opportunity.next_action_date and opportunity.next_action_date <= today + reminder:
                lead = session.get(RepairShopLead, opportunity.lead_id)
                _ensure_notification(
                    session, user.id, "due_action",
                    opportunity.next_action or "机会下一步到期",
                    lead.shop_name if lead else "",
                    "opportunity", opportunity.id,
                    f"#/opportunities?id={opportunity.id}",
                )
    if pref.notify_batches:
        from .models import LeadBatch
        from .workbench import _batch_status
        for batch in session.scalars(select(LeadBatch).where(LeadBatch.status != "archived")):
            status = _batch_status(batch)
            if status in {"overdue", "high_risk", "decision"} or (not batch.franchise_id and batch.status in {"new", "reviewed"}):
                _ensure_notification(
                    session, user.id, "batch",
                    f"批次 {batch.id} 待处理",
                    status,
                    "lead_batch", batch.id,
                    f"#/batches?id={batch.id}",
                )
    session.commit()


def list_notifications(session: Session, user: CurrentUser, include_archived: bool = False) -> list[dict]:
    refresh_notifications(session, user)
    query = select(Notification).where(Notification.user_id == user.id).order_by(Notification.read_at.is_not(None), Notification.id.desc())
    if not include_archived:
        query = query.where(Notification.archived_at.is_(None))
    return [serialize_notification(item) for item in session.scalars(query)]


def mark_notification_read(session: Session, notification_id: int, user: CurrentUser) -> dict:
    item = session.get(Notification, notification_id)
    if item is None or item.user_id != user.id:
        raise ValueError("notification not found")
    item.read_at = datetime.utcnow()
    persist(session, user, "notification.read", f"notification_id={item.id}")
    return serialize_notification(item)


def mark_all_read(session: Session, user: CurrentUser) -> dict:
    now = datetime.utcnow()
    for item in session.scalars(select(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None), Notification.archived_at.is_(None))):
        item.read_at = now
    persist(session, user, "notification.read_all")
    return {"ok": True}


def archive_notification(session: Session, notification_id: int, user: CurrentUser) -> dict:
    item = session.get(Notification, notification_id)
    if item is None or item.user_id != user.id:
        raise ValueError("notification not found")
    item.archived_at = datetime.utcnow()
    persist(session, user, "notification.archive", f"notification_id={item.id}")
    return serialize_notification(item)
