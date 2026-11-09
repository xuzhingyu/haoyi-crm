from datetime import UTC, datetime, timedelta

from lead_core.domain.preferences import ContactPreferencePolicy, PreferenceKind

UTC = UTC


def test_soft_rejection_enters_ninety_day_cooldown() -> None:
    policy = ContactPreferencePolicy()
    occurred_at = datetime(2026, 9, 1, 12, 0, tzinfo=UTC)

    decision = policy.apply(PreferenceKind.SOFT_REJECT, occurred_at)

    assert decision.globally_blocked is False
    assert decision.cooldown_until == occurred_at + timedelta(days=90)


def test_hard_opt_out_blocks_globally_without_automatic_expiry() -> None:
    policy = ContactPreferencePolicy()

    decision = policy.apply(
        PreferenceKind.HARD_OPTOUT,
        datetime(2026, 9, 1, 12, 0, tzinfo=UTC),
    )

    assert decision.globally_blocked is True
    assert decision.cooldown_until is None
    assert decision.requires_audited_override is True
