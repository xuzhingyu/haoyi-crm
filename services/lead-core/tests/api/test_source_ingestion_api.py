import httpx
from conftest import auth_headers
from fastapi.testclient import TestClient

from lead_core.ingestion.service import IngestionService

HQ_HEADERS = auth_headers(user="reviewer-1", roles="hq_data_reviewer")


def test_only_hq_admin_can_enable_person_fields_for_a_source(client: TestClient) -> None:
    response = client.post(
        "/api/v1/admin/sources",
        headers=HQ_HEADERS,
        json={
            "name": "sensitive-source",
            "base_url": "https://example.gov.cn/public/repair/list.xlsx",
            "allowed_domains": ["example.gov.cn"],
            "allowed_path_prefixes": ["/public/repair/"],
            "allowed_fields": ["business_name", "representative_name"],
            "status": "approved",
            "personal_fields_approved": True,
        },
    )

    assert response.status_code == 403


def test_hq_reviewer_can_ingest_an_approved_source_url(client: TestClient) -> None:
    source = client.post(
        "/api/v1/admin/sources",
        headers=HQ_HEADERS,
        json={
            "name": "无锡维修业户附件",
            "base_url": "https://example.gov.cn/public/repair/list.xlsx",
            "allowed_domains": ["example.gov.cn"],
            "allowed_path_prefixes": ["/public/repair/"],
            "allowed_fields": ["business_name", "city", "district", "category"],
            "rate_limit_per_minute": 6,
            "status": "approved",
            "personal_fields_approved": False,
        },
    ).json()
    transport = httpx.MockTransport(
        lambda request: httpx.Response(
            200,
            content=(
                "企业名称,城市,区县,类型\n"
                "新吴顺达汽车服务中心,无锡市,新吴区,快修保养\n"
            ).encode(),
        )
    )
    client.app.state.ingestion_service = IngestionService(
        client=httpx.Client(transport=transport)
    )

    response = client.post(
        f"/api/v1/admin/sources/{source['id']}/ingest",
        headers=HQ_HEADERS,
        json={
            "url": "https://example.gov.cn/public/repair/list.csv",
            "format": "csv",
            "parser_version": "csv-v1",
            "field_mapping": {
                "企业名称": "business_name",
                "城市": "city",
                "区县": "district",
                "类型": "category",
            },
            "value_mapping": {"category": {"快修保养": "quick_maintenance"}},
        },
    )

    assert response.status_code == 201
    assert response.json()["candidates_created"] == 1
    assert response.json()["requires_manual_review"] is False


def test_source_rate_limit_is_enforced_before_a_second_download(client: TestClient) -> None:
    source = client.post(
        "/api/v1/admin/sources",
        headers=HQ_HEADERS,
        json={
            "name": "rate-limited-source",
            "base_url": "https://example.gov.cn/public/repair/list.csv",
            "allowed_domains": ["example.gov.cn"],
            "allowed_path_prefixes": ["/public/repair/"],
            "allowed_fields": ["business_name", "city", "district", "category"],
            "rate_limit_per_minute": 1,
            "status": "approved",
        },
    ).json()
    client.app.state.ingestion_service = IngestionService(
        client=httpx.Client(
            transport=httpx.MockTransport(
                lambda request: httpx.Response(
                    200,
                    content=b"name,city,district,category\nShop,Nantong,Chongchuan,quick_maintenance\n",
                )
            )
        )
    )
    payload = {
        "url": "https://example.gov.cn/public/repair/list.csv",
        "format": "csv",
        "parser_version": "csv-v1",
        "field_mapping": {
            "name": "business_name",
            "city": "city",
            "district": "district",
            "category": "category",
        },
    }

    first = client.post(
        f"/api/v1/admin/sources/{source['id']}/ingest",
        headers=HQ_HEADERS,
        json=payload,
    )
    second = client.post(
        f"/api/v1/admin/sources/{source['id']}/ingest",
        headers=HQ_HEADERS,
        json=payload,
    )

    assert first.status_code == 201
    assert second.status_code == 429


def test_upstream_download_failure_returns_bad_gateway(client: TestClient) -> None:
    source = client.post(
        "/api/v1/admin/sources",
        headers=HQ_HEADERS,
        json={
            "name": "unavailable-source",
            "base_url": "https://example.gov.cn/public/repair/list.csv",
            "allowed_domains": ["example.gov.cn"],
            "allowed_path_prefixes": ["/public/repair/"],
            "allowed_fields": ["business_name"],
            "status": "approved",
        },
    ).json()
    client.app.state.ingestion_service = IngestionService(
        client=httpx.Client(
            transport=httpx.MockTransport(lambda request: httpx.Response(503))
        )
    )

    response = client.post(
        f"/api/v1/admin/sources/{source['id']}/ingest",
        headers=HQ_HEADERS,
        json={
            "url": "https://example.gov.cn/public/repair/list.csv",
            "format": "csv",
            "parser_version": "csv-v1",
            "field_mapping": {"name": "business_name"},
        },
    )

    assert response.status_code == 502
