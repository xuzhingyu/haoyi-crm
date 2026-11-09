from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from hashlib import sha256

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from lead_core.ingestion.object_store import SnapshotStore
from lead_core.ingestion.parsers import DocumentParser, ParseFormat
from lead_core.ingestion.source_policy import SourceAccessPolicy, SourceDefinition
from lead_core.models import ExtractionCandidate, Source, SourceDocument
from lead_core.security.sensitive_data import SENSITIVE_SOURCE_FIELDS, SensitiveTextCipher


class DuplicateDocumentError(ValueError):
    pass


@dataclass(frozen=True)
class IngestionResult:
    document_id: str
    candidates_created: int
    requires_manual_review: bool
    review_reason: str | None


class IngestionService:
    def __init__(
        self,
        *,
        client: httpx.Client | None = None,
        parser: DocumentParser | None = None,
        snapshot_store: SnapshotStore | None = None,
        cipher: SensitiveTextCipher | None = None,
        max_document_bytes: int = 10 * 1024 * 1024,
    ) -> None:
        self._client = client or httpx.Client(timeout=20.0, follow_redirects=False)
        self._parser = parser or DocumentParser()
        self._snapshot_store = snapshot_store
        self._cipher = cipher
        self._max_document_bytes = max_document_bytes

    def close(self) -> None:
        self._client.close()

    def ingest_url(
        self,
        session: Session,
        *,
        source: Source,
        url: str,
        format_: ParseFormat,
        parser_version: str,
        field_mapping: dict[str, str],
        value_mapping: dict[str, dict[str, str]] | None = None,
    ) -> IngestionResult:
        policy = SourceAccessPolicy(
            SourceDefinition(
                status=source.status,
                allowed_domains=tuple(source.allowed_domains),
                allowed_path_prefixes=tuple(source.allowed_path_prefixes),
                allowed_fields=frozenset(source.allowed_fields),
            )
        )
        policy.assert_url_allowed(url)
        response = self._client.get(
            url,
            headers={"User-Agent": "HaoyiLeadSourceBot/1.0 (+source-review-required)"},
            follow_redirects=False,
        )
        if response.is_redirect:
            raise ValueError("source redirects are not allowed")
        response.raise_for_status()
        content = response.content
        if len(content) > self._max_document_bytes:
            raise ValueError("source document exceeds size limit")

        document_hash = sha256(content).hexdigest()
        duplicate = session.scalar(
            select(SourceDocument).where(
                SourceDocument.source_id == source.id,
                SourceDocument.document_hash == document_hash,
            )
        )
        if duplicate is not None:
            raise DuplicateDocumentError("document already ingested")

        parsed = self._parser.parse(content, format_)
        fetched_at = datetime.now(UTC)
        object_key = None
        if self._snapshot_store is not None:
            object_key = (
                f"{source.id}/{fetched_at:%Y/%m/%d}/{document_hash}.{format_.value}"
            )
            self._snapshot_store.put(
                object_key,
                content,
                response.headers.get("Content-Type", "application/octet-stream").split(";", 1)[0],
            )
        document = SourceDocument(
            source_id=source.id,
            source_url=url,
            document_hash=document_hash,
            parser_version=parser_version,
            object_key=object_key,
            fetched_at=fetched_at,
            purge_after=fetched_at + timedelta(days=30),
        )
        session.add(document)
        session.flush()

        candidates_created = 0
        mappings = value_mapping or {}
        for row in parsed.rows:
            canonical: dict[str, str] = {}
            for source_field, raw_value in row.items():
                target_field = field_mapping.get(source_field)
                if not target_field or not raw_value:
                    continue
                canonical[target_field] = mappings.get(target_field, {}).get(raw_value, raw_value)
            filtered = policy.filter_fields(canonical)
            if not filtered:
                continue
            evidence = []
            for field, value in filtered.items():
                if field in SENSITIVE_SOURCE_FIELDS and self._cipher is not None:
                    evidence.append(
                        {"field": field, "value_encrypted": self._cipher.encrypt(str(value))}
                    )
                else:
                    evidence.append({"field": field, "value": str(value)})
            if self._cipher is not None:
                filtered = self._cipher.protect_mapping(filtered)
            session.add(
                ExtractionCandidate(
                    source_id=source.id,
                    source_document_id=document.id,
                    business_data=filtered,
                    evidence_data=evidence,
                )
            )
            candidates_created += 1
        session.flush()
        return IngestionResult(
            document_id=document.id,
            candidates_created=candidates_created,
            requires_manual_review=parsed.requires_manual_review,
            review_reason=parsed.review_reason,
        )
