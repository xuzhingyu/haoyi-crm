"""Read legacy public source settings; verify RSS and optionally import into AIHOT.

Default: preview only. --apply changes only the new AIHOT/source registry, never
legacy articles, favorites, preferences, identities, or the old scheduler.
"""
from __future__ import annotations

import argparse
import hashlib
import http.client
import ipaddress
import json
import socket
import sqlite3
import ssl
import xml.etree.ElementTree as ET
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse

import httpx
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from lead_core.config import Settings
from lead_core.db import apply_rls_context, build_engine, build_session_factory
from lead_core.intelligence.models import NewsSource
from lead_core.intelligence.source_metadata import (
    save_source_metadata,
    source_nature,
)

SECRET_KEYS = {"key", "apikey", "api_key", "token", "access_token", "secret", "password", "sig", "signature"}
TOPICS = {"新能源维修": "新能源售后", "培训技术": "三电维修", "同行布局": "新能源售后", "保险与全损车": "车险理赔", "区域动态": "维修服务网络"}


def canonical_url(value: str) -> str:
    try:
        parsed = urlparse(value.strip())
        if (parsed.scheme not in {"https", "http"} or not parsed.hostname
                or parsed.username or parsed.password or parsed.port not in (None, 443 if parsed.scheme == "https" else 80)
                or any(k.lower() in SECRET_KEYS for k, _ in parse_qsl(parsed.query))):
            raise ValueError
        host = parsed.hostname.encode("idna").decode().lower()
        if host in {"localhost", "metadata.google.internal"} or "." not in host:
            raise ValueError
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            address = None
        if address is not None and not address.is_global:
            raise ValueError
        return urlunparse((parsed.scheme, host, parsed.path or "/", "", urlencode(sorted(parse_qsl(parsed.query, keep_blank_values=True))), ""))
    except (ValueError, UnicodeError) as error:
        raise ValueError("来源必须是无凭据的公开 HTTP(S) 地址") from error


def read_legacy_sources(database: str) -> tuple[list[dict], dict]:
    """Read only public source fields and aggregate history counts. No owner IDs."""
    uri = Path(database).resolve().as_uri() + "?mode=ro"
    sources: dict[str, dict] = {}
    invalid = 0
    with closing(sqlite3.connect(uri, uri=True, timeout=5)) as connection:
        connection.execute("PRAGMA query_only=ON")
        connection.execute("BEGIN")
        for (payload,) in connection.execute("SELECT payload FROM studio_records WHERE kind='news_source' ORDER BY id"):
            try:
                value = json.loads(payload)
                if not isinstance(value, dict):
                    raise ValueError("来源格式无效")
                url = canonical_url(str(value.get("url", "")))
                item = {"name": str(value["name"])[:100], "url": url,
                        "format": value.get("format", "rss"), "topic": str(value.get("topic", "新能源维修"))[:50],
                        "nature": str(value.get("nature", "待核实")), "enabled": value.get("enabled") is True}
            except (ValueError, KeyError, TypeError):
                invalid += 1
                continue
            if url in sources:
                prior = sources[url]
                # Conflicting per-user settings require a decision, never an implicit resume.
                if prior["enabled"] != item["enabled"]:
                    prior["enabled"] = False
                    prior["review_reason"] = "旧账号启停设置不一致，需核对"
            else:
                sources[url] = item
        counts = {"articles": connection.execute("SELECT count(*) FROM studio_records WHERE kind='article'").fetchone()[0],
                  "favorites": connection.execute("SELECT count(*) FROM studio_records WHERE kind='article' AND json_extract(payload,'$.favorite')=1").fetchone()[0],
                  "news_jobs": connection.execute("SELECT count(*) FROM news_jobs").fetchone()[0],
                  "invalid_sources": invalid}
        connection.rollback()
    return list(sources.values()), counts


