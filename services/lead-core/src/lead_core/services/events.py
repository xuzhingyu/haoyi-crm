from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from lead_core.models import AuditEvent, OutboxEvent
from lead_core.security.auth import Principal


def record_audit(
    session: Session,
    *,
    principal: Principal,
    action: str,
    entity_type: str,
    entity_id: str,
    details: dict[str, Any] | None = None,
) -> AuditEvent:
    event = AuditEvent(
        actor_user_id=principal.user_id,
        actor_org_id=principal.org_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details or {},
    )
    session.add(event)
    return event


def enqueue_outbox(
    session: Session,
    *,
    dedupe_key: str,
    aggregate_type: str,
    aggregate_id: str,
    event_type: str,
    payload: dict[str, Any],
) -> OutboxEvent:
    event = OutboxEvent(
        dedupe_key=dedupe_key,
        aggregate_type=aggregate_type,
        aggregate_id=aggregate_id,
        event_type=event_type,
        payload=payload,
    )
    session.add(event)
    return event
