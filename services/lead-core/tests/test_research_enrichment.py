import importlib.util
import json
import sqlite3
import subprocess
from collections import Counter
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from conftest import auth_headers
from sqlalchemy import create_engine, select, text

from lead_core.intelligence.legacy import TABLES
from lead_core.intelligence.models import (
    Article,
    IntegrationCursor,
    NewsSource,
    Research,
    WorkspaceMember,
)
from lead_core.intelligence.research import select_evidence
from lead_core.intelligence.research_context import business_context
from lead_core.models import Franchisee, Membership

ADMIN = auth_headers(user="xu", roles="hq_admin")
CEO = auth_headers(user="ceo", roles="hq_executive")
FRANCHISE = auth_headers(user="member", org="org-a", roles="franchise_owner")


def test_research_recall_covers_old_insurance_among_large_ev_backfill_and_limits_sources(client):
    now = datetime.now(UTC)
    with client.app.state.session_factory() as session:
        for ident in ("ev", "insurance", "battery", "network"):
            session.add(NewsSource(id=ident, name=ident, url=f"https://{ident}.example.org", topic="新能源售后"))
        session.flush()
        session.add_all([Article(source_id="ev", title=f"新能源电动汽车发布 {i}", url=f"https://ev.example.org/{i}", url_hash=f"ev-{i}", topic="新能源售后", published_at=now-timedelta(days=30), fetched_at=now) for i in range(160)])
        insurance = Article(source_id="insurance", title="Insurance claims service update", summary="New insurance underwriting process", url="https://insurance.example.org/claims", url_hash="insurance", topic="保险科技", published_at=now-timedelta(days=10), fetched_at=now-timedelta(days=10))
        session.add(insurance)
        session.add(Article(source_id="battery", title="Battery repair training", url="https://battery.example.org/repair", url_hash="battery", topic="三电维修", published_at=now-timedelta(days=2), fetched_at=now-timedelta(days=2)))
        session.add(Article(source_id="network", title="新能源汽车维修服务网络更新", url="https://network.example.org/service", url_hash="network", topic="维修服务网络", published_at=now-timedelta(days=1), fetched_at=now-timedelta(days=1)))
        session.flush()
        picked = select_evidence(session, Research(question="请研究新能源、车险理赔和三电维修", title="test", created_by="xu"))
        assert insurance.id in {row.id for row in picked}
        assert {"保险科技", "三电维修", "新能源售后"} <= {row.topic for row in picked}
        assert len(picked) <= 8 and max(Counter(row.source_id for row in picked).values()) <= 3
        # Chinese insurance questions also recall English source material.
        insurance_only = select_evidence(session, Research(question="车险理赔有什么变化？", title="test", created_by="xu"))
        assert [row.id for row in insurance_only] == [insurance.id]


def test_explicit_evidence_never_expands_beyond_requested_ids(client):
    with client.app.state.session_factory() as session:
        session.add(NewsSource(id="explicit", name="指定来源", url="https://example.org", topic="车险理赔"))
        session.flush()
        rows = [Article(source_id="explicit", title=f"车险理赔资料{i}", url=f"https://example.org/{i}", url_hash=f"explicit-{i}", topic="车险理赔") for i in range(5)]
        session.add_all(rows)
        session.flush()
        rows[1].analysis_status = "source_removed"
        session.flush()
        picked = select_evidence(session, Research(question="分析车险理赔与新能源", title="test", created_by="xu", article_ids=[rows[0].id, rows[1].id]))
        assert [row.id for row in picked] == [rows[0].id]
        picked = select_evidence(session, Research(question="分析指定资料", title="test", created_by="xu", article_ids=[row.id for row in rows]))
        assert [row.id for row in picked] == [row.id for row in rows if row.id != rows[1].id]


