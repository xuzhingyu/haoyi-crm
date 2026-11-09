import json
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import CurrentUser, write_audit
from .models import EntityEvent, User

LEAD_TRANSITIONS = {
    "active": {"archived", "voided"},
    "archived": set(),
    "voided": set(),
}
OPPORTUNITY_TRANSITIONS = {
    "active": {"closed", "archived", "voided"},
    "closed": {"archived"},
    "archived": set(),
    "voided": set(),
}
FRANCHISE_TRANSITIONS = {
    "筹建中": {"运营中", "已关闭", "已归档"},
    "运营中": {"已关闭", "已归档"},
    "已关闭": {"已归档"},
    "已归档": set(),
}
TRAINING_TRANSITIONS = {
    "待安排": {"已完成", "已取消", "已归档"},
    "已完成": {"已归档"},
    "已取消": {"已归档"},
    "已归档": set(),
}
BATCH_TRANSITIONS = {
    "new": {"reviewed", "dispatched", "archived"},
    "reviewed": {"dispatched", "archived"},
    "dispatched": {"confirmed", "archived"},
    "confirmed": {"archived"},
    "archived": set(),
}
KNOWLEDGE_TRANSITIONS = {
    "draft": {"published", "archived"},
    "published": {"archived"},
    "archived": set(),
}
REASON_REQUIRED = {"voided", "void", "close", "closed", "cancel", "cancelled", "已取消", "已关闭"}


class IllegalTransition(ValueError):
    pass


def snapshot(payload: dict | None) -> str:
    return json.dumps(payload or {}, ensure_ascii=False, default=str)


def require_reason(reason: str | None, action: str) -> str:
    text = (reason or "").strip()
    if action in REASON_REQUIRED and not text:
        raise ValueError("reason is required")
    return text


def assert_transition(table: dict[str, set[str]], current: str, target: str) -> None:
    allowed = table.get(current, set())
    if target not in allowed:
        raise IllegalTransition(f"cannot transition from {current} to {target}")


def record_event(
    session: Session,
    *,
    entity_type: str,
    entity_id: int,
    action: str,
    user: CurrentUser | None,
    before: dict | None = None,
    after: dict | None = None,
    reason: str = "",
) -> EntityEvent:
    event = EntityEvent(
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        before_json=snapshot(before),
        after_json=snapshot(after),
        reason=reason or "",
        user_id=user.id if user else None,
    )
    session.add(event)
    return event


def persist(
    session: Session,
    user: CurrentUser | None,
    action: str,
    detail: str = "",
) -> None:
    write_audit(session, user, action, detail, commit=False)
    session.commit()


def serialize_event(session: Session, event: EntityEvent) -> dict:
    actor = session.get(User, event.user_id) if event.user_id else None
    return {
        "id": event.id,
        "entity_type": event.entity_type,
        "entity_id": event.entity_id,
        "action": event.action,
        "before": json.loads(event.before_json or "{}"),
        "after": json.loads(event.after_json or "{}"),
        "reason": event.reason,
        "user_id": event.user_id,
        "actor": actor.display_name if actor else None,
        "created_at": event.created_at.isoformat() if event.created_at else datetime.utcnow().isoformat(),
    }


def list_events(session: Session, entity_type: str, entity_id: int) -> list[dict]:
    rows = session.scalars(
        select(EntityEvent)
        .where(EntityEvent.entity_type == entity_type, EntityEvent.entity_id == entity_id)
        .order_by(EntityEvent.id.desc())
    )
    return [serialize_event(session, row) for row in rows]


def touch(record, user: CurrentUser | None) -> None:
    if hasattr(record, "updated_at"):
        record.updated_at = datetime.utcnow()
    if user and hasattr(record, "updated_by_id"):
        record.updated_by_id = user.id
