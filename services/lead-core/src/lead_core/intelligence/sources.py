"""Public institutional sources. No login, private networks or arbitrary URL fetching."""
from __future__ import annotations

import hashlib
import json
import re
from datetime import UTC, datetime, timedelta
from urllib.parse import urljoin, urlparse, urlunparse
from zoneinfo import ZoneInfo

import httpx
from bs4 import BeautifulSoup
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from lead_core.config import Settings
from lead_core.intelligence.models import Article, IntegrationCursor, NewsSource
from lead_core.intelligence.source_metadata import save_source_metadata, upstream_metadata

SOURCE_SEEDS = [
    ("picc", "人保财险", "https://property.picc.com.cn/cx_gywm/zxzx/xwsd/", "保险科技", "active"),
    ("pingan", "中国平安", "https://www.pingan.cn/zh/common/pinganxinwen_zh.shtml", "保险科技", "active"),
    ("cpic", "中国太保", "https://m.cpic.com.cn/aboutUs/gsdt/rdxw/index.shtml", "车险理赔", "active"),
    ("nfra", "国家金融监督管理总局", "https://www.nfra.gov.cn/cn/view/pages/zhengwuxinxi/zhengfuxinxi.html?signIndex=4", "车险理赔", "pending"),
    ("miit", "工信部节能与综合利用司", "https://www.miit.gov.cn/jgsj/jns/zhlyh/index.html", "三电维修", "pending"),
    ("samr", "市场监管总局召回信息", "https://www.samr.gov.cn/zw/zh/index.html", "新能源售后", "pending"),
    ("jiangsu-transport", "江苏省交通运输厅", "https://jtyst.jiangsu.gov.cn/col/col74669/index.html", "维修服务网络", "pending"),
    ("iachina", "中国保险行业协会", "https://www.iachina.cn/col/col24/index.html", "车险理赔", "pending"),
    ("szara", "深圳市汽车维修行业协会", "https://szara.org.cn/", "维修服务网络", "pending"),
]


def ensure_sources(session: Session) -> None:
    for ident, name, url, topic, status in SOURCE_SEEDS:
        if session.get(NewsSource, ident) is None:
            session.add(NewsSource(id=ident, name=name, url=url, topic=topic, status=status))
    session.flush()


def parse_date(value: str) -> datetime | None:
    if "T" in value:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=ZoneInfo("Asia/Shanghai"))
        except ValueError:
            pass
    match = re.search(r"(20\d{2})[-年/.]([01]?\d)[-月/.]([0-3]?\d)", value)
    if match:
        try:
            return datetime(*map(int, match.groups()), tzinfo=ZoneInfo("Asia/Shanghai"))
        except ValueError:
            return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None
    except ValueError:
        return None


