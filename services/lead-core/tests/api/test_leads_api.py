from conftest import auth_headers
from fastapi.testclient import TestClient
from sqlalchemy import select

from lead_core.models import Evidence, ExtractionCandidate, LeadListing, RepairBusiness

HQ_HEADERS = auth_headers(user="reviewer-1", roles="hq_data_reviewer")
HQ_ADMIN_HEADERS = auth_headers(user="admin-1", roles="hq_admin")
ORG_A_HEADERS = auth_headers(user="member-a", org="org-a", roles="franchise_member")
ORG_B_HEADERS = auth_headers(user="member-b", org="org-b", roles="franchise_member")


def publish_business(client: TestClient, *, suffix: str = "1") -> dict:
    source_response = client.post(
        "/api/v1/admin/sources",
        headers=HQ_ADMIN_HEADERS,
        json={
            "name": f"南通维修业户公示-{suffix}",
            "base_url": "https://example.gov.cn/public/repair-list.html",
            "allowed_domains": ["example.gov.cn"],
            "allowed_path_prefixes": ["/public/"],
            "allowed_fields": [
                "business_name",
                "city",
                "district",
                "category",
                "full_address",
                "filing_number",
                "representative_name",
                "representative_role",
                "business_phone",
            ],
            "rate_limit_per_minute": 6,
            "status": "approved",
            "personal_fields_approved": True,
        },
    )
    assert source_response.status_code == 201
    source_id = source_response.json()["id"]

    candidate_response = client.post(
        "/api/v1/admin/candidates",
        headers=HQ_HEADERS,
        json={
            "source_id": source_id,
            "source_url": "https://example.gov.cn/public/repair-list.html",
            "document_hash": f"sha256-{suffix}",
            "parser_version": "html-table-v1",
            "business": {
                "business_name": f"南通诚安汽车维修有限公司{suffix}",
                "city": "南通市",
                "district": "崇川区",
                "category": "comprehensive_repair",
                "full_address": f"崇川区青年路{suffix}号",
                "filing_number": f"苏交维备00{suffix}",
                "unified_social_credit_code": f"91320600MA12345{suffix}7X",
                "representative_name": "张诚",
                "representative_role": "法定代表人",
                "business_phone": f"0513-8000000{suffix}",
            },
            "evidence": [
                {"field": "business_name", "value": f"南通诚安汽车维修有限公司{suffix}"},
                {"field": "full_address", "value": f"崇川区青年路{suffix}号"},
                {"field": "representative_name", "value": "张诚"},
            ],
        },
    )
    assert candidate_response.status_code == 201

    publication_response = client.post(
        "/api/v1/admin/publications",
        headers=HQ_HEADERS,
        json={"candidate_id": candidate_response.json()["id"]},
    )
    assert publication_response.status_code == 201
    return publication_response.json()


