from datetime import UTC, datetime

from fastapi.testclient import TestClient

from lead_core.models import OutboxEvent, TwentyMirror
from lead_core.services.outbox import OutboxDispatcher


class RecordingSink:
    def __init__(self, *, fail_once: bool = False) -> None:
        self.fail_once = fail_once
        self.received: list[tuple[str, dict, str | None]] = []

    def deliver(self, event_type: str, payload: dict, remote_id: str | None = None) -> str:
        if self.fail_once:
            self.fail_once = False
            raise RuntimeError("temporary Twenty outage")
        self.received.append((event_type, payload, remote_id))
        return remote_id or "remote-test-1"


def test_outbox_failure_is_retryable_and_success_is_not_redelivered(client: TestClient) -> None:
    with client.app.state.session_factory() as session:
        event = OutboxEvent(
            dedupe_key="claim.created:test-1",
            aggregate_type="claim",
            aggregate_id="test-1",
            event_type="claim.created",
            payload={"claim_id": "test-1", "org_id": "org-a"},
            available_at=datetime(2026, 9, 1, tzinfo=UTC),
        )
        session.add(event)
        session.commit()

        sink = RecordingSink(fail_once=True)
        dispatcher = OutboxDispatcher(sink)

        first = dispatcher.dispatch_batch(session, now=datetime(2026, 9, 1, tzinfo=UTC))
        session.commit()
        session.refresh(event)
        assert first == {"processed": 0, "failed": 1}
        assert event.status == "pending"
        assert event.attempts == 1
        assert event.last_error == "temporary Twenty outage"

        second = dispatcher.dispatch_batch(session, now=event.available_at)
        session.commit()
        session.refresh(event)
        third = dispatcher.dispatch_batch(session, now=event.available_at)

        assert second == {"processed": 1, "failed": 0}
        assert third == {"processed": 0, "failed": 0}
        assert event.status == "processed"
        assert sink.received == [
            ("claim.created", {"claim_id": "test-1", "org_id": "org-a"}, None)
        ]
        mirror = session.query(TwentyMirror).filter_by(
            aggregate_type="claim", aggregate_id="test-1"
        ).one()
        assert mirror.remote_id == "remote-test-1"