def public_link(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme in {"https", "http"} and bool(parsed.hostname) and not parsed.username and not parsed.password


def article_topic(title: str, default: str) -> str:
    lower = title.lower()
    for pattern, topic in [(r"\b(battery|bms|high.voltage|recycling)\b", "三电维修"),
                           (r"\b(insurance|claim|underwriting)\b", "车险理赔"),
                           (r"\b(repair|aftermarket|workshop)\b", "维修服务网络"),
                           (r"\b(ev|electric vehicle|charging|recall)\b", "新能源售后")]:
        if re.search(pattern, lower):
            return topic
    for words, topic in [
        (("三电", "电池", "高压", "回收"), "三电维修"),
        (("新能源", "充电", "智能汽车", "召回"), "新能源售后"),
        (("理赔", "车险", "定损"), "车险理赔"),
        (("维修", "门店", "技师", "服务网络"), "维修服务网络"),
    ]:
        if any(word in title for word in words):
            return topic
    return default


def parse_listing(html: str, source: NewsSource) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()
    records, seen = [], set()
    host = urlparse(source.url).hostname
    for anchor in soup.select("a[href]"):
        title_node = anchor.select_one("h3.tit, .title, h3")
        title = (anchor.get("title") or (title_node.get_text(" ", strip=True) if title_node else anchor.get_text(" ", strip=True))).strip()
        title = re.sub(r"\s+", " ", title)
        if not 12 <= len(title) <= 350 or not re.search(r"[\u4e00-\u9fff]", title):
            continue
        href = str(anchor.get("href", ""))
        url = urljoin(source.url, href)
        parsed = urlparse(url)
        if parsed.scheme not in {"https", "http"} or parsed.hostname != host:
            continue
        if parsed.path.endswith(("/", "index.html", "index.shtml")) or parsed.fragment:
            continue
        url = urlunparse(parsed._replace(fragment=""))
        if url in seen or url == source.url:
            continue
        container = anchor if title_node else anchor.find_parent("li") or anchor.parent
        parent_text = container.get_text(" ", strip=True) if container else title
        if len(parent_text) < len(title) + 8 and anchor.parent and anchor.parent.parent:
            parent_text = anchor.parent.parent.get_text(" ", strip=True)
        dated = container.select_one("[data-publishtime]") if container else None
        date = parse_date(str(dated.get("data-publishtime", ""))) if dated else None
        date = date or parse_date(parent_text[:1200]) or parse_date(url)
        # A dated article path or a dated list row distinguishes news from navigation.
        if date is None and not re.search(r"(?:/t\d{8}|/\d{4}/|/article/|/news/|/\d{6,})", parsed.path):
            continue
        seen.add(url)
        abstract = container.select_one(".list-content, .abstract") if container else None
        summary = abstract.get_text(" ", strip=True)[:600] if abstract else "原文索引，点击来源查看完整内容。"
        records.append({"title": title, "url": url, "published_at": date, "summary": summary, "topic": article_topic(title, source.topic)})
        if len(records) >= 35:
            break
    return records


def upsert_article(session: Session, source: NewsSource, item: dict) -> bool:
    url = str(item.get("url", ""))
    if not public_link(url) or not item.get("title"):
        return False
    digest = hashlib.sha256(url.encode()).hexdigest()
    by_url = session.scalar(select(Article).where(Article.url_hash == digest))
    by_upstream = session.scalar(select(Article).where(Article.upstream_id == item["upstream_id"])) if item.get("upstream_id") else None
    if by_url is not None and by_upstream is not None and by_url.id != by_upstream.id:
        raise ValueError("上游原文地址与另一条已收藏记录冲突，需核对后合并")
    row = by_upstream or by_url
    created = row is None
    if row is None:
        row = Article(source_id=source.id, title=item["title"][:500], url=url, url_hash=digest)
        session.add(row)
    # A resync updates source material without replacing CRM IDs or personal state.
    row.title = item["title"][:500]
    row.url, row.url_hash = url, digest
    row.topic = item.get("topic") or source.topic
    if "published_at" in item:
        row.published_at = item["published_at"]
    if created:
        row.fetched_at = item.get("fetched_at") or datetime.now(UTC)
    if item.get("summary"):
        row.summary = str(item["summary"])[:1800]
    if item.get("upstream_id"):
        row.upstream_id = item["upstream_id"]
    if "content" in item:
        row.content = str(item.get("content") or "")[:4000]
        row.content_kind = item.get("content_kind", "source_excerpt") if row.content else "index_only"
        row.snapshot_hash = hashlib.sha256(json.dumps({key: item.get(key) for key in ("title", "url", "summary", "content", "content_kind")}, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    if item.get("upstream_updated_at"):
        row.upstream_updated_at = item["upstream_updated_at"]
    if item.get("withdrawn"):
        row.analysis_status = "source_removed"
    elif row.analysis_status == "source_removed":
        row.analysis_status = "not_started"
    session.flush()
    return created


def aihot_source(session: Session, name: str, url: str, topic: str, external_id: str | None = None) -> NewsSource:
    host = urlparse(url).hostname
    match = next((seed for seed in SOURCE_SEEDS if urlparse(seed[2]).hostname == host), None)
    sid = match[0] if match else "aihot-" + hashlib.sha256((external_id or name).encode()).hexdigest()[:20]
    seed_source = session.get(NewsSource, sid)
    if external_id and seed_source and seed_source.external_id not in {None, external_id}:
        # Different feeds on one official domain remain separate registered sources.
        sid = "aihot-" + hashlib.sha256(external_id.encode()).hexdigest()[:20]
    source = (session.scalar(select(NewsSource).where(NewsSource.external_id == external_id)) if external_id else None) or session.get(NewsSource, sid)
    if source is None:
        use_seed = match and sid == match[0]
        source = NewsSource(id=sid, name=match[1] if use_seed else name, url=match[2] if use_seed else url, topic=topic, adapter="aihot", status="active")
        session.add(source)
        session.flush()
    source.adapter = "aihot"
    if external_id:
        source.external_id = external_id
    return source


def crawl_source(session: Session, source: NewsSource, client: httpx.Client) -> int:
    if source.status in {"paused", "pending"}:
        return 0
    try:
        # Fixed, administrator-approved seeds; redirects cannot move to another host.
        current = source.url
        for _ in range(4):
            response = client.get(current, follow_redirects=False)
            if response.is_redirect:
                target = urljoin(current, response.headers.get("location", ""))
                if urlparse(target).hostname != urlparse(source.url).hostname:
                    raise ValueError("跨域重定向需人工核对")
                current = target
                continue
            response.raise_for_status()
            break
        else:
            raise ValueError("来源重定向过多")
        if len(response.content) > 5_000_000:
            raise ValueError("来源页面超过读取上限")
        if "charset=" not in response.headers.get("content-type", "").lower():
            encoding = re.search(br'charset=["\s]*([\w-]+)', response.content[:4096], re.I)
            response.encoding = encoding.group(1).decode() if encoding else "utf-8"
        records = parse_listing(response.text, source)
        if not records:
            raise ValueError("未发现可识别的新闻列表，待核对来源结构")
        count = sum(upsert_article(session, source, item) for item in records)
        source.status, source.last_error = "active", None
        source.last_fetched_at = datetime.now(UTC)
        return count
    except (httpx.HTTPError, ValueError, LookupError) as exc:
        source.status = "error"
        source.last_error = f"采集未完成：{type(exc).__name__}" if isinstance(exc, httpx.HTTPError) else str(exc)[:200]
        return 0


def sync_aihot(session: Session, settings: Settings, client: httpx.Client) -> int:
    if not settings.aihot_base_url:
        return 0
    if session.get_bind().dialect.name == "postgresql":
        # A manual refresh and the scheduler share a transaction-scoped lease. The
        # existing sync finishes normally; a second request must not overwrite its cursor.
        locked = session.scalar(text("SELECT pg_try_advisory_xact_lock(hashtext('haoyi.aihot.sync'))"))
        if not locked:
            return 0
    if settings.aihot_admin_password:
        return sync_aihot_raw(session, settings, client)
    cursor = session.get(IntegrationCursor, "aihot")
    if cursor is None:
        cursor = IntegrationCursor(name="aihot", value="")
        session.add(cursor)
        session.flush()
    count, new_cursor, page = 0, cursor.value, None
    try:
        snapshot = not bool(cursor.value)
        for _ in range(100):
            endpoint = "snapshot" if snapshot else "changes"
            params = {"limit": 200, "fields": "default"}
            if snapshot and page:
                params["page"] = page
            if not snapshot:
                params["cursor"] = new_cursor
            response = client.get(f"{settings.aihot_base_url.rstrip('/')}/api/v1/selected/{endpoint}", params=params)
            if response.status_code == 304:
                cursor.last_success_at, cursor.last_error = datetime.now(UTC), None
                return count
            response.raise_for_status()
            payload = response.json()
            if snapshot:
                if not new_cursor:
                    new_cursor = payload["cursor"]
                items = payload["items"]
            else:
                new_cursor = payload["cursor"]
                items = [c["item"] for c in payload["changes"] if c.get("op") == "upsert"]
                for change in payload["changes"]:
                    if change.get("op") == "remove":
                        old = session.scalar(select(Article).where(Article.upstream_id == change["id"]))
                        if old:
                            old.analysis_status = "source_removed"
            for item in items:
                original = item.get("links", {}).get("original", "")
                source_name = item.get("source", {}).get("name", "AIHOT 来源")
                source = aihot_source(session, source_name, original, item.get("category") or "保险科技")
                if source.status == "paused":
                    continue
                discovered = parse_date(item.get("discoveredAt") or "")
                count += upsert_article(session, source, {"url": original, "title": item["title"], "summary": item.get("summary"), "topic": item.get("category"), "published_at": parse_date(item.get("publishedAt") or ""), "fetched_at": discovered, "upstream_id": item["id"]})
                source.last_fetched_at = discovered
            if not payload.get("hasMore"):
                cursor.value = new_cursor
                cursor.last_success_at, cursor.last_error = datetime.now(UTC), None
                return count
            page = payload.get("nextPage")
        raise ValueError("同步分页尚未完成，保留旧游标以便重试")
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        cursor.last_error = f"AIHOT 同步未完成：{type(exc).__name__}"
        return count


def sync_aihot_raw(session: Session, settings: Settings, client: httpx.Client) -> int:
    """Resumable complete metadata snapshot, then watermarked incremental updates.

    Daily full reconciliation repairs any updates whose upstream transaction committed
    after its timestamp watermark. Only excerpts are mirrored, never claimed as full text.
    """
    cursor = session.get(IntegrationCursor, "aihot")
    if cursor is None:
        cursor = IntegrationCursor(name="aihot", value="")
        session.add(cursor)
        session.flush()
    base = settings.aihot_base_url.rstrip("/")
    count = 0
    try:
        response = client.post(base + "/api/auth/password", data={"password": settings.aihot_admin_password, "return": "/api/admin/me"}, follow_redirects=False)
        if response.status_code != 303 or "wrong" in response.headers.get("location", ""):
            raise ValueError("AIHOT 管理会话未建立")
        me = client.get(base + "/api/admin/me")
        me.raise_for_status()
        source_meta = {}
        for page in range(1, 101):
            upstream = client.get(base + "/api/admin/sources", params={"page": page})
            upstream.raise_for_status()
            batch = upstream.json()["rows"]
            for remote in batch:
                detail = client.get(base + "/api/admin/sources/" + remote["id"])
                detail.raise_for_status()
                remote = detail.json()["source"]
                public_meta = upstream_metadata(remote)
                source_url = public_meta["source_url"]
                if not source_url or not public_link(source_url):
                    continue
                source = aihot_source(session, remote["name"], source_url, public_meta.get("topic") or "新能源售后", remote["id"])
                source.url = source_url
                source.last_fetched_at = parse_date(remote.get("last_fetch_at") or "")
                source.last_error = "AIHOT 上游采集异常，请检查来源" if remote.get("last_error") else None
                source.status = "paused" if remote.get("enabled") is False else "error" if source.last_error else "active"
                save_source_metadata(session, source, {**public_meta, "metadata_window": "complete_snapshot_incremental", "content_scope": "source_excerpt"})
                source_meta[remote["id"]] = source
            if len(batch) < 100:
                break
        else:
            raise ValueError("AIHOT 来源分页尚未完成")
        try:
            state = json.loads(cursor.value) if cursor.value.startswith("{") else {}
        except ValueError:
            state = {}
        now = datetime.now(UTC)
        last_snapshot = parse_date(state.get("last_snapshot_at") or "")
        if not state.get("in_progress"):
            full = not state.get("watermark") or not last_snapshot or now - last_snapshot > timedelta(days=1)
            state = {"mode": "snapshot" if full else "changes", "in_progress": True,
                     "last_snapshot_at": state.get("last_snapshot_at"),
                     "since": None if full else (parse_date(state["watermark"]) - timedelta(minutes=5)).isoformat()}
        for _ in range(100):
            params = {"limit": 200}
            for key in ("since", "until", "after"):
                if state.get(key):
                    params[key] = state[key]
            response = client.get(base + "/api/admin/haoyi/sync", params=params)
            if response.status_code == 404:
                raise ValueError("AIHOT 完整同步接口尚未部署，未退回有限关键词窗口")
            response.raise_for_status()
            payload = response.json()
            if payload.get("version") != 1 or not parse_date(payload.get("until", "")):
                raise ValueError("AIHOT 同步响应格式不兼容")
            if state.get("until") and state["until"] != payload["until"]:
                raise ValueError("AIHOT 同步水位发生变化")
            state["until"] = payload["until"]
            for item in payload["items"]:
                source = source_meta.get(item["source_id"])
                if source is None:
                    raise ValueError("同步内容的来源不在已核验注册表中")
                count += upsert_article(session, source, {
                    "title": item["title"], "url": item["url"], "upstream_id": item["id"],
                    "published_at": parse_date(item.get("published_at") or ""),
                    "fetched_at": parse_date(item.get("discovered_at") or ""),
                    "summary": item.get("summary") or "原文索引，点击来源查看完整内容。",
                    "content": item.get("content") or "", "content_kind": item.get("content_kind") or "source_excerpt",
                    "upstream_updated_at": parse_date(item.get("updated_at") or ""),
                    "withdrawn": item.get("visibility") == "withdrawn",
                    "topic": article_topic(item["title"], source.topic)})
            if payload.get("hasMore"):
                after = payload.get("nextAfter")
                if not after or after == state.get("after"):
                    raise ValueError("AIHOT 分页游标没有推进")
                state["after"] = after
                cursor.value = json.dumps(state, sort_keys=True)
                session.flush()
            else:
                state = {"mode": "raw_snapshot_incremental", "watermark": state["until"],
                         "last_snapshot_at": state["until"] if state["mode"] == "snapshot" else state.get("last_snapshot_at")}
                cursor.value = json.dumps(state, sort_keys=True)
                cursor.last_success_at, cursor.last_error = now, None
                return count
        raise ValueError("同步分页尚未完成，将从已保存的分页游标继续")
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        cursor.last_error = str(exc)[:200] if isinstance(exc, ValueError) else f"AIHOT 采集同步未完成：{type(exc).__name__}"
        return count


def refresh_sources(session: Session, settings: Settings) -> dict:
    ensure_sources(session)
    with httpx.Client(timeout=20, headers={"User-Agent": "HaoyiWorkbench/1.0 (institutional-news-index)"}) as client:
        imported = sync_aihot(session, settings, client)
        direct = 0
        if not settings.aihot_base_url:
            for source in session.scalars(select(NewsSource).where(NewsSource.adapter == "direct_html")).all():
                direct += crawl_source(session, source, client)
        session.commit()
    return {"imported": imported, "direct_html_added": direct}


def set_aihot_source_status(settings: Settings, source: NewsSource, status: str):
    if not source.external_id or not settings.aihot_admin_password:
        raise ValueError("上游来源配置缺失")
    base = settings.aihot_base_url.rstrip("/")
    with httpx.Client(timeout=20) as client:
        client.post(base + "/api/auth/password", data={"password": settings.aihot_admin_password}, follow_redirects=False)
        me = client.get(base + "/api/admin/me")
        me.raise_for_status()
        detail = client.get(base + "/api/admin/sources/" + source.external_id)
        detail.raise_for_status()
        row = detail.json()["source"]
        response = client.patch(base + "/api/admin/sources/" + source.external_id, headers={"x-csrf-token": me.json()["csrf"]}, json={"patch": {"enabled": status == "active"}, "version": row["updated_at"], "reason": "浩宜工作台管理员调整"})
        response.raise_for_status()
