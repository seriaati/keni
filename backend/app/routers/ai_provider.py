from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel.ext.asyncio.session import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.user import User
from app.schemas.ai_provider import AIProviderResponse, AIProviderUpsert
from app.services.ai_expense import (
    _decrypt_key,
    _mask_key,
    get_ai_provider_record,
    upsert_ai_provider,
)

router = APIRouter(prefix="/api/users/me/ai-provider", tags=["ai-provider"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.get("")
async def get_ai_provider(current_user: CurrentUser, session: DbDep) -> AIProviderResponse:
    record = await get_ai_provider_record(current_user.id, session)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No AI provider configured"
        )

    return AIProviderResponse(
        provider=record.provider,
        model=record.model,
        api_key_masked=_mask_key(_decrypt_key(record.api_key_encrypted)),
    )


@router.post("", status_code=status.HTTP_200_OK)
async def upsert_ai_provider_endpoint(
    body: AIProviderUpsert, current_user: CurrentUser, session: DbDep
) -> AIProviderResponse:
    record = await upsert_ai_provider(
        user_id=current_user.id,
        provider=body.provider,
        api_key=body.api_key,
        model=body.model,
        session=session,
    )
    return AIProviderResponse(
        provider=record.provider,
        model=record.model,
        api_key_masked=_mask_key(_decrypt_key(record.api_key_encrypted)),
    )


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ai_provider(current_user: CurrentUser, session: DbDep) -> None:
    record = await get_ai_provider_record(current_user.id, session)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No AI provider configured"
        )
    await session.delete(record)
    await session.commit()
