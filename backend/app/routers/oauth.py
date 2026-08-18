from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.oauth_authorization_code import OAuthAuthorizationCode
from app.models.user import User
from app.services.auth import verify_password

if TYPE_CHECKING:
    import uuid

    from app.services.mcp_oauth_provider import KeniOAuthProvider

router = APIRouter(prefix="/api/oauth", tags=["oauth"])

DbDep = Annotated[AsyncSession, Depends(get_db)]

_AUTH_CODE_TTL_SECONDS = 300


class ApproveRequest(BaseModel):
    state: str
    username: str | None = None
    password: str | None = None


class ApproveResponse(BaseModel):
    redirect_uri: str


@dataclass
class _AuthCodeParams:
    client_id: str
    user_id: uuid.UUID
    redirect_uri: str
    redirect_uri_provided_explicitly: bool
    code_challenge: str
    scopes: list[str]
    resource: str | None


def _get_provider() -> KeniOAuthProvider:
    from app.mcp_server import oauth_provider  # ruff: ignore[import-outside-top-level]

    return oauth_provider


def _build_redirect_uri(base_uri: str, code: str, state: str | None) -> str:
    sep = "&" if "?" in base_uri else "?"
    uri = f"{base_uri}{sep}code={code}"
    if state:
        uri += f"&state={state}"
    return uri


async def _create_auth_code(session: AsyncSession, p: _AuthCodeParams) -> str:
    code = secrets.token_urlsafe(32)
    expires_at = datetime.now(UTC) + timedelta(seconds=_AUTH_CODE_TTL_SECONDS)
    auth_code = OAuthAuthorizationCode(
        code=code,
        client_id=p.client_id,
        user_id=p.user_id,
        redirect_uri=p.redirect_uri,
        redirect_uri_provided_explicitly=p.redirect_uri_provided_explicitly,
        code_challenge=p.code_challenge,
        scopes=p.scopes,
        resource=p.resource,
        expires_at=expires_at,
    )
    session.add(auth_code)
    await session.commit()
    return code


@router.post("/approve")
async def approve(body: ApproveRequest, session: DbDep) -> ApproveResponse:
    provider = _get_provider()
    pending = provider.pop_pending_authorization(body.state)
    if not pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired state"
        )

    client, params = pending

    if body.username is None or body.password is None:
        provider.store_pending_authorization(body.state, client, params)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="username and password are required"
        )

    result = await session.exec(select(User).where(User.username == body.username))
    db_user = result.first()
    if not db_user or not verify_password(body.password, db_user.password_hash):
        provider.store_pending_authorization(body.state, client, params)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    code = await _create_auth_code(
        session,
        _AuthCodeParams(
            client_id=client.client_id or "",
            user_id=db_user.id,
            redirect_uri=str(params.redirect_uri),
            redirect_uri_provided_explicitly=params.redirect_uri_provided_explicitly,
            code_challenge=params.code_challenge,
            scopes=params.scopes or [],
            resource=params.resource,
        ),
    )

    redirect_uri = _build_redirect_uri(str(params.redirect_uri), code, params.state)
    return ApproveResponse(redirect_uri=redirect_uri)


@router.post("/approve/session")
async def approve_with_session(
    body: ApproveRequest, session: DbDep, current_user: Annotated[User, Depends(get_current_user)]
) -> ApproveResponse:
    provider = _get_provider()
    pending = provider.pop_pending_authorization(body.state)
    if not pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired state"
        )

    client, params = pending

    code = await _create_auth_code(
        session,
        _AuthCodeParams(
            client_id=client.client_id or "",
            user_id=current_user.id,
            redirect_uri=str(params.redirect_uri),
            redirect_uri_provided_explicitly=params.redirect_uri_provided_explicitly,
            code_challenge=params.code_challenge,
            scopes=params.scopes or [],
            resource=params.resource,
        ),
    )

    redirect_uri = _build_redirect_uri(str(params.redirect_uri), code, params.state)
    return ApproveResponse(redirect_uri=redirect_uri)
