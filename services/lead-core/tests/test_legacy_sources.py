import hashlib
import json
import socket
import sqlite3

import httpx
import pytest
from conftest import auth_headers
from sqlalchemy import func, select

from lead_core.intelligence.legacy_sources import (
    canonical_url,
    import_sources,
    read_legacy_sources,
    source_spec,
    verify_feed,
)
from lead_core.intelligence.models import Article, IntegrationCursor, NewsSource
from lead_core.intelligence.source_metadata import source_metadata, source_nature
from lead_core.intelligence.sources import aihot_source, article_topic, sync_aihot_raw

RSS = b'<rss><channel><item><title>New data published</title><link>https://cnevpost.com/news/update</link></item></channel></rss>'
SOURCE = {"name": "CnEVPost·行业", "url": "https://cnevpost.com/industry/feed", "format": "rss", "topic": "同行布局", "nature": "媒体", "enabled": True}


@pytest.mark.parametrize("url", ["http://127.0.0.1/", "http://169.254.169.254/", "http://localhost/", "https://user:pass@example.org/", "https://example.org/?token=secret", "https://example.org:80/", "file:///tmp/feed"])
def test_public_feed_urls_refuse_credentials_and_private_targets(url):
    with pytest.raises(ValueError, match="无凭据"):
        canonical_url(url)


def test_read_legacy_sources_deduplicates_without_changing_history(tmp_path):
    path = tmp_path / "old.db"
    with sqlite3.connect(path) as connection:
        connection.execute("CREATE TABLE studio_records(id TEXT PRIMARY KEY, kind TEXT, payload TEXT)")
        connection.execute("CREATE TABLE news_jobs(id TEXT)")
        payloads = [("1", "news_source", SOURCE), ("2", "news_source", {**SOURCE, "enabled": False}),
                    ("3", "news_source", {**SOURCE, "url": "https://example.org/?token=secret"}),
                    ("4", "article", {"title": "private history", "favorite": True})]
        connection.executemany("INSERT INTO studio_records VALUES(?,?,?)", [(ident, kind, json.dumps(value)) for ident, kind, value in payloads])
        connection.execute("INSERT INTO news_jobs VALUES('historical')")
    before = hashlib.sha256(path.read_bytes()).hexdigest()
    sources, counts = read_legacy_sources(str(path))
    assert counts == {"articles": 1, "favorites": 1, "news_jobs": 1, "invalid_sources": 1}
    assert len(sources) == 1 and sources[0]["enabled"] is False
    assert "不一致" in sources[0]["review_reason"]
    assert hashlib.sha256(path.read_bytes()).hexdigest() == before
    assert "private history" not in json.dumps(sources)


def test_feed_verification_rejects_html_entities_and_stopped_sources():
    assert verify_feed(SOURCE, lambda _: RSS)["items"] == 1
    atom = b'<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>English</title><link href="https://cnevpost.com/a"/></entry></feed>'
    assert verify_feed(SOURCE, lambda _: atom)["valid"]
    for body in (b"<html>login</html>", b"<!DOCTYPE rss><rss/>", b"<rss><channel/></rss>"):
        assert not verify_feed(SOURCE, lambda _, body=body: body)["valid"]
    assert verify_feed({**SOURCE, "enabled": False}, lambda _: pytest.fail("disabled source fetched"))["status"] == "paused"


def test_feed_verification_pins_only_public_dns(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", lambda *args, **kwargs: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.1", 443))])
    monkeypatch.setattr(socket, "create_connection", lambda *args, **kwargs: pytest.fail("private network used"))
    result = verify_feed(SOURCE)
    assert not result["valid"] and "非公网" in result["reason"]


def test_nature_requires_known_official_domain_and_specs_keep_six_hours():
    assert source_nature("https://cnevpost.com/feed", "官方") == "media"
    assert source_nature("https://auto.gasgoo.com/feed", "官方") == "industry"
    assert source_nature("https://example.org/feed", "official") == "unknown"
    assert source_nature("https://property.picc.com.cn/news") == "official"
    spec = source_spec(SOURCE)
    assert spec["tier"] == "T2" and spec["first_party"] is False
    assert spec["interval_minutes"] == 360 and "nature:media" in spec["tags"]
    assert spec["config"]["_aihot"]["initialBackfillLimit"] == 30
    assert not spec["site_fulltext"] and not spec["syndicate_fulltext"]


def test_import_preview_never_changes_databases_or_calls_aihot(client, settings):
    with client.app.state.session_factory() as session:
        results = import_sources(session, settings, [SOURCE], fetcher=lambda _: RSS)
        assert results[0]["nature"] == "media" and results[0]["valid"]
        assert session.scalar(select(func.count()).select_from(NewsSource)) == 0
        assert session.scalar(select(func.count()).select_from(IntegrationCursor)) == 0


