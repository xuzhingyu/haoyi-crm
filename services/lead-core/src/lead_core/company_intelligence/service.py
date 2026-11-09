from __future__ import annotations

import hashlib
import json
from datetime import UTC, date, datetime, time, timedelta
from importlib.resources import files
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

from sqlalchemy import func, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from lead_core.company_intelligence.models import (
    CompanyBriefing,
    CompanyCollectionRun,
    CompanyRecord,
    MonitoredCompany,
)
from lead_core.intelligence.models import Article, NewsSource

SHANGHAI = ZoneInfo("Asia/Shanghai")
ROOTS = (
    ("rongda", "上海容大数字技术有限公司"),
    ("haoyi", "上海浩宜信息科技有限公司"),
    ("hengbao", "上海横保信息科技有限公司"),
)
COVERAGE_MESSAGE = "仅汇总已接通信源和已收录资料；历史回填不代表全网全量。股权关系以采集时点为准，公众号历史及全部子公司仍不保证完整覆盖。未返回记录不代表没有风险。"


def provider_reason(code):
    return {
        "partial": "部分维度、分页或返回结构未完整覆盖",
        "quota_exceeded": "调用额度已用完",
        "auth_required": "授权缺失或过期",
        "unavailable": "查询服务暂不可用",
    }.get(code, "查询服务暂不可用")


def as_utc(value):
    if not value:
        return None
    parsed = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed.astimezone(UTC)


def day_range(day: date):
    start = datetime.combine(day, time.min, SHANGHAI).astimezone(UTC)
    return start, start + timedelta(days=1)


def local_day(now=None):
    return (as_utc(now) or datetime.now(UTC)).astimezone(SHANGHAI).date()


