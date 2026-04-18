from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.dependencies import get_current_user, get_db, require_admin
from app.models.settings import AppSettings
from app.models.user import User
from app.schemas.auth import (
    AdminSettingsRequest,
    AdminSettingsResponse,
    UpdateProfileRequest,
    UserResponse,
)
from app.services.auth import hash_password

router = APIRouter(prefix="/api", tags=["users"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]
AdminUser = Annotated[User, Depends(require_admin)]


@router.get("/users/me")
async def get_me(current_user: CurrentUser) -> UserResponse:
    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        display_name=current_user.display_name,
        is_admin=current_user.is_admin,
        created_at=current_user.created_at,
        timezone=current_user.timezone,
    )


@router.patch("/users/me")
async def update_me(
    body: UpdateProfileRequest, current_user: CurrentUser, session: DbDep
) -> UserResponse:
    if body.display_name is not None:
        current_user.display_name = body.display_name
    if body.password is not None:
        current_user.password_hash = hash_password(body.password)
    if body.timezone is not None:
        current_user.timezone = body.timezone

    session.add(current_user)
    await session.commit()
    await session.refresh(current_user)

    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        display_name=current_user.display_name,
        is_admin=current_user.is_admin,
        created_at=current_user.created_at,
        timezone=current_user.timezone,
    )


@router.patch("/admin/settings")
async def update_admin_settings(
    body: AdminSettingsRequest, _: AdminUser, session: DbDep
) -> AdminSettingsResponse:
    result = await session.exec(select(AppSettings).where(AppSettings.id == 1))
    settings_row = result.first()

    if settings_row is None:
        settings_row = AppSettings(id=1, signups_enabled=body.signups_enabled)
    else:
        settings_row.signups_enabled = body.signups_enabled

    session.add(settings_row)
    await session.commit()

    return AdminSettingsResponse(signups_enabled=settings_row.signups_enabled)


@router.get("/admin/settings")
async def get_admin_settings(_: AdminUser, session: DbDep) -> AdminSettingsResponse:
    result = await session.exec(select(AppSettings).where(AppSettings.id == 1))
    settings_row = result.first()
    enabled = settings_row.signups_enabled if settings_row else True
    return AdminSettingsResponse(signups_enabled=enabled)
