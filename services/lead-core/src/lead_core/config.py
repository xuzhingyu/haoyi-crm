from __future__ import annotations

from functools import lru_cache

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="LEAD_CORE_", extra="ignore")

    app_name: str = "好易拓客 Lead Core"
    environment: str = "production"
    auth_mode: str = "oidc"
    database_url: str = "postgresql+psycopg://lead_core:change-me@postgres:5432/lead_core"
    redis_url: str = "redis://redis:6379/0"
    auto_create_schema: bool = False
    sensitive_data_key: str = ""
    person_fields_enabled: bool = False
    oidc_issuer: str = "http://keycloak:8080/realms/haoyi"
    oidc_audience: str = "lead-core"
    oidc_jwks_url: str | None = None
    twenty_sync_enabled: bool = True
    twenty_base_url: str = "http://twenty-server:3000"
    twenty_api_key: str = ""
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])
    claim_rate_limit_per_minute: int = 10
    inventory_target_per_city: int = 200
    snapshot_store_enabled: bool = False
    snapshot_s3_endpoint: str = "http://minio:9000"
    snapshot_s3_region: str = "us-east-1"
    snapshot_s3_bucket: str = "source-snapshots"
    snapshot_s3_access_key: str = ""
    snapshot_s3_secret_key: str = ""
    aihot_base_url: str = ""
    aihot_admin_password: str = Field(default="", repr=False)
    autoloop_base_url: str = ""
    autoloop_source_token: str = Field(default="", repr=False)
    autoloop_owner_token: str = Field(default="", repr=False)
    worker_token: str = Field(default="", repr=False)
    ai_gateway_token: str = Field(default="", repr=False)
    legacy_bridge_token: str = Field(default="", repr=False)
    legacy_crm_api_url: str = ""
    legacy_ai_actor_subs: list[str] = Field(default_factory=lambda: [
        "00000000-0000-4000-8000-000000000011", "00000000-0000-4000-8000-000000000012",
    ])
    workspace_api_url: str = "http://lead-core:8000"
    llm_base_url: str = "https://api.deepseek.com"
    llm_api_key: str = Field(default="", repr=False)
    llm_model: str = "deepseek-v4-pro"
    llm_input_cny_per_million: float = Field(default=0, ge=0, allow_inf_nan=False)
    llm_output_cny_per_million: float = Field(default=0, ge=0, allow_inf_nan=False)
    ai_daily_budget_cny: float = Field(default=20, gt=0, allow_inf_nan=False)
    ai_task_budget_cny: float = Field(default=2, gt=0, allow_inf_nan=False)
    ai_max_rounds: int = Field(default=6, ge=1, le=6)
    ai_task_timeout_minutes: int = Field(default=20, ge=1, le=20)
    ai_max_concurrent_tasks: int = Field(default=1, ge=1, le=1)
    company_intelligence_tianyan_enabled: bool = False
    company_intelligence_tyc_node: str = "node"
    company_intelligence_tyc_cli_entry: str = ""
    company_intelligence_tyc_max_pages: int = Field(default=50, ge=1, le=200)
    legacy_crm_database_path: str = ""
    legacy_crm_url: str = "/workbench/"
    jiangsu_cities: list[str] = Field(
        default_factory=lambda: [
            "南京市",
            "无锡市",
            "徐州市",
            "常州市",
            "苏州市",
            "南通市",
            "连云港市",
            "淮安市",
            "盐城市",
            "扬州市",
            "镇江市",
            "泰州市",
            "宿迁市",
        ]
    )

    @model_validator(mode="after")
    def validate_security_settings(self) -> Settings:
        if self.auth_mode == "dev" and self.environment != "development":
            raise ValueError("dev authentication is only allowed in development")
        if self.environment != "development" and not self.sensitive_data_key:
            raise ValueError("sensitive_data_key is required outside development")
        if (
            self.environment != "development"
            and self.twenty_sync_enabled
            and not self.twenty_api_key
        ):
            raise ValueError("twenty_api_key is required when Twenty sync is enabled")
        if self.snapshot_store_enabled and not (
            self.snapshot_s3_access_key and self.snapshot_s3_secret_key
        ):
            raise ValueError("snapshot S3 credentials are required when snapshot storage is enabled")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
