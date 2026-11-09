from __future__ import annotations

import re
from dataclasses import dataclass
from enum import StrEnum


class MatchKind(StrEnum):
    EXACT_USCC = "exact_uscc"
    EXACT_FILING_NUMBER = "exact_filing_number"
    EXACT_NAME_ADDRESS = "exact_name_address"
    MANUAL_REVIEW = "manual_review"


@dataclass(frozen=True)
class BusinessIdentity:
    name: str
    city: str
    address: str | None = None
    unified_social_credit_code: str | None = None
    filing_number: str | None = None


@dataclass(frozen=True)
class EntityMatch:
    kind: MatchKind


class EntityResolver:
    _LEGAL_SUFFIXES = (
        "有限责任公司",
        "股份有限公司",
        "有限公司",
        "普通合伙",
    )

    def compare(self, left: BusinessIdentity, right: BusinessIdentity) -> EntityMatch:
        if self._same_non_empty(
            left.unified_social_credit_code,
            right.unified_social_credit_code,
        ):
            return EntityMatch(MatchKind.EXACT_USCC)
        if self._same_non_empty(left.filing_number, right.filing_number):
            return EntityMatch(MatchKind.EXACT_FILING_NUMBER)
        if (
            self._normalize(left.city) == self._normalize(right.city)
            and left.address
            and right.address
            and self._normalize_name(left.name) == self._normalize_name(right.name)
            and self._normalize(left.address) == self._normalize(right.address)
        ):
            return EntityMatch(MatchKind.EXACT_NAME_ADDRESS)
        return EntityMatch(MatchKind.MANUAL_REVIEW)

    @staticmethod
    def _same_non_empty(left: str | None, right: str | None) -> bool:
        return bool(left and right and EntityResolver._normalize(left) == EntityResolver._normalize(right))

    @staticmethod
    def _normalize(value: str) -> str:
        return re.sub(r"[^0-9A-Za-z\u4e00-\u9fff]", "", value).upper()

    def _normalize_name(self, value: str) -> str:
        normalized = self._normalize(value)
        for suffix in self._LEGAL_SUFFIXES:
            normalized = normalized.removesuffix(self._normalize(suffix))
        return normalized