def test_pool_masks_private_fields_until_atomic_claim(client: TestClient) -> None:
    listing = publish_business(client)

    with client.app.state.session_factory() as session:
        stored_listing = session.get(LeadListing, listing["listing_id"])
        business = session.get(RepairBusiness, stored_listing.business_id)
        candidate = session.scalar(select(ExtractionCandidate))
        personal_evidence = session.scalar(
            select(Evidence).where(Evidence.field_name == "representative_name")
        )
        assert business.representative_name_encrypted != "张诚"
        assert business.business_phone_encrypted != "0513-80000001"
        assert "张诚" not in str(candidate.business_data)
        assert "0513-80000001" not in str(candidate.business_data)
        assert personal_evidence.source_value is None
        assert personal_evidence.source_value_encrypted != "张诚"

    pool_response = client.get("/api/v1/pool?city=南通市", headers=ORG_A_HEADERS)

    assert pool_response.status_code == 200
    card = pool_response.json()["items"][0]
    assert card == {
        "id": listing["listing_id"],
        "business_name": "南通诚安汽车维修有限公司1",
        "city": "南通市",
        "district": "崇川区",
        "categories": ["comprehensive_repair"],
        "freshness_date": card["freshness_date"],
        "completeness_grade": "A",
        "status": "available",
    }
    assert "full_address" not in card
    assert "representative_name" not in card
    assert "business_phone" not in card

    first = client.post(
        f"/api/v1/leads/{listing['listing_id']}/claim",
        headers={**ORG_A_HEADERS, "Idempotency-Key": "claim-key-1"},
    )
    replay = client.post(
        f"/api/v1/leads/{listing['listing_id']}/claim",
        headers={**ORG_A_HEADERS, "Idempotency-Key": "claim-key-1"},
    )
    conflict = client.post(
        f"/api/v1/leads/{listing['listing_id']}/claim",
        headers={**ORG_B_HEADERS, "Idempotency-Key": "claim-key-2"},
    )

    assert first.status_code == 201
    assert replay.status_code == 200
    assert replay.json()["id"] == first.json()["id"]
    assert conflict.status_code == 409

    own_detail = client.get(f"/api/v1/claims/{first.json()['id']}", headers=ORG_A_HEADERS)
    other_detail = client.get(f"/api/v1/claims/{first.json()['id']}", headers=ORG_B_HEADERS)
    hq_detail = client.get(f"/api/v1/claims/{first.json()['id']}", headers=HQ_ADMIN_HEADERS)

    assert own_detail.status_code == 200
    assert own_detail.json()["full_address"] == "崇川区青年路1号"
    assert own_detail.json()["representative"] == {"name": "张诚", "role": "法定代表人"}
    assert own_detail.json()["business_contacts"] == [{"kind": "phone", "value": "0513-80000001"}]
    assert other_detail.status_code == 404
    assert hq_detail.status_code == 200


def test_interaction_and_opportunity_are_tenant_scoped(client: TestClient) -> None:
    listing = publish_business(client, suffix="2")
    claim = client.post(
        f"/api/v1/leads/{listing['listing_id']}/claim",
        headers={**ORG_A_HEADERS, "Idempotency-Key": "claim-key-3"},
    ).json()

    interaction = client.post(
        f"/api/v1/claims/{claim['id']}/interactions",
        headers=ORG_A_HEADERS,
        json={
            "channel": "phone",
            "outcome": "connected",
            "notes": "老板表示下周可以到店沟通",
            "next_follow_up_at": "2026-09-04T09:00:00Z",
        },
    )
    forbidden_interaction = client.post(
        f"/api/v1/claims/{claim['id']}/interactions",
        headers=ORG_B_HEADERS,
        json={"channel": "phone", "outcome": "connected"},
    )
    opportunity = client.put(
        f"/api/v1/claims/{claim['id']}/opportunity",
        headers=ORG_A_HEADERS,
        json={"stage": "qualified", "expected_value": "12000.00"},
    )

    assert interaction.status_code == 201
    assert interaction.json()["outcome"] == "connected"
    assert forbidden_interaction.status_code == 404
    assert opportunity.status_code == 200
    assert opportunity.json() == {"stage": "qualified", "expected_value": "12000.00"}


def test_hard_opt_out_removes_business_from_the_global_pool(client: TestClient) -> None:
    listing = publish_business(client, suffix="3")
    claim = client.post(
        f"/api/v1/leads/{listing['listing_id']}/claim",
        headers={**ORG_A_HEADERS, "Idempotency-Key": "claim-key-4"},
    ).json()

    response = client.post(
        f"/api/v1/claims/{claim['id']}/contact-preference",
        headers=ORG_A_HEADERS,
        json={"kind": "hard_optout", "reason": "对方明确要求不要再联系"},
    )
    pool_for_other_org = client.get("/api/v1/pool?city=南通市", headers=ORG_B_HEADERS)

    assert response.status_code == 201
    assert response.json()["listing_status"] == "dnc"
    assert pool_for_other_org.json()["items"] == []


