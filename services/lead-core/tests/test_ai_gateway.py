from decimal import Decimal

import httpx
from conftest import auth_headers
from sqlalchemy import func, select

from lead_core.intelligence import gateway
from lead_core.intelligence.models import AiJob, BudgetDay, ModelCall, WorkspaceMember

ACTOR = "00000000-0000-4000-8000-000000000011"


def setup_gateway(client, settings):
    settings.ai_gateway_token = "test-service"
    settings.llm_api_key = "upstream-test"
    settings.llm_input_cny_per_million = 9
    settings.llm_output_cny_per_million = 27
    with client.app.state.session_factory() as session:
        session.add(WorkspaceMember(user_id=ACTOR, display_name="test"))
        session.commit()
    return {"Authorization": "Bearer test-service"}


def payload(request_id="request-001"):
    return {"request_id": request_id, "source_system": "legacy_crm", "source_id": "overview",
            "actor_sub": ACTOR, "purpose": "operations", "max_tokens": 1024,
            "messages": [{"role": "user", "content": "商机数量 4，联系电话13812345678，邮箱test@example.com"}]}


def test_gateway_fixed_upstream_redacts_and_replays_once(client, settings, monkeypatch):
    headers = setup_gateway(client, settings)
    calls = []
    def answer(url, **kwargs):
        calls.append(kwargs["json"])
        assert url == settings.llm_base_url + "/chat/completions"
        assert "13812345678" not in str(kwargs["json"])
        assert "test@example.com" not in str(kwargs["json"])
        assert kwargs["json"]["model"] == settings.llm_model
        return httpx.Response(200, request=httpx.Request("POST", url), json={"choices": [{"message": {"content": "请核对这 4 项商机。"}}], "usage": {"prompt_tokens": 1000, "completion_tokens": 200}})
    monkeypatch.setattr(gateway.httpx, "post", answer)
    first = client.post("/api/v1/internal/ai/chat-completions", headers=headers, json=payload())
    again = client.post("/api/v1/internal/ai/chat-completions", headers=headers, json=payload())
    assert first.status_code == again.status_code == 200
    assert again.json()["haoyi"]["replayed"] is True
    assert len(calls) == 1
    with client.app.state.session_factory() as session:
        assert session.scalar(select(func.count()).select_from(ModelCall)) == 1
        day = session.get(BudgetDay, gateway.local_day())
        assert day.spent == Decimal("0.0144") and day.reserved == 0
        assert session.scalar(select(ModelCall)).research_id is None
    changed = payload()
    changed["messages"][0]["content"] = "不同内容"
    assert client.post("/api/v1/internal/ai/chat-completions", headers=headers, json=changed).status_code == 409


def test_gateway_denies_untrusted_actor_and_caller_models(client, settings):
    headers = setup_gateway(client, settings)
    endpoint = "/api/v1/internal/ai/chat-completions"
    assert client.post(endpoint, json=payload()).status_code == 401
    invalid = payload()
    invalid["actor_sub"] = "someone-else"
    assert client.post(endpoint, headers=headers, json=invalid).status_code == 403
    invalid = payload()
    invalid["model"] = "expensive-model"
    assert client.post(endpoint, headers=headers, json=invalid).status_code == 422
    invalid = payload()
    invalid["response_format"] = {"type": "untrusted"}
    assert client.post(endpoint, headers=headers, json=invalid).status_code == 422
    with client.app.state.session_factory() as session:
        assert session.scalar(select(func.count()).select_from(ModelCall)) == 0


def test_gateway_budget_and_unknown_usage_are_shared(client, settings, monkeypatch):
    headers = setup_gateway(client, settings)
    settings.ai_daily_budget_cny = 0.08
    def failed(url, **kwargs):
        raise httpx.ReadTimeout("upstream timeout")
    monkeypatch.setattr(gateway.httpx, "post", failed)
    endpoint = "/api/v1/internal/ai/chat-completions"
    response = client.post(endpoint, headers=headers, json=payload())
    assert response.status_code == 502
    with client.app.state.session_factory() as session:
        row = session.get(BudgetDay, gateway.local_day())
        held = row.reserved
        assert held > 0 and row.spent == 0
        assert session.scalar(select(ModelCall)).status == "usage_unknown"
        assert session.scalar(select(AiJob)).status == "failed"
    assert client.post(endpoint, headers=headers, json=payload()).status_code == 409
    assert client.post(endpoint, headers=headers, json=payload("new-request")).status_code == 402
    with client.app.state.session_factory() as session:
        assert session.get(BudgetDay, gateway.local_day()).reserved == held
    assert client.get("/api/v1/ai/jobs", headers=auth_headers(user="franchise", org="x", roles="franchise_owner")).status_code == 403
    jobs = client.get("/api/v1/ai/jobs", headers=auth_headers(user="ceo", roles="hq_executive")).json()["items"]
    assert len(jobs) == 2 and all("response" not in item for item in jobs)


def test_gateway_global_concurrency_reserves_nothing_when_busy(client, settings, monkeypatch):
    headers = setup_gateway(client, settings)
    settings.ai_max_concurrent_tasks = 1
    from datetime import UTC, datetime
    with client.app.state.session_factory() as session:
        session.add(AiJob(request_id="active-other", input_hash="hash", actor_sub=ACTOR, source_system="workspace",
                          purpose="research", status="running", started_at=datetime.now(UTC)))
        session.commit()
    monkeypatch.setattr(gateway.httpx, "post", lambda *a, **k: (_ for _ in ()).throw(AssertionError("must not call")))
    assert client.post("/api/v1/internal/ai/chat-completions", headers=headers, json=payload()).status_code == 429
    with client.app.state.session_factory() as session:
        assert session.scalar(select(func.count()).select_from(ModelCall)) == 0
