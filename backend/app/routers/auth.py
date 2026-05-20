from __future__ import annotations

import uuid
from typing import Annotated

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.dependencies import get_db
from app.models.category import Category
from app.models.settings import AppSettings
from app.models.user import User
from app.models.wallet import Wallet
from app.schemas.auth import LoginRequest, RefreshRequest, SignupRequest, TokenResponse
from app.services.auth import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

DbDep = Annotated[AsyncSession, Depends(get_db)]


async def _get_signups_enabled(session: AsyncSession) -> bool:
    result = await session.exec(select(AppSettings).where(AppSettings.id == 1))
    settings_row = result.first()
    return settings_row.signups_enabled if settings_row else True


def _create_others_category(user_id: uuid.UUID, session: AsyncSession) -> None:
    category = Category(user_id=user_id, name="Others", icon="tag", color="#9CA3AF", is_system=True)
    session.add(category)


@router.post("/signup", status_code=status.HTTP_201_CREATED)
async def signup(body: SignupRequest, session: DbDep) -> TokenResponse:
    if not await _get_signups_enabled(session):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Signups are disabled")

    result = await session.exec(select(User).where(User.username == body.username))
    if result.first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")

    user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        display_name=body.display_name,
    )
    session.add(user)
    await session.flush()

    _create_others_category(user.id, session)

    wallet = Wallet(user_id=user.id, name="Main Wallet", currency="USD")
    session.add(wallet)

    await session.commit()

    return TokenResponse(
        access_token=create_access_token(user.id), refresh_token=create_refresh_token(user.id)
    )


@router.post("/login")
async def login(body: LoginRequest, session: DbDep) -> TokenResponse:
    result = await session.exec(select(User).where(User.username == body.username))
    user = result.first()

    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    return TokenResponse(
        access_token=create_access_token(user.id), refresh_token=create_refresh_token(user.id)
    )


@router.post("/refresh")
async def refresh(body: RefreshRequest, session: DbDep) -> TokenResponse:
    try:
        payload = decode_token(body.refresh_token)
        if payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type"
            )
        user_id = uuid.UUID(payload["sub"])
    except (jwt.PyJWTError, ValueError, KeyError) as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token"
        ) from e

    result = await session.exec(select(User).where(User.id == user_id))
    user = result.first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return TokenResponse(
        access_token=create_access_token(user.id), refresh_token=create_refresh_token(user.id)
    )
