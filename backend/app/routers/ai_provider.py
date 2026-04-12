from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlmodel.ext.asyncio.session import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.user import User
from app.providers import get_provider_client
from app.providers.errors import ProviderAPIError, ProviderAuthError
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
    provider: Annotated[str | None, Body(embed=True)] = None,
) -> AIProviderValidateResponse:
    resolved_key = api_key
    resolved_provider = provider

    if not resolved_key or not resolved_provider:
        record = await get_ai_provider_record(current_user.id, session)
        if record is None and (not resolved_key or not resolved_provider):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No AI provider configured and no API key/provider provided.",
            )
        if record is not None:
            if not resolved_key:
                resolved_key = _decrypt_key(record.api_key_encrypted)
            if not resolved_provider:
                resolved_provider = record.provider

    resolved_provider = resolved_provider or "anthropic"
    resolved_key = resolved_key or ""

    client = get_provider_client(resolved_provider, resolved_key)
    try:
        valid = await client.validate_key()
        if valid:
            return AIProviderValidateResponse(valid=True, detail="API key is valid.")
        return AIProviderValidateResponse(valid=False, detail="Invalid API key.")
    except ProviderAuthError:
        return AIProviderValidateResponse(valid=False, detail="Invalid API key.")
    except ProviderAPIError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Failed to validate key: {exc}"
        ) from exc


@router.post("/models", status_code=status.HTTP_200_OK)
async def list_provider_models(
    current_user: CurrentUser,
    session: DbDep,
    api_key: Annotated[str | None, Body(embed=True)] = None,
    provider: Annotated[str | None, Body(embed=True)] = None,
) -> AIProviderModelsResponse:
    resolved_key = api_key
    resolved_provider = provider

    if not resolved_key or not resolved_provider:
        record = await get_ai_provider_record(current_user.id, session)
        if record is None and (not resolved_key or not resolved_provider):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No AI provider configured and no API key/provider provided.",
            )
        if record is not None:
            if not resolved_key:
                resolved_key = _decrypt_key(record.api_key_encrypted)
            if not resolved_provider:
                resolved_provider = record.provider

    resolved_provider = resolved_provider or "anthropic"
    resolved_key = resolved_key or ""

    client = get_provider_client(resolved_provider, resolved_key)
    try:
        model_ids = await client.list_models()
    except ProviderAuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid API key."
        ) from exc
    except ProviderAPIError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Failed to fetch models: {exc}"
        ) from exc
    return AIProviderModelsResponse(models=model_ids)
