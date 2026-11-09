from __future__ import annotations

from datetime import UTC, datetime

from lead_core.config import Settings
from lead_core.db import apply_rls_context, build_engine, build_session_factory
from lead_core.ingestion.object_store import S3SnapshotStore
from lead_core.jobs.celery_app import celery_app
from lead_core.jobs.lifecycle import process_claim_expirations, release_expired_cooldowns
from lead_core.jobs.replenishment import replenish_city
from lead_core.jobs.retention import purge_expired_source_snapshots
from lead_core.services.outbox import OutboxDispatcher
from lead_core.services.twenty import TwentyHttpSink


def _session_factory(settings: Settings):
    return build_session_factory(build_engine(settings.database_url))


@celery_app.task(name="lead_core.replenish_all_cities")
def replenish_all_cities() -> list[dict[str, int | str]]:
    settings = Settings()
    factory = _session_factory(settings)
    with factory() as session:
        apply_rls_context(session, is_worker=True)
        results = [
            replenish_city(
                session,
                city=city,
                target=settings.inventory_target_per_city,
            )
            for city in settings.jiangsu_cities
        ]
        session.commit()
        return results


@celery_app.task(name="lead_core.maintain_claims")
def maintain_claims() -> dict[str, int]:
    settings = Settings()
    factory = _session_factory(settings)
    now = datetime.now(UTC)
    with factory() as session:
        apply_rls_context(session, is_worker=True)
        claim_result = process_claim_expirations(session, now=now)
        cooldowns = release_expired_cooldowns(session, now=now)
        session.commit()
        return {**claim_result, "cooldowns_released": cooldowns}


@celery_app.task(name="lead_core.dispatch_twenty_outbox")
def dispatch_twenty_outbox() -> dict[str, int | str]:
    settings = Settings()
    if not settings.twenty_sync_enabled:
        return {"status": "disabled"}
    sink = TwentyHttpSink(
        base_url=settings.twenty_base_url,
        api_key=settings.twenty_api_key,
    )
    factory = _session_factory(settings)
    with factory() as session:
        apply_rls_context(session, is_worker=True)
        result = OutboxDispatcher(sink).dispatch_batch(session, now=datetime.now(UTC))
        session.commit()
        return result


@celery_app.task(name="lead_core.purge_source_snapshots")
def purge_source_snapshots() -> dict[str, int | str]:
    settings = Settings()
    if not settings.snapshot_store_enabled:
        return {"status": "disabled"}
    store = S3SnapshotStore(
        endpoint_url=settings.snapshot_s3_endpoint,
        region=settings.snapshot_s3_region,
        bucket=settings.snapshot_s3_bucket,
        access_key=settings.snapshot_s3_access_key,
        secret_key=settings.snapshot_s3_secret_key,
    )
    factory = _session_factory(settings)
    with factory() as session:
        apply_rls_context(session, is_worker=True)
        purged = purge_expired_source_snapshots(
            session,
            store=store,
            now=datetime.now(UTC),
        )
        session.commit()
        return {"purged": purged}
