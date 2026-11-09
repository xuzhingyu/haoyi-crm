from lead_core.company_intelligence.service import collect_run, local_day, queue_run
from lead_core.config import Settings
from lead_core.db import apply_rls_context, build_engine, build_session_factory
from lead_core.jobs.celery_app import celery_app


@celery_app.task(name="lead_core.company_collection", soft_time_limit=1740, time_limit=1800)
def company_collection(run_id: str):
    settings = Settings()
    engine = build_engine(settings.database_url)
    try:
        with build_session_factory(engine)() as session:
            apply_rls_context(session, is_worker=True)
            return collect_run(session, settings, run_id)
    finally:
        engine.dispose()


@celery_app.task(name="lead_core.company_daily_collection", soft_time_limit=1740, time_limit=1800)
def company_daily_collection():
    settings = Settings()
    engine = build_engine(settings.database_url)
    try:
        with build_session_factory(engine)() as session:
            apply_rls_context(session, is_worker=True)
            run, created = queue_run(session, "daily", "scheduler", scheduled_day=local_day().isoformat())
            session.commit()
            apply_rls_context(session, is_worker=True)
            if not created:
                return {"id": run.id, "status": run.status}
            return collect_run(session, settings, run.id)
    finally:
        engine.dispose()
