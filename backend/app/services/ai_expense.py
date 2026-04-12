from __future__ import annotations

import base64
import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from fastapi import HTTPException, status
from sqlmodel import select

from app.models.ai_provider import AIProvider
from app.models.category import Category
from app.models.tag import Tag
from app.providers import get_provider
from app.providers.errors import (
    ProviderAPIError,
    ProviderAuthError,
    ProviderConnectionError,
    ProviderPermissionError,
    ProviderRateLimitError,
)
from app.services.ocr import extract_text_from_base64

logger = logging.getLogger(__name__)


if TYPE_CHECKING:
    import uuid

    from sqlmodel.ext.asyncio.session import AsyncSession


@dataclass
class SuggestedTagResult:
    name: str
    is_new: bool


@dataclass
class ParsedExpenseResult:
    amount: float
    currency: str
    category_name: str
    is_new_category: bool
    description: str
    date: str
    ai_context: str
    suggested_tags: list[SuggestedTagResult] = field(default_factory=list)


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


async def upsert_ai_provider(  # noqa: PLR0913, PLR0917
    user_id: uuid.UUID,
    provider: str,
    api_key: str,
    model: str,
    session: AsyncSession,
    ocr_enabled: bool = True,
) -> AIProvider:
    record = await get_ai_provider_record(user_id, session)
    if record is None:
        record = AIProvider(
            user_id=user_id,
            provider=provider,
            api_key_encrypted=_encrypt_key(api_key),
            model=model,
            ocr_enabled=ocr_enabled,
        )
    else:
        record.provider = provider
        record.api_key_encrypted = _encrypt_key(api_key)
        record.model = model
        record.ocr_enabled = ocr_enabled

    session.add(record)
    await session.commit()
    await session.refresh(record)
    return record


async def parse_expense_with_ai(  # noqa: PLR0914
    user_id: uuid.UUID,
    text: str | None,
    image_base64: str | None,
    image_media_type: str | None,
    session: AsyncSession,
) -> ParsedExpenseResult:
    record = await get_ai_provider_record(user_id, session)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No AI provider configured. Set up your API key at /api/users/me/ai-provider.",
        )

    api_key = _decrypt_key(record.api_key_encrypted)

    if record.ocr_enabled and image_base64 is not None:
        ocr_text = extract_text_from_base64(image_base64)
        if ocr_text is not None:
            text = "OCR extracted from receipt image:\n" + ocr_text
            image_base64 = None
            image_media_type = None

    cat_result = await session.exec(select(Category).where(Category.user_id == user_id))
    existing_categories = cat_result.all()
    category_names = [c.name for c in existing_categories]

    tag_result = await session.exec(select(Tag).where(Tag.user_id == user_id))
    existing_tags = tag_result.all()
    tag_names = [t.name for t in existing_tags]

    provider = get_provider(record.provider, api_key=api_key, model=record.model)

    try:
        parsed = await provider.parse_expense(
            text=text,
            image_base64=image_base64,
            image_media_type=image_media_type,
            categories=category_names,
            tags=tag_names,
        )
    except ProviderAuthError as exc:
        logger.warning("AI expense parse failed - auth error for user %s: %s", user_id, exc)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid API key. Please update your AI provider configuration.",
        ) from exc
    except ProviderPermissionError as exc:
        logger.warning("AI expense parse failed - permission error for user %s: %s", user_id, exc)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="AI provider request was denied. Your API key may have insufficient credits or billing issues.",
        ) from exc
    except ProviderRateLimitError as exc:
        logger.warning("AI expense parse failed - rate limit for user %s: %s", user_id, exc)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="AI provider rate limit exceeded. Please try again later.",
        ) from exc
    except ProviderConnectionError as exc:
        logger.exception(
            "AI expense parse failed - connection error for user %s model=%s", user_id, record.model
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not connect to AI provider: {exc}",
        ) from exc
    except ProviderAPIError as exc:
        logger.exception(
            "AI expense parse failed - API error for user %s model=%s", user_id, record.model
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"AI provider error: {exc}"
        ) from exc
    except (ValueError, KeyError) as exc:
        logger.exception("AI expense parse failed - parse error for user %s", user_id)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Could not parse expense from input: {exc}",
        ) from exc

    existing_category_names_lower = {c.name.lower() for c in existing_categories}
    is_new_category = parsed.category_name.lower() not in existing_category_names_lower

    existing_tag_names_lower = {t.name.lower() for t in existing_tags}
    suggested_tags = [
        SuggestedTagResult(name=name, is_new=name.lower() not in existing_tag_names_lower)
        for name in parsed.suggested_tags
    ]

    return ParsedExpenseResult(
        amount=parsed.amount,
        currency=parsed.currency,
        category_name=parsed.category_name,
        is_new_category=is_new_category,
        description=parsed.description,
        date=parsed.date,
        ai_context=parsed.ai_context,
        suggested_tags=suggested_tags,
    )
