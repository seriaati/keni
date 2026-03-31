from __future__ import annotations

import base64
from typing import TYPE_CHECKING

import anthropic as anthropic_sdk
from fastapi import HTTPException, status
from sqlmodel import select

from app.models.ai_provider import AIProvider
from app.models.category import Category
from app.providers.anthropic import AnthropicProvider

if TYPE_CHECKING:
    import uuid

    from sqlmodel.ext.asyncio.session import AsyncSession

    from app.providers.base import ParsedExpense


def _mask_key(key: str) -> str:
    if len(key) <= 8:
        return "****"
    return key[:4] + "****" + key[-4:]


def _encrypt_key(key: str) -> str:
    return base64.b64encode(key.encode()).decode()


def _decrypt_key(encrypted: str) -> str:
    return base64.b64decode(encrypted.encode()).decode()


async def get_ai_provider_record(user_id: uuid.UUID, session: AsyncSession) -> AIProvider | None:
    result = await session.exec(select(AIProvider).where(AIProvider.user_id == user_id))
    return result.first()


async def upsert_ai_provider(
    user_id: uuid.UUID, provider: str, api_key: str, model: str, session: AsyncSession
) -> AIProvider:
    record = await get_ai_provider_record(user_id, session)
    if record is None:
        record = AIProvider(
            user_id=user_id, provider=provider, api_key_encrypted=_encrypt_key(api_key), model=model
        )
    else:
        record.provider = provider
        record.api_key_encrypted = _encrypt_key(api_key)
        record.model = model

    session.add(record)
    await session.commit()
    await session.refresh(record)
    return record


async def parse_expense_with_ai(
    user_id: uuid.UUID,
    text: str | None,
    image_base64: str | None,
    image_media_type: str | None,
    session: AsyncSession,
) -> ParsedExpense:
    record = await get_ai_provider_record(user_id, session)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No AI provider configured. Set up your API key at /api/users/me/ai-provider.",
        )

    api_key = _decrypt_key(record.api_key_encrypted)

    cat_result = await session.exec(select(Category).where(Category.user_id == user_id))
    categories = [c.name for c in cat_result.all()]

    provider = AnthropicProvider(api_key=api_key, model=record.model)

    try:
        return await provider.parse_expense(
            text=text,
            image_base64=image_base64,
            image_media_type=image_media_type,
            categories=categories,
        )
    except anthropic_sdk.AuthenticationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid API key. Please update your AI provider configuration.",
        ) from exc
    except anthropic_sdk.RateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="AI provider rate limit exceeded. Please try again later.",
        ) from exc
    except anthropic_sdk.APIError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"AI provider error: {exc}"
        ) from exc
    except (ValueError, KeyError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Could not parse expense from input: {exc}",
        ) from exc
