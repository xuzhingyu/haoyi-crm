from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from lead_core.ingestion.object_store import SnapshotStore
from lead_core.models import SourceDocument


def purge_expired_source_snapshots(
    session: Session,
    *,
    store: SnapshotStore,
    now: datetime,
) -> int:
    documents = session.scalars(
        select(SourceDocument)
        .where(
            SourceDocument.object_key.is_not(None),
            SourceDocument.purge_after.is_not(None),
            SourceDocument.purge_after <= now,
        )
        .with_for_update(skip_locked=True)
    ).all()
    for document in documents:
        if document.object_key:
            store.delete(document.object_key)
            document.object_key = None
    return len(documents)
