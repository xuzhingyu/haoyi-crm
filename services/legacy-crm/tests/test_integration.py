import json
import time
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
from uuid import uuid4

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app import ai_gateway, oidc
from app.integration_models import ExternalLeadLink, ExternalOperation
from app.main import create_app
from app.models import EntityEvent, RepairShopLead, User


@pytest.fixture
def unified(tmp_path, monkeypatch):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    monkeypatch.setenv("OIDC_ISSUER", "https://identity.test/realms/haoyi")
    monkeypatch.setenv("OIDC_AUDIENCE", "haoyi-workbench")
    monkeypatch.setenv("CRM_BRIDGE_TOKEN", "test-bridge-service-token")
    monkeypatch.setattr(oidc, "jwks_client", lambda _: SimpleNamespace(get_signing_key_from_jwt=lambda _: SimpleNamespace(key=key.public_key())))
    app = create_app(database_url=f"sqlite:///{tmp_path / 'unified.db'}")
    with TestClient(app) as client:
        monkeypatch.setenv("AUTH_MODE", "oidc")

        def token(user=11, roles=None, **overrides):
            claims = {"sub": f"00000000-0000-4000-8000-{user:012d}", "iss": "https://identity.test/realms/haoyi",
                "aud": "haoyi-workbench", "iat": int(time.time()), "exp": int(time.time()) + 300,
                "realm_access": {"roles": roles or (["hq_admin"] if user == 11 else ["hq_executive"])}, "name": "Unified display name"}
            claims.update(overrides)
            return jwt.encode(claims, key, algorithm="RS256")

        def headers(user=11, **kwargs):
            return {"Authorization": "Bearer " + token(user, **kwargs), "X-Haoyi-Bridge-Token": "test-bridge-service-token"}

        yield client, app, headers, token


def test_oidc_rejects_forged_headers_wrong_audience_and_franchise(unified):
    client, _, headers, token = unified
    assert client.get("/api/leads", headers={"X-UserId": "1", "X-Role": "operator"}).status_code == 401
    assert client.get("/api/leads", headers=headers(11, roles=["franchise_admin"])).status_code == 403
    assert client.get("/api/leads", headers=headers(13, roles=["hq_admin"])).status_code == 403
    assert client.get("/api/leads", headers=headers(11, aud="different-app")).status_code == 401
    assert client.get("/api/leads", headers=headers(11, exp=int(time.time()) - 60)).status_code == 401
    bad = token()[:-8] + "tampered"
    assert client.get("/api/leads", headers={"Authorization": "Bearer " + bad}).status_code == 401
    assert client.get("/api/auth/me", headers=headers()).json()["display_name"] == "Unified display name"
    assert client.post("/api/auth/login", json={"username": "lin", "password": "irrelevant"}).status_code == 410


def test_ceo_business_writes_denied_and_followup_notes_hidden(unified):
    client, _, headers, _ = unified
    assert client.post("/api/leads", headers=headers(12), json={"shop_name": "forbidden"}).status_code == 403
    assert client.get("/api/studio/records/contract", headers=headers(12)).status_code == 403
    assert all("note" not in row for row in client.get("/api/follow-ups", headers=headers(12)).json())
    body = {"request_id": str(uuid4()), "confirmed": True, "source_system": "lead_core", "source_id": str(uuid4()), "lead": {"shop_name": "not imported"}}
    assert client.post("/api/integrations/import-lead", headers=headers(12), json=body).status_code == 403


def test_ceo_detail_and_history_do_not_expose_private_notes(unified):
    client, app, headers, _ = unified
    from app.models import FollowUp
    with app.state.session_factory() as session:
        lead = session.get(RepairShopLead, 1)
        lead.private_notes = "PRIVATE-LEAD-NOTE"
        session.get(FollowUp, 1).note = "PRIVATE-FOLLOWUP-NOTE"
        session.add(EntityEvent(entity_type="lead", entity_id=1, action="update", user_id=1,
            before_json=json.dumps({"phone": "13912345678"}), after_json=json.dumps({"private_notes": "PRIVATE-HISTORY-NOTE"}), reason="PRIVATE-REASON"))
        session.commit()
    for path in ["/api/leads/1", "/api/leads/1/history", "/api/entities/lead/1/history"]:
        response = client.get(path, headers=headers(12))
        assert response.status_code == 200
        assert "PRIVATE-" not in response.text and "13912345678" not in response.text
    assert "PRIVATE-LEAD-NOTE" in client.get("/api/leads/1", headers=headers()).text


