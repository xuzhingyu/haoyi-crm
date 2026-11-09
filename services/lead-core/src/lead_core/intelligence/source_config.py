"""Administrator source configuration through AIHOT's authenticated control API."""
from __future__ import annotations

import hashlib
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4

import httpx
import soupsieve
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import select

from lead_core.intelligence.legacy_sources import canonical_url, fetch_feed
from lead_core.intelligence.models import NewsSource
from lead_core.intelligence.source_metadata import save_source_metadata, source_nature

TOPICS = {"新能源售后", "三电维修", "车险理赔", "保险科技", "维修服务网络"}


class SourceDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=200)
    url: str = Field(min_length=8, max_length=2000)
    kind: Literal["rss", "web_list"] = "rss"
    topic: str = "新能源售后"
    interval_minutes: int = Field(default=360, ge=30, le=1440)
    enabled: bool = True
    item_selector: str = Field(default="", max_length=300)
    link_selector: str = Field(default="", max_length=300)
    title_selector: str = Field(default="", max_length=300)
    date_selector: str = Field(default="", max_length=300)
    version: str | None = Field(default=None, max_length=100)

    @field_validator("url")
    @classmethod
    def public_url(cls, value):
        return canonical_url(value)

    @field_validator("topic")
    @classmethod
    def known_topic(cls, value):
        if value not in TOPICS:
            raise ValueError("请选择已有情报分类")
        return value

    @model_validator(mode="after")
    def selectors(self):
        if self.kind == "web_list":
            for value in (self.item_selector, self.link_selector, self.title_selector, self.date_selector):
                if value:
                    try:
                        soupsieve.compile(value)
                    except soupsieve.SelectorSyntaxError as exc:
                        raise ValueError("网页选择器格式无效") from exc
        return self


class SourceConfigError(Exception):
    def __init__(self, message, status=502):
        super().__init__(message)
        self.status = status


@contextmanager
def admin_client(settings):
    if not settings.aihot_base_url or not settings.aihot_admin_password:
        raise SourceConfigError("AIHOT 管理连接尚未配置", 503)
    with httpx.Client(base_url=settings.aihot_base_url.rstrip("/"), timeout=40, follow_redirects=False) as client:
        response = client.post("/api/auth/password", data={"password": settings.aihot_admin_password})
        if response.status_code != 303 or "wrong" in response.headers.get("location", ""):
            raise SourceConfigError("AIHOT 管理连接验证失败")
        response = client.get("/api/admin/me")
        response.raise_for_status()
        client.headers["x-csrf-token"] = response.json()["csrf"]
        yield client


def config_for(draft: SourceDraft, previous: dict | None = None) -> dict:
    # Keep collector-specific date extraction for existing known configurations.
    config = dict(previous or {})
    if draft.kind == "rss":
        config.update(feedUrl=draft.url)
        config.setdefault("summaryIsBody", False)
        config.pop("url", None)
    else:
        config.update(url=draft.url)
        config.setdefault("parseMode", "html")
        config.pop("feedUrl", None)
        for key, value in [("itemSelector", draft.item_selector), ("linkSelector", draft.link_selector),
                           ("titleSelector", draft.title_selector), ("publishedAtSelector", draft.date_selector)]:
            if value:
                config[key] = value
            else:
                config.pop(key, None)
    config.setdefault("publishedAtUtcOffset", "+08:00")
    config.setdefault("_aihot", {"initialBackfillLimit": 100})
    return config


def spec_for(draft: SourceDraft) -> dict:
    nature = source_nature(draft.url)
    return {"id": "haoyi-" + hashlib.sha256(draft.url.encode()).hexdigest()[:24],
            "name": draft.name, "kind": draft.kind, "config": config_for(draft),
            "interval_minutes": draft.interval_minutes, "tier": "T1" if nature == "official" else "T2",
            "participation_mode": "editorial", "tags": ["haoyi-configured", "nature:" + nature, "topic:" + draft.topic],
            "uses": [], "site_fulltext": False, "syndicate_fulltext": False}


def validate_source(draft: SourceDraft, client, fetcher=None, *, config=None) -> dict:
    # DNS is pinned at every hop, public addresses only, response <= 2 MB. AIHOT
    # additionally performs its own guarded fetch on previews and scheduled runs.
    (fetcher or fetch_feed)(draft.url)
    spec = spec_for(draft)
    if config is not None:
        spec["config"] = config
    response = client.post("/api/admin/sources/preview", json=spec)
    response.raise_for_status()
    value = response.json()
    if not isinstance(value.get("count"), int) or value["count"] < 1:
        raise SourceConfigError("没有发现可采集条目，请检查地址和网页列表规则", 422)
    items = []
    for item in (value.get("items") or [])[:5]:
        try:
            url = canonical_url(str(item.get("url", "")))
        except ValueError:
            continue
        items.append({"title": str(item.get("title", ""))[:500], "url": url,
                      "published_at": item.get("publishedAt"), "summary": str(item.get("excerpt", ""))[:500]})
    if not items:
        raise SourceConfigError("条目缺少可用的公开原文地址", 422)
    return {"valid": True, "count": value["count"], "items": items, "nature": source_nature(draft.url),
            "checked_at": datetime.now(UTC).isoformat()}


