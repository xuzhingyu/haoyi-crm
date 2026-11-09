from datetime import UTC, date, datetime, timedelta

from sqlalchemy import delete, func, select

from lead_core.company_intelligence.models import (
    CompanyCollectionRun,
    CompanyRecord,
    MonitoredCompany,
)
from lead_core.company_intelligence.service import (
    add_record,
    collect_run,
    day_range,
    initialize,
    queue_run,
)
from lead_core.intelligence.models import Article, NewsSource

HQ = {"X-User-Id": "admin", "X-Roles": "hq_admin"}
CEO = {"X-User-Id": "ceo", "X-Roles": "hq_executive"}
MEMBER = {"X-User-Id": "member", "X-Roles": "franchise_member", "X-Org-Id": "org"}
URL = "/api/v1/company-intelligence"


def item(**kwargs):
    return {"title": "公开资料", "summary": "测试来源摘要", "category": "business", "source_name": "测试机构", "source_url": "https://example.com/evidence", **kwargs}


def test_permissions_and_read_only_executive(client):
    assert client.get(URL).status_code == 401
    assert client.get(URL, headers=MEMBER).status_code == 403
    assert client.get(URL, headers=CEO).status_code == 200
    assert client.post(URL + "/collect", headers=CEO, json={"mode": "baseline"}).status_code == 403
    assert client.post(URL + "/collect", headers=MEMBER, json={"mode": "daily"}).status_code == 403
    assert client.post(URL + "/collect", headers={**CEO, "X-Roles": "hq_executive,hq_admin"}, json={"mode": "daily"}).status_code == 403


def test_seed_idempotent_and_read_has_no_write(client):
    with client.app.state.session_factory() as session:
        before = session.scalar(select(func.count()).select_from(CompanyRecord))
        initialize(session)
        session.commit()
        assert session.scalar(select(func.count()).select_from(CompanyRecord)) == before
    response = client.get(URL, headers=HQ).json()
    assert {"rongda", "haoyi", "hengbao"} <= {c["id"] for c in response["companies"]}
    assert response["coverage"]["tianyan_status"] == "not_configured"
    assert response["coverage"]["status"] == "not_started"
    assert response["runs"] == []


def test_filter_observation_day_not_publication_and_pagination(client):
    with client.app.state.session_factory() as session:
        session.execute(delete(CompanyRecord))
        company = session.get(MonitoredCompany, "rongda")
        add_record(session, company, item(title="日界前", observed_at="2026-11-08T15:59:59Z", published_at="2024-01-01T00:00:00Z"))
        add_record(session, company, item(title="日界后", observed_at="2026-11-08T16:00:00Z", published_at="2024-01-01T00:00:00Z"))
        add_record(session, session.get(MonitoredCompany, "haoyi"), item(title="其他公司", category="news", observed_at="2026-11-08T16:00:00Z"))
        session.commit()
    data = client.get(URL, headers=HQ, params={"date": "2026-11-09", "company_id": "rongda", "category": "business", "limit": 1}).json()
    assert data["total"] == 1
    assert [r["title"] for r in data["items"]] == ["日界后"]
    assert client.get(URL, headers=HQ, params={"page": 0}).status_code == 422
    assert client.get(URL, headers=HQ, params={"category": "invented"}).status_code == 422


def test_queue_singleton_and_daily_idempotency(client, monkeypatch):
    sent = []
    monkeypatch.setattr("lead_core.company_intelligence.jobs.company_collection.delay", lambda ident: sent.append(ident))
    first = client.post(URL + "/collect", headers=HQ, json={"mode": "baseline"}).json()
    second = client.post(URL + "/collect", headers=HQ, json={"mode": "daily"}).json()
    assert first["id"] == second["id"] and len(sent) == 1
    with client.app.state.session_factory() as session:
        run = session.get(CompanyCollectionRun, first["id"])
        run.active_slot, run.status = None, "partial"
        run.created_at = datetime.now(UTC) - timedelta(hours=1)
        session.commit()
        daily, created = queue_run(session, "daily", "scheduler", scheduled_day="2026-11-09")
        assert created
        daily.active_slot, daily.status = None, "partial"
        session.commit()
        repeat, created = queue_run(session, "daily", "scheduler", scheduled_day="2026-11-09")
        assert not created and repeat.id == daily.id