def test_topic_relevance_precedes_source_recent_candidate_limit(client):
    now = datetime.now(UTC)
    with client.app.state.session_factory() as session:
        session.add(NewsSource(id="insurance-recall", name="保险来源", url="https://example.org", topic="保险科技"))
        session.flush()
        rows = [Article(source_id="insurance-recall", title=f"公司活动动态 {i}", url=f"https://example.org/activity/{i}", url_hash=f"activity-{i}", topic="保险科技", published_at=now-timedelta(days=i), fetched_at=now) for i in range(5)]
        relevant = Article(source_id="insurance-recall", title="车险理赔保险保障服务更新", url="https://example.org/claims", url_hash="relevant-insurance", topic="保险科技", published_at=now-timedelta(days=20), fetched_at=now-timedelta(days=20))
        session.add_all([*rows, relevant])
        session.flush()
        picked = select_evidence(session, Research(question="车险理赔保险研究", title="test", created_by="xu"))
        assert picked[0].id == relevant.id
        assert len(picked) == 3


def test_cross_topic_ev_story_does_not_take_insurance_topic_slot(client):
    now = datetime.now(UTC)
    with client.app.state.session_factory() as session:
        for source_id in ("insurer", "ev-feed", "battery-feed"):
            session.add(NewsSource(id=source_id, name=source_id, url=f"https://{source_id}.example.org", topic="新能源售后"))
        session.flush()
        for i in range(8):
            session.add(Article(source_id="insurer" if i < 4 else "ev-feed", title=f"新能源汽车售后电池三电维修保险理赔服务 {i}", url=f"https://example.org/cross/{i}", url_hash=f"cross-{i}", topic="新能源售后", published_at=now, fetched_at=now))
        insurance = Article(source_id="insurer", title="车险专项规定", url="https://example.org/insurance", url_hash="insurance-slot", topic="车险理赔", published_at=now-timedelta(days=20), fetched_at=now-timedelta(days=20))
        battery = Article(source_id="battery-feed", title="三电维修技术更新", url="https://example.org/battery", url_hash="battery-slot", topic="三电维修", published_at=now, fetched_at=now)
        session.add_all([insurance, battery])
        session.flush()
        picked = select_evidence(session, Research(question="新能源汽车售后、三电维修和车险服务的近期关注事项", title="test", created_by="xu"))
        assert insurance.id in {row.id for row in picked}
        assert {"车险理赔", "三电维修", "新能源售后"} <= {row.topic for row in picked}


def test_explicit_car_insurance_content_outranks_generic_claim_category(client):
    now = datetime.now(UTC)
    with client.app.state.session_factory() as session:
        for source_id in ("insurer-exact", "ev-exact", "battery-exact"):
            session.add(NewsSource(id=source_id, name=source_id, url=f"https://{source_id}.example.org", topic="新能源售后"))
        session.flush()
        session.add_all([Article(source_id="insurer-exact", title=f"地震救援保险理赔动态 {i}", url=f"https://example.org/earthquake/{i}", url_hash=f"earthquake-{i}", topic="车险理赔", published_at=now, fetched_at=now) for i in range(4)])
        exact = Article(source_id="insurer-exact", title="人保财险落地欧洲中资新能源车险首单", url="https://example.org/car-insurance", url_hash="car-insurance", topic="新能源售后", published_at=now-timedelta(days=20), fetched_at=now-timedelta(days=20))
        session.add(exact)
        for source_id, topic, title in [("ev-exact", "新能源售后", "新能源汽车售后服务"), ("battery-exact", "三电维修", "三电维修服务")]:
            session.add_all([Article(source_id=source_id, title=f"{title} {i}", url=f"https://example.org/{source_id}/{i}", url_hash=f"{source_id}-{i}", topic=topic, published_at=now, fetched_at=now) for i in range(4)])
        session.flush()
        picked = select_evidence(session, Research(question="新能源汽车售后、三电维修和车险服务的近期关注事项", title="test", created_by="xu"))
        assert picked[0].id == exact.id
        assert len(picked) <= 8 and len({row.source_id for row in picked}) >= 3
        assert max(Counter(row.source_id for row in picked).values()) <= 3


