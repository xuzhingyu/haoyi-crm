from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from enum import StrEnum


class InteractionOutcome(StrEnum):
    NO_ANSWER = "no_answer"
    BUSY = "busy"
    CONNECTED = "connected"
    WECHAT_REPLIED = "wechat_replied"
    APPOINTMENT = "appointment"
    QUOTED = "quoted"
    SOFT_REJECT = "soft_reject"
    HARD_OPTOUT = "hard_optout"


MEANINGFUL_OUTCOMES = {
    InteractionOutcome.CONNECTED,
    InteractionOutcome.WECHAT_REPLIED,
    InteractionOutcome.APPOINTMENT,
    InteractionOutcome.QUOTED,
}


@dataclass(frozen=True)
class FollowUpSignal:
    occurred_at: datetime
    outcome: InteractionOutcome


@dataclass(frozen=True)
class ClaimDeadlines:
    first_touch_due: datetime
    activity_due: datetime
    protected_until: datetime


@dataclass(frozen=True)
class ClaimDecision:
    release: bool
    reason: str | None = None
    renew_until: datetime | None = None


class ClaimPolicy:
    def __init__(self, holidays: set[date] | None = None) -> None:
        self._holidays = holidays or set()

    def deadlines_for(self, claimed_at: datetime) -> ClaimDeadlines:
        return ClaimDeadlines(
            first_touch_due=self._add_business_days(claimed_at, 2),
            activity_due=claimed_at + timedelta(days=7),
            protected_until=claimed_at + timedelta(days=30),
        )

    def evaluate(
        self,
        *,
        now: datetime,
        claimed_at: datetime,
        protected_until: datetime,
        interactions: Iterable[FollowUpSignal],
        opportunity_active: bool,
    ) -> ClaimDecision:
        ordered = sorted(interactions, key=lambda signal: signal.occurred_at)
        if not ordered:
            if now > self.deadlines_for(claimed_at).first_touch_due:
                return ClaimDecision(release=True, reason="first_touch_overdue")
            return ClaimDecision(release=False)

        latest = ordered[-1]
        if now > latest.occurred_at + timedelta(days=7):
            return ClaimDecision(release=True, reason="activity_overdue")

        if now > protected_until:
            has_meaningful_recent_signal = any(
                signal.outcome in MEANINGFUL_OUTCOMES
                and signal.occurred_at >= now - timedelta(days=7)
                for signal in ordered
            )
            if not has_meaningful_recent_signal and not opportunity_active:
                return ClaimDecision(release=True, reason="renewal_not_qualified")
            return ClaimDecision(
                release=False,
                renew_until=protected_until + timedelta(days=30),
            )

        return ClaimDecision(release=False)

    def _add_business_days(self, value: datetime, days: int) -> datetime:
        current = value
        added = 0
        while added < days:
            current += timedelta(days=1)
            if current.weekday() < 5 and current.date() not in self._holidays:
                added += 1
        return current