def fetch_feed(url: str) -> bytes:
    """Pin public DNS at every redirect; do not fetch credentials or internal hosts."""
    current = canonical_url(url)
    for _ in range(4):
        parsed = urlparse(current)
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        addresses = socket.getaddrinfo(parsed.hostname, port, type=socket.SOCK_STREAM)
        if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
            raise ValueError("来源解析到非公网地址")
        connection = http.client.HTTPConnection(parsed.hostname, port, timeout=15)
        try:
            sock = socket.create_connection((addresses[0][4][0], port), timeout=15)
            connection.sock = sock
            connection.sock = ssl.create_default_context().wrap_socket(sock, server_hostname=parsed.hostname) if parsed.scheme == "https" else sock
            connection.request("GET", parsed.path + ("?" + parsed.query if parsed.query else ""), headers={"User-Agent": "HaoyiSourceVerification/1.0", "Accept-Encoding": "identity"})
            response = connection.getresponse()
            if response.status in (301, 302, 303, 307, 308):
                current = canonical_url(urljoin(current, response.getheader("Location", "")))
                continue
            if response.status != 200:
                raise ValueError(f"来源响应 HTTP {response.status}")
            body = response.read(2_000_001)
            if len(body) > 2_000_000:
                raise ValueError("来源超过 2 MB 上限")
            return body
        finally:
            connection.close()
    raise ValueError("来源重定向过多")


def verify_feed(source: dict, fetcher=fetch_feed) -> dict:
    if not source["enabled"]:
        return {"valid": False, "reason": source.get("review_reason", "旧来源已停用"), "status": "paused"}
    if source["format"] != "rss":
        return {"valid": False, "reason": "旧网页来源需单独配置列表规则", "status": "pending"}
    try:
        body = fetcher(source["url"])
        if b"<!DOCTYPE" in body.upper() or b"<!ENTITY" in body.upper():
            raise ValueError("RSS 不允许 DTD 或外部实体")
        root = ET.fromstring(body)
        if root.tag.split("}")[-1] not in {"rss", "feed", "RDF"}:
            raise ValueError("地址未返回 RSS 或 Atom")
        count = 0
        for entry in root.iter():
            if entry.tag.split("}")[-1] not in {"item", "entry"}:
                continue
            title, link = "", ""
            for child in entry:
                key = child.tag.split("}")[-1]
                if key == "title":
                    title = "".join(child.itertext()).strip()
                elif key == "link" and child.attrib.get("rel", "alternate") == "alternate":
                    link = child.attrib.get("href") or "".join(child.itertext()).strip()
            if title and link:
                try:
                    canonical_url(urljoin(source["url"], link))
                    count += 1
                except ValueError:
                    continue
        if count == 0:
            raise ValueError("RSS 未发现带标题和公开原文地址的条目")
        return {"valid": True, "items": count, "status": "active", "verified_at": datetime.now(UTC).isoformat()}
    except (OSError, ValueError, ET.ParseError, http.client.HTTPException) as error:
        reason = str(error) if isinstance(error, ValueError) else type(error).__name__
        return {"valid": False, "reason": reason[:180], "status": "pending"}


def source_spec(source: dict) -> dict:
    url = canonical_url(source["url"])
    nature = source_nature(url, source.get("nature"))
    tag = nature
    return {"id": "legacy-rss-" + hashlib.sha256(url.encode()).hexdigest()[:24],
            "name": source["name"], "kind": "rss", "config": {"feedUrl": url, "summaryIsBody": False,
                "publishedAtUtcOffset": "+08:00", "_aihot": {"initialBackfillLimit": 30}},
            "tier": "T1" if nature == "official" else "T2", "first_party": nature == "official",
            "participation_mode": "editorial", "interval_minutes": 360,
            "tags": ["haoyi-legacy-import", "nature:" + tag, "topic:" + TOPICS.get(source["topic"], source["topic"])],
            "uses": [], "site_fulltext": False, "syndicate_fulltext": False}


