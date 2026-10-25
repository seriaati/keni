from __future__ import annotations

import hashlib
import logging
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Literal, cast
from urllib.parse import urlencode

from mcp.server.auth.provider import (
    AccessToken,
    AuthorizationCode,
    OAuthAuthorizationServerProvider,
    RefreshToken,
    TokenError,
    construct_redirect_uri,
)
from mcp.shared.auth import OAuthClientInformationFull, OAuthToken
from pydantic import AnyUrl
from sqlmodel import col, delete, select, update

from app.database import get_session
from app.models.oauth_authorization_code import OAuthAuthorizationCode
from app.models.oauth_client import OAuthClient
from app.models.oauth_token import OAuthToken as OAuthTokenModel

if TYPE_CHECKING:
    from mcp.server.auth.provider import AuthorizationParams
    from sqlmodel.ext.asyncio.session import AsyncSession

logger = logging.getLogger(__name__)

_PENDING_AUTHORIZATION_TTL_SECONDS = 600
_AUTH_CODE_TTL_SECONDS = 300
_ACCESS_TOKEN_TTL_SECONDS = 3600
_REFRESH_TOKEN_TTL_DAYS = 30

_TOKEN_TYPE_ACCESS = "access"  # ruff: ignore[hardcoded-password-string]
_TOKEN_TYPE_REFRESH = "refresh"  # ruff: ignore[hardcoded-password-string]
_TOKEN_TYPE_BEARER = "Bearer"  # ruff: ignore[hardcoded-password-string]


class KeniAuthorizationCode(AuthorizationCode):
    db_id: uuid.UUID
    user_id: uuid.UUID


class KeniRefreshToken(RefreshToken):
    user_id: uuid.UUID
    pair_id: uuid.UUID
    resource: str | None = None


class KeniAccessToken(AccessToken):
    user_id: str


@dataclass(frozen=True)
class PendingAuthorization:
    """A client's authorization request, waiting for the user to approve or deny it."""

    client: OAuthClientInformationFull
    params: AuthorizationParams
    expires_at: datetime


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _generate_token() -> str:
    return secrets.token_urlsafe(32)


_ValidAuthMethod = Literal["none", "client_secret_post", "client_secret_basic", "private_key_jwt"]
_VALID_AUTH_METHODS: frozenset[str] = frozenset(
    {"none", "client_secret_post", "client_secret_basic", "private_key_jwt"}
)


def _coerce_auth_method(value: str | None) -> _ValidAuthMethod:
    if value in _VALID_AUTH_METHODS:
        return cast("_ValidAuthMethod", value)
    return "none"


def _client_to_sdk(db_client: OAuthClient) -> OAuthClientInformationFull:
    redirect_uris = [AnyUrl(uri) for uri in (db_client.redirect_uris or [])]
    return OAuthClientInformationFull(
        client_id=db_client.client_id,
        # None for clients registered before secrets were stored, so the SDK skips the check.
        client_secret=db_client.client_secret,
        client_id_issued_at=int(db_client.client_id_issued_at.timestamp()),
        redirect_uris=redirect_uris,
        client_name=db_client.client_name,
        grant_types=db_client.grant_types or ["authorization_code", "refresh_token"],
        response_types=db_client.response_types or ["code"],
        scope=db_client.scope,
        token_endpoint_auth_method=_coerce_auth_method(db_client.token_endpoint_auth_method),
    )


async def _prune_expired(session: AsyncSession, now: datetime) -> None:
    await session.exec(
        delete(OAuthAuthorizationCode).where(col(OAuthAuthorizationCode.expires_at) <= now)
    )
    await session.exec(delete(OAuthTokenModel).where(col(OAuthTokenModel.expires_at) <= now))


