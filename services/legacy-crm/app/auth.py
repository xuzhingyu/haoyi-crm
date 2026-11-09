import hashlib
import hmac
import os
import secrets
import time
from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import AuditLog, User

PBKDF_ROUNDS = 120_000


def hash_password(password: str, salt: str | None = None) -> str:
    material = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), material.encode("utf-8"), PBKDF_ROUNDS).hex()
    return f"{material}${digest}"


def verify_password(password: str, stored: str) -> bool:
    salt, _, digest = stored.partition("$")
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), PBKDF_ROUNDS).hex()
    return hmac.compare_digest(candidate, digest)


def auth_disabled() -> bool:
    return os.getenv("AUTH_MODE", "oidc") == "development" and os.getenv("AUTH_DISABLED", "0") == "1"


def password_login_enabled() -> bool:
    return os.getenv("AUTH_MODE", "oidc") in {"legacy", "development"} and os.getenv("LEGACY_PASSWORD_LOGIN_ENABLED", "0") == "1"


@dataclass(frozen=True)
class CurrentUser:
    id: int
    username: str
    display_name: str
    role: str
    subject: str | None = None


def seed_users(session):
    """Demo users are never provisioned by this integrated service."""
    return None


def write_audit(session: Session, user: CurrentUser | None, action: str, detail: str = "", *, commit: bool = True) -> None:
    session.add(AuditLog(user_id=user.id if user else None, action=action, detail=detail))
    if commit:
        session.commit()


def get_current_user(request: Request, session: Session) -> CurrentUser:
    if os.getenv("AUTH_MODE", "oidc") == "oidc":
        from .oidc import resolve_user
        return resolve_user(request, session)
    if auth_disabled():
        user = session.scalar(select(User).where(User.username == "lin"))
        if user is None:
            return CurrentUser(id=0, username="lin", display_name="林", role="operator")
        return CurrentUser(id=user.id, username=user.username, display_name=user.display_name, role=user.role)
    if not password_login_enabled():
        raise HTTPException(status_code=401, detail="unified login required")
    header = request.headers.get("Authorization", "")
    token = header.removeprefix("Bearer ").strip()
    user_id = request.app.state.sessions.get(token)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="authentication required")
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid session")
    return CurrentUser(id=user.id, username=user.username, display_name=user.display_name, role=user.role)


def require_operator(user: CurrentUser) -> CurrentUser:
    if user.role != "operator":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="operator role required")
    return user


def check_login_rate(request: Request, limit: int = 10, window_seconds: int = 60) -> None:
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    attempts = getattr(request.app.state, "login_attempts", None)
    if attempts is None:
        request.app.state.login_attempts = {}
        attempts = request.app.state.login_attempts
    recent = [stamp for stamp in attempts.get(ip, []) if now - stamp < window_seconds]
    if len(recent) >= limit:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="too many login attempts")
    recent.append(now)
    attempts[ip] = recent