def add_record(session: Session, company: MonitoredCompany, item: dict, now=None) -> bool:
    url = str(item.get("source_url") or "")
    if urlsplit(url).scheme not in {"https", "http"} or not urlsplit(url).netloc:
        raise ValueError("来源链接必须为公开 HTTP/HTTPS 地址")
    title = str(item.get("title") or "").strip()[:500]
    category = item.get("category", "news")
    if not title or category not in {"news", "business", "sentiment"}:
        raise ValueError("资料标题或分类无效")
    # A source may contain multiple observations; changing source data produces a new version.
    summary = str(item.get("summary") or "")[:15000]
    published_at = as_utc(item.get("published_at"))
    verification_status = str(item.get("verification_status") or "pending_verification")[:60]
    key = hashlib.sha256(json.dumps({
        "company_id": company.id, "url": url, "title": title, "summary": summary,
        "category": category, "published_at": published_at.isoformat() if published_at else None,
        "verification_status": verification_status,
    }, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    if session.scalar(select(CompanyRecord.id).where(CompanyRecord.dedupe_key == key)):
        return False
    record = CompanyRecord(
        company_id=company.id, dedupe_key=key, title=title, category=category,
        summary=summary, source_name=str(item.get("source_name") or "待核验来源")[:200],
        source_url=url, published_at=published_at,
        observed_at=as_utc(item.get("observed_at")) or as_utc(now) or datetime.now(UTC),
        verification_status=verification_status,
    )
    try:
        with session.begin_nested():
            session.add(record)
            session.flush()
    except IntegrityError:
        if session.scalar(select(CompanyRecord.id).where(CompanyRecord.dedupe_key == key)):
            return False
        raise
    return True


def initialize(session: Session):
    """Explicit startup/import path, never called from a read API."""
    if session.get_bind().dialect.name == "postgresql":
        session.execute(text("SELECT pg_advisory_xact_lock(6825191109)"))
    for ident, name in ROOTS:
        if session.get(MonitoredCompany, ident) is None:
            _insert_company(session, ident, name)
    session.flush()
    changed_days = set()
    for filename in ("baseline.json", "tianyan-baseline.json"):
        seed = files("lead_core.company_intelligence").joinpath(filename)
        if seed.is_file():
            payload = json.loads(seed.read_text(encoding="utf-8-sig"))
            for item in payload.get("companies", []):
                company = session.get(MonitoredCompany, item["id"])
                if company is None:
                    company = _insert_company(session, item["id"], item["name"])
                status = item.get("verification_status", "pending_verification")
                # A packaged baseline must not roll a later live relationship back on restart.
                if company.verification_status == "pending_verification" or (status == "provider_record" and company.verification_status != "provider_record"):
                    company.verification_status = status
                    company.relationship_note = item.get("relationship_note", "子公司及当前股权关系待核验")
            session.flush()
            by_name = {row.name: row for row in session.scalars(select(MonitoredCompany)).all()}
            for item in payload.get("records", []):
                if item.get("company_name") in by_name:
                    if add_record(session, by_name[item["company_name"]], item):
                        changed_days.add(local_day(item.get("observed_at")))
    days = {local_day(value) for value in session.scalars(select(CompanyRecord.observed_at)).all()}
    for day in days:
        if day in changed_days or session.get(CompanyBriefing, day.isoformat()) is None:
            briefing(session, day, ["首次资料基线"])
            session.flush()
            row = session.get(CompanyBriefing, day.isoformat())
            row.summary += " 本条为首次资料基线，不表示定时采集已上线。"


def _insert_company(session, ident, name):
    try:
        with session.begin_nested():
            company = MonitoredCompany(id=ident, name=name)
            session.add(company)
            session.flush()
        return company
    except IntegrityError:
        existing = session.get(MonitoredCompany, ident)
        if existing is None:
            raise
        return existing


def queue_run(session: Session, mode: str, actor: str, *, scheduled_day: str | None = None):
    now = datetime.now(UTC)
    # Release crashed/undelivered jobs after a bounded lease; tasks themselves have a 30m cap.
    session.execute(update(CompanyCollectionRun).where(
        CompanyCollectionRun.active_slot == "collection",
        CompanyCollectionRun.created_at < now - timedelta(hours=2),
    ).values(status="failed", active_slot=None, finished_at=now, errors=["采集任务超时，请重试"]))
    active = session.scalar(select(CompanyCollectionRun).where(CompanyCollectionRun.active_slot == "collection"))
    if active:
        return active, False
    if scheduled_day:
        existing = session.scalar(select(CompanyCollectionRun).where(CompanyCollectionRun.scheduled_day == scheduled_day))
        if existing:
            return existing, False
    recent = session.scalar(select(CompanyCollectionRun).where(
        CompanyCollectionRun.created_at > now - timedelta(minutes=5),
    ).order_by(CompanyCollectionRun.created_at.desc()))
    if recent:
        return recent, False
    run = CompanyCollectionRun(mode=mode, created_by=actor, active_slot="collection", scheduled_day=scheduled_day)
    try:
        with session.begin_nested():
            session.add(run)
            session.flush()
    except IntegrityError:
        existing = session.scalar(select(CompanyCollectionRun).where(CompanyCollectionRun.active_slot == "collection"))
        if existing is None and scheduled_day:
            existing = session.scalar(select(CompanyCollectionRun).where(CompanyCollectionRun.scheduled_day == scheduled_day))
        if existing is None:
            raise
        return existing, False
    return run, True


def briefing(session: Session, day: date, errors: list[str]):
    start, end = day_range(day)
    counts = dict(session.execute(select(CompanyRecord.category, func.count()).where(
        CompanyRecord.observed_at >= start, CompanyRecord.observed_at < end,
    ).group_by(CompanyRecord.category)).all())
    row = session.get(CompanyBriefing, day.isoformat())
    if row is None:
        row = CompanyBriefing(day=day.isoformat())
        session.add(row)
    row.news_count, row.business_count, row.sentiment_count = (counts.get(k, 0) for k in ("news", "business", "sentiment"))
    row.summary = f"按今日首次收录时间汇总：媒体新闻 {row.news_count} 条，经营信息 {row.business_count} 条，舆情信息 {row.sentiment_count} 条。历史回填按原文发布日期辨识。"
    row.summary += " 部分信源未接通或采集未完成。" if errors else " 已完成本次已接通信源扫描。"


def collect_run(session: Session, settings, run_id: str, collector=None):
    run = session.get(CompanyCollectionRun, run_id)
    if not run or run.status != "queued":
        return {"status": run.status if run else "missing"}
    # Atomic status transition prevents duplicate Celery deliveries from calling providers twice.
    claimed = session.execute(update(CompanyCollectionRun).where(
        CompanyCollectionRun.id == run_id, CompanyCollectionRun.status == "queued",
    ).values(status="running", started_at=datetime.now(UTC)))
    if not claimed.rowcount:
        session.rollback()
        return {"status": "already_claimed"}
    session.commit()
    from lead_core.db import apply_rls_context
    apply_rls_context(session, is_worker=True)
    errors: list[str] = []
    created = 0
    provider_stopped = False
    try:
        initialize(session)
        # Release initialization's advisory transaction lock before slow provider calls.
        session.commit()
        apply_rls_context(session, is_worker=True)
        if settings.company_intelligence_tianyan_enabled and collector is None:
            from lead_core.company_intelligence.tianyan import discover_companies
            try:
                discovered = discover_companies(settings, [{"id": ident, "name": name} for ident, name in ROOTS])
                for item in discovered:
                    company = session.scalar(select(MonitoredCompany).where(MonitoredCompany.name == item["name"]))
                    if company is None:
                        company = _insert_company(session, item["id"], item["name"])
                    company.verification_status = item["verification_status"]
                    company.relationship_note = item["relationship_note"]
                session.flush()
            except Exception as exc:
                code = getattr(exc, "code", "unavailable")
                provider_stopped = code in {"quota_exceeded", "auth_required"}
                errors.append(f"子公司关系更新：{provider_reason(code)}；保留已有监测范围")
        companies = session.scalars(select(MonitoredCompany)).all()
        for company in companies:
            # Exact registered-name matching avoids brand and similarly named entity conflation.
            query = select(Article, NewsSource.name).join(NewsSource, Article.source_id == NewsSource.id).where(
                Article.analysis_status != "source_removed",
                (Article.title.contains(company.name)) | (Article.summary.contains(company.name)) | (Article.content.contains(company.name)),
            )
            for article, source in session.execute(query).all():
                created += add_record(session, company, {
                    "title": article.title, "summary": article.summary, "category": "news",
                    "source_url": article.url, "source_name": source, "published_at": article.published_at,
                    "verification_status": "pending_verification",
                })
            if settings.company_intelligence_tianyan_enabled and not provider_stopped:
                if collector is None:
                    from lead_core.company_intelligence.tianyan import collect_company
                    collector = collect_company
                try:
                    for item in collector(company.name, run.mode, settings):
                        created += add_record(session, company, item)
                except Exception as exc:
                    for item in getattr(exc, "records", []):
                        created += add_record(session, company, item)
                    code = getattr(exc, "code", "unavailable")
                    provider_stopped = code in {"quota_exceeded", "auth_required"}
                    # Provider exceptions may contain credentials or customer data; never persist their text.
                    reason = provider_reason(code)
                    errors.append(f"{company.name}：{reason}" + ("；已停止后续天眼调用" if provider_stopped else ""))
        if not settings.company_intelligence_tianyan_enabled:
            errors.append("天眼 AI 尚未启用或授权")
        source_errors = session.scalar(select(func.count()).select_from(NewsSource).where(
            NewsSource.status == "active", NewsSource.last_error.is_not(None), NewsSource.last_error != "",
        ))
        if source_errors:
            errors.append(f"已有 {source_errors} 个行业信源最近采集异常")
        # No dedicated WeChat historical feed or exhaustive subsidiary registry is implied.
        errors.append("微信公众号历史及全部子公司范围尚未完成核验")
        run.status = "partial" if errors else "succeeded"
        run.errors, run.new_records = errors, created
        run.finished_at, run.active_slot = datetime.now(UTC), None
        briefing(session, local_day(), errors)
        session.commit()
        return {"id": run.id, "status": run.status, "new_records": created}
    except Exception:
        session.rollback()
        apply_rls_context(session, is_worker=True)
        run = session.get(CompanyCollectionRun, run_id)
        run.status, run.active_slot, run.finished_at = "failed", None, datetime.now(UTC)
        run.errors = ["采集未完成，请检查服务日志中的错误类别"]
        session.commit()
        return {"id": run_id, "status": "failed"}
