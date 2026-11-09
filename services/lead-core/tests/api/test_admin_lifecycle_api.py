from conftest import auth_headers
from fastapi.testclient import TestClient

from lead_core.models import AuditEvent

HQ_ADMIN_HEADERS = auth_headers(user="admin-1", roles="hq_admin")
HQ_REVIEWER_HEADERS = auth_headers(user="reviewer-1", roles="hq_data_reviewer")


def create_source(client: TestClient, *, name: str = "test-source") -> dict:
    response = client.post(
        "/api/v1/admin/sources",
        headers=HQ_REVIEWER_HEADERS,
        json={
            "name": name,
            "base_url": "https://example.gov.cn/public/repair/list.csv",
            "allowed_domains": ["example.gov.cn"],
            "allowed_path_prefixes": ["/public/repair/"],
            "allowed_fields": ["business_name", "city", "district", "category"],
            "status": "approved",
        },
    )
    assert response.status_code == 201
    return response.json()


def create_candidate(client: TestClient, source_id: str) -> dict:
    response = client.post(
        "/api/v1/admin/candidates",
        headers=HQ_REVIEWER_HEADERS,
        json={
            "source_id": source_id,
            "source_url": "https://example.gov.cn/public/repair/manual.csv",
            "document_hash": "manual-review-hash",
            "parser_version": "manual-v1",
            "business": {
                "business_name": "南通合规汽修服务中心",
                "city": "南通市",
                "district": "崇川区",
                "category": "quick_maintenance",
            },
            "evidence": [
                {"field": "business_name", "value": "南通合规汽修服务中心"},
                {"field": "city", "value": "南通市"},
                {"field": "district", "value": "崇川区"},
                {"field": "category", "value": "quick_maintenance"},
            ],
        },
    )
    assert response.status_code == 201
    return response.json()


def test_source_can_be_listed_and_paused_immediately(client: TestClient) -> None:
    source = create_source(client)

    listed = client.get("/api/v1/admin/sources", headers=HQ_REVIEWER_HEADERS)
    paused = client.patch(
        f"/api/v1/admin/sources/{source['id']}",
        headers=HQ_REVIEWER_HEADERS,
        json={"status": "paused"},
    )

    assert listed.status_code == 200
    assert listed.json()[0]["id"] == source["id"]
    assert paused.status_code == 200
    assert paused.json()["status"] == "paused"


def test_only_hq_admin_can_approve_source_person_fields_on_update(
    client: TestClient,
) -> None:
    source = create_source(client)

    forbidden = client.patch(
        f"/api/v1/admin/sources/{source['id']}",
        headers=HQ_REVIEWER_HEADERS,
        json={"personal_fields_approved": True},
    )

    assert forbidden.status_code == 403


def test_rejected_candidate_cannot_be_published(client: TestClient) -> None:
    source = create_source(client)
    candidate = create_candidate(client, source["id"])

    rejected = client.patch(
        f"/api/v1/admin/candidates/{candidate['id']}",
        headers=HQ_REVIEWER_HEADERS,
        json={"status": "rejected", "reason": "不属于一期目标门店"},
    )
    publication = client.post(
        "/api/v1/admin/publications",
        headers=HQ_REVIEWER_HEADERS,
        json={"candidate_id": candidate["id"]},
    )

    assert rejected.status_code == 200
    assert rejected.json()["status"] == "rejected"
    assert publication.status_code == 409


def test_candidate_person_fields_are_redacted_for_reviewer_and_views_are_audited(
    client: TestClient,
) -> None:
    source = client.post(
        "/api/v1/admin/sources",
        headers=HQ_ADMIN_HEADERS,
        json={
            "name": "approved-person-source",
            "base_url": "https://example.gov.cn/public/repair/list.csv",
            "allowed_domains": ["example.gov.cn"],
            "allowed_path_prefixes": ["/public/repair/"],
            "allowed_fields": [
                "business_name",
                "city",
                "district",
                "category",
                "representative_name",
                "representative_role",
                "business_phone",
            ],
            "status": "approved",
            "personal_fields_approved": True,
        },
    ).json()
    candidate = client.post(
        "/api/v1/admin/candidates",
        headers=HQ_ADMIN_HEADERS,
        json={
            "source_id": source["id"],
            "source_url": "https://example.gov.cn/public/repair/person.csv",
            "document_hash": "person-review-hash",
            "parser_version": "manual-v1",
            "business": {
                "business_name": "南通公开负责人汽修店",
                "city": "南通市",
                "district": "崇川区",
                "category": "quick_maintenance",
                "representative_name": "张公开",
                "representative_role": "经营负责人",
                "business_phone": "0513-12345678",
            },
            "evidence": [
                {"field": "business_name", "value": "南通公开负责人汽修店"},
                {"field": "representative_name", "value": "张公开"},
            ],
        },
    ).json()

    reviewer_view = client.get(
        f"/api/v1/admin/candidates/{candidate['id']}",
        headers=HQ_REVIEWER_HEADERS,
    )
    admin_view = client.get(
        f"/api/v1/admin/candidates/{candidate['id']}",
        headers=HQ_ADMIN_HEADERS,
    )

    assert "representative_name" not in reviewer_view.json()["business"]
    assert admin_view.json()["business"]["representative_name"] == "张公开"
    with client.app.state.session_factory() as session:
        assert session.query(AuditEvent).filter_by(action="candidate.viewed").count() == 2


def test_franchisee_membership_is_admin_only_and_capped_at_three(
    client: TestClient,
) -> None:
    franchisee = client.post(
        "/api/v1/admin/franchisees",
        headers=HQ_ADMIN_HEADERS,
        json={"id": "org-nantong-1", "name": "南通一号加盟商"},
    )
    assert franchisee.status_code == 201

    for index in range(3):
        response = client.post(
            "/api/v1/admin/franchisees/org-nantong-1/memberships",
            headers=HQ_ADMIN_HEADERS,
            json={"user_id": f"member-{index}", "role": "franchise_member"},
        )
        assert response.status_code == 201

    fourth = client.post(
        "/api/v1/admin/franchisees/org-nantong-1/memberships",
        headers=HQ_ADMIN_HEADERS,
        json={"user_id": "member-4", "role": "franchise_member"},
    )
    members = client.get(
        "/api/v1/admin/franchisees/org-nantong-1/memberships",
        headers=HQ_ADMIN_HEADERS,
    )
    removed = client.delete(
        f"/api/v1/admin/franchisees/org-nantong-1/memberships/{members.json()[0]['id']}",
        headers=HQ_ADMIN_HEADERS,
    )
    replacement = client.post(
        "/api/v1/admin/franchisees/org-nantong-1/memberships",
        headers=HQ_ADMIN_HEADERS,
        json={"user_id": "member-4", "role": "franchise_member"},
    )
    reviewer = client.get(
        "/api/v1/admin/franchisees/org-nantong-1/memberships",
        headers=HQ_REVIEWER_HEADERS,
    )

    assert fourth.status_code == 409
    assert len(members.json()) == 3
    assert removed.status_code == 204
    assert replacement.status_code == 201
    assert reviewer.status_code == 403