def test_source_publication_date_precedes_backfill_fetch_time(client):
    now = datetime.now(UTC)
    with client.app.state.session_factory() as session:
        session.add(NewsSource(id="dates", name="日期来源", url="https://example.org", topic="车险理赔"))
        session.flush()
        rows = [Article(source_id="dates", title="车险理赔服务", url=f"https://example.org/{i}", url_hash=f"date-{i}", topic="车险理赔", published_at=now-timedelta(days=i), fetched_at=now+timedelta(minutes=i)) for i in range(5)]
        session.add_all(rows)
        session.flush()
        picked = select_evidence(session, Research(question="车险理赔", title="test", created_by="xu"))
        assert [row.id for row in picked] == [row.id for row in rows[:3]]


@pytest.mark.parametrize("legacy_available", [True, False])
def test_research_prompt_distinguishes_zero_counts_from_unavailable_source(client, settings, monkeypatch, legacy_available):
    from lead_core.api.routes import workspace
    from lead_core.intelligence import research, research_context
    settings.worker_token = "test-worker"
    monkeypatch.setattr(workspace, "dispatch_research", lambda *args: True)
    context = {"captured_at": datetime.now(UTC).isoformat(),
               "legacy_crm": {"available": legacy_available, "stats": dict.fromkeys(TABLES, 0) if legacy_available else None},
               "lead_pool": {"available_leads": 0, "active_claims": 0, "overdue_followups": 0, "opportunity_stages": {"won": 0}}}
    monkeypatch.setattr(research_context, "business_context", lambda *args: context)
    captured = []

    def completion(*args, **kwargs):
        messages = kwargs["messages"]
        captured.append(messages)
        return {"choices": [{"message": {"content": "公开线索池当前可领取线索为0。[1]"}}]}

    monkeypatch.setattr(research, "complete", completion)
    created = client.post("/api/v1/research", headers=CEO, json={"question": "分析经营汇总", "include_business_context": True}).json()
    assert client.post("/api/v1/internal/research/run-next", headers={"Authorization": "Bearer test-worker"}).json()["outcome"] == "done"
    prompt = captured[0][0]["content"]
    assert "legacy_crm.available=false" in prompt and "legacy_crm.available=true" in prompt
    assert "lead_pool 中返回的各项计数0同样是真实零" in prompt
    for field_meaning in ("available_leads=可领取线索数", "active_claims=有效领取线索数", "overdue_followups=逾期跟进数", "opportunity_stages=商机阶段计数", "不是保险理赔、活跃理赔或理赔案件"):
        assert field_meaning in prompt
    submitted = json.loads(json.loads(captured[0][1]["content"])["sources"][0]["excerpt"])
    assert submitted == context
    assert client.get("/api/v1/research/" + created["id"], headers=CEO).json()["status"] == "completed"


def legacy_database(tmp_path, settings):
    path = tmp_path / "legacy.sqlite"
    with sqlite3.connect(path) as connection:
        for table in TABLES.values():
            connection.execute(f'CREATE TABLE "{table}" (id INTEGER PRIMARY KEY, private_name TEXT, private_phone TEXT)')
            connection.execute(f'INSERT INTO "{table}" VALUES (1, ?, ?)', ("private-customer-never-export", "13912345678"))
    settings.legacy_crm_database_path = str(path)
    return path


def test_opted_in_research_uses_only_aggregate_counts_and_keeps_snapshot(client, settings, monkeypatch, tmp_path):
    from lead_core.api.routes import workspace
    from lead_core.intelligence import research
    database = legacy_database(tmp_path, settings)
    before = database.read_bytes()
    settings.worker_token = "test-worker"
    settings.llm_api_key = "test-model"
    settings.llm_input_cny_per_million = 9
    settings.llm_output_cny_per_million = 27
    monkeypatch.setattr(workspace, "dispatch_research", lambda *args: True)
    captured = []

    def model_post(url, **kwargs):
        payload = kwargs["json"]
        serialized = json.dumps(payload, ensure_ascii=False)
        assert "private-customer-never-export" not in serialized
        assert "13912345678" not in serialized
        source = json.loads(payload["messages"][1]["content"])["sources"][0]
        context = json.loads(source["excerpt"])
        assert source["source_nature"] == "internal"
        assert context["legacy_crm"]["stats"] == dict.fromkeys(TABLES, 1)
        captured.append(context)
        return httpx.Response(200, request=httpx.Request("POST", url), json={"choices": [{"message": {"content": "CRM 中现有客户线索 1 条，需逐步核实跟进情况。[1]"}}], "usage": {"prompt_tokens": 500, "completion_tokens": 100}})

    monkeypatch.setattr(research.httpx, "post", model_post)
    created = client.post("/api/v1/research", headers=CEO, json={"question": "结合经营汇总安排下一步", "include_business_context": True}).json()
    assert created["include_business_context"] is True
    assert created["business_context"] is None
    result = client.post("/api/v1/internal/research/run-next", headers={"Authorization": "Bearer test-worker"})
    assert result.json()["outcome"] == "done"
    report = client.get("/api/v1/research/" + created["id"], headers=CEO).json()
    assert report["status"] == "completed"
    assert report["business_context"] == captured[0]
    assert report["citations"][0]["kind"] == "business_context"
    assert float(report["cost_cny"]) > 0
    assert database.read_bytes() == before


