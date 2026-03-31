from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer  # noqa: TC002
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession  # noqa: TC002

from app.database import get_session
from app.models.api_token import APIToken
from app.models.user import User
from app.services.auth import decode_token, hash_api_token

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator


bearer_scheme = HTTPBearer(auto_error=False)


async def get_db() -> AsyncGenerator[AsyncSession]:
    async for session in get_session():
        yield session


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    token = credentials.credentials

    user = await _try_jwt_auth(token, session)
    if user:
        return user

    user = await _try_api_token_auth(token, session)
    if user:
        return user

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")


async def _try_jwt_auth(token: str, session: AsyncSession) -> User | None:
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            return None
        user_id = uuid.UUID(payload["sub"])
    except jwt.PyJWTError, ValueError, KeyError:
        return None

    result = await session.exec(select(User).where(User.id == user_id))
    return result.first()


async def _try_api_token_auth(token: str, session: AsyncSession) -> User | None:
    token_hash = hash_api_token(token)
    result = await session.exec(select(APIToken).where(APIToken.token_hash == token_hash))
    api_token = result.first()
    if not api_token:
        return None

    if api_token.expires_at and api_token.expires_at < datetime.now(UTC):
        return None

    api_token.last_used = datetime.now(UTC)
    session.add(api_token)
    await session.commit()

    result = await session.exec(select(User).where(User.id == api_token.user_id))
    return result.first()


def require_admin(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user
