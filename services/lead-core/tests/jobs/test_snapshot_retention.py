from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from lead_core.jobs.retention import purge_expired_source_snapshots
from lead_core.models import Source, SourceDocument


class RecordingStore:
    def __init__(self) -> None:
        self.deleted: list[str] = []

    def delete(self, key: str) -> None:
        self.deleted.append(key)


def test_expired_raw_snapshot_is_deleted_but_evidence_record_is_retained(
    client: TestClient,
) -> None:
    now = datetime(2026, 9, 1, tzinfo=UTC)
    store = RecordingStore()
    with client.app.state.session_factory() as session:
        source = Source(
            name="retention-source",
            base_url="https://example.gov.cn/public/list.csv",
            allowed_domains=["example.gov.cn"],
            allowed_path_prefixes=["/public/"],
            allowed_fields=["business_name"],
            status="approved",
        )
        session.add(source)
        session.flush()
        document = SourceDocument(
            source_id=source.id,
            source_url="https://example.gov.cn/public/list.csv",
            document_hash="hash-retention",
            parser_version="csv-v1",
            object_key="source/raw/hash.csv",
            purge_after=now - timedelta(seconds=1),
        )
        session.add(document)
        session.commit()

        assert purge_expired_source_snapshots(session, store=store, now=now) == 1
        session.commit()

        assert store.deleted == ["source/raw/hash.csv"]
        assert session.get(SourceDocument, document.id) is not None
        assert session.get(SourceDocument, document.id).object_key is None