def test_source_import_is_atomic_idempotent_and_reconcilable(unified):
    client, app, headers, _ = unified
    body = {"request_id": str(uuid4()), "confirmed": True, "source_system": "lead_core", "source_id": str(uuid4()), "lead": {"shop_name": "new CRM lead"}}
    before = len(client.get("/api/leads", headers=headers()).json())
    first = client.post("/api/integrations/import-lead", headers=headers(), json=body)
    assert first.status_code == 200, first.text
    second = client.post("/api/integrations/import-lead", headers=headers(), json=body)
    assert second.json()["replayed"] is True
    assert second.json()["entity_id"] == first.json()["entity_id"]
    assert client.post("/api/integrations/import-lead", headers=headers(), json={**body, "lead": {"shop_name": "changed"}}).status_code == 409
    source_replay = client.post("/api/integrations/import-lead", headers=headers(), json={**body, "request_id": str(uuid4())})
    assert source_replay.json()["entity_id"] == first.json()["entity_id"]
    assert len(client.get("/api/leads", headers=headers()).json()) == before + 1
    result = client.get("/api/integrations/operations/" + body["request_id"], headers={"X-Haoyi-Bridge-Token": "test-bridge-service-token"})
    assert result.json()["actor_sub"].endswith("0011")
    assert "new CRM lead" not in result.text
    assert client.get("/api/integrations/operations/" + body["request_id"]).status_code == 401
    assert client.post("/api/integrations/import-lead", headers={"X-Haoyi-Bridge-Token": "test-bridge-service-token"}, json=body).status_code == 401
    with app.state.session_factory() as session:
        assert session.scalar(select(func.count()).select_from(ExternalLeadLink)) == 1


def test_concurrent_import_replays_one_effect(unified):
    client, app, headers, _ = unified
    body = {"request_id": str(uuid4()), "confirmed": True, "source_system": "lead_core", "source_id": str(uuid4()), "lead": {"shop_name": "concurrent lead"}}
    auth = headers()
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: client.post("/api/integrations/import-lead", headers=auth, json=body), range(2)))
    assert [r.status_code for r in results] == [200, 200]
    assert len({r.json()["entity_id"] for r in results}) == 1
    assert sorted(r.json()["replayed"] for r in results) == [False, True]
    with app.state.session_factory() as session:
        assert session.scalar(select(func.count()).select_from(ExternalOperation)) == 1


def test_stage_confirmation_checks_version_role_and_lifecycle(unified):
    client, app, headers, _ = unified
    state = client.get("/api/integrations/entities/opportunity/1", headers=headers()).json()
    body = {"request_id": str(uuid4()), "confirmed": True, "entity_type": "opportunity", "entity_id": 1,
        "action": "update_stage", "expected_version": state["version"], "payload": {"stage": "方案沟通", "stage_reason": "人工确认有新进展"}}
    assert client.post("/api/integrations/confirmed-operations", headers=headers(12), json=body).status_code == 403
    changed = client.post("/api/integrations/confirmed-operations", headers=headers(), json=body)
    assert changed.status_code == 200, changed.text
    assert client.post("/api/integrations/confirmed-operations", headers=headers(), json=body).json()["replayed"] is True
    stale = {**body, "request_id": str(uuid4())}
    assert client.post("/api/integrations/confirmed-operations", headers=headers(), json=stale).status_code == 409
    bad = {**stale, "expected_version": changed.json()["version"], "payload": {"stage": "已签约", "stage_reason": "bypass"}}
    assert client.post("/api/integrations/confirmed-operations", headers=headers(), json=bad).status_code == 422
    with app.state.session_factory() as session:
        assert session.scalar(select(func.count()).select_from(ExternalOperation)) == 1
        assert session.scalar(select(func.count()).select_from(EntityEvent).where(EntityEvent.entity_type == "opportunity", EntityEvent.action == "update")) == 1


def test_deployed_defaults_do_not_seed_business_or_accounts(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTH_MODE", "oidc")
    app = create_app(database_url=f"sqlite:///{tmp_path / 'empty.db'}")
    with TestClient(app):
        with app.state.session_factory() as session:
            assert session.scalar(select(func.count()).select_from(User)) == 0
            assert session.scalar(select(func.count()).select_from(RepairShopLead)) == 0


def test_gateway_uses_fixed_service_endpoint_and_preserves_budget_failure(monkeypatch):
    monkeypatch.setenv("AI_GATEWAY_URL", "http://gateway/api/v1/internal/ai/chat-completions")
    monkeypatch.setenv("AI_GATEWAY_TOKEN", "test-gateway-token")
    captured = []

    def respond(request):
        captured.append(request)
        return httpx.Response(402, json={"detail": "budget exhausted"})

    call_id = str(uuid4())
    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        with pytest.raises(ai_gateway.GatewayError, match="额度"):
            ai_gateway.chat(purpose="operations", actor_sub="00000000-0000-4000-8000-000000000011",
                messages=[{"role": "user", "content": "{}"}], call_id=call_id, client=client)
    payload = json.loads(captured[0].content)
    assert payload["request_id"] == call_id
    assert "model" not in payload and "base_url" not in payload
    assert captured[0].headers["authorization"] == "Bearer test-gateway-token"


def test_studio_draft_sends_aggregates_not_private_input(unified, monkeypatch):
    client, _, headers, _ = unified
    calls = []

    def fake_chat(**kwargs):
        calls.append(kwargs)
        return {"choices": [{"message": {"content": json.dumps({"summary": "经营汇总", "next_action": "人工核对"})}}]}

    monkeypatch.setattr(ai_gateway, "chat", fake_chat)
    response = client.post("/api/studio/ai/drafts", headers=headers(), json={"text": "private contact phone 13912345678; secret contract", "mode": "report"})
    assert response.status_code == 200, response.text
    assert response.json()["analysis_scope"] == "aggregate_only"
    sent = json.dumps(calls)
    assert "13912345678" not in sent and "secret contract" not in sent
    assert calls[0]["purpose"] == "studio_report"
    assert set(json.loads(calls[0]["messages"][1]["content"])) == {"mode", "metrics"}