def test_import_apply_is_idempotent_and_preserves_upstream_pause(client, settings):
    settings.aihot_base_url, settings.aihot_admin_password = "http://aihot.test", "test-only"
    remote = {**source_spec(SOURCE), "id": "existing-feed", "enabled": False, "updated_at": "2026-11-05T01:00:00Z", "tags": ["keep-tag"]}
    patches = []
    def handler(request):
        if request.url.path == "/api/auth/password":
            return httpx.Response(303, headers={"location": "/"})
        if request.url.path == "/api/admin/me":
            return httpx.Response(200, json={"csrf": "test"})
        if request.method == "POST" and request.url.path == "/api/admin/sources":
            return httpx.Response(200, json={"created": False, "duplicate": remote})
        if request.method == "PATCH":
            body = json.loads(request.content)
            assert request.headers["x-csrf-token"] == "test"
            assert "enabled" not in body["patch"]
            patches.append(body)
            remote.update(body["patch"])
            return httpx.Response(200, json=remote)
        if request.url.path == "/api/admin/sources/existing-feed":
            return httpx.Response(200, json={"source": remote})
        raise AssertionError(str(request.url))
    with client.app.state.session_factory() as session, httpx.Client(transport=httpx.MockTransport(handler)) as upstream:
        for _ in range(2):
            result = import_sources(session, settings, [SOURCE], apply=True, client=upstream, fetcher=lambda _: RSS)
            assert result[0]["status"] == "paused"
            session.commit()
        row = session.scalar(select(NewsSource))
        assert row.external_id == "existing-feed" and row.adapter == "aihot"
        assert source_metadata(session, row)["nature"] == "media"
        assert session.scalar(select(func.count()).select_from(NewsSource)) == 1
    assert len(patches) == 2 and "keep-tag" in remote["tags"]


def test_invalid_import_is_pending_without_creating_upstream_source(client, settings):
    settings.aihot_base_url, settings.aihot_admin_password = "http://aihot.test", "test-only"
    def handler(request):
        if request.url.path == "/api/auth/password":
            return httpx.Response(303, headers={"location": "/"})
        if request.url.path == "/api/admin/me":
            return httpx.Response(200, json={"csrf": "test"})
        pytest.fail("invalid source sent upstream")
    with client.app.state.session_factory() as session, httpx.Client(transport=httpx.MockTransport(handler)) as upstream:
        result = import_sources(session, settings, [SOURCE], apply=True, client=upstream, fetcher=lambda _: b"<html/>")
        assert result[0]["status"] == "pending" and result[0]["external_id"] is None
        assert session.scalar(select(NewsSource)).adapter == "legacy_pending"


def test_raw_sync_includes_english_titles_and_idle_source_health(client, settings):
    settings.aihot_base_url, settings.aihot_admin_password = "http://aihot.test", "test-only"
    stamp = "2026-11-05T01:00:00Z"
    sources = [{"id": ident, "name": "CnEVPost", "enabled": True, "last_fetch_at": stamp, "config": {"feedUrl": f"https://cnevpost.com/{ident}/feed"}, "tags": ["nature:media"], "interval_minutes": 360} for ident in ["industry", "policy"]]
    item = {"id": "english-1", "title": "Nio unveils new service", "url": "https://cnevpost.com/a"}
    def handler(request):
        path = request.url.path
        if path == "/api/auth/password":
            return httpx.Response(303, headers={"location": "/"})
        if path == "/api/admin/me":
            return httpx.Response(200, json={"csrf": "test"})
        if path == "/api/admin/sources":
            return httpx.Response(200, json={"rows": sources})
        for source in sources:
            if path == "/api/admin/sources/" + source["id"]:
                return httpx.Response(200, json={"source": source, "items": [item] if source["id"] == "industry" else []})
        if path == "/api/admin/haoyi/sync":
            return httpx.Response(200, json={"version": 1, "until": stamp, "items": [{**item, "source_id": "industry", "published_at": stamp, "discovered_at": stamp, "updated_at": stamp, "content": "Source feed excerpt", "content_kind": "rss_excerpt"}], "hasMore": False})
        raise AssertionError(path)
    with client.app.state.session_factory() as session, httpx.Client(transport=httpx.MockTransport(handler)) as upstream:
        assert sync_aihot_raw(session, settings, upstream) == 1
        assert sync_aihot_raw(session, settings, upstream) == 0
        assert session.scalar(select(func.count()).select_from(NewsSource)) == 2
        assert session.scalar(select(Article)).title == item["title"]
        assert all(row.last_fetched_at and source_metadata(session, row)["nature"] == "media" for row in session.scalars(select(NewsSource)))
        session.commit()
    headers = auth_headers(user="xu", roles="hq_admin")
    assert client.get("/api/v1/intelligence/articles", headers=headers).json()["items"][0]["source_nature"] == "media"
    assert all(row["nature"] == "media" for row in client.get("/api/v1/intelligence/sources", headers=headers).json() if row["name"] == "CnEVPost")


def test_impostor_name_cannot_replace_official_seed(client):
    with client.app.state.session_factory() as session:
        row = aihot_source(session, "人保财险", "https://example.org/news", "车险理赔", "impostor")
        assert row.id != "picc" and source_metadata(session, row)["nature"] == "unknown"
    assert article_topic("Battery recycling expands", "other") == "三电维修"
    assert article_topic("Insurance claims update", "other") == "车险理赔"


def test_separate_feeds_on_one_official_domain_keep_distinct_identity(client):
    with client.app.state.session_factory() as session:
        first = aihot_source(session, "人保新闻", "https://property.picc.com.cn/news", "保险科技", "picc-news")
        second = aihot_source(session, "人保服务", "https://property.picc.com.cn/service", "车险理赔", "picc-service")
        assert first.id != second.id
        assert first.external_id == "picc-news"
        assert second.external_id == "picc-service"
