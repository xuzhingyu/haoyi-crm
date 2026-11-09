from datetime import UTC, date, datetime, timedelta

from lead_core.domain.claims import (
    ClaimPolicy,
    FollowUpSignal,
    InteractionOutcome,
)

UTC = UTC


def test_first_touch_due_skips_weekend_and_configured_holiday() -> None:
    policy = ClaimPolicy(holidays={date(2026, 10, 5)})
    claimed_at = datetime(2026, 10, 2, 9, 0, tzinfo=UTC)  # Friday

    deadlines = policy.deadlines_for(claimed_at)

    assert deadlines.first_touch_due == datetime(2026, 10, 7, 9, 0, tzinfo=UTC)
    assert deadlines.protected_until == datetime(2026, 11, 1, 9, 0, tzinfo=UTC)
    assert deadlines.activity_due == datetime(2026, 10, 9, 9, 0, tzinfo=UTC)


def test_missing_first_touch_releases_after_two_business_days() -> None:
    policy = ClaimPolicy()
    claimed_at = datetime(2026, 9, 1, 8, 0, tzinfo=UTC)
    deadlines = policy.deadlines_for(claimed_at)

    decision = policy.evaluate(
        now=deadlines.first_touch_due + timedelta(seconds=1),
        claimed_at=claimed_at,
        protected_until=deadlines.protected_until,
        interactions=[],
        opportunity_active=False,
    )

    assert decision.release is True
    assert decision.reason == "first_touch_overdue"


def test_no_answer_counts_for_weekly_activity_inside_first_protection_period() -> None:
    policy = ClaimPolicy()
    claimed_at = datetime(2026, 9, 1, 8, 0, tzinfo=UTC)
    interaction = FollowUpSignal(
        occurred_at=datetime(2026, 9, 7, 7, 0, tzinfo=UTC),
        outcome=InteractionOutcome.NO_ANSWER,
    )

    decision = policy.evaluate(
        now=datetime(2026, 9, 10, 8, 0, tzinfo=UTC),
        claimed_at=claimed_at,
        protected_until=claimed_at + timedelta(days=30),
        interactions=[interaction],
        opportunity_active=False,
    )

    assert decision.release is False
    assert decision.reason is None


def test_claim_releases_when_latest_activity_is_older_than_seven_days() -> None:
    policy = ClaimPolicy()
    claimed_at = datetime(2026, 9, 1, 8, 0, tzinfo=UTC)
    interaction = FollowUpSignal(
        occurred_at=datetime(2026, 9, 2, 8, 0, tzinfo=UTC),
        outcome=InteractionOutcome.CONNECTED,
    )

    decision = policy.evaluate(
        now=datetime(2026, 9, 9, 8, 0, 1, tzinfo=UTC),
        claimed_at=claimed_at,
        protected_until=claimed_at + timedelta(days=30),
        interactions=[interaction],
        opportunity_active=False,
    )

    assert decision.release is True
    assert decision.reason == "activity_overdue"


def test_thirty_day_renewal_requires_meaningful_recent_signal() -> None:
    policy = ClaimPolicy()
    claimed_at = datetime(2026, 9, 1, 8, 0, tzinfo=UTC)
    recent_no_answer = FollowUpSignal(
        occurred_at=datetime(2026, 9, 29, 8, 0, tzinfo=UTC),
        outcome=InteractionOutcome.NO_ANSWER,
    )

    rejected = policy.evaluate(
        now=datetime(2026, 10, 1, 8, 0, 1, tzinfo=UTC),
        claimed_at=claimed_at,
        protected_until=datetime(2026, 10, 1, 8, 0, tzinfo=UTC),
        interactions=[recent_no_answer],
        opportunity_active=False,
    )
    accepted = policy.evaluate(
        now=datetime(2026, 10, 1, 8, 0, 1, tzinfo=UTC),
        claimed_at=claimed_at,
        protected_until=datetime(2026, 10, 1, 8, 0, tzinfo=UTC),
        interactions=[
            FollowUpSignal(
                occurred_at=datetime(2026, 9, 29, 8, 0, tzinfo=UTC),
                outcome=InteractionOutcome.APPOINTMENT,
            )
        ],
        opportunity_active=False,
    )

    assert rejected.release is True
    assert rejected.reason == "renewal_not_qualified"
    assert accepted.release is False
    assert accepted.renew_until == datetime(2026, 10, 31, 8, 0, tzinfo=UTC)
