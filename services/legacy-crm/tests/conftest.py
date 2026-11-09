"""Original regression fixtures are explicitly isolated from deployment defaults."""
import secrets

import pytest
from sqlalchemy import select

TEST_OPERATOR_PASSWORD = secrets.token_urlsafe(24)
TEST_EXECUTIVE_PASSWORD = secrets.token_urlsafe(24)


@pytest.fixture(autouse=True)
def isolated_demo_environment(monkeypatch):
    monkeypatch.setenv("AUTH_MODE", "development")
    monkeypatch.setenv("AUTH_DISABLED", "1")
    monkeypatch.setenv("LEGACY_PASSWORD_LOGIN_ENABLED", "1")
    monkeypatch.setenv("SEED_DEMO_DATA", "1")
    monkeypatch.setenv("LEGACY_NEWS_WORKER_ENABLED", "1")
    monkeypatch.delenv("AI_GATEWAY_URL", raising=False)
    monkeypatch.delenv("AI_GATEWAY_TOKEN", raising=False)
    from app import seed
    from app.auth import hash_password
    from app.models import User

    def test_users(session):
        for username, role, fixture_password in [("lin", "operator", TEST_OPERATOR_PASSWORD), ("leader", "executive", TEST_EXECUTIVE_PASSWORD)]:
            if not session.scalar(select(User).where(User.username == username)):
                session.add(User(username=username, display_name=username, role=role, password_hash=hash_password(fixture_password)))
        session.commit()

    monkeypatch.setattr(seed, "seed_users", test_users)
    from dataclasses import replace

    from app import main
    original = main.get_current_user

    def test_identity(request, session):
        user = original(request, session)
        return user if user.subject else replace(user, subject=f"00000000-0000-4000-8000-{user.id + 10:012d}")

    monkeypatch.setattr(main, "get_current_user", test_identity)
    original_seed = main.seed_demo_data

    def seed_with_sources(session):
        original_seed(session)
        from app.industry import seed_default_sources
        seed_default_sources(session)

    monkeypatch.setattr(main, "seed_demo_data", seed_with_sources)
