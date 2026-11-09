from conftest import TEST_OPERATOR_PASSWORD, TEST_EXECUTIVE_PASSWORD
from fastapi.testclient import TestClient


def test_login_issues_a_session_for_the_operator_and_rejects_bad_passwords(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTH_DISABLED", "0")
    from app.main import create_app

    with TestClient(create_app(database_url=f"sqlite:///{tmp_path / 'auth.db'}")) as client:
        denied = client.post("/api/auth/login", json={"username": "lin", "password": "wrong"})
        ok = client.post("/api/auth/login", json={"username": "lin", "password": TEST_OPERATOR_PASSWORD})
        me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {ok.json()['token']}"})

    assert denied.status_code == 401
    assert ok.status_code == 200
    assert ok.json()["role"] == "operator"
    assert me.status_code == 200
    assert me.json()["username"] == "lin"


def test_executive_token_cannot_create_knowledge_documents(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTH_DISABLED", "0")
    from app.main import create_app

    with TestClient(create_app(database_url=f"sqlite:///{tmp_path / 'auth-exec.db'}")) as client:
        token = client.post("/api/auth/login", json={"username": "leader", "password": TEST_EXECUTIVE_PASSWORD}).json()["token"]
        created = client.post(
            "/api/knowledge-documents",
            headers={"Authorization": f"Bearer {token}"},
            json={"title": "secret", "category": "政策", "content": "内部条款"},
        )
        leads = client.get("/api/executive/leads", headers={"Authorization": f"Bearer {token}"})

    assert created.status_code == 403
    assert leads.status_code == 200
    assert "phone" not in leads.json()[0]
