from __future__ import annotations

from typing import TYPE_CHECKING, Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.user import User
from app.services.auth import verify_password

if TYPE_CHECKING:
    from app.services.mcp_oauth_provider import KeniOAuthProvider, PendingAuthorization

router = APIRouter(prefix="/api/oauth", tags=["oauth"])

DbDep = Annotated[AsyncSession, Depends(get_db)]

_INVALID_REQUEST = "Invalid or expired authorization request"


class AuthorizationRequestResponse(BaseModel):
    client_name: str | None
    redirect_uri: str
    scopes: list[str]


class ApproveRequest(BaseModel):
    request_id: str
    username: str | None = None
    password: str | None = None


class AnswerRequest(BaseModel):
    request_id: str


class ApproveResponse(BaseModel):
    redirect_uri: str


def _get_provider() -> KeniOAuthProvider:
    from app.mcp_server import oauth_provider  # ruff: ignore[import-outside-top-level]

    return oauth_provider


def _pop_pending(provider: KeniOAuthProvider, request_id: str) -> PendingAuthorization:
    pending = provider.pop_pending_authorization(request_id)
    if pending is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=_INVALID_REQUEST)
    return pending


@router.get("/requests/{request_id}")
async def get_authorization_request(request_id: str) -> AuthorizationRequestResponse:
    # Public: the consent page shows this before the user signs in. The request ID is a random
    # secret known only to whoever holds the consent link.
    pending = _get_provider().get_pending_authorization(request_id)
    if pending is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_INVALID_REQUEST)
    return AuthorizationRequestResponse(
        client_name=pending.client.client_name,
        redirect_uri=str(pending.params.redirect_uri),
        scopes=pending.params.scopes or [],
    )


@router.post("/approve")
async def approve(body: ApproveRequest, session: DbDep) -> ApproveResponse:
    provider = _get_provider()
    if provider.get_pending_authorization(body.request_id) is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=_INVALID_REQUEST)

    if body.username is None or body.password is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="username and password are required"
        )

    result = await session.exec(select(User).where(User.username == body.username))
    db_user = result.first()
    if not db_user or not verify_password(body.password, db_user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    pending = _pop_pending(provider, body.request_id)
    redirect_uri = await provider.approve_authorization(session, pending, db_user.id)
    return ApproveResponse(redirect_uri=redirect_uri)


@router.post("/approve/session")
async def approve_with_session(
    body: AnswerRequest, session: DbDep, current_user: Annotated[User, Depends(get_current_user)]
) -> ApproveResponse:
    provider = _get_provider()
    pending = _pop_pending(provider, body.request_id)
    redirect_uri = await provider.approve_authorization(session, pending, current_user.id)
    return ApproveResponse(redirect_uri=redirect_uri)


@router.post("/deny")
async def deny(body: AnswerRequest) -> ApproveResponse:
    provider = _get_provider()
    pending = _pop_pending(provider, body.request_id)
    return ApproveResponse(redirect_uri=provider.deny_authorization(pending))
