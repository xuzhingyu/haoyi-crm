from __future__ import annotations

from collections.abc import Iterator

from fastapi import Depends, Request
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from lead_core.company_intelligence import models as company_models  # noqa: F401
from lead_core.intelligence import models as intelligence_models  # noqa: F401
from lead_core.models import Base
from lead_core.security.auth import Principal, get_principal


def build_engine(database_url: str) -> Engine:
    connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
    return create_engine(database_url, connect_args=connect_args, pool_pre_ping=True)


def build_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)


def create_schema(engine: Engine) -> None:
    Base.metadata.create_all(engine)


def apply_rls_context(
    session: Session,
    *,
    org_id: str | None = None,
    is_hq: bool = False,
    is_worker: bool = False,
) -> None:
    if session.get_bind().dialect.name != "postgresql":
        return
    session.execute(
        text("SELECT set_config('app.current_org_id', :value, true)"),
        {"value": org_id or ""},
    )
    session.execute(
        text("SELECT set_config('app.is_hq', :value, true)"),
        {"value": "true" if is_hq else "false"},
    )
    session.execute(
        text("SELECT set_config('app.is_worker', :value, true)"),
        {"value": "true" if is_worker else "false"},
    )


def get_session(
    request: Request,
    principal: Principal = Depends(get_principal),
) -> Iterator[Session]:
    factory = request.app.state.session_factory
    with factory() as session:
        apply_rls_context(session, org_id=principal.org_id, is_hq=principal.is_hq)
        yield session
