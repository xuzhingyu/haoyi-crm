"""Verify OIDC at the business API. Identity headers are never accepted."""
import json
import os
from functools import lru_cache

import jwt
from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from .auth import CurrentUser
from .models import User

DEFAULT_SUBJECT_MAP = {
    "00000000-0000-4000-8000-000000000011": {"id": 1, "username": "lin", "role": "operator"},
    "00000000-0000-4000-8000-000000000012": {"id": 2, "username": "leader", "role": "executive"},
}


@lru_cache(maxsize=4)
def jwks_client(url: str):
    return jwt.PyJWKClient(url, cache_keys=True, lifespan=300, timeout=10)


def verify_token(token: str) -> dict:
    issuer = os.getenv("OIDC_ISSUER", "").rstrip("/")
    audience = os.getenv("OIDC_AUDIENCE", "")
    jwks_url = os.getenv("OIDC_JWKS_URL", "") or f"{issuer}/protocol/openid-connect/certs"
    if not issuer or not audience:
        raise HTTPException(503, "unified login is not configured")
    try:
        key = jwks_client(jwks_url).get_signing_key_from_jwt(token).key
        return jwt.decode(token, key, algorithms=["RS256"], issuer=issuer, audience=audience,
                          options={"require": ["exp", "iat", "sub", "iss", "aud"]}, leeway=15)
    except jwt.PyJWTError as exc:
        raise HTTPException(401, "invalid unified login token") from exc


def identity_map() -> dict:
    try:
        configured = os.getenv("OIDC_SUBJECT_MAP")
        mapping = json.loads(configured) if configured is not None else DEFAULT_SUBJECT_MAP
        if not isinstance(mapping, dict):
            raise ValueError()
        return mapping
    except (ValueError, TypeError) as exc:
        raise HTTPException(503, "identity mapping is not configured correctly") from exc


def resolve_user(request: Request, session: Session) -> CurrentUser:
    authorization = request.headers.get("Authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(401, "unified login required")
    claims = verify_token(token)
    subject = claims.get("sub")
    mapping = identity_map().get(subject)
    if not mapping or mapping.get("enabled", True) is not True:
        raise HTTPException(403, "this account has no legacy CRM access")
    roles = set(claims.get("realm_access", {}).get("roles", []))
    roles.update(claims.get("resource_access", {}).get(os.getenv("OIDC_AUDIENCE", ""), {}).get("roles", []))
    expected_role = mapping.get("role")
    if expected_role not in {"operator", "executive"}:
        raise HTTPException(403, "invalid headquarters role mapping")
    allowed = {"hq_admin", "hq_franchise_manager"} if expected_role == "operator" else {"hq_executive"}
    if not roles.intersection(allowed):
        raise HTTPException(403, "headquarters role required")
    user = session.get(User, mapping.get("id"))
    if not user or user.username != mapping.get("username") or user.role != expected_role:
        raise HTTPException(403, "legacy CRM identity mapping is unavailable")
    return CurrentUser(user.id, user.username, claims.get("name") or user.display_name, user.role, subject)
