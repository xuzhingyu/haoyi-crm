from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from lead_core.api.routes import (
    admin,
    ai_gateway,
    company_intelligence,
    crm_bridge,
    intelligence_engagement,
    leads,
    source_config,
    workspace,
)
from lead_core.api.schemas import HealthRead
from lead_core.config import Settings, get_settings
from lead_core.db import build_engine, build_session_factory, create_schema
from lead_core.ingestion.object_store import S3SnapshotStore
from lead_core.ingestion.service import IngestionService
from lead_core.security.auth import Authenticator
from lead_core.security.sensitive_data import SensitiveTextCipher
from lead_core.services.rate_limit import InMemoryRateLimiter, RedisRateLimiter


def create_app(settings: Settings | None = None) -> FastAPI:
    active_settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        engine = build_engine(active_settings.database_url)
        if active_settings.auto_create_schema:
            create_schema(engine)
        app.state.settings = active_settings
        app.state.engine = engine
        app.state.session_factory = build_session_factory(engine)
        from lead_core.company_intelligence.service import initialize
        from lead_core.db import apply_rls_context
        with app.state.session_factory() as session:
            apply_rls_context(session, is_worker=True)
            initialize(session)
            session.commit()
        app.state.authenticator = Authenticator(active_settings)
        cipher = SensitiveTextCipher(active_settings.sensitive_data_key)
        app.state.cipher = cipher
        if active_settings.environment == "development":
            app.state.claim_rate_limiter = InMemoryRateLimiter(
                active_settings.claim_rate_limit_per_minute
            )
            app.state.source_rate_limiter = InMemoryRateLimiter(60)
        else:
            app.state.claim_rate_limiter = RedisRateLimiter.from_url(
                active_settings.redis_url,
                limit=active_settings.claim_rate_limit_per_minute,
            )
            app.state.source_rate_limiter = RedisRateLimiter.from_url(
                active_settings.redis_url,
                limit=60,
                prefix="lead-core:source-rate",
            )
        snapshot_store = None
        if active_settings.snapshot_store_enabled:
            snapshot_store = S3SnapshotStore(
                endpoint_url=active_settings.snapshot_s3_endpoint,
                region=active_settings.snapshot_s3_region,
                bucket=active_settings.snapshot_s3_bucket,
                access_key=active_settings.snapshot_s3_access_key,
                secret_key=active_settings.snapshot_s3_secret_key,
                cipher=cipher,
            )
        app.state.ingestion_service = IngestionService(
            snapshot_store=snapshot_store,
            cipher=cipher,
        )
        yield
        if isinstance(app.state.claim_rate_limiter, RedisRateLimiter):
            app.state.claim_rate_limiter.close()
        if isinstance(app.state.source_rate_limiter, RedisRateLimiter):
            app.state.source_rate_limiter.close()
        app.state.ingestion_service.close()
        engine.dispose()

    app = FastAPI(
        title=active_settings.app_name,
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs" if active_settings.environment == "development" else None,
        redoc_url=None,
    )
    allowed_headers = ["Authorization", "Content-Type", "Idempotency-Key"]
    if active_settings.environment == "development":
        allowed_headers.extend(["X-User-Id", "X-Org-Id", "X-Roles"])
    app.add_middleware(
        CORSMiddleware,
        allow_origins=active_settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=allowed_headers,
    )

    @app.get("/health", response_model=HealthRead, tags=["system"])
    def health() -> HealthRead:
        return HealthRead(status="ok")

    app.include_router(admin.router, prefix="/api/v1")
    app.include_router(leads.router, prefix="/api/v1")
    app.include_router(workspace.router, prefix="/api/v1")
    app.include_router(company_intelligence.router, prefix="/api/v1")
    app.include_router(intelligence_engagement.router, prefix="/api/v1")
    app.include_router(source_config.router, prefix="/api/v1")
    app.include_router(ai_gateway.router, prefix="/api/v1")
    app.include_router(crm_bridge.router, prefix="/api/v1")
    return app
