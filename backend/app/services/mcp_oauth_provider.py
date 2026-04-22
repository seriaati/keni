from __future__ import annotations

import hashlib
import logging
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Literal, cast
from urllib.parse import urlencode

from mcp.server.auth.provider import (
    AccessToken,
    AuthorizationCode,
    OAuthAuthorizationServerProvider,
)
from mcp.shared.auth import OAuthClientInformationFull, OAuthToken
from pydantic import AnyUrl
from sqlmodel import select

from app.database import get_session
from app.models.oauth_authorization_code import OAuthAuthorizationCode
from app.models.oauth_client import OAuthClient
from app.models.oauth_token import OAuthToken as OAuthTokenModel

if TYPE_CHECKING:
    from mcp.server.auth.provider import AuthorizationParams

logger = logging.getLogger(__name__)

_AUTH_CODE_TTL_SECONDS = 300
_ACCESS_TOKEN_TTL_SECONDS = 3600
_REFRESH_TOKEN_TTL_DAYS = 30

_TOKEN_TYPE_ACCESS = "access"  # noqa: S105
_TOKEN_TYPE_REFRESH = "refresh"  # noqa: S105
_TOKEN_TYPE_BEARER = "Bearer"  # noqa: S105


class ZeniAuthorizationCode(AuthorizationCode):
    db_id: uuid.UUID


class ZeniAccessToken(AccessToken):
    user_id: str


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
        client_secret=None,
        client_id_issued_at=int(db_client.client_id_issued_at.timestamp()),
        redirect_uris=redirect_uris,
        client_name=db_client.client_name,
        grant_types=db_client.grant_types or ["authorization_code", "refresh_token"],
        response_types=db_client.response_types or ["code"],
        scope=db_client.scope,
        token_endpoint_auth_method=_coerce_auth_method(db_client.token_endpoint_auth_method),
    )


class ZeniOAuthProvider(OAuthAuthorizationServerProvider):
    def __init__(self, frontend_url: str) -> None:
        self._frontend_url = frontend_url
        self._pending_authorizations: dict[
            str, tuple[OAuthClientInformationFull, AuthorizationParams]
        ] = {}

    def store_pending_authorization(
        self, state: str, client: OAuthClientInformationFull, params: AuthorizationParams
    ) -> None:
        self._pending_authorizations[state] = (client, params)

    def pop_pending_authorization(
        self, state: str
    ) -> tuple[OAuthClientInformationFull, AuthorizationParams] | None:
        return self._pending_authorizations.pop(state, None)

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
                client_secret_hash=None,
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
        state = params.state or secrets.token_urlsafe(16)
        self.store_pending_authorization(state, client, params)

        query = {
            "state": state,
            "client_name": client.client_name or client.client_id or "",
            "scopes": " ".join(params.scopes or []),
        }
        return f"{self._frontend_url}/oauth/authorize?{urlencode(query)}"

    async def load_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: str
    ) -> ZeniAuthorizationCode | None:
        async for session in get_session():
            result = await session.exec(
                select(OAuthAuthorizationCode).where(
                    OAuthAuthorizationCode.code == authorization_code,
                    OAuthAuthorizationCode.client_id == client.client_id,
                )
            )
            row = result.first()
            if row is None:
                logger.warning(
                    "load_authorization_code: not found — code=%s client_id=%s",
                    authorization_code[:8] + "…",
                    client.client_id,
                )
                return None
            logger.info(
                "load_authorization_code: found — redirect_uri=%r redirect_uri_provided_explicitly=%s "
                "code_challenge=%r expires_at=%s",
                row.redirect_uri,
                row.redirect_uri_provided_explicitly,
                row.code_challenge,
                row.expires_at,
            )
            return ZeniAuthorizationCode(
                db_id=row.id,
                code=row.code,
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
        client: OAuthClientInformationFull,  # noqa: ARG002
        authorization_code: ZeniAuthorizationCode,
    ) -> OAuthToken:
        now = datetime.now(UTC)

        access_token_str = _generate_token()
        refresh_token_str = _generate_token()
        pair_id = uuid.uuid4()

        access_expires = now + timedelta(seconds=_ACCESS_TOKEN_TTL_SECONDS)
        refresh_expires = now + timedelta(days=_REFRESH_TOKEN_TTL_DAYS)

        async for session in get_session():
            result = await session.exec(
                select(OAuthAuthorizationCode).where(
                    OAuthAuthorizationCode.code == authorization_code.code
                )
            )
            code_row = result.first()
            if code_row is None:
                msg = "Authorization code not found"
                raise ValueError(msg)

            user_id = code_row.user_id

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
            await session.delete(code_row)
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
    ) -> OAuthTokenModel | None:
        async for session in get_session():
            result = await session.exec(
                select(OAuthTokenModel).where(
                    OAuthTokenModel.token_hash == _hash_token(refresh_token),
                    OAuthTokenModel.token_type == _TOKEN_TYPE_REFRESH,
                    OAuthTokenModel.client_id == client.client_id,
                    OAuthTokenModel.revoked == False,  # noqa: E712
                )
            )
            return result.first()
        return None

    async def exchange_refresh_token(
        self,
        client: OAuthClientInformationFull,  # noqa: ARG002
        refresh_token: OAuthTokenModel,
        scopes: list[str],
    ) -> OAuthToken:
        now = datetime.now(UTC)
        if refresh_token.expires_at.replace(tzinfo=UTC) < now:
            msg = "Refresh token expired"
            raise ValueError(msg)

        effective_scopes = scopes or refresh_token.scopes

        new_access_str = _generate_token()
        new_refresh_str = _generate_token()
        new_pair_id = uuid.uuid4()

        access_expires = now + timedelta(seconds=_ACCESS_TOKEN_TTL_SECONDS)
        refresh_expires = now + timedelta(days=_REFRESH_TOKEN_TTL_DAYS)

        async for session in get_session():
            result = await session.exec(
                select(OAuthTokenModel).where(OAuthTokenModel.pair_id == refresh_token.pair_id)
            )
            old_tokens = result.all()
            for t in old_tokens:
                t.revoked = True
                session.add(t)

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

    async def load_access_token(self, token: str) -> ZeniAccessToken | None:
        async for session in get_session():
            result = await session.exec(
                select(OAuthTokenModel).where(
                    OAuthTokenModel.token_hash == _hash_token(token),
                    OAuthTokenModel.token_type == _TOKEN_TYPE_ACCESS,
                    OAuthTokenModel.revoked == False,  # noqa: E712
                )
            )
            db_token = result.first()
            if not db_token:
                return None
            now = datetime.now(UTC)
            if db_token.expires_at.replace(tzinfo=UTC) < now:
                return None
            return ZeniAccessToken(
                token=token,
                client_id=db_token.client_id,
                scopes=db_token.scopes or [],
                expires_at=int(db_token.expires_at.timestamp()),
                resource=db_token.resource,
                user_id=str(db_token.user_id),
            )
        return None

    async def revoke_token(self, token: ZeniAccessToken | OAuthTokenModel) -> None:
        if isinstance(token, ZeniAccessToken):
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
