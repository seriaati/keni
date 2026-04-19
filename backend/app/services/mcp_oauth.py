from __future__ import annotations

import json
import secrets
import time
import uuid  # noqa: TC003
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from mcp.server.auth.provider import (
    AccessToken,
    AuthorizationCode,
    OAuthAuthorizationServerProvider,
    RefreshToken,
)
from mcp.shared.auth import OAuthClientInformationFull, OAuthToken
from pydantic import AnyUrl
from sqlmodel import select

from app.config import settings
from app.database import get_session
from app.models.api_token import APIToken
from app.models.oauth import OAuthAuthCode, OAuthClient, OAuthPendingRequest, OAuthRefreshToken
from app.services.auth import generate_api_token, hash_api_token

if TYPE_CHECKING:
    import uuid as uuid_mod

    from mcp.server.auth.provider import AuthorizationParams

_TOKEN_TYPE = "Bearer"  # noqa: S105


class ZeniAuthorizationCode(AuthorizationCode):
    user_id: uuid.UUID


class ZeniAccessToken(AccessToken):
    user_id: uuid.UUID


class ZeniRefreshToken(RefreshToken):
    user_id: uuid.UUID


class ZeniOAuthProvider(
    OAuthAuthorizationServerProvider[ZeniAuthorizationCode, ZeniRefreshToken, ZeniAccessToken]
):
    async def get_client(self, client_id: str) -> OAuthClientInformationFull | None:
        async for session in get_session():
            result = await session.exec(
                select(OAuthClient).where(OAuthClient.client_id == client_id)
            )
            row = result.first()
            if not row:
                return None
            return OAuthClientInformationFull.model_validate_json(row.client_data)
        return None

    async def register_client(self, client_info: OAuthClientInformationFull) -> None:
        async for session in get_session():
            existing = await session.exec(
                select(OAuthClient).where(OAuthClient.client_id == (client_info.client_id or ""))
            )
            row = existing.first()
            if row:
                row.client_data = client_info.model_dump_json()
                session.add(row)
            else:
                session.add(
                    OAuthClient(
                        client_id=client_info.client_id or "",
                        client_data=client_info.model_dump_json(),
                    )
                )
            await session.commit()

    async def authorize(
        self, client: OAuthClientInformationFull, params: AuthorizationParams
    ) -> str:
        request_id = secrets.token_urlsafe(20)
        async for session in get_session():
            session.add(
                OAuthPendingRequest(
                    request_id=request_id,
                    client_id=client.client_id or "",
                    redirect_uri=str(params.redirect_uri),
                    redirect_uri_provided_explicitly=params.redirect_uri_provided_explicitly,
                    code_challenge=params.code_challenge,
                    state=params.state,
                    scopes=json.dumps(params.scopes or []),
                    resource=str(params.resource) if params.resource else None,
                    created_at=time.time(),
                )
            )
            await session.commit()
        return f"{settings.mcp_frontend_url}/oauth/authorize?request_id={request_id}"

    async def load_authorization_code(
        self, _client: OAuthClientInformationFull, authorization_code: str
    ) -> ZeniAuthorizationCode | None:
        async for session in get_session():
            result = await session.exec(
                select(OAuthAuthCode).where(OAuthAuthCode.code == authorization_code)
            )
            row = result.first()
            if not row:
                return None
            if row.expires_at < time.time():
                await session.delete(row)
                await session.commit()
                return None
            return ZeniAuthorizationCode(
                code=row.code,
                scopes=json.loads(row.scopes),
                expires_at=row.expires_at,
                client_id=row.client_id,
                code_challenge=row.code_challenge,
                redirect_uri=AnyUrl(row.redirect_uri),
                redirect_uri_provided_explicitly=row.redirect_uri_provided_explicitly,
                user_id=row.user_id,
                resource=row.resource,
            )
        return None

    async def exchange_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: ZeniAuthorizationCode
    ) -> OAuthToken:
        raw_token = generate_api_token()
        token_hash = hash_api_token(raw_token)
        raw_refresh = secrets.token_urlsafe(32)

        async for session in get_session():
            result = await session.exec(
                select(OAuthAuthCode).where(OAuthAuthCode.code == authorization_code.code)
            )
            row = result.first()
            if row:
                await session.delete(row)

            session.add(
                APIToken(
                    user_id=authorization_code.user_id,
                    name=f"MCP: {client.client_id}",
                    token_hash=token_hash,
                )
            )
            session.add(
                OAuthRefreshToken(
                    token=raw_refresh,
                    client_id=client.client_id or "",
                    scopes=json.dumps(authorization_code.scopes),
                    user_id=authorization_code.user_id,
                )
            )
            await session.commit()

        return OAuthToken(access_token=raw_token, token_type=_TOKEN_TYPE, refresh_token=raw_refresh)

    async def load_refresh_token(
        self, client: OAuthClientInformationFull, refresh_token: str
    ) -> ZeniRefreshToken | None:
        async for session in get_session():
            result = await session.exec(
                select(OAuthRefreshToken).where(OAuthRefreshToken.token == refresh_token)
            )
            row = result.first()
            if not row or row.client_id != client.client_id:
                return None
            return ZeniRefreshToken(
                token=row.token,
                client_id=row.client_id,
                scopes=json.loads(row.scopes),
                user_id=row.user_id,
            )
        return None

    async def exchange_refresh_token(
        self, client: OAuthClientInformationFull, refresh_token: ZeniRefreshToken, scopes: list[str]
    ) -> OAuthToken:
        old_token_hash = hash_api_token(refresh_token.token)
        raw_token = generate_api_token()
        new_token_hash = hash_api_token(raw_token)
        raw_refresh = secrets.token_urlsafe(32)

        async for session in get_session():
            old_result = await session.exec(
                select(APIToken).where(APIToken.token_hash == old_token_hash)
            )
            old_api = old_result.first()
            if old_api:
                await session.delete(old_api)

            rt_result = await session.exec(
                select(OAuthRefreshToken).where(OAuthRefreshToken.token == refresh_token.token)
            )
            old_rt = rt_result.first()
            if old_rt:
                await session.delete(old_rt)

            session.add(
                APIToken(
                    user_id=refresh_token.user_id,
                    name=f"MCP: {client.client_id}",
                    token_hash=new_token_hash,
                )
            )
            session.add(
                OAuthRefreshToken(
                    token=raw_refresh,
                    client_id=client.client_id or "",
                    scopes=json.dumps(scopes or refresh_token.scopes),
                    user_id=refresh_token.user_id,
                )
            )
            await session.commit()

        return OAuthToken(access_token=raw_token, token_type=_TOKEN_TYPE, refresh_token=raw_refresh)

    async def load_access_token(self, token: str) -> ZeniAccessToken | None:
        token_hash = hash_api_token(token)
        async for session in get_session():
            result = await session.exec(select(APIToken).where(APIToken.token_hash == token_hash))
            api_token = result.first()
            if not api_token:
                return None
            if api_token.expires_at and api_token.expires_at < datetime.now(UTC):
                return None
            api_token.last_used = datetime.now(UTC)
            session.add(api_token)
            await session.commit()
            return ZeniAccessToken(
                token=token, client_id="zeni", scopes=[], user_id=api_token.user_id
            )
        return None

    async def revoke_token(self, token: ZeniAccessToken | ZeniRefreshToken) -> None:
        async for session in get_session():
            if isinstance(token, ZeniRefreshToken):
                result = await session.exec(
                    select(OAuthRefreshToken).where(OAuthRefreshToken.token == token.token)
                )
                row = result.first()
                if row:
                    await session.delete(row)
                    await session.commit()
                return
            token_hash = hash_api_token(token.token)
            result = await session.exec(select(APIToken).where(APIToken.token_hash == token_hash))
            api_token = result.first()
            if api_token:
                await session.delete(api_token)
                await session.commit()

    async def approve_request(self, request_id: str, user_id: uuid_mod.UUID) -> str:
        async for session in get_session():
            result = await session.exec(
                select(OAuthPendingRequest).where(OAuthPendingRequest.request_id == request_id)
            )
            pending = result.first()
            if not pending:
                msg = "Request not found or expired"
                raise ValueError(msg)

            code = secrets.token_urlsafe(20)
            session.add(
                OAuthAuthCode(
                    code=code,
                    scopes=pending.scopes,
                    expires_at=time.time() + 300,
                    client_id=pending.client_id,
                    code_challenge=pending.code_challenge,
                    redirect_uri=pending.redirect_uri,
                    redirect_uri_provided_explicitly=pending.redirect_uri_provided_explicitly,
                    user_id=user_id,
                    resource=pending.resource,
                )
            )
            await session.delete(pending)
            await session.commit()

            redirect = pending.redirect_uri
            separator = "&" if "?" in redirect else "?"
            redirect += f"{separator}code={code}"
            if pending.state:
                redirect += f"&state={pending.state}"
            return redirect
        msg = "Database error"
        raise RuntimeError(msg)

    async def get_pending_request(self, request_id: str) -> OAuthPendingRequest | None:
        async for session in get_session():
            result = await session.exec(
                select(OAuthPendingRequest).where(OAuthPendingRequest.request_id == request_id)
            )
            return result.first()
        return None


oauth_provider = ZeniOAuthProvider()
