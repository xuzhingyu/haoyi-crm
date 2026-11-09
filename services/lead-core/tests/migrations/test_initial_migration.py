from pathlib import Path

from alembic.config import Config
from sqlalchemy import create_engine, inspect

from alembic import command


def test_initial_migration_creates_authoritative_tables(tmp_path) -> None:
    project_root = Path(__file__).parents[2]
    config = Config(str(project_root / "alembic.ini"))
    database_path = tmp_path / "migration.db"
    config.set_main_option("sqlalchemy.url", f"sqlite+pysqlite:///{database_path}")

    command.upgrade(config, "head")

    tables = set(inspect(create_engine(f"sqlite+pysqlite:///{database_path}")).get_table_names())
    assert {
        "alembic_version",
        "repair_businesses",
        "lead_listings",
        "claims",
        "interactions",
        "opportunities",
        "contact_preferences",
        "audit_events",
        "outbox_events",
        "twenty_mirrors",
    } <= tables
