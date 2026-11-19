from __future__ import annotations

from typing import TYPE_CHECKING, Annotated

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlmodel.ext.asyncio.session import AsyncSession

from app.config import settings
from app.dependencies import get_current_user, get_db
from app.models.user import User
from app.providers import check_base_url, get_provider_client
from app.providers.errors import (
    ProviderAPIError,
    ProviderAuthError,
    ProviderConfigError,
    ProviderConnectionError,
)
from app.schemas.ai_provider import (
    AIProviderModelsResponse,
    AIProviderOptionsResponse,
    AIProviderResponse,
    AIProviderUpsert,
    AIProviderValidateResponse,
)
from app.services.ai_transaction import (
    _decrypt_key,
    _mask_key,
    get_ai_provider_record,
    upsert_ai_provider,
)

if TYPE_CHECKING:
    import uuid

    from app.providers.base import LLMProvider

router = APIRouter(prefix="/api/users/me/ai-provider", tags=["ai-provider"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


async def _resolve_client(
    user_id: uuid.UUID,
    session: AsyncSession,
    api_key: str | None,
    provider: str | None,
    base_url: str | None,
) -> LLMProvider:
    record = await get_ai_provider_record(user_id, session)
    provider = provider or (record.provider if record else None)
    base_url = base_url or (record.base_url if record else None)
    # A custom endpoint only gets the stored key if it is the endpoint the key was saved for.
    if (
        not api_key
        and record is not None
        and (
            provider != "openai_compatible"
            or (record.provider, record.base_url) == (provider, base_url)
        )
    ):
        api_key = _decrypt_key(record.api_key_encrypted)

    if provider is None or (not api_key and provider != "openai_compatible"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No AI provider configured and no API key/provider provided.",
        )

    try:
        return get_provider_client(provider, api_key or "", base_url)
    except ProviderConfigError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc


@router.get("/options")
async def get_ai_provider_options(_: CurrentUser) -> AIProviderOptionsResponse:
    return AIProviderOptionsResponse(allowed_base_urls=settings.ai_base_url_allowlist)


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
        chat_model=record.chat_model,
        attachment_model=record.attachment_model,
        api_key_masked=_mask_key(_decrypt_key(record.api_key_encrypted)),
        base_url=record.base_url,
        ocr_enabled=record.ocr_enabled,
    )


@router.post("", status_code=status.HTTP_200_OK)
async def upsert_ai_provider_endpoint(
    body: AIProviderUpsert, current_user: CurrentUser, session: DbDep
) -> AIProviderResponse:
    if body.provider == "openai_compatible":
        try:
            check_base_url(body.base_url)
        except ProviderConfigError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
            ) from exc

    record = await upsert_ai_provider(
        user_id=current_user.id,
        provider=body.provider,
        api_key=body.api_key,
        model=body.model,
        session=session,
        ocr_enabled=body.ocr_enabled,
        chat_model=body.chat_model or None,
        attachment_model=body.attachment_model or None,
        base_url=body.base_url,
    )
    return AIProviderResponse(
        provider=record.provider,
        model=record.model,
        chat_model=record.chat_model,
        attachment_model=record.attachment_model,
        api_key_masked=_mask_key(_decrypt_key(record.api_key_encrypted)),
        base_url=record.base_url,
        ocr_enabled=record.ocr_enabled,
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
    base_url: Annotated[str | None, Body(embed=True)] = None,
) -> AIProviderValidateResponse:
    client = await _resolve_client(current_user.id, session, api_key, provider, base_url)
    try:
        valid = await client.validate_key()
        if valid:
            return AIProviderValidateResponse(valid=True, detail="API key is valid.")
        return AIProviderValidateResponse(valid=False, detail="Invalid API key.")
    except ProviderAuthError:
        return AIProviderValidateResponse(valid=False, detail="Invalid API key.")
    except (ProviderAPIError, ProviderConnectionError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Failed to validate key: {exc}"
        ) from exc


@router.post("/models", status_code=status.HTTP_200_OK)
async def list_provider_models(
    current_user: CurrentUser,
    session: DbDep,
    api_key: Annotated[str | None, Body(embed=True)] = None,
    provider: Annotated[str | None, Body(embed=True)] = None,
    base_url: Annotated[str | None, Body(embed=True)] = None,
) -> AIProviderModelsResponse:
    client = await _resolve_client(current_user.id, session, api_key, provider, base_url)
    try:
        model_ids = await client.list_models()
    except ProviderAuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid API key."
        ) from exc
    except (ProviderAPIError, ProviderConnectionError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Failed to fetch models: {exc}"
        ) from exc
    return AIProviderModelsResponse(models=model_ids)