def read_config(row: NewsSource, client) -> dict:
    source = {}
    if row.external_id:
        response = client.get("/api/admin/sources/" + row.external_id)
        response.raise_for_status()
        source = response.json()["source"]
    config = source.get("config") or {}
    return {"id": row.id, "name": source.get("name", row.name),
            "url": canonical_url(config.get("feedUrl") or config.get("url") or row.url),
            "kind": source.get("kind", "rss" if row.url.endswith("feed") else "web_list"),
            "topic": row.topic, "interval_minutes": source.get("interval_minutes", 360),
            "enabled": source.get("enabled", row.status != "paused"), "version": source.get("updated_at"),
            "item_selector": config.get("itemSelector", ""), "link_selector": config.get("linkSelector", ""),
            "title_selector": config.get("titleSelector", ""), "date_selector": config.get("publishedAtSelector", "")}


def save_config(session, draft: SourceDraft, client, *, row: NewsSource | None = None, fetcher=None) -> dict:
    # Source identity is stable; articles, bookmarks and notes are never moved or deleted.
    duplicate = session.scalar(select(NewsSource).where(NewsSource.url == draft.url,
                               NewsSource.id != row.id if row else True))
    if duplicate:
        raise SourceConfigError("该地址已经配置，请编辑现有信源", 409)
    current = None
    config = config_for(draft)
    if row and row.external_id:
        response = client.get("/api/admin/sources/" + row.external_id)
        response.raise_for_status()
        current = response.json()["source"]
        if not draft.version or draft.version != current["updated_at"]:
            raise SourceConfigError("信源已发生变化，请重新打开后再保存", 409)
        old_config = current.get("config") or {}
        if current["kind"] == draft.kind:
            config = config_for(draft, old_config)
    verification = validate_source(draft, client, fetcher, config=config)
    spec = spec_for(draft)
    spec["config"] = config
    if current is None:
        # Addresses can be edited. An address hash must not permanently occupy
        # the source ID and prevent adding that original address again later.
        spec["id"] = "haoyi-" + uuid4().hex
        response = client.post("/api/admin/sources", json=spec)
        response.raise_for_status()
        payload = response.json()
        if payload.get("duplicate") or payload.get("created") is False:
            raise SourceConfigError("该地址已存在于采集服务，请刷新情报后编辑现有信源", 409)
        current = payload.get("source")
        if not current or not current.get("id"):
            raise SourceConfigError("AIHOT 未返回可识别的信源")
        response = client.get("/api/admin/sources/" + current["id"])
        response.raise_for_status()
        current = response.json()["source"]
        existing = current.get("config") or {}
        if current["kind"] != draft.kind or canonical_url(existing.get("feedUrl") or existing.get("url", "")) != draft.url:
            raise SourceConfigError("上游信源地址冲突，未修改现有配置", 409)
        associated = session.scalar(select(NewsSource).where(NewsSource.external_id == current["id"]))
        if associated and (not row or associated.id != row.id):
            raise SourceConfigError("该地址已经接入，请编辑现有信源", 409)
    tags = [t for t in current.get("tags", []) if not t.startswith(("nature:", "topic:"))]
    patch = {"name": draft.name, "kind": draft.kind, "config": config,
             "interval_minutes": draft.interval_minutes, "enabled": draft.enabled,
             "tags": list(dict.fromkeys(tags + spec["tags"]))}
    response = client.patch("/api/admin/sources/" + current["id"], json={
        "patch": patch, "version": current["updated_at"], "reason": "浩宜信源管理配置"})
    if response.status_code == 409:
        raise SourceConfigError("信源已发生变化，请重新打开后再保存", 409)
    response.raise_for_status()
    if row is None:
        row = NewsSource(id="source-" + uuid4().hex, name=draft.name, url=draft.url, topic=draft.topic)
        session.add(row)
    row.name, row.url, row.topic = draft.name, draft.url, draft.topic
    row.external_id, row.adapter = current["id"], "aihot"
    row.status, row.last_error = ("active" if draft.enabled else "paused"), None
    session.flush()
    save_source_metadata(session, row, {"verification": verification, "interval_minutes": draft.interval_minutes,
                                       "configured_at": datetime.now(UTC).isoformat()})
    return {"id": row.id, "status": row.status, "verification": verification}


def request_collection(session, settings) -> int:
    """Queue real collector work; never resume a locally or remotely paused source."""
    requested = 0
    rows = session.scalars(select(NewsSource).where(NewsSource.adapter == "aihot",
        NewsSource.status.in_(["active", "error"]), NewsSource.external_id.is_not(None))).all()
    if not rows:
        return 0
    with admin_client(settings) as client:
        for row in rows:
            response = client.get("/api/admin/sources/" + row.external_id)
            response.raise_for_status()
            if not response.json()["source"].get("enabled", False):
                continue
            response = client.post("/api/admin/sources/" + row.external_id + "/fetch")
            response.raise_for_status()
            requested += 1
    return requested
