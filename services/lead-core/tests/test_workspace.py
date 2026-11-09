from datetime import UTC, datetime
from decimal import Decimal

import httpx
import pytest
from conftest import auth_headers
from sqlalchemy import func, select

from lead_core.domain.claims import ClaimPolicy
from lead_core.intelligence.models import (
    AiJob,
    Article,
    NewsSource,
    Research,
)
from lead_core.intelligence.research import budget_read, reserve_call, settle_call
from lead_core.intelligence.sources import parse_listing, upsert_article
from lead_core.models import Claim, LeadListing, Opportunity, RepairBusiness

ADMIN = auth_headers(user="xu", roles="hq_admin,hq_franchise_manager")
CEO = auth_headers(user="ceo", roles="hq_executive")
FRANCHISE = auth_headers(user="franchise", org="org-a", roles="franchise_owner")


def seed_article(client):
    with client.app.state.session_factory() as session:
        source = NewsSource(id="picc", name="人保财险", url="https://property.picc.com.cn/", topic="车险理赔")
        session.add(source)
        session.flush()
        article = Article(source_id=source.id, title="新能源车险理赔服务更新", url="https://property.picc.com.cn/news/20261105.html", url_hash="news-1", topic="车险理赔", summary="官方发布了服务流程调整。")
        session.add(article)
        session.commit()
        return article.id


def seed_claim(client):
    with client.app.state.session_factory() as session:
        business = RepairBusiness(business_name="测试维修企业", city="南京市", district="浦口区", category="维修")
        session.add(business)
        session.flush()
        listing = LeadListing(business_id=business.id, status="claimed", claimed_by_org_id="org-a")
        session.add(listing)
        session.flush()
        dates = ClaimPolicy().deadlines_for(datetime.now(UTC))
        claim = Claim(listing_id=listing.id, org_id="org-a", user_id="franchise", idempotency_key="one", first_touch_due=dates.first_touch_due, activity_due=dates.activity_due, protected_until=dates.protected_until)
        session.add(claim)
        session.commit()
        return claim.id


def test_identity_permissions_and_hq_isolation(client):
    ceo = client.get("/api/v1/me", headers=CEO)
    assert ceo.status_code == 200
    assert ceo.json()["display_name"] == "ceo"
    assert ceo.json()["is_hq"] is True
    assert "crm:write" not in ceo.json()["permissions"]
    assert "proposals:confirm" in ceo.json()["permissions"]
    assert client.get("/api/v1/intelligence/articles", headers=FRANCHISE).status_code == 403
    assert client.post("/api/v1/intelligence/refresh", headers=CEO).status_code == 403
    assert client.get("/api/v1/workspace/members", headers=CEO).json()["items"][0]["user_id"] == "ceo"


def test_saved_articles_are_per_user(client):
    aid = seed_article(client)
    assert client.post(f"/api/v1/intelligence/articles/{aid}/save", headers=ADMIN, json={"saved": True}).status_code == 200
    assert len(client.get("/api/v1/intelligence/articles?saved=true", headers=ADMIN).json()["items"]) == 1
    assert client.get("/api/v1/intelligence/articles?saved=true", headers=CEO).json()["items"] == []
    assert client.get(f"/api/v1/intelligence/articles/{aid}", headers=CEO).json()["saved"] is False


def test_intelligence_notes_and_follows_are_personal_and_survive_resync(client):
    aid = seed_article(client)
    assert client.patch(f"/api/v1/intelligence/articles/{aid}/note", headers=ADMIN, json={"note": "与业务团队核对服务范围"}).status_code == 200
    assert client.get(f"/api/v1/intelligence/articles/{aid}", headers=CEO).json()["note"] == ""
    follow = client.post("/api/v1/intelligence/follows", headers=ADMIN, json={"kind": "topic", "value": "车险理赔"}).json()
    assert client.post("/api/v1/intelligence/follows", headers=ADMIN, json={"kind": "topic", "value": "车险理赔"}).json()["id"] == follow["id"]
    assert len(client.get("/api/v1/intelligence/articles?followed=true", headers=ADMIN).json()["items"]) == 1
    assert client.get("/api/v1/intelligence/articles?followed=true", headers=CEO).json()["items"] == []
    assert client.get("/api/v1/intelligence/articles?source_id=missing", headers=ADMIN).json()["items"] == []
    assert client.delete(f"/api/v1/intelligence/follows/{follow['id']}", headers=CEO).status_code == 404
    assert client.get("/api/v1/intelligence/follows", headers=FRANCHISE).status_code == 403
    with client.app.state.session_factory() as session:
        article = session.get(Article, aid)
        import hashlib
        article.url_hash = hashlib.sha256(article.url.encode()).hexdigest()
        session.flush()
        assert not upsert_article(session, session.get(NewsSource, article.source_id), {"title": "更新后的来源标题", "url": article.url, "content": "来源 RSS 摘要", "content_kind": "rss_excerpt", "summary": "修订摘要"})
        article.upstream_id = "stable-upstream-id"
        session.flush()
        assert not upsert_article(session, session.get(NewsSource, article.source_id), {"title": "更新后的来源标题", "url": "https://property.picc.com.cn/corrected-url", "upstream_id": "stable-upstream-id", "topic": "车险理赔"})
        session.commit()
    result = client.get(f"/api/v1/intelligence/articles/{aid}", headers=ADMIN).json()
    assert result["note"] == "与业务团队核对服务范围"
    assert result["title"] == "更新后的来源标题"
    assert result["url"] == "https://property.picc.com.cn/corrected-url"
    assert result["content_kind"] == "rss_excerpt" and len(result["snapshot_hash"]) == 64
    overview = client.get("/api/v1/intelligence/overview", headers=ADMIN).json()
    assert overview["total"] == 1 and overview["followed"] == 1
    assert client.delete(f"/api/v1/intelligence/follows/{follow['id']}", headers=ADMIN).status_code == 200


