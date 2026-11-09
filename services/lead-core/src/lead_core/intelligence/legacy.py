"""Read-only counters for the separately deployed CRM. No records or identities are read."""
import sqlite3
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path

from lead_core.config import Settings

TABLES = {
    "leads": "repair_shop_leads",
    "followups": "follow_ups",
    "opportunities": "opportunities",
    "franchises": "franchises",
    "training_records": "training_records",
}


def legacy_overview(settings: Settings) -> dict:
    result = {"url": settings.legacy_crm_url, "available": False, "checked_at": datetime.now(UTC), "stats": None, "error": None}
    if not settings.legacy_crm_database_path:
        result["error"] = "原 CRM 只读数据源尚未配置"
        return result
    try:
        uri = Path(settings.legacy_crm_database_path).resolve().as_uri() + "?mode=ro"
        with closing(sqlite3.connect(uri, uri=True, timeout=1)) as connection:
            connection.execute("PRAGMA query_only=ON")
            connection.execute("BEGIN")
            counts = {name: connection.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0] for name, table in TABLES.items()}
            connection.rollback()
        result["stats"], result["available"] = counts, True
    except (sqlite3.Error, OSError, ValueError):
        result["error"] = "原 CRM 数据源暂不可读，请通过原系统入口查看"
    return result
