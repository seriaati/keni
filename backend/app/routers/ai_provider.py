from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel.ext.asyncio.session import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.ai_provider import AIProvider
from app.models.user import User
from app.schemas.ai_provider import AIProviderResponse, AIProviderUpsert
from app.services.ai_connections import get_ai_provider_record, upsert_ai_provider

router = APIRouter(prefix="/api/users/me/ai-provider", tags=["ai-provider"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


def _to_response(record: AIProvider) -> AIProviderResponse:
    return AIProviderResponse(
        connection_id=record.connection_id,
        model=record.model,
        chat_connection_id=record.chat_connection_id,
        chat_model=record.chat_model,
        attachment_connection_id=record.attachment_connection_id,
        attachment_model=record.attachment_model,
        ocr_enabled=record.ocr_enabled,
    )


@router.get("")
async def get_ai_provider(current_user: CurrentUser, session: DbDep) -> AIProviderResponse:
    record = await get_ai_provider_record(current_user.id, session)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No AI provider configured"
        )
    return _to_response(record)


@router.post("", status_code=status.HTTP_200_OK)
async def upsert_ai_provider_endpoint(
    body: AIProviderUpsert, current_user: CurrentUser, session: DbDep
) -> AIProviderResponse:
    try:
        record = await upsert_ai_provider(
            current_user.id,
            session,
            connection_id=body.connection_id,
            model=body.model,
            chat_connection_id=body.chat_connection_id,
            chat_model=body.chat_model or None,
            attachment_connection_id=body.attachment_connection_id,
            attachment_model=body.attachment_model or None,
            ocr_enabled=body.ocr_enabled,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    return _to_response(record)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ai_provider(current_user: CurrentUser, session: DbDep) -> None:
    record = await get_ai_provider_record(current_user.id, session)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No AI provider configured"
        )
    await session.delete(record)
    await session.commit()
