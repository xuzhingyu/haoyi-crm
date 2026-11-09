from __future__ import annotations

from dataclasses import dataclass

import jwt
from fastapi import HTTPException, Request, status
from jwt import PyJWKClient

from lead_core.config import Settings


@dataclass(frozen=True)
class Principal:
    user_id: str
    org_id: str | None
    roles: frozenset[str]
    display_name: str = ""

    @property
    def is_hq(self) -> bool:
        return bool(
            self.roles
            & {"hq_admin", "hq_franchise_manager", "hq_data_reviewer", "hq_auditor", "hq_executive"}
        )

    def has_any_role(self, *roles: str) -> bool:
        return bool(self.roles & set(roles))


class Authenticator:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._jwk_client: PyJWKClient | None = None

    def authenticate(self, request: Request) -> Principal:
        if self._settings.auth_mode == "dev":
            return self._authenticate_dev(request)
        return self._authenticate_oidc(request)

    def _authenticate_dev(self, request: Request) -> Principal:
        user_id = request.headers.get("X-User-Id")
        if not user_id:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing development identity")
        roles = frozenset(
            role.strip() for role in request.headers.get("X-Roles", "").split(",") if role.strip()
        )
        return Principal(user_id=user_id, org_id=request.headers.get("X-Org-Id"), roles=roles)

    def _authenticate_oidc(self, request: Request) -> Principal:
        authorization = request.headers.get("Authorization", "")
        if not authorization.startswith("Bearer "):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
        token = authorization.removeprefix("Bearer ").strip()
        try:
            jwks_url = self._settings.oidc_jwks_url or (
                f"{self._settings.oidc_issuer.rstrip('/')}/protocol/openid-connect/certs"
            )
            if self._jwk_client is None:
                self._jwk_client = PyJWKClient(jwks_url, cache_keys=True)
            signing_key = self._jwk_client.get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256", "PS256"],
                audience=self._settings.oidc_audience,
                issuer=self._settings.oidc_issuer,
                options={"require": ["exp", "sub", "iat"]},
            )
        except jwt.PyJWTError as exc:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid bearer token") from exc

        realm_roles = claims.get("realm_access", {}).get("roles", [])
        client_roles = claims.get("resource_access", {}).get(
            self._settings.oidc_audience, {}
        ).get("roles", [])
        org_id = claims.get("org_id")
        return Principal(
            user_id=claims["sub"],
            org_id=org_id,
            roles=frozenset([*realm_roles, *client_roles]),
            display_name=str(claims.get("name") or claims.get("preferred_username") or claims["sub"]),
        )


def get_principal(request: Request) -> Principal:
    principal = request.app.state.authenticator.authenticate(request)
    if request.app.state.settings.auth_mode == "oidc":
        from sqlalchemy import select

        from lead_core.db import apply_rls_context
        from lead_core.models import Franchisee, Membership

        if not principal.org_id:
            raise HTTPException(403, "organization claim required")
        with request.app.state.session_factory() as session:
            apply_rls_context(session, org_id=principal.org_id, is_hq=principal.is_hq)
            org = session.get(Franchisee, principal.org_id)
            membership = session.scalar(select(Membership).where(Membership.franchisee_id == principal.org_id, Membership.user_id == principal.user_id))
            if org is None or org.status != "active" or membership is None or membership.role not in principal.roles:
                raise HTTPException(403, "membership inactive or revoked")
    return principal


def require_franchise_principal(principal: Principal) -> Principal:
    if not principal.has_any_role("franchise_owner", "franchise_member"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "franchise role required")
    if not principal.org_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "organization claim required")
    return principal


def require_hq_role(principal: Principal, *allowed_roles: str) -> Principal:
    if not principal.has_any_role(*allowed_roles):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "headquarters role required")
    return principal