def test_context_is_opt_in_and_franchise_cannot_request_it(client, settings, monkeypatch):
    from lead_core.api.routes import workspace
    from lead_core.intelligence import research_context
    monkeypatch.setattr(workspace, "dispatch_research", lambda *args: True)
    monkeypatch.setattr(research_context, "business_context", lambda *args: pytest.fail("not opted in"))
    settings.worker_token = "test-worker"
    assert client.post("/api/v1/research", headers=FRANCHISE, json={"question": "获取总部经营汇总", "include_business_context": True}).status_code == 403
    created = client.post("/api/v1/research", headers=CEO, json={"question": "新能源行业研究"}).json()
    assert created["include_business_context"] is False
    client.post("/api/v1/internal/research/run-next", headers={"Authorization": "Bearer test-worker"})
    report = client.get("/api/v1/research/" + created["id"], headers=CEO).json()
    assert report["status"] == "failed"
    assert report["business_context"] is None


def test_context_rechecks_membership_and_marks_missing_crm_unavailable(client, settings):
    settings.auth_mode = "oidc"
    with client.app.state.session_factory() as session:
        with pytest.raises(ValueError, match="权限已失效"):
            business_context(session, settings, "ceo")
        org = Franchisee(id="hq-context", name="总部", status="active")
        session.add(org)
        session.flush()
        session.add(Membership(franchisee_id=org.id, user_id="ceo", role="hq_executive"))
        session.commit()
        context = business_context(session, settings, "ceo")
        assert context["legacy_crm"]["available"] is False
        assert context["legacy_crm"]["stats"] is None
        org.status = "disabled"
        session.commit()
        with pytest.raises(ValueError, match="权限已失效"):
            business_context(session, settings, "ceo")


def test_research_filters_and_retry_preserve_context_choice(client, monkeypatch):
    from lead_core.api.routes import workspace
    monkeypatch.setattr(workspace, "dispatch_research", lambda *args: True)
    with client.app.state.session_factory() as session:
        watched = Research(title="待追踪专题", question="持续研究车险", created_by="ceo", status="failed", watch=True, include_business_context=True)
        session.add_all([watched, Research(title="已有结论", question="研究新能源", created_by="ceo", status="completed")])
        session.commit()
        ident = watched.id
    result = client.get("/api/v1/research?status=failed&watch=true", headers=CEO).json()
    assert [row["id"] for row in result["items"]] == [ident]
    assert client.get("/api/v1/research?status=invalid", headers=CEO).status_code == 422
    retried = client.post(f"/api/v1/research/{ident}/retry", headers=CEO).json()
    assert retried["id"] != ident
    assert retried["include_business_context"] is True
    assert retried["watch"] is False  # Original remains the single watch subscription.


