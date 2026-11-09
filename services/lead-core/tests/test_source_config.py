import copy

import httpx
import pytest
from conftest import auth_headers
from pydantic import ValidationError
from sqlalchemy import func, select

from lead_core.intelligence.models import NewsSource
from lead_core.intelligence.source_config import (
    SourceConfigError,
    SourceDraft,
    config_for,
    read_config,
    request_collection,
    save_config,
    spec_for,
    validate_source,
)

DRAFT = {"name": "Industry feed", "url": "https://cnevpost.com/industry/feed", "kind": "rss",
         "topic": "新能源售后", "interval_minutes": 360, "enabled": True}
ADMIN = auth_headers(user="admin", roles="hq_admin")


def upstream(*, remote=None, count=2, fail_patch=False):
    stored = copy.deepcopy(remote)
    calls = []

    def handle(request):
        nonlocal stored
        import json
        payload = json.loads(request.content) if request.content else None
        calls.append((request.method, request.url.path, payload))
        if request.url.path.endswith("/preview"):
            return httpx.Response(200, json={"count": count, "items": [
                {"title": "Battery repair update", "url": "https://cnevpost.com/2026/11/06/repair/", "publishedAt": "2026-11-06T01:00:00Z", "excerpt": "Source excerpt"}
            ] if count else []})
        if request.method == "POST":
            if stored:
                return httpx.Response(200, json={"created": False, "duplicate": stored})
            stored = {**payload, "enabled": True, "updated_at": "v1"}
            return httpx.Response(200, json={"created": True, "source": stored})
        if request.method == "GET":
            return httpx.Response(200, json={"source": stored})
        if fail_patch:
            return httpx.Response(409, json={"detail": "do not leak secret"})
        stored = {**stored, **payload["patch"], "updated_at": "v2"}
        return httpx.Response(200, json=stored)
    return httpx.Client(base_url="http://aihot.test", transport=httpx.MockTransport(handle)), calls


@pytest.mark.parametrize("url", ["http://127.0.0.1/", "http://10.0.0.1/", "https://localhost/",
    "https://u:p@example.com/", "https://example.com/feed?token=secret", "file:///x"])
def test_source_configuration_rejects_non_public_and_credential_urls(url):
    with pytest.raises(ValidationError):
        SourceDraft(**{**DRAFT, "url": url})


def test_source_configuration_uses_bounded_fields_and_trusts_no_official_label():
    for extra in [{"interval_minutes": 1}, {"topic": "unregistered"}, {"nature": "official"},
                  {"kind": "web_list", "item_selector": "[broken"}]:
        with pytest.raises(ValidationError):
            SourceDraft(**{**DRAFT, **extra})
    spec = spec_for(SourceDraft(**DRAFT))
    assert spec["tier"] == "T2" and not spec["site_fulltext"]


def test_preview_returns_original_samples_without_mutating_sources():
    remote, calls = upstream()
    result = validate_source(SourceDraft(**DRAFT), remote, lambda _: b"public RSS")
    assert result["valid"] and result["count"] == 2 and result["nature"] == "media"
    assert result["items"][0]["published_at"] == "2026-11-06T01:00:00Z"
    assert len(calls) == 1 and calls[0][1].endswith("/preview")


def test_private_dns_refused_before_aihot_receives_url():
    remote, calls = upstream()
    def blocked(_):
        raise ValueError("来源解析到非公网地址")
    with pytest.raises(ValueError, match="非公网"):
        validate_source(SourceDraft(**DRAFT), remote, blocked)
    assert not calls


def test_empty_source_cannot_be_saved(client):
    remote, calls = upstream(count=0)
    with client.app.state.session_factory() as session:
        with pytest.raises(SourceConfigError, match="没有发现"):
            save_config(session, SourceDraft(**DRAFT), remote, fetcher=lambda _: b"html")
        assert session.scalar(select(func.count()).select_from(NewsSource)) == 0
        assert len(calls) == 1


def test_create_paused_source_and_duplicate_rejection(client):
    remote, calls = upstream()
    with client.app.state.session_factory() as session:
        result = save_config(session, SourceDraft(**{**DRAFT, "enabled": False}), remote, fetcher=lambda _: b"rss")
        assert result["status"] == "paused"
        row = session.get(NewsSource, result["id"])
        assert row.external_id and row.adapter == "aihot"
        assert calls[-1][2]["patch"]["enabled"] is False
        with pytest.raises(SourceConfigError, match="已经配置"):
            save_config(session, SourceDraft(**DRAFT), remote, fetcher=lambda _: b"rss")