def test_absent_integrations_report_blocked_and_zero_spend(client):
    result = client.post("/api/v1/research", headers=CEO, json={"question": "新能源车险有哪些新变化？"})
    assert result.status_code == 201
    assert result.json()["status"] == "blocked"
    assert float(result.json()["cost_cny"]) == 0
    overview = client.get("/api/v1/workspace/overview", headers=CEO)
    assert overview.status_code == 200
    assert overview.json()["budget"]["spent"] == 0
    assert overview.json()["integrations"]["autoloop"]["configured"] is False


def test_task_assignment_and_status(client):
    client.get("/api/v1/me", headers=CEO)
    result = client.post("/api/v1/work-tasks", headers=ADMIN, json={"title": "核对监管原文", "assignee_id": "ceo"})
    assert result.status_code == 201
    ident = result.json()["id"]
    assert result.json()["status"] == "open"
    assert client.patch(f"/api/v1/work-tasks/{ident}", headers=CEO, json={"status": "done"}).json()["status"] == "done"
    assert client.post("/api/v1/work-tasks", headers=ADMIN, json={"title": "错误分配", "assignee_id": "unknown"}).status_code == 422
    assert client.get("/api/v1/work-tasks", headers=FRANCHISE).status_code == 403


def test_crm_proposal_requires_confirmation_and_replays_once(client):
    claim_id = seed_claim(client)
    proposal = client.post("/api/v1/proposals", headers=ADMIN, json={"kind": "opportunity_stage", "target_id": claim_id, "payload": {"stage": "qualified", "expected_value": "1200"}})
    assert proposal.status_code == 201
    pid = proposal.json()["id"]
    with client.app.state.session_factory() as session:
        assert session.scalar(select(func.count()).select_from(Opportunity)) == 0
    assert client.post(f"/api/v1/proposals/{pid}/confirm", headers=CEO, json={"confirmed": False}).status_code == 422
    assert client.post(f"/api/v1/proposals/{pid}/confirm", headers=FRANCHISE, json={"confirmed": True}).status_code == 403
    assert client.post(f"/api/v1/proposals/{pid}/confirm", headers=CEO, json={"confirmed": True}).json()["status"] == "confirmed"
    assert client.post(f"/api/v1/proposals/{pid}/confirm", headers=CEO, json={"confirmed": True}).status_code == 200
    with client.app.state.session_factory() as session:
        assert session.scalar(select(func.count()).select_from(Opportunity)) == 1
    overview = client.get("/api/v1/workspace/overview", headers=CEO).json()
    assert next(x for x in overview["pipeline"] if x["stage"] == "qualified")["count"] == 1
    assert client.put(f"/api/v1/claims/{claim_id}/opportunity", headers=CEO, json={"stage": "won"}).status_code == 403


def test_stale_proposal_does_not_overwrite_newer_business_data(client):
    claim_id = seed_claim(client)
    pid = client.post("/api/v1/proposals", headers=ADMIN, json={"kind": "opportunity_stage", "target_id": claim_id, "payload": {"stage": "qualified"}}).json()["id"]
    assert client.put(f"/api/v1/claims/{claim_id}/opportunity", headers=FRANCHISE, json={"stage": "won"}).status_code == 200
    assert client.post(f"/api/v1/proposals/{pid}/confirm", headers=CEO, json={"confirmed": True}).status_code == 409
    assert client.get("/api/v1/opportunities", headers=CEO).json()["items"][0]["stage"] == "won"