class KeniOAuthProvider(OAuthAuthorizationServerProvider):
    def __init__(self, frontend_url: str) -> None:
        self._frontend_url = frontend_url
        self._pending_authorizations: dict[str, PendingAuthorization] = {}

    def add_pending_authorization(
        self, client: OAuthClientInformationFull, params: AuthorizationParams
    ) -> str:
        now = datetime.now(UTC)
        for request_id, pending in list(self._pending_authorizations.items()):
            if pending.expires_at <= now:
                self._pending_authorizations.pop(request_id, None)
        request_id = secrets.token_urlsafe(16)
        self._pending_authorizations[request_id] = PendingAuthorization(
            client=client,
            params=params,
            expires_at=now + timedelta(seconds=_PENDING_AUTHORIZATION_TTL_SECONDS),
        )
        return request_id

    def get_pending_authorization(self, request_id: str) -> PendingAuthorization | None:
        pending = self._pending_authorizations.get(request_id)
        if pending is None or pending.expires_at <= datetime.now(UTC):
            return None
        return pending

    def pop_pending_authorization(self, request_id: str) -> PendingAuthorization | None:
        # Popping first means only one of two simultaneous answers gets the request.
        pending = self._pending_authorizations.pop(request_id, None)
        if pending is None or pending.expires_at <= datetime.now(UTC):
            return None
        return pending

    async def approve_authorization(
        self, session: AsyncSession, pending: PendingAuthorization, user_id: uuid.UUID
    ) -> str:
        """Issues an authorization code and returns the client redirect URI carrying it."""
        params = pending.params
        code = _generate_token()
        session.add(
            OAuthAuthorizationCode(
                code=_hash_token(code),
                client_id=pending.client.client_id or "",
                user_id=user_id,
                redirect_uri=str(params.redirect_uri),
                redirect_uri_provided_explicitly=params.redirect_uri_provided_explicitly,
                code_challenge=params.code_challenge,
                scopes=params.scopes or [],
                resource=params.resource,
                expires_at=datetime.now(UTC) + timedelta(seconds=_AUTH_CODE_TTL_SECONDS),
            )
        )
        await session.commit()
        return construct_redirect_uri(str(params.redirect_uri), code=code, state=params.state)

    @staticmethod
    def deny_authorization(pending: PendingAuthorization) -> str:
        params = pending.params
        return construct_redirect_uri(
            str(params.redirect_uri), error="access_denied", state=params.state
        )

    async def get_client(self, client_id: str) -> OAuthClientInformationFull | None:
        async for session in get_session():
            result = await session.exec(
                select(OAuthClient).where(OAuthClient.client_id == client_id)
            )
            db_client = result.first()
            if not db_client:
                return None
            return _client_to_sdk(db_client)
        return None

    async def register_client(self, client_info: OAuthClientInformationFull) -> None:
        async for session in get_session():
            db_client = OAuthClient(
                client_id=client_info.client_id or secrets.token_urlsafe(16),
                client_secret=client_info.client_secret,
                redirect_uris=[str(uri) for uri in (client_info.redirect_uris or [])],
                client_name=client_info.client_name,
                grant_types=client_info.grant_types or ["authorization_code", "refresh_token"],
                response_types=client_info.response_types or ["code"],
                scope=client_info.scope,
                token_endpoint_auth_method=client_info.token_endpoint_auth_method or "none",
            )
            session.add(db_client)
            await session.commit()

    async def authorize(
        self, client: OAuthClientInformationFull, params: AuthorizationParams
    ) -> str:
        request_id = self.add_pending_authorization(client, params)
        return f"{self._frontend_url}/oauth/authorize?{urlencode({'request': request_id})}"

    async def load_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: str
    ) -> KeniAuthorizationCode | None:
        async for session in get_session():
            result = await session.exec(
                select(OAuthAuthorizationCode).where(
                    OAuthAuthorizationCode.code == _hash_token(authorization_code),
                    OAuthAuthorizationCode.client_id == client.client_id,
                )
            )
            row = result.first()
            if row is None:
                return None
            return KeniAuthorizationCode(
                db_id=row.id,
                user_id=row.user_id,
                code=authorization_code,
                client_id=row.client_id,
                scopes=row.scopes or [],
                expires_at=row.expires_at.replace(tzinfo=UTC).timestamp(),
                code_challenge=row.code_challenge,
                redirect_uri=AnyUrl(row.redirect_uri),
                redirect_uri_provided_explicitly=row.redirect_uri_provided_explicitly,
                resource=row.resource,
            )
        return None

    async def exchange_authorization_code(
        self,
        client: OAuthClientInformationFull,  # ruff: ignore[unused-method-argument]
        authorization_code: KeniAuthorizationCode,
    ) -> OAuthToken:
        now = datetime.now(UTC)

        access_token_str = _generate_token()
        refresh_token_str = _generate_token()
        pair_id = uuid.uuid4()

        access_expires = now + timedelta(seconds=_ACCESS_TOKEN_TTL_SECONDS)
        refresh_expires = now + timedelta(days=_REFRESH_TOKEN_TTL_DAYS)

        user_id = authorization_code.user_id

        async for session in get_session():
            # Deleting decides which of two simultaneous exchanges of one code wins.
            result = await session.exec(
                delete(OAuthAuthorizationCode).where(
                    col(OAuthAuthorizationCode.id) == authorization_code.db_id
                )
            )
            if result.rowcount == 0:
                msg = "Authorization code already used"
                raise TokenError(error="invalid_grant", error_description=msg)
            await _prune_expired(session, now)

            access_token = OAuthTokenModel(
                token_hash=_hash_token(access_token_str),
                token_type=_TOKEN_TYPE_ACCESS,
                client_id=authorization_code.client_id,
                user_id=user_id,
                scopes=authorization_code.scopes,
                resource=authorization_code.resource,
                expires_at=access_expires,
                revoked=False,
                pair_id=pair_id,
            )
            refresh_token = OAuthTokenModel(
                token_hash=_hash_token(refresh_token_str),
                token_type=_TOKEN_TYPE_REFRESH,
                client_id=authorization_code.client_id,
                user_id=user_id,
                scopes=authorization_code.scopes,
                resource=authorization_code.resource,
                expires_at=refresh_expires,
                revoked=False,
                pair_id=pair_id,
            )
            session.add(access_token)
            session.add(refresh_token)
            await session.commit()

        return OAuthToken(
            access_token=access_token_str,
            token_type=_TOKEN_TYPE_BEARER,
            expires_in=_ACCESS_TOKEN_TTL_SECONDS,
            scope=" ".join(authorization_code.scopes or []),
            refresh_token=refresh_token_str,
        )

    async def load_refresh_token(
        self, client: OAuthClientInformationFull, refresh_token: str
    ) -> KeniRefreshToken | None:
        async for session in get_session():
            result = await session.exec(
                select(OAuthTokenModel).where(
                    OAuthTokenModel.token_hash == _hash_token(refresh_token),
                    OAuthTokenModel.token_type == _TOKEN_TYPE_REFRESH,
                    OAuthTokenModel.client_id == client.client_id,
                    OAuthTokenModel.revoked == False,  # ruff: ignore[true-false-comparison]
                )
            )
            db_token = result.first()
            if db_token is None:
                return None
            return KeniRefreshToken(
                token=refresh_token,
                client_id=db_token.client_id,
                scopes=db_token.scopes or [],
                expires_at=int(db_token.expires_at.replace(tzinfo=UTC).timestamp()),
                user_id=db_token.user_id,
                pair_id=db_token.pair_id,
                resource=db_token.resource,
            )
        return None

    async def exchange_refresh_token(
        self,
        client: OAuthClientInformationFull,  # ruff: ignore[unused-method-argument]
        refresh_token: KeniRefreshToken,
        scopes: list[str],
    ) -> OAuthToken:
        now = datetime.now(UTC)
        if refresh_token.expires_at is not None and refresh_token.expires_at < now.timestamp():
            msg = "Refresh token expired"
            raise TokenError(error="invalid_grant", error_description=msg)

        effective_scopes = scopes or refresh_token.scopes

        new_access_str = _generate_token()
        new_refresh_str = _generate_token()
        new_pair_id = uuid.uuid4()

        access_expires = now + timedelta(seconds=_ACCESS_TOKEN_TTL_SECONDS)
        refresh_expires = now + timedelta(days=_REFRESH_TOKEN_TTL_DAYS)

        async for session in get_session():
            # Revoking decides which of two simultaneous refreshes of one token wins.
            result = await session.exec(
                update(OAuthTokenModel)
                .where(
                    col(OAuthTokenModel.token_hash) == _hash_token(refresh_token.token),
                    col(OAuthTokenModel.revoked).is_(False),
                )
                .values(revoked=True)
            )
            if result.rowcount == 0:
                msg = "Refresh token already used"
                raise TokenError(error="invalid_grant", error_description=msg)
            await session.exec(
                update(OAuthTokenModel)
                .where(col(OAuthTokenModel.pair_id) == refresh_token.pair_id)
                .values(revoked=True)
            )
            await _prune_expired(session, now)

            new_access = OAuthTokenModel(
                token_hash=_hash_token(new_access_str),
                token_type=_TOKEN_TYPE_ACCESS,
                client_id=refresh_token.client_id,
                user_id=refresh_token.user_id,
                scopes=effective_scopes,
                resource=refresh_token.resource,
                expires_at=access_expires,
                revoked=False,
                pair_id=new_pair_id,
            )
            new_refresh = OAuthTokenModel(
                token_hash=_hash_token(new_refresh_str),
                token_type=_TOKEN_TYPE_REFRESH,
                client_id=refresh_token.client_id,
                user_id=refresh_token.user_id,
                scopes=effective_scopes,
                resource=refresh_token.resource,
                expires_at=refresh_expires,
                revoked=False,
                pair_id=new_pair_id,
            )
            session.add(new_access)
            session.add(new_refresh)
            await session.commit()

        return OAuthToken(
            access_token=new_access_str,
            token_type=_TOKEN_TYPE_BEARER,
            expires_in=_ACCESS_TOKEN_TTL_SECONDS,
            scope=" ".join(effective_scopes or []),
            refresh_token=new_refresh_str,
        )

    async def load_access_token(self, token: str) -> KeniAccessToken | None:
        async for session in get_session():
            result = await session.exec(
                select(OAuthTokenModel).where(
                    OAuthTokenModel.token_hash == _hash_token(token),
                    OAuthTokenModel.token_type == _TOKEN_TYPE_ACCESS,
                    OAuthTokenModel.revoked == False,  # ruff: ignore[true-false-comparison]
                )
            )
            db_token = result.first()
            if not db_token:
                return None
            now = datetime.now(UTC)
            if db_token.expires_at.replace(tzinfo=UTC) < now:
                return None
            return KeniAccessToken(
                token=token,
                client_id=db_token.client_id,
                scopes=db_token.scopes or [],
                expires_at=int(db_token.expires_at.timestamp()),
                resource=db_token.resource,
                user_id=str(db_token.user_id),
            )
        return None

    async def revoke_token(self, token: KeniAccessToken | OAuthTokenModel) -> None:
        if isinstance(token, KeniAccessToken):
            token_hash = _hash_token(token.token)
            async for session in get_session():
                result = await session.exec(
                    select(OAuthTokenModel).where(OAuthTokenModel.token_hash == token_hash)
                )
                db_token = result.first()
                if not db_token:
                    return
                pair_id = db_token.pair_id
                pair_result = await session.exec(
                    select(OAuthTokenModel).where(OAuthTokenModel.pair_id == pair_id)
                )
                for t in pair_result.all():
                    t.revoked = True
                    session.add(t)
                await session.commit()
        else:
            async for session in get_session():
                pair_result = await session.exec(
                    select(OAuthTokenModel).where(OAuthTokenModel.pair_id == token.pair_id)
                )
                for t in pair_result.all():
                    t.revoked = True
                    session.add(t)
                await session.commit()