def test_edit_requires_current_version_and_preserves_hidden_rules(client):
    draft = SourceDraft(**{**DRAFT, "kind": "web_list", "url": "https://www.pingan.cn/news", "item_selector": "li", "version": "v1"})
    source = {**spec_for(draft), "updated_at": "v1", "enabled": True}
    source["config"].update(publishedAtRegex="date=(.+)", allowUrlPrefixes=[draft.url])
    remote, calls = upstream(remote=source)
    with client.app.state.session_factory() as session:
        row = NewsSource(id="existing", name="old", url=draft.url, topic=draft.topic,
                         adapter="aihot", external_id=source["id"], status="active")
        session.add(row)
        session.flush()
        with pytest.raises(SourceConfigError, match="发生变化"):
            save_config(session, draft.model_copy(update={"version": "stale"}), remote, row=row, fetcher=lambda _: b"html")
        assert len(calls) == 1
        save_config(session, draft, remote, row=row, fetcher=lambda _: b"html")
        config = calls[-1][2]["patch"]["config"]
        assert config["publishedAtRegex"] == "date=(.+)"
        assert config["allowUrlPrefixes"] == [draft.url]
        detail = read_config(row, remote)
        assert detail["version"] == "v2" and "config" not in detail
        assert "publishedAtRegex" not in detail


def test_failed_upstream_edit_leaves_local_source_unchanged(client):
    draft = SourceDraft(**{**DRAFT, "version": "v1"})
    remote, _ = upstream(remote={**spec_for(draft), "updated_at": "v1", "enabled": True}, fail_patch=True)
    with client.app.state.session_factory() as session:
        row = NewsSource(id="existing", name="original", url=draft.url, topic=draft.topic,
                         external_id=spec_for(draft)["id"], adapter="aihot", status="active")
        session.add(row)
        session.flush()
        with pytest.raises(SourceConfigError, match="发生变化"):
            save_config(session, draft, remote, row=row, fetcher=lambda _: b"rss")
        assert row.name == "original"


@pytest.mark.parametrize("roles", ["hq_executive", "hq_franchise_manager", "franchise_member"])
def test_configuration_endpoints_require_admin(client, roles):
    headers = auth_headers(user="reader", roles=roles)
    for method, path, payload in [("POST", "/validate", DRAFT), ("POST", "", DRAFT),
                                  ("GET", "/anything", None), ("PUT", "/anything", DRAFT)]:
        response = client.request(method, "/api/v1/intelligence/source-config" + path, headers=headers, json=payload)
        assert response.status_code == 403


def test_unconfigured_collector_is_explicit_and_has_no_secret_output(client):
    response = client.post("/api/v1/intelligence/source-config/validate", headers=ADMIN, json=DRAFT)
    assert response.status_code == 503 and "尚未配置" in response.json()["detail"]


def test_config_switch_drops_incompatible_address_key():
    assert "url" not in config_for(SourceDraft(**DRAFT), {"url": "old"})


def test_hidden_parser_settings_survive_simple_edits():
    assert config_for(SourceDraft(**DRAFT), {"summaryIsBody": True})["summaryIsBody"] is True
    draft = SourceDraft(**{**DRAFT, "kind": "web_list"})
    assert config_for(draft, {"parseMode": "markdown"})["parseMode"] == "markdown"


def test_existing_upstream_duplicate_is_not_overwritten(client):
    remote, calls = upstream(remote={**spec_for(SourceDraft(**DRAFT)), "updated_at": "v1", "enabled": False})
    with client.app.state.session_factory() as session:
        with pytest.raises(SourceConfigError, match="存在于采集服务"):
            save_config(session, SourceDraft(**DRAFT), remote, fetcher=lambda _: b"rss")
        assert not any(method == "PATCH" for method, _, _ in calls)
        assert session.scalar(select(func.count()).select_from(NewsSource)) == 0


def test_old_address_hash_does_not_block_new_source_after_address_edit(client):
    draft = SourceDraft(**DRAFT)
    original_id = spec_for(draft)["id"]
    remote, calls = upstream()
    with client.app.state.session_factory() as session:
        session.add(NewsSource(id=original_id, name="moved", url="https://cnevpost.com/battery/feed",
                              topic=draft.topic, external_id=original_id, adapter="aihot", status="active"))
        session.flush()
        result = save_config(session, draft, remote, fetcher=lambda _: b"rss")
        assert result["id"] != original_id
        assert next(payload for method, path, payload in calls if method == "POST" and path.endswith("/sources"))["id"] != original_id


def test_manual_collection_queues_only_enabled_sources(client, monkeypatch):
    from contextlib import contextmanager

    from lead_core.intelligence import source_config
    calls = []
    def handle(request):
        calls.append((request.method, request.url.path))
        if request.method == "GET":
            return httpx.Response(200, json={"source": {"enabled": request.url.path.endswith("enabled")}})
        return httpx.Response(200, json={"jobId": "queued"})
    @contextmanager
    def remote(_):
        with httpx.Client(base_url="http://aihot.test", transport=httpx.MockTransport(handle)) as c:
            yield c
    monkeypatch.setattr(source_config, "admin_client", remote)
    with client.app.state.session_factory() as session:
        for sid, status in [("enabled", "active"), ("remote-paused", "active"), ("local-paused", "paused")]:
            session.add(NewsSource(id=sid, name=sid, url="https://example.org/"+sid, topic="新能源售后",
                                  adapter="aihot", external_id=sid, status=status))
        session.flush()
        assert request_collection(session, client.app.state.settings) == 1
    assert ("POST", "/api/admin/sources/enabled/fetch") in calls
    assert not any("local-paused" in path for _, path in calls)
    assert not any(method == "POST" and "remote-paused" in path for method, path in calls)
