import httpx
import pytest
from fastapi.testclient import TestClient

from lead_core.ingestion.parsers import ParseFormat
from lead_core.ingestion.service import DuplicateDocumentError, IngestionService
from lead_core.models import ExtractionCandidate, Source, SourceDocument


class RecordingSnapshotStore:
    def __init__(self) -> None:
        self.items: list[tuple[str, bytes, str]] = []

    def put(self, key: str, content: bytes, content_type: str) -> None:
        self.items.append((key, content, content_type))


def test_whitelisted_csv_url_creates_filtered_candidate_and_rejects_duplicate(
    client: TestClient,
) -> None:
    with client.app.state.session_factory() as session:
        source = Source(
            name="南通公开名录",
            base_url="https://example.gov.cn/public/repair/list.csv",
            allowed_domains=["example.gov.cn"],
            allowed_path_prefixes=["/public/repair/"],
            allowed_fields=["business_name", "city", "district", "category"],
            status="approved",
        )
        session.add(source)
        session.commit()

        transport = httpx.MockTransport(
            lambda request: httpx.Response(
                200,
                content=(
                    "企业名称,城市,区县,类型,私人手机\n"
                    "诚安汽车维修有限公司,南通市,崇川区,综合维修,13800000000\n"
                ).encode(),
                headers={"Content-Type": "text/csv"},
            )
        )
        snapshots = RecordingSnapshotStore()
        service = IngestionService(
            client=httpx.Client(transport=transport),
            snapshot_store=snapshots,
        )

        result = service.ingest_url(
            session,
            source=source,
            url="https://example.gov.cn/public/repair/list.csv",
            format_=ParseFormat.CSV,
            parser_version="csv-v1",
            field_mapping={
                "企业名称": "business_name",
                "城市": "city",
                "区县": "district",
                "类型": "category",
                "私人手机": "private_mobile",
            },
            value_mapping={"category": {"综合维修": "comprehensive_repair"}},
        )
        session.commit()

        candidate = session.query(ExtractionCandidate).one()
        assert result.candidates_created == 1
        assert result.requires_manual_review is False
        assert candidate.business_data == {
            "business_name": "诚安汽车维修有限公司",
            "city": "南通市",
            "district": "崇川区",
            "category": "comprehensive_repair",
        }
        assert "private_mobile" not in candidate.business_data
        document = session.query(SourceDocument).one()
        assert document.object_key is not None
        assert snapshots.items == [
            (document.object_key, snapshots.items[0][1], "text/csv")
        ]

        with pytest.raises(DuplicateDocumentError, match="document already ingested"):
            service.ingest_url(
                session,
                source=source,
                url="https://example.gov.cn/public/repair/list.csv",
                format_=ParseFormat.CSV,
                parser_version="csv-v1",
                field_mapping={"企业名称": "business_name"},
            )


def test_disallowed_url_is_rejected_before_http_request(client: TestClient) -> None:
    called = False

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal called
        called = True
        return httpx.Response(200, content=b"")

    with client.app.state.session_factory() as session:
        source = Source(
            name="受限来源",
            base_url="https://example.gov.cn/public/repair/",
            allowed_domains=["example.gov.cn"],
            allowed_path_prefixes=["/public/repair/"],
            allowed_fields=["business_name"],
            status="approved",
        )
        session.add(source)
        session.commit()
        service = IngestionService(client=httpx.Client(transport=httpx.MockTransport(handler)))

        with pytest.raises(ValueError, match="source URL is not allowed"):
            service.ingest_url(
                session,
                source=source,
                url="https://search.example/result.csv",
                format_=ParseFormat.CSV,
                parser_version="csv-v1",
                field_mapping={"name": "business_name"},
            )

        assert called is False
