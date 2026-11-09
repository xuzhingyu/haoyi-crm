from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from lead_core.jobs.lifecycle import process_claim_expirations, release_expired_cooldowns
from lead_core.jobs.replenishment import replenish_city
from lead_core.models import Claim, Interaction, LeadListing, RepairBusiness


def add_business(session, *, suffix: int, status: str) -> LeadListing:
    business = RepairBusiness(
        business_name=f"测试汽修企业{suffix}",
        city="南通市",
        district="崇川区",
        category="comprehensive_repair",
        full_address=f"青年路{suffix}号",
        freshness_date=datetime(2026, 9, 1, tzinfo=UTC).date(),
    )
    session.add(business)
    session.flush()
    listing = LeadListing(business_id=business.id, status=status)
    session.add(listing)
    session.flush()
    return listing


def test_replenishment_fills_only_up_to_city_target(client: TestClient) -> None:
    with client.app.state.session_factory() as session:
        add_business(session, suffix=1, status="reserve")
        add_business(session, suffix=2, status="reserve")
        add_business(session, suffix=3, status="reserve")
        session.commit()

        result = replenish_city(session, city="南通市", target=2)
        session.commit()

        listings = session.query(LeadListing).all()
        assert result == {"city": "南通市", "available": 2, "released": 2, "shortfall": 0}
        assert [item.status for item in listings].count("available") == 2
        assert [item.status for item in listings].count("reserve") == 1


def test_missing_first_touch_is_released_back_to_reserve(client: TestClient) -> None:
    now = datetime(2026, 9, 10, 8, 0, tzinfo=UTC)
    with client.app.state.session_factory() as session:
        listing = add_business(session, suffix=4, status="claimed")
        listing.claimed_by_org_id = "org-a"
        claim = Claim(
            listing_id=listing.id,
            org_id="org-a",
            user_id="member-a",
            idempotency_key="expiry-1",
            claimed_at=now - timedelta(days=5),
            first_touch_due=now - timedelta(days=3),
            activity_due=now + timedelta(days=2),
            protected_until=now + timedelta(days=25),
        )
        session.add(claim)
        session.commit()

        result = process_claim_expirations(session, now=now)
        session.commit()

        assert result == {"released": 1, "renewed": 0}
        assert claim.status == "released"
        assert claim.release_reason == "first_touch_overdue"
        assert listing.status == "reserve"
        assert listing.claimed_by_org_id is None


def test_meaningful_recent_contact_renews_expired_protection(client: TestClient) -> None:
    now = datetime(2026, 10, 2, 8, 0, tzinfo=UTC)
    with client.app.state.session_factory() as session:
        listing = add_business(session, suffix=5, status="claimed")
        listing.claimed_by_org_id = "org-a"
        claim = Claim(
            listing_id=listing.id,
            org_id="org-a",
            user_id="member-a",
            idempotency_key="expiry-2",
            claimed_at=now - timedelta(days=31),
            first_touch_due=now - timedelta(days=29),
            activity_due=now + timedelta(days=6),
            protected_until=now - timedelta(days=1),
        )
        session.add(claim)
        session.flush()
        session.add(
            Interaction(
                claim_id=claim.id,
                org_id="org-a",
                user_id="member-a",
                channel="phone",
                outcome="appointment",
                occurred_at=now - timedelta(days=1),
            )
        )
        session.commit()

        result = process_claim_expirations(session, now=now)
        session.commit()

        assert result == {"released": 0, "renewed": 1}
        assert claim.status == "active"
        assert claim.protected_until == now + timedelta(days=29)


def test_expired_soft_rejection_returns_to_reserve(client: TestClient) -> None:
    now = datetime(2026, 12, 1, 8, 0, tzinfo=UTC)
    with client.app.state.session_factory() as session:
        listing = add_business(session, suffix=6, status="cooldown")
        listing.cooldown_until = now - timedelta(seconds=1)
        session.commit()

        count = release_expired_cooldowns(session, now=now)
        session.commit()

        assert count == 1
        assert listing.status == "reserve"
        assert listing.cooldown_until is None
