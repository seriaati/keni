from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, time
from typing import TYPE_CHECKING, Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import jwt
from fastapi import Depends, Header, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import select
from sqlmodel.ext.asyncio.session import (
    AsyncSession,  # ruff: ignore[typing-only-third-party-import]
)

from app.database import get_session
from app.models.api_token import APIToken
from app.models.user import User
from app.services.auth import decode_token, hash_api_token

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator


logger = logging.getLogger(__name__)

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


@dataclass
class DateRange:
    start: datetime | None
    end: datetime | None
    tz: ZoneInfo


def _resolve_timezone(*names: str | None) -> ZoneInfo:
    for name in names:
        if not name:
            continue
        try:
            return ZoneInfo(name)
        except ZoneInfoNotFoundError, ValueError:
            logger.warning("Ignoring unknown timezone %r", name)
    return ZoneInfo("UTC")


def _parse_date_bound(value: str | None, tz: ZoneInfo, *, end: bool) -> datetime | None:
    """Date-only values span the whole calendar day in ``tz``; naive datetimes are in ``tz``."""
    if not value:
        return None
    try:
        if len(value) == 10:
            day = date.fromisoformat(value)
            return datetime.combine(day, time.max if end else time.min, tzinfo=tz)
        parsed = datetime.fromisoformat(value)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Invalid date: {value}"
        ) from e
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=tz)


def get_date_range(
    current_user: Annotated[User, Depends(get_current_user)],
    start_date: Annotated[str | None, Query()] = None,
    end_date: Annotated[str | None, Query()] = None,
    x_timezone: Annotated[str | None, Header()] = None,
) -> DateRange:
    """Parse start_date/end_date filters in the user's timezone.

    Browser timezone (X-Timezone) wins over the profile timezone so that filter
    boundaries and day buckets match how the frontend renders transaction dates.
    """
    tz = _resolve_timezone(x_timezone, current_user.timezone)
    return DateRange(
        start=_parse_date_bound(start_date, tz, end=False),
        end=_parse_date_bound(end_date, tz, end=True),
        tz=tz,
    )
