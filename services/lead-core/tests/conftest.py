from collections.abc import Iterator

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from lead_core.app import create_app
from lead_core.config import Settings


@pytest.fixture
def settings(tmp_path) -> Settings:
    return Settings(
        environment="development",
        auth_mode="dev",
        database_url=f"sqlite+pysqlite:///{tmp_path / 'lead-core.db'}",
        auto_create_schema=True,
        sensitive_data_key=Fernet.generate_key().decode(),
        person_fields_enabled=True,
        twenty_sync_enabled=False,
    )


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(settings)) as test_client:
        yield test_client


def auth_headers(*, user: str, org: str | None = None, roles: str) -> dict[str, str]:
    headers = {
        "X-User-Id": user,
        "X-Roles": roles,
    }
    if org:
        headers["X-Org-Id"] = org
    return headers
