import json
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.main import create_app
from app.studio_models import NewsJob, StudioRecord


def test_disabled_refresh_creates_no_pending_job(tmp_path, monkeypatch):
    with TestClient(create_app(database_url=f"sqlite:///{tmp_path / 'news.db'}")) as client:
        monkeypatch.setenv("LEGACY_NEWS_WORKER_ENABLED", "1")
        response = client.post("/api/studio/news/refresh", json={"request_key": str(uuid4()), "data": {}})
        assert response.status_code == 200
        assert response.json()["status"] == "pending"
        for disabled in (None, "0"):
            if disabled is None:
                monkeypatch.delenv("LEGACY_NEWS_WORKER_ENABLED")
            else:
                monkeypatch.setenv("LEGACY_NEWS_WORKER_ENABLED", disabled)
            response = client.post("/api/studio/news/refresh", json={"request_key": str(uuid4()), "data": {}})
            assert response.status_code == 410
            assert "行业情报" in response.json()["detail"]
            with client.app.state.session_factory() as session:
                assert session.scalar(select(func.count()).select_from(NewsJob)) == 1


def test_disabled_collection_preserves_history_and_local_article_actions(tmp_path, monkeypatch):
    monkeypatch.setenv("LEGACY_NEWS_WORKER_ENABLED", "0")
    with TestClient(create_app(database_url=f"sqlite:///{tmp_path / 'history.db'}")) as client:
        with client.app.state.session_factory() as session:
            article = StudioRecord(
                kind="article", owner_id=1, request_key="article:retained",
                payload=json.dumps({"title": "Retained industry article", "url": "https://example.com/article", "favorite": False, "report_material": False}),
            )
            session.add(article)
            session.flush()
            article_id = article.id
            edition = {"owner": 1, "date": "2026-11-04", "articles": [article_id], "count": 1}
            session.add(NewsJob(job_key="manual:1:retained", status="success", payload=json.dumps(edition)))
            session.commit()

        response = client.get("/api/studio/news")
        assert response.status_code == 200
        assert response.json()["articles"][0]["id"] == article_id
        assert response.json()["history"][0]["status"] == "success"
        edited = client.patch(f"/api/studio/news/articles/{article_id}", json={"request_key": str(uuid4()), "data": {"favorite": True, "report_material": True}})
        assert edited.status_code == 200
        assert edited.json()["report_material"] is True
        action = client.post(f"/api/studio/news/articles/{article_id}/action", json={"request_key": str(uuid4()), "data": {"next_action": "Review retained source"}})
        assert action.status_code == 200
        assert action.json()["source_id"] == article_id
        final = client.get("/api/studio/news").json()
        assert final["favorites"][0]["id"] == article_id
        assert final["edition"] == edition
        with client.app.state.session_factory() as session:
            assert session.scalar(select(func.count()).select_from(NewsJob)) == 1
