import pytest
from pydantic import ValidationError

from lead_core.config import Settings


def test_production_rejects_enabled_twenty_sync_without_api_key() -> None:
    with pytest.raises(ValidationError, match="twenty_api_key"):
        Settings(
            environment="production",
            auth_mode="oidc",
            sensitive_data_key="configured-by-secret-store",
            twenty_sync_enabled=True,
            twenty_api_key="",
        )
