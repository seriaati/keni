from __future__ import annotations

from typing import Annotated

import anthropic as anthropic_sdk
from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlmodel.ext.asyncio.session import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.user import User
from app.schemas.ai_provider import (
    AIProviderModelsResponse,
    AIProviderResponse,
    AIProviderUpsert,
    AIProviderValidateResponse,
)
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


@router.post("/validate", status_code=status.HTTP_200_OK)
async def validate_ai_provider(
    current_user: CurrentUser,
    session: DbDep,
    api_key: Annotated[str | None, Body(embed=True)] = None,
) -> AIProviderValidateResponse:
    resolved_key = api_key
    if not resolved_key:
        record = await get_ai_provider_record(current_user.id, session)
        if record is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No AI provider configured and no API key provided.",
            )
        resolved_key = _decrypt_key(record.api_key_encrypted)

    client = anthropic_sdk.AsyncAnthropic(api_key=resolved_key)
    try:
        await client.models.list(limit=1)
        return AIProviderValidateResponse(valid=True, detail="API key is valid.")
    except anthropic_sdk.AuthenticationError:
        return AIProviderValidateResponse(valid=False, detail="Invalid API key.")
    except anthropic_sdk.APIError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Failed to validate key: {exc}"
        ) from exc


@router.post("/models", status_code=status.HTTP_200_OK)
async def list_provider_models(
    current_user: CurrentUser,
    session: DbDep,
    api_key: Annotated[str | None, Body(embed=True)] = None,
) -> AIProviderModelsResponse:
    resolved_key = api_key
    if not resolved_key:
        record = await get_ai_provider_record(current_user.id, session)
        if record is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No AI provider configured and no API key provided.",
            )
        resolved_key = _decrypt_key(record.api_key_encrypted)

    client = anthropic_sdk.AsyncAnthropic(api_key=resolved_key)
    try:
        page = await client.models.list(limit=100)
        model_ids = [m.id for m in page.data]
    except anthropic_sdk.AuthenticationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid API key."
        ) from exc
    except anthropic_sdk.APIError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Failed to fetch models: {exc}"
        ) from exc
    return AIProviderModelsResponse(models=model_ids)
