"""Verify the actual generic gateway lock with isolated PostgreSQL rows, no model calls."""
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import delete, select, text

from lead_core.config import Settings
from lead_core.db import apply_rls_context, build_engine, build_session_factory
from lead_core.intelligence import gateway
from lead_core.intelligence.models import AiJob, BudgetDay, ModelCall


def main():
    settings = Settings()
    settings.llm_api_key = 'smoke-no-upstream-called'
    factory = build_session_factory(build_engine(settings.database_url))
    day = 'T' + uuid4().hex[:9]
    original_day = gateway.local_day
    gateway.local_day = lambda: day
    ids = []
    try:
        with factory() as session:
            assert session.get_bind().dialect.name == 'postgresql'
            role = session.execute(text('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).one()
            assert not any(role)
            apply_rls_context(session, is_worker=True)
            for source in ['workspace', 'legacy_crm']:
                job = gateway.get_job(session, request_id='smoke:' + uuid4().hex,
                    actor_sub='smoke', purpose='smoke', source_system=source, source_id=None,
                    messages=[{'role': 'user', 'content': 'aggregate count: 1'}], max_tokens=16)
                ids.append(job.id)

        def reserve(job_id):
            with factory() as session:
                apply_rls_context(session, is_worker=True)
                try:
                    call = gateway.reserve_job_call(session, settings, session.get(AiJob, job_id),
                        [{'role': 'user', 'content': 'aggregate count: 1'}], 16)
                    return call.id
                except gateway.GatewayError as error:
                    assert error.status_code == 429
                    return None

        with ThreadPoolExecutor(max_workers=2) as pool:
            calls = list(pool.map(reserve, ids))
        assert sum(bool(item) for item in calls) == 1
        with factory() as session:
            apply_rls_context(session, is_worker=True)
            call = session.get(ModelCall, next(item for item in calls if item))
            cost = gateway.settle_call(session, settings, call, {'prompt_tokens': 100, 'completion_tokens': 10})
            assert gateway.settle_call(session, settings, call, {'prompt_tokens': 100, 'completion_tokens': 10}) == cost
            budget = session.get(BudgetDay, day)
            assert budget.reserved == Decimal('0') and budget.spent == cost
            session.expunge_all()
            session.rollback()
            apply_rls_context(session, org_id='unmapped-franchise')
            assert not session.scalars(select(AiJob).where(AiJob.id.in_(ids))).all()
        print('Generic AI gateway: shared concurrency, idempotent settlement and RLS passed; no model called.')
    finally:
        gateway.local_day = original_day
        with factory() as session:
            apply_rls_context(session, is_worker=True)
            session.execute(delete(ModelCall).where(ModelCall.ai_job_id.in_(ids)))
            session.execute(delete(AiJob).where(AiJob.id.in_(ids)))
            session.execute(delete(BudgetDay).where(BudgetDay.day == day))
            session.commit()


if __name__ == '__main__':
    main()
