import os

import pytest
from sqlalchemy import create_engine, inspect, text


@pytest.mark.skipif(not os.getenv("POSTGRES_TEST_URL"), reason="set POSTGRES_TEST_URL to exercise PostgreSQL migrations")
def test_alembic_upgrade_and_downgrade_on_postgres():
    from alembic import command
    from alembic.config import Config
    from pathlib import Path

    url = os.environ["POSTGRES_TEST_URL"]
    root = Path(__file__).resolve().parents[1]
    config = Config(str(root / "alembic.ini"))
    config.set_main_option("script_location", str(root / "alembic"))
    config.set_main_option("sqlalchemy.url", url)
    command.upgrade(config, "head")
    engine = create_engine(url)
    assert "lead_batches" in inspect(engine).get_table_names()
    command.downgrade(config, "base")



def test_alembic_upgrade_creates_domain_tables_on_sqlite(tmp_path, monkeypatch):
    monkeypatch.setenv("RUN_MIGRATIONS", "1")
    from app.database import apply_schema
    from app.main import create_app
    from fastapi.testclient import TestClient

    database_url = f"sqlite:///{tmp_path / 'migrated.db'}"
    engine = create_engine(database_url)
    apply_schema(engine, database_url)
    tables = set(inspect(engine).get_table_names())
    assert {"users", "lead_batches", "batch_rows", "territory_authorizations", "action_items", "delivery_items", "monthly_snapshots", "entity_events", "notifications", "user_preferences"} <= tables

    with TestClient(create_app(database_url=database_url)) as client:
        assert client.get("/api/health").status_code == 200
        assert client.get("/api/auth/me").json()["username"] == "lin"


def test_create_all_upgrades_legacy_sqlite_copy(tmp_path):
    from app.database import apply_schema
    from app.models import RepairShopLead

    database_url = f"sqlite:///{tmp_path / 'legacy.db'}"
    engine = create_engine(database_url)
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE repair_shop_leads (id INTEGER PRIMARY KEY, shop_name VARCHAR(200), source VARCHAR(100))"))
        connection.execute(text("CREATE TABLE opportunities (id INTEGER PRIMARY KEY, lead_id INTEGER, stage VARCHAR(40), estimated_value INTEGER)"))
    apply_schema(engine, database_url)
    tables = set(inspect(engine).get_table_names())
    assert "users" in tables
    assert "lead_batches" in tables
    assert inspect(engine).has_table(RepairShopLead.__tablename__)
    opportunity_columns = {column["name"] for column in inspect(engine).get_columns("opportunities")}
    assert "opportunity_type" in opportunity_columns
    assert "next_action" in opportunity_columns
