from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlparse


@dataclass(frozen=True)
class SourceDefinition:
    status: str
    allowed_domains: tuple[str, ...]
    allowed_path_prefixes: tuple[str, ...]
    allowed_fields: frozenset[str]


class SourceAccessPolicy:
    def __init__(self, source: SourceDefinition) -> None:
        self._source = source

    def assert_url_allowed(self, url: str) -> None:
        if self._source.status != "approved":
            raise ValueError("source is not approved")
        parsed = urlparse(url)
        hostname = (parsed.hostname or "").lower()
        domain_allowed = any(
            hostname == domain.lower() or hostname.endswith(f".{domain.lower()}")
            for domain in self._source.allowed_domains
        )
        path_allowed = any(
            parsed.path.startswith(prefix) for prefix in self._source.allowed_path_prefixes
        )
        if parsed.scheme != "https" or not domain_allowed or not path_allowed:
            raise ValueError("source URL is not allowed")

    def filter_fields(self, values: dict[str, object]) -> dict[str, object]:
        return {key: value for key, value in values.items() if key in self._source.allowed_fields}