def test_scheduled_watch_keeps_opt_in_without_duplicate_daily_runs(client, settings, monkeypatch):
    from lead_core.intelligence import jobs
    monkeypatch.setattr(jobs, "Settings", lambda: settings)
    dispatched = []
    monkeypatch.setattr(jobs, "dispatch_research", lambda session, settings, row: dispatched.append(row.id))
    with client.app.state.session_factory() as session:
        session.add(WorkspaceMember(user_id="ceo", display_name="总部成员"))
        watched = Research(title="售后经营专题", question="结合经营现状分析行业机会", created_by="ceo", watch=True, include_business_context=True)
        session.add(watched)
        session.commit()
        ident = watched.id
    assert jobs.intelligence_briefing.run()["created"] == 2
    assert jobs.intelligence_briefing.run()["created"] == 0
    assert len(dispatched) == 2
    with client.app.state.session_factory() as session:
        followup = session.scalar(select(Research).where(Research.parent_id == ident))
        assert followup.include_business_context is True
        assert followup.business_context is None
        assert followup.watch is False
        daily = session.scalar(select(Research).where(Research.title == "今日行业简报"))
        assert daily.include_business_context is False


def test_dispatch_health_reports_real_attempts_and_retains_last_success(client, settings, monkeypatch):
    from lead_core.intelligence import research
    settings.autoloop_base_url = "http://autoloop.test"
    settings.autoloop_source_token = "test-source"
    initial = client.get("/api/v1/workspace/settings", headers=CEO).json()["integrations"]["autoloop"]
    assert initial["status"] == "configured"
    assert initial["last_dispatch_at"] is None
    monkeypatch.setattr(research.httpx, "post", lambda url, **kw: httpx.Response(200, request=httpx.Request("POST", url), json={"event": "event-one"}))
    queued = client.post("/api/v1/research", headers=CEO, json={"question": "研究新能源理赔"}).json()
    state = client.get("/api/v1/workspace/settings", headers=CEO).json()["integrations"]["autoloop"]
    assert state["status"] == "connected"
    assert state["last_dispatch_at"] is not None
    assert state["counts"]["queued"] == 1
    with client.app.state.session_factory() as session:
        row = session.get(Research, queued["id"])
        row.status, row.started_at = "completed", datetime.now(UTC)
        session.commit()
    monkeypatch.setattr(research.httpx, "post", lambda url, **kw: httpx.Response(503, request=httpx.Request("POST", url)))
    blocked = client.post("/api/v1/research", headers=CEO, json={"question": "另一个研究任务"}).json()
    assert blocked["status"] == "blocked"
    state = client.get("/api/v1/workspace/settings", headers=CEO).json()["integrations"]["autoloop"]
    assert state["status"] == "error"
    assert state["last_dispatch_at"] is not None
    assert state["last_completed_at"] is not None
    assert state["counts"]["completed"] == state["counts"]["blocked"] == 1
    with client.app.state.session_factory() as session:
        assert session.get(IntegrationCursor, "autoloop").last_error


def test_additive_context_migration_preserves_old_research(tmp_path):
    migration_file = Path(__file__).parents[1] / "alembic/versions/20261106_0005_research_context.py"
    spec = importlib.util.spec_from_file_location("research_context_migration", migration_file)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine(f"sqlite+pysqlite:///{tmp_path / 'old.db'}")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE research_tasks (id VARCHAR(36) PRIMARY KEY, report TEXT NOT NULL)"))
        connection.execute(text("INSERT INTO research_tasks VALUES ('old', '保留已有报告')"))
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
            migration.upgrade()
        row = connection.execute(text("SELECT * FROM research_tasks")).mappings().one()
        assert row["report"] == "保留已有报告"
        assert row["include_business_context"] == 0
        assert row["business_context"] is None
    engine.dispose()


@pytest.mark.parametrize(("outcome", "expected"), [("failed", 1), ("done", 0), ("nothing", 0), ("cancelled", 0), ("unexpected", 1)])
def test_autoloop_runner_preserves_worker_failure(outcome, expected):
    runner = Path(__file__).parents[3] / "infra/deploy/haoyi-runner.mjs"
    script = f"globalThis.fetch=async()=>({{ok:true,json:async()=>({{outcome:{json.dumps(outcome)},error:'busy',summary:'test'}})}});await import({json.dumps(runner.as_uri())});"
    result = subprocess.run(["node", "--input-type=module", "-e", script], capture_output=True, text=True, encoding="utf-8", timeout=15)
    assert result.returncode == expected, result.stderr