def test_only_hq_admin_can_lift_dnc_with_consent_evidence(client: TestClient) -> None:
    listing = publish_business(client, suffix="8")
    claim = client.post(
        f"/api/v1/leads/{listing['listing_id']}/claim",
        headers={**ORG_A_HEADERS, "Idempotency-Key": "claim-key-8"},
    ).json()
    client.post(
        f"/api/v1/claims/{claim['id']}/contact-preference",
        headers=ORG_A_HEADERS,
        json={"kind": "hard_optout", "reason": "明确要求停止联系"},
    )

    forbidden = client.post(
        f"/api/v1/admin/listings/{listing['listing_id']}/dnc-lift",
        headers=HQ_HEADERS,
        json={
            "basis": "new_consent",
            "evidence_reference": "consent://case/NT-2026-0008",
        },
    )
    lifted = client.post(
        f"/api/v1/admin/listings/{listing['listing_id']}/dnc-lift",
        headers=HQ_ADMIN_HEADERS,
        json={
            "basis": "new_consent",
            "evidence_reference": "consent://case/NT-2026-0008",
        },
    )

    assert forbidden.status_code == 403
    assert lifted.status_code == 200
    assert lifted.json()["status"] == "reserve"
    with client.app.state.session_factory() as session:
        stored_listing = session.get(LeadListing, listing["listing_id"])
        assert stored_listing.dnc_at is None


def test_hard_opt_out_interaction_immediately_removes_business_from_pool(
    client: TestClient,
) -> None:
    listing = publish_business(client, suffix="9")
    claim = client.post(
        f"/api/v1/leads/{listing['listing_id']}/claim",
        headers={**ORG_A_HEADERS, "Idempotency-Key": "claim-key-9"},
    ).json()

    response = client.post(
        f"/api/v1/claims/{claim['id']}/interactions",
        headers=ORG_A_HEADERS,
        json={
            "channel": "phone",
            "outcome": "hard_optout",
            "notes": "对方明确要求不再联系",
        },
    )
    repeated_contact = client.post(
        f"/api/v1/claims/{claim['id']}/interactions",
        headers=ORG_A_HEADERS,
        json={
            "channel": "phone",
            "outcome": "connected",
            "notes": "不应允许继续联系",
        },
    )
    pool_for_other_org = client.get("/api/v1/pool", headers=ORG_B_HEADERS)

    assert response.status_code == 201
    assert repeated_contact.status_code == 409
    assert pool_for_other_org.json()["items"] == []
    with client.app.state.session_factory() as session:
        stored_listing = session.get(LeadListing, listing["listing_id"])
        assert stored_listing.status == "dnc"


def test_publication_respects_city_available_inventory_target(client: TestClient) -> None:
    client.app.state.settings.inventory_target_per_city = 1

    first = publish_business(client, suffix="10")
    second = publish_business(client, suffix="11")

    with client.app.state.session_factory() as session:
        statuses = {
            first["listing_id"]: session.get(LeadListing, first["listing_id"]).status,
            second["listing_id"]: session.get(LeadListing, second["listing_id"]).status,
        }
    assert sorted(statuses.values()) == ["available", "reserve"]


def test_franchise_routes_require_an_organization_claim(client: TestClient) -> None:
    response = client.get(
        "/api/v1/pool",
        headers=auth_headers(user="orphan", roles="franchise_member"),
    )

    assert response.status_code == 403


def test_idempotent_claim_replays_do_not_consume_claim_rate_limit(
    client: TestClient,
) -> None:
    listing = publish_business(client, suffix="12")
    headers = {**ORG_A_HEADERS, "Idempotency-Key": "stable-replay-key"}

    first = client.post(
        f"/api/v1/leads/{listing['listing_id']}/claim",
        headers=headers,
    )
    replays = [
        client.post(
            f"/api/v1/leads/{listing['listing_id']}/claim",
            headers=headers,
        )
        for _ in range(11)
    ]

    assert first.status_code == 201
    assert all(response.status_code == 200 for response in replays)
    assert {response.json()["id"] for response in replays} == {first.json()["id"]}


def test_pool_cursor_does_not_skip_the_first_item_on_the_next_page(
    client: TestClient,
) -> None:
    listings = [publish_business(client, suffix=str(index)) for index in range(4, 7)]

    first_page = client.get("/api/v1/pool?limit=2", headers=ORG_A_HEADERS).json()
    second_page = client.get(
        f"/api/v1/pool?limit=2&cursor={first_page['next_cursor']}",
        headers=ORG_A_HEADERS,
    ).json()

    returned_ids = [item["id"] for item in first_page["items"] + second_page["items"]]
    assert set(returned_ids) == {item["listing_id"] for item in listings}