def import_sources(session: Session, settings: Settings, sources: list[dict], *, apply=False,
                   client: httpx.Client | None = None, fetcher=fetch_feed) -> list[dict]:
    plans = [{"source": source, "verification": verify_feed(source, fetcher)} for source in sources]
    if not apply:
        return [{"name": p["source"]["name"], "url": p["source"]["url"], "nature": source_nature(p["source"]["url"], p["source"].get("nature")), **p["verification"]} for p in plans]
    if not client or not settings.aihot_base_url or not settings.aihot_admin_password:
        raise ValueError("AIHOT 管理连接尚未配置")
    base = settings.aihot_base_url.rstrip("/")
    login = client.post(base + "/api/auth/password", data={"password": settings.aihot_admin_password}, follow_redirects=False)
    if login.status_code != 303 or "wrong" in login.headers.get("location", ""):
        raise ValueError("AIHOT 管理会话未建立")
    me = client.get(base + "/api/admin/me")
    me.raise_for_status()
    headers = {"x-csrf-token": me.json()["csrf"]}
    results = []
    for plan in plans:
        source, verification = plan["source"], plan["verification"]
        spec = source_spec(source)
        row = session.get(NewsSource, spec["id"])
        remote = None
        if verification["valid"]:
            result = client.post(base + "/api/admin/sources", headers=headers, json=spec)
            result.raise_for_status()
            payload = result.json()
            remote = payload.get("source") or payload.get("duplicate")
            if not remote or not remote.get("id"):
                raise ValueError("AIHOT 未返回可识别的来源")
            detail = client.get(base + "/api/admin/sources/" + remote["id"])
            detail.raise_for_status()
            remote = detail.json()["source"]
            existing_url = canonical_url((remote.get("config") or {}).get("feedUrl", ""))
            if remote.get("kind") != "rss" or existing_url != source["url"]:
                raise ValueError("AIHOT 来源地址不一致，未覆盖已有配置")
            # Preserve upstream enabled/paused state and collection rules on reimport.
            patch = {"interval_minutes": 360, "tags": sorted(set(remote.get("tags", [])) | set(spec["tags"]))}
            updated = client.patch(base + "/api/admin/sources/" + remote["id"], headers=headers,
                                   json={"patch": patch, "version": remote["updated_at"], "reason": "旧工作台公开信源接续，统一六小时采集"})
            updated.raise_for_status()
            remote = updated.json().get("source", updated.json())
            row = session.scalar(select(NewsSource).where(NewsSource.external_id == remote["id"])) or row
        if row is None:
            row = NewsSource(id=spec["id"], name=source["name"], url=source["url"], topic=TOPICS.get(source["topic"], source["topic"]))
            session.add(row)
            session.flush()
        if remote:
            row.external_id, row.adapter = remote["id"], "aihot"
            row.status = "active" if remote.get("enabled", True) else "paused"
            row.last_error = None
        elif row.adapter != "aihot":
            row.adapter, row.status = "legacy_pending", verification["status"]
            row.last_error = verification["reason"]
        save_source_metadata(session, row, {"nature": source_nature(source["url"], source.get("nature")),
            "legacy_nature": source.get("nature"), "legacy_url": source["url"], "legacy_format": source["format"],
            "legacy_topic": source["topic"], "verification": verification, "interval_minutes": 360,
            "legacy_history": "retained_in_original_database"})
        session.flush()
        results.append({"name": row.name, "url": row.url, "status": row.status, "nature": source_nature(row.url, source.get("nature")), "external_id": row.external_id, "verification": verification})
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Import verified sources into the new stack; default is read-only preview")
    args = parser.parse_args()
    settings = Settings()
    if not settings.legacy_crm_database_path:
        raise ValueError("旧 CRM 只读数据库路径尚未配置")
    sources, counts = read_legacy_sources(settings.legacy_crm_database_path)
    engine = build_engine(settings.database_url)
    try:
        with build_session_factory(engine)() as session, httpx.Client(timeout=30) as client:
            apply_rls_context(session, is_worker=True)
            results = import_sources(session, settings, sources, apply=args.apply, client=client)
            if args.apply:
                session.commit()
            print(json.dumps({"mode": "applied" if args.apply else "preview", "legacy_history_counts": counts, "sources": results}, ensure_ascii=False))
    finally:
        engine.dispose()


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, sqlite3.Error, httpx.HTTPError, SQLAlchemyError):
        raise SystemExit("信源导入未完成；未修改旧数据库。请核对连接、来源状态和新栈配置。") from None