def test_reservation_cap_missing_usage_and_settlement(client, settings):
    settings.llm_api_key = "test-only"
    settings.llm_input_cny_per_million = 9
    settings.llm_output_cny_per_million = 27
    settings.ai_daily_budget_cny = 0.2
    with client.app.state.session_factory() as session:
        row = Research(title="test", question="test question", created_by="xu")
        session.add(row)
        session.commit()
        call = reserve_call(session, settings, row, [{"role": "user", "content": "测试"}], 4096)
        before = budget_read(session, settings)["reserved"]
        assert before > 0
        settle_call(session, settings, call, None)
        assert budget_read(session, settings)["reserved"] == before
        # The low-level reservation helper omits the orchestration failure transition.
        session.get(AiJob, call.ai_job_id).status = "failed"
        session.commit()
        row = Research(title="another", question="new request", created_by="xu")
        session.add(row)
        session.commit()
        with pytest.raises(ValueError, match="今日"):
            reserve_call(session, settings, row, [{"role": "user", "content": "测试"}], 4096)


def test_real_model_path_publishes_cited_report_and_task(client, settings, monkeypatch):
    from lead_core.api.routes import workspace
    from lead_core.intelligence import research
    aid = seed_article(client)
    settings.worker_token = "worker-test"
    settings.llm_api_key = "test-only"
    settings.llm_input_cny_per_million = 9
    settings.llm_output_cny_per_million = 27
    monkeypatch.setattr(workspace, "dispatch_research", lambda *args: True)
    monkeypatch.setattr(research, "article_excerpt", lambda row: "人保财险官方公开了新能源理赔流程调整。")
    def model_post(url, **kwargs):
        assert url.endswith("/chat/completions")
        assert kwargs["json"]["max_tokens"] == 4096
        return httpx.Response(200, request=httpx.Request("POST", url), json={"choices": [{"message": {"content": "已知事实：官方公开了流程调整。[1]\n可能影响：需核实适用范围。"}}], "usage": {"prompt_tokens": 1000, "completion_tokens": 200}})
    monkeypatch.setattr(research.httpx, "post", model_post)
    created = client.post("/api/v1/research", headers=CEO, json={"question": "分析新能源理赔变化", "article_ids": [aid], "create_task": True}).json()
    assert client.post("/api/v1/internal/research/run-next").status_code == 401
    ran = client.post("/api/v1/internal/research/run-next", headers={"Authorization": "Bearer worker-test"})
    assert ran.status_code == 200
    assert ran.json()["outcome"] == "done"
    result = client.get("/api/v1/research/" + created["id"], headers=CEO).json()
    assert result["status"] == "completed"
    assert len(result["citations"]) == 1
    assert Decimal(str(result["cost_cny"])) == Decimal("0.0144")
    assert client.get("/api/v1/work-tasks", headers=CEO).json()["items"][0]["research_id"] == created["id"]
    assert client.get("/api/v1/workspace/overview", headers=CEO).json()["budget"]["reserved"] == 0


def test_iso_source_time_is_not_truncated():
    from lead_core.intelligence.sources import parse_date
    value = parse_date("2026-11-04T16:00:00Z")
    assert value.hour == 16
    from zoneinfo import ZoneInfo
    assert value.astimezone(ZoneInfo("Asia/Shanghai")).date().isoformat() == "2026-11-05"


def test_cancelled_task_never_calls_model(client, settings, monkeypatch):
    from lead_core.api.routes import workspace
    monkeypatch.setattr(workspace, "dispatch_research", lambda *args: True)
    settings.worker_token = "worker-test"
    created = client.post("/api/v1/research", headers=CEO, json={"question": "测试取消任务", "watch": True}).json()
    cancelled = client.post("/api/v1/research/" + created["id"] + "/cancel", headers=CEO).json()
    assert cancelled["status"] == "cancelled"
    assert cancelled["watch"] is False
    assert client.post("/api/v1/internal/research/run-next", headers={"Authorization": "Bearer worker-test"}).json()["outcome"] == "nothing"


def test_source_parsing_preserves_date_and_url_dedup(client):
    source = NewsSource(id="test", name="官方测试", url="https://property.picc.com.cn/news/", topic="车险理赔")
    html = '<ul><li><a href="/news/20261105/a.html">新能源车险理赔服务最新公开说明</a><span>2026-11-05</span></li><li><a href="/news/20261105/a.html">新能源车险理赔服务最新公开说明</a></li></ul>'
    rows = parse_listing(html, source)
    assert len(rows) == 1
    assert rows[0]["published_at"].date().isoformat() == "2026-11-05"
    with client.app.state.session_factory() as session:
        session.add(source)
        session.flush()
        assert upsert_article(session, source, rows[0]) is True
        assert upsert_article(session, source, rows[0]) is False


