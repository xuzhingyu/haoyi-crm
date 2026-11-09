import os
from contextlib import nullcontext
from collections.abc import Generator
from pathlib import Path

from sqlalchemy import Engine, Connection, inspect, text, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    pass


def build_engine(database_url: str) -> Engine:
    connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
    return create_engine(database_url, connect_args=connect_args)


def build_session_factory(database_url: str) -> tuple[Engine, sessionmaker[Session]]:
    engine = build_engine(database_url)
    return engine, sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def session_scope(session_factory: sessionmaker[Session]) -> Generator[Session, None, None]:
    session = session_factory()
    try:
        yield session
    finally:
        session.close()


def _column_default_sql(column) -> str:
    default = column.default
    if default is None or not getattr(default, "is_scalar", False):
        return ""
    value = default.arg
    if isinstance(value, str):
        return f" DEFAULT '{value.replace(chr(39), chr(39)+chr(39))}'"
    if isinstance(value, bool):
        return f" DEFAULT {int(value)}"
    if value is None:
        return ""
    return f" DEFAULT {value}"


def ensure_schema_columns(engine: Engine) -> None:
    """Add columns that create_all will not patch onto already-created tables."""
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    dialect = engine.dialect
    with (nullcontext(engine) if isinstance(engine, Connection) else engine.begin()) as connection:
        for table in Base.metadata.sorted_tables:
            if table.name not in existing_tables:
                continue
            existing_columns = {column["name"] for column in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in existing_columns:
                    continue
                type_sql = column.type.compile(dialect=dialect)
                connection.execute(
                    text(f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {type_sql}{_column_default_sql(column)}')
                )


def apply_schema(engine: Engine, database_url: str) -> None:
    if os.getenv("RUN_MIGRATIONS") == "1":
        from alembic import command
        from alembic.config import Config

        root = Path(__file__).resolve().parents[1]
        config = Config(str(root / "alembic.ini"))
        config.set_main_option("script_location", str(root / "alembic"))
        config.set_main_option("sqlalchemy.url", database_url)
        command.upgrade(config, "head")
        ensure_schema_columns(engine)
        return
    Base.metadata.create_all(engine)
    ensure_schema_columns(engine)
