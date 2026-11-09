from datetime import UTC, datetime
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import select

from lead_core.config import Settings
from lead_core.db import apply_rls_context, build_engine, build_session_factory
from lead_core.intelligence.models import Research, WorkspaceMember
from lead_core.intelligence.research import dispatch_research, local_day
from lead_core.intelligence.sources import refresh_sources
from lead_core.jobs.celery_app import celery_app


@celery_app.task(name="lead_core.crm_confirmation_reconcile")
def crm_confirmation_reconcile():
    from lead_core.intelligence.crm_bridge import reconcile
    settings = Settings()
    engine = build_engine(settings.database_url)
    try:
        with build_session_factory(engine)() as session:
            apply_rls_context(session, is_worker=True)
            return reconcile(session, settings)
    finally:
        engine.dispose()


@celery_app.task(name="lead_core.intelligence_sync")
def intelligence_sync():
    settings = Settings()
    engine = build_engine(settings.database_url)
    try:
        with build_session_factory(engine)() as session:
            apply_rls_context(session, is_worker=True)
            return refresh_sources(session, settings)
    finally:
        engine.dispose()


@celery_app.task(name="lead_core.intelligence_briefing")
def intelligence_briefing():
    settings = Settings()
    engine = build_engine(settings.database_url)
    count = 0
    try:
        with build_session_factory(engine)() as session:
            apply_rls_context(session, is_worker=True)
            owner = session.scalar(select(WorkspaceMember).order_by(WorkspaceMember.user_id))
            if owner is None:
                return {"created": 0, "reason": "总部成员尚未初始化"}
            watches = session.scalars(select(Research).where(Research.watch.is_(True), Research.parent_id.is_(None))).all()
            specs = [("daily", owner.user_id, "今日行业简报", "请基于最近采集的公开资料整理新能源售后、三电维修、车险理赔与保险科技简报，注明官方、行业、媒体等来源性质，区分事实、对浩宜可能的影响和待核实事项。", None, False)]
            specs += [(row.id, row.created_by, "持续关注：" + row.title[:250], row.question, row.id, row.include_business_context) for row in watches]
            for key, user_id, title, question, parent_id, include_business_context in specs:
                ident = str(uuid5(NAMESPACE_URL, "haoyi-briefing:" + local_day() + ":" + key))
                if session.get(Research, ident):
                    continue
                row = Research(id=ident, title=title, question=question, created_by=user_id, parent_id=parent_id, create_task=True, include_business_context=include_business_context, created_at=datetime.now(UTC))
                session.add(row)
                session.commit()
                apply_rls_context(session, is_worker=True)
                dispatch_research(session, settings, row)
                apply_rls_context(session, is_worker=True)
                count += 1
            return {"created": count}
    finally:
        engine.dispose()
