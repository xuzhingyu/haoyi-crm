import json
from datetime import UTC, datetime

import httpx
from sqlalchemy import func, select

from lead_core.intelligence.models import Article, IntegrationCursor
from lead_core.intelligence.sources import sync_aihot_raw


def test_complete_sync_resumes_after_failed_page_and_updates_existing_excerpt(client, settings):
    settings.aihot_base_url, settings.aihot_admin_password = "http://aihot.test", "test-only"
    stamp = datetime.now(UTC).isoformat()
    fail = True
    seen = []
    source = {"id": "rss", "name": "行业资讯", "enabled": True, "config": {"feedUrl": "https://cnevpost.com/feed/"}, "tags": ["topic:新能源售后"]}

    def handler(request):
        nonlocal fail
        if request.url.path == "/api/auth/password":
            return httpx.Response(303, headers={"location": "/"})
        if request.url.path == "/api/admin/me":
            return httpx.Response(200, json={"csrf": "test"})
        if request.url.path == "/api/admin/sources":
            return httpx.Response(200, json={"rows": [source]})
        if request.url.path == "/api/admin/sources/rss":
            return httpx.Response(200, json={"source": source})
        assert request.url.path == "/api/admin/haoyi/sync"
        after = request.url.params.get("after")
        incremental = bool(request.url.params.get("since"))
        seen.append((after, incremental))
        if after and fail:
            fail = False
            return httpx.Response(503)
        start, stop = (0, 1) if incremental else (200, 225) if after else (0, 200)
        items = [{"id": f"a{i:03}", "title": f"EV service {i}", "url": f"https://cnevpost.com/news/{i}", "source_id": "rss", "updated_at": stamp,
                  "summary": "修订摘要" if incremental else "原始摘要", "content": "Feed excerpt", "content_kind": "rss_excerpt"} for i in range(start, stop)]
        return httpx.Response(200, json={"version": 1, "until": stamp, "items": items, "hasMore": not after and not incremental, "nextAfter": "a199" if not after else None})

    with client.app.state.session_factory() as session, httpx.Client(transport=httpx.MockTransport(handler)) as upstream:
        assert sync_aihot_raw(session, settings, upstream) == 200
        state = json.loads(session.get(IntegrationCursor, "aihot").value)
        assert state["after"] == "a199" and state["in_progress"]
        assert session.get(IntegrationCursor, "aihot").last_error
        session.commit()
        assert sync_aihot_raw(session, settings, upstream) == 25
        assert session.scalar(select(func.count()).select_from(Article)) == 225
        assert session.get(IntegrationCursor, "aihot").last_error is None
        assert sync_aihot_raw(session, settings, upstream) == 0
        assert session.scalar(select(Article).where(Article.upstream_id == "a000")).summary == "修订摘要"
        assert seen == [(None, False), ("a199", False), ("a199", False), (None, True)]


def test_missing_upstream_patch_is_explicit_instead_of_partial_success(client, settings):
    settings.aihot_base_url, settings.aihot_admin_password = "http://aihot.test", "test-only"

    def handler(request):
        if request.url.path == "/api/auth/password":
            return httpx.Response(303, headers={"location": "/"})
        if request.url.path == "/api/admin/me":
            return httpx.Response(200, json={"csrf": "test"})
        if request.url.path == "/api/admin/sources":
            return httpx.Response(200, json={"rows": []})
        return httpx.Response(404)

    with client.app.state.session_factory() as session, httpx.Client(transport=httpx.MockTransport(handler)) as upstream:
        assert sync_aihot_raw(session, settings, upstream) == 0
        cursor = session.get(IntegrationCursor, "aihot")
        assert cursor.last_success_at is None and "完整同步接口尚未部署" in cursor.last_error
