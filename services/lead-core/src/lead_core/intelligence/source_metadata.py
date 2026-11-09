"""Public provenance retained in the existing integration registry; no new DB columns."""
import hashlib
import json
from urllib.parse import urlparse

from sqlalchemy.orm import Session

from lead_core.intelligence.models import IntegrationCursor, NewsSource

OFFICIAL_HOSTS = {
    "property.picc.com.cn", "www.pingan.cn", "m.cpic.com.cn", "www.nfra.gov.cn",
    "www.miit.gov.cn", "www.samr.gov.cn", "jtyst.jiangsu.gov.cn",
    "www.iachina.cn", "szara.org.cn",
}
KNOWN_NATURES = {"auto.gasgoo.com": "行业", "cnevpost.com": "媒体"}
TAG_NATURES = {"official": "官方", "industry": "行业", "media": "媒体", "peer": "同行宣传", "unknown": "待核实"}
NATURE_CODES = {label: code for code, label in TAG_NATURES.items()}


def source_nature(url: str, declared: str | None = None) -> str:
    host = urlparse(url).hostname
    if host in KNOWN_NATURES:
        return NATURE_CODES[KNOWN_NATURES[host]]
    if host in OFFICIAL_HOSTS:
        return "official"
    declared = TAG_NATURES.get(declared, declared)
    return NATURE_CODES[declared] if declared in {"行业", "媒体", "同行宣传"} else "unknown"


def metadata_key(source_id: str) -> str:
    return "source-meta:" + hashlib.sha256(source_id.encode()).hexdigest()[:32]


def source_metadata(session: Session, source: NewsSource) -> dict:
    row = session.get(IntegrationCursor, metadata_key(source.id))
    try:
        value = json.loads(row.value) if row else {}
        if not isinstance(value, dict):
            value = {}
    except (ValueError, TypeError):
        value = {}
    # A legacy user-selected label or upstream tier alone never proves official status.
    value["nature"] = source_nature(source.url, value.get("nature"))
    return value


def save_source_metadata(session: Session, source: NewsSource, values: dict) -> None:
    key = metadata_key(source.id)
    row = session.get(IntegrationCursor, key)
    if row is None:
        row = IntegrationCursor(name=key, value="{}")
        session.add(row)
    merged = source_metadata(session, source)
    merged.update(values)
    merged["nature"] = source_nature(source.url, merged.get("nature"))
    row.value = json.dumps(merged, ensure_ascii=False, sort_keys=True)


def upstream_metadata(row: dict) -> dict:
    tags = row.get("tags") or []
    declared = next((TAG_NATURES.get(t.removeprefix("nature:")) for t in tags if isinstance(t, str) and t.startswith("nature:")), None)
    config = row.get("config") or {}
    url = config.get("feedUrl") or config.get("url") or ""
    topic = next((t.removeprefix("topic:") for t in tags if isinstance(t, str) and t.startswith("topic:")), None)
    return {"nature": source_nature(url, declared), "source_url": url,
            "topic": topic, "collector": "aihot", "interval_minutes": row.get("interval_minutes"),
            "legacy_import": "haoyi-legacy-import" in tags}