def test_aihot_raw_adapter_preserves_upstream_dates_and_source_identity(client, settings):
    from lead_core.intelligence.sources import ensure_sources, sync_aihot
    settings.aihot_base_url = "http://aihot.test"
    settings.aihot_admin_password = "test-only"
    stamp = "2026-11-04T16:00:00Z"
    def handler(request):
        path = request.url.path
        if path == "/api/auth/password":
            return httpx.Response(303, headers={"location": "/api/admin/me"})
        if path == "/api/admin/me":
            return httpx.Response(200, json={"csrf": "test-csrf"})
        if path == "/api/admin/sources":
            return httpx.Response(200, json={"rows": [{"id": "upstream-picc", "enabled": True, "last_fetch_at": stamp, "last_error": None}]})
        if path == "/api/admin/sources/upstream-picc":
            return httpx.Response(200, json={"source": {"id": "upstream-picc", "name": "人保财险官方新闻", "enabled": True, "last_fetch_at": stamp, "last_error": None, "config": {"url": "https://property.picc.com.cn/cx_gywm/zxzx/xwsd/"}}, "items": []})
        if path == "/api/admin/haoyi/sync":
            return httpx.Response(200, json={"version": 1, "until": "2026-11-05T02:00:00Z", "hasMore": False, "items": [{"id": "news123", "title": "新能源车险理赔服务最新公开说明", "url": "https://property.picc.com.cn/news/20261105/a.html", "source_id": "upstream-picc", "published_at": stamp, "discovered_at": "2026-11-05T01:00:00Z", "content": "来源摘要", "content_kind": "source_excerpt"}]})
        raise AssertionError(path)
    with client.app.state.session_factory() as session, httpx.Client(transport=httpx.MockTransport(handler)) as upstream:
        ensure_sources(session)
        assert sync_aihot(session, settings, upstream) == 1
        article = session.scalar(select(Article))
        assert article.source_id == "picc"
        assert article.published_at.hour == 16
        assert article.fetched_at.hour == 1
        source = session.get(NewsSource, "picc")
        assert source.adapter == "aihot"
        assert source.external_id == "upstream-picc"
        assert source.last_fetched_at.hour == 16
        assert session.scalar(select(func.count()).select_from(NewsSource)) == 9


def test_busy_worker_restores_scope_for_queued_task_check(client, settings, monkeypatch):
    from lead_core.intelligence import research
    restored = []
    monkeypatch.setattr(research, "apply_rls_context", lambda session, **scope: restored.append(scope))
    settings.ai_max_concurrent_tasks = 1
    with client.app.state.session_factory() as session:
        session.add(Research(title="正在运行", question="进行中的测试", created_by="xu", status="running", started_at=datetime.now(UTC)))
        queued = Research(title="排队中", question="等待中的测试", created_by="ceo")
        session.add(queued)
        session.commit()
        assert research.claim_next(session, settings) is None
        assert restored == [{"is_worker": True}]
        assert session.get(Research, queued.id).status == "queued"


def test_cancellation_during_model_call_keeps_cancelled_and_settles_usage(client, settings, monkeypatch):
    from lead_core.api.routes import workspace
    from lead_core.intelligence import research
    aid = seed_article(client)
    settings.worker_token = "worker-test"
    settings.llm_api_key = "test-only"
    settings.llm_input_cny_per_million = 9
    settings.llm_output_cny_per_million = 27
    monkeypatch.setattr(workspace, "dispatch_research", lambda *args: True)
    monkeypatch.setattr(research, "article_excerpt", lambda row: "官方资料。")
    created = client.post("/api/v1/research", headers=CEO, json={"question": "研究新能源理赔变化", "article_ids": [aid], "create_task": True}).json()
    def model_post(url, **kwargs):
        with client.app.state.session_factory() as other_session:
            current = other_session.get(Research, created["id"])
            current.status = "cancelled"
            other_session.commit()
        return httpx.Response(200, request=httpx.Request("POST", url), json={"choices": [{"message": {"content": "依据官方资料的结论。[1]"}}], "usage": {"prompt_tokens": 1000, "completion_tokens": 200}})
    monkeypatch.setattr(research.httpx, "post", model_post)
    result = client.post("/api/v1/internal/research/run-next", headers={"Authorization": "Bearer worker-test"})
    assert result.json()["outcome"] == "cancelled"
    row = client.get("/api/v1/research/" + created["id"], headers=CEO).json()
    assert row["status"] == "cancelled"
    assert row["report"] == ""
    assert Decimal(str(row["cost_cny"])) == Decimal("0.0144")
    assert client.get("/api/v1/work-tasks", headers=CEO).json()["items"] == []
