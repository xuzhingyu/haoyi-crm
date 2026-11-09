from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import StrEnum


class PreferenceKind(StrEnum):
    SOFT_REJECT = "soft_reject"
    HARD_OPTOUT = "hard_optout"


@dataclass(frozen=True)
class PreferenceDecision:
    globally_blocked: bool
    cooldown_until: datetime | None
    requires_audited_override: bool


class ContactPreferencePolicy:
    def apply(self, kind: PreferenceKind, occurred_at: datetime) -> PreferenceDecision:
        if kind is PreferenceKind.HARD_OPTOUT:
            return PreferenceDecision(
                globally_blocked=True,
                cooldown_until=None,
                requires_audited_override=True,
            )
        return PreferenceDecision(
            globally_blocked=False,
            cooldown_until=occurred_at + timedelta(days=90),
            requires_audited_override=False,
        )
