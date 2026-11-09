from __future__ import annotations

from datetime import datetime, timedelta
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session

from lead_core.models import OutboxEvent, TwentyMirror


class EventSink(Protocol):
    def deliver(
        self,
        event_type: str,
        payload: dict,
        remote_id: str | None = None,
    ) -> str | None: ...


class OutboxDispatcher:
    def __init__(self, sink: EventSink, *, batch_size: int = 100) -> None:
        self._sink = sink
        self._batch_size = batch_size

    def dispatch_batch(self, session: Session, *, now: datetime) -> dict[str, int]:
        events = session.scalars(
            select(OutboxEvent)
            .where(OutboxEvent.status == "pending", OutboxEvent.available_at <= now)
            .order_by(OutboxEvent.available_at, OutboxEvent.id)
            .limit(self._batch_size)
            .with_for_update(skip_locked=True)
        ).all()
        processed = 0
        failed = 0
        for event in events:
            mirror = session.scalar(
                select(TwentyMirror).where(
                    TwentyMirror.aggregate_type == event.aggregate_type,
                    TwentyMirror.aggregate_id == event.aggregate_id,
                )
            )
            try:
                remote_id = self._sink.deliver(
                    event.event_type,
                    event.payload,
                    mirror.remote_id if mirror else None,
                )
            except Exception as exc:
                event.attempts += 1
                event.last_error = str(exc)[:2000]
                backoff_minutes = min(2 ** (event.attempts - 1), 60)
                event.available_at = now + timedelta(minutes=backoff_minutes)
                failed += 1
            else:
                if remote_id:
                    if mirror is None:
                        mirror = TwentyMirror(
                            aggregate_type=event.aggregate_type,
                            aggregate_id=event.aggregate_id,
                            remote_id=remote_id,
                        )
                        session.add(mirror)
                    else:
                        mirror.remote_id = remote_id
                event.attempts += 1
                event.status = "processed"
                event.processed_at = now
                event.last_error = None
                processed += 1
        session.flush()
        return {"processed": processed, "failed": failed}