def test_queue_failure_not_success(client, monkeypatch):
    def unavailable(_):
        raise RuntimeError("secret-provider-token")
    monkeypatch.setattr("lead_core.company_intelligence.jobs.company_collection.delay", unavailable)
    assert client.post(URL + "/collect", headers=HQ, json={"mode": "daily"}).status_code == 503
    data = client.get(URL, headers=HQ).json()
    assert data["runs"][0]["status"] == "failed"
    assert "secret-provider-token" not in str(data)


def test_collection_exact_company_dedup_and_partial(client, settings):
    with client.app.state.session_factory() as session:
        session.add(NewsSource(id="company-test", name="公开机构", url="https://example.com", topic="测试"))
        session.flush()
        session.add_all([
            Article(source_id="company-test", title="上海容大数字技术有限公司新增公告", url="https://example.com/1", url_hash="company-1", topic="测试"),
            Article(source_id="company-test", title="上海容大公司公告", url="https://example.com/2", url_hash="company-2", topic="测试"),
        ])
        run, _ = queue_run(session, "baseline", "admin")
        session.commit()
        result = collect_run(session, settings, run.id)
        assert result["status"] == "partial" and result["new_records"] == 1
        assert collect_run(session, settings, run.id)["status"] == "partial"
        records = session.scalars(select(CompanyRecord).where(CompanyRecord.source_url.in_(["https://example.com/1", "https://example.com/2"]))).all()
        assert len(records) == 1
        assert records[0].verification_status == "pending_verification"
    data = client.get(URL, headers=HQ).json()
    assert data["briefings"] and "首次收录" in data["briefings"][0]["summary"]


def test_provider_partial_preserved_and_quota_stops(client, settings):
    settings.company_intelligence_tianyan_enabled = True
    calls = []
    class PartialError(Exception):
        code = "quota_exceeded"
        records = [item(title="已返回的天眼记录")]
    def collect(name, mode, configuration):
        calls.append(name)
        raise PartialError("secret-provider-token")
    with client.app.state.session_factory() as session:
        run, _ = queue_run(session, "baseline", "admin")
        session.commit()
        result = collect_run(session, settings, run.id, collect)
        assert result["status"] == "partial"
        assert len(calls) == 1
        assert session.scalar(select(CompanyRecord.id).where(CompanyRecord.title == "已返回的天眼记录"))
        assert "secret-provider-token" not in str(session.get(CompanyCollectionRun, run.id).errors)


def test_shanghai_bounds():
    assert day_range(date(2026, 11, 9)) == (datetime(2026, 11, 8, 16, tzinfo=UTC), datetime(2026, 11, 9, 16, tzinfo=UTC))


def test_changed_classification_keeps_new_evidence_version(client):
    with client.app.state.session_factory() as session:
        company = session.get(MonitoredCompany, "rongda")
        assert add_record(session, company, item(category="news"))
        assert not add_record(session, company, item(category="news"))
        assert add_record(session, company, item(category="sentiment"))
        assert add_record(session, company, item(category="sentiment", verification_status="media_report"))
        assert add_record(session, company, item(category="sentiment", verification_status="media_report", published_at="2026-11-09T00:00:00Z"))
        assert not add_record(session, company, item(category="sentiment", verification_status="media_report", published_at="2026-11-09T08:00:00+08:00"))


def test_discovery_adds_controlled_company_and_matches_existing_name(client, settings, monkeypatch):
    settings.company_intelligence_tianyan_enabled = True
    names = []
    monkeypatch.setattr("lead_core.company_intelligence.tianyan.discover_companies", lambda *_: [
        {"id": "different-haoyi-id", "name": "上海浩宜信息科技有限公司", "verification_status": "provider_record", "relationship_note": "容大持股92%"},
        {"id": "controlled-child", "name": "已核验子公司", "verification_status": "provider_record", "relationship_note": "浩宜持股70%"},
    ])
    monkeypatch.setattr("lead_core.company_intelligence.tianyan.collect_company", lambda name, *_: names.append(name) or [])
    with client.app.state.session_factory() as session:
        run, _ = queue_run(session, "daily", "admin")
        session.commit()
        assert collect_run(session, settings, run.id)["status"] == "partial"
        assert "已核验子公司" in names
        assert session.get(MonitoredCompany, "different-haoyi-id") is None
        assert session.get(MonitoredCompany, "haoyi").relationship_note == "容大持股92%"
