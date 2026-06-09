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
from app.models.user import User
from app.models.wallet import Wallet
from app.providers import get_provider
from app.providers.base import LUCIDE_ICONS
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

    from app.providers.base import ParsedRecurringTransaction, ParsedTransaction


@dataclass
class SuggestedTagResult:
    name: str
    is_new: bool


@dataclass
class ParsedTransactionResult:
    amount: float
    category_name: str
    is_new_category: bool
    description: str
    date: str
    ai_context: str
    type: str = "expense"
    suggested_tags: list[SuggestedTagResult] = field(default_factory=list)
    suggested_icon: str | None = None
    suggested_wallet_id: str | None = None


@dataclass
class ParsedGroupResult:
    description: str
    amount: float
    category_name: str
    is_new_category: bool
    date: str
    ai_context: str
    type: str = "expense"
    suggested_tags: list[SuggestedTagResult] = field(default_factory=list)
    suggested_icon: str | None = None


@dataclass
class ParsedRecurringResult:
    amount: float
    category_name: str
    is_new_category: bool
    description: str
    frequency: str
    next_due: str
    ai_context: str
    type: str = "expense"
    suggested_tags: list[SuggestedTagResult] = field(default_factory=list)
    suggested_icon: str | None = None


@dataclass
class ParsedTransactionsResult:
    result_type: str
    expenses: list[ParsedTransactionResult]
    group: ParsedGroupResult | None = None
    recurring: ParsedRecurringResult | None = None
    suggested_wallet_id: str | None = None


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
    api_key: str | None,
    model: str,
    session: AsyncSession,
    ocr_enabled: bool = True,
    chat_model: str | None = None,
    base_url: str | None = None,
) -> AIProvider:
    normalized_base_url = base_url.strip() if base_url else None
    record = await get_ai_provider_record(user_id, session)
    if record is None:
        if not api_key:
            msg = "API key is required when creating a new AI provider"
            raise ValueError(msg)
        record = AIProvider(
            user_id=user_id,
            provider=provider,
            api_key_encrypted=_encrypt_key(api_key),
            model=model,
            ocr_enabled=ocr_enabled,
            chat_model=chat_model,
            base_url=normalized_base_url,
        )
    else:
        record.provider = provider
        if api_key:
            record.api_key_encrypted = _encrypt_key(api_key)
        record.model = model
        record.ocr_enabled = ocr_enabled
        record.chat_model = chat_model
        record.base_url = normalized_base_url

    session.add(record)
    await session.commit()
    await session.refresh(record)
    return record


async def parse_transactions_with_ai(  # noqa: PLR0912, PLR0914, PLR0915, C901
    user_id: uuid.UUID,
    text: str | None,
    images: list[tuple[str, str]],
    session: AsyncSession,
    timezone: str | None = None,
) -> ParsedTransactionsResult:
    record = await get_ai_provider_record(user_id, session)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No AI provider configured. Set up your API key at /api/users/me/ai-provider.",
        )

    user_result = await session.exec(select(User).where(User.id == user_id))
    user = user_result.first()
    custom_ai_prompt = user.custom_ai_prompt if user else None

    api_key = _decrypt_key(record.api_key_encrypted)

    if record.ocr_enabled and images:
        ocr_texts: list[str] = []
        remaining_images: list[tuple[str, str]] = []
        for img_b64, img_media_type in images:
            ocr_text = extract_text_from_base64(img_b64)
            if ocr_text is not None:
                ocr_texts.append(ocr_text)
            else:
                remaining_images.append((img_b64, img_media_type))
        if ocr_texts:
            combined_ocr = "\n\n".join(f"OCR extracted from receipt image:\n{t}" for t in ocr_texts)
            text = f"{combined_ocr}\n\n{text}" if text else combined_ocr
        images = remaining_images

    cat_result = await session.exec(select(Category).where(Category.user_id == user_id))
    existing_categories = cat_result.all()
    category_names = [c.name for c in existing_categories]

    tag_result = await session.exec(select(Tag).where(Tag.user_id == user_id))
    existing_tags = tag_result.all()
    tag_names = [t.name for t in existing_tags]

    wallet_result = await session.exec(select(Wallet).where(Wallet.user_id == user_id))
    user_wallets = wallet_result.all()
    wallet_context = [(w.name, w.currency) for w in user_wallets]
    wallet_by_name = {w.name.lower(): str(w.id) for w in user_wallets}

    provider = get_provider(
        record.provider, api_key=api_key, model=record.model, base_url=record.base_url
    )

    try:
        output = await provider.parse_transactions(
            text=text,
            images=images,
            categories=category_names,
            tags=tag_names,
            wallets=wallet_context if len(wallet_context) > 1 else None,
            timezone=timezone or "UTC",
            custom_prompt=custom_ai_prompt,
        )
    except ProviderAuthError as exc:
        logger.warning("AI transaction parse failed - auth error for user %s: %s", user_id, exc)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid API key. Please update your AI provider configuration.",
        ) from exc
    except ProviderPermissionError as exc:
        logger.warning(
            "AI transaction parse failed - permission error for user %s: %s", user_id, exc
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="AI provider request was denied. Your API key may have insufficient credits or billing issues.",
        ) from exc
    except ProviderRateLimitError as exc:
        logger.warning("AI transaction parse failed - rate limit for user %s: %s", user_id, exc)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="AI provider rate limit exceeded. Please try again later.",
        ) from exc
    except ProviderConnectionError as exc:
        logger.exception(
            "AI transaction parse failed - connection error for user %s model=%s",
            user_id,
            record.model,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not connect to AI provider: {exc}",
        ) from exc
    except ProviderAPIError as exc:
        logger.exception(
            "AI transaction parse failed - API error for user %s model=%s", user_id, record.model
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"AI provider error: {exc}"
        ) from exc
    except (ValueError, KeyError) as exc:
        logger.exception("AI transaction parse failed - parse error for user %s", user_id)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Could not parse transaction from input: {exc}",
        ) from exc

    existing_category_names_lower = {c.name.lower() for c in existing_categories}
    existing_tag_names_lower = {t.name.lower() for t in existing_tags}

    def _enrich_recurring(parsed_rec: ParsedRecurringTransaction) -> ParsedRecurringResult:
        is_new = parsed_rec.category_name.lower() not in existing_category_names_lower
        tags = [
            SuggestedTagResult(name=n, is_new=n.lower() not in existing_tag_names_lower)
            for n in parsed_rec.suggested_tags
        ]
        return ParsedRecurringResult(
            amount=parsed_rec.amount,
            category_name=parsed_rec.category_name,
            is_new_category=is_new,
            description=parsed_rec.description,
            frequency=parsed_rec.frequency,
            next_due=parsed_rec.next_due,
            ai_context=parsed_rec.ai_context,
            type=parsed_rec.type,
            suggested_tags=tags,
            suggested_icon=parsed_rec.suggested_icon
            if (is_new and parsed_rec.suggested_icon in LUCIDE_ICONS)
            else None,
        )

    def _enrich_transaction(parsed_txn: ParsedTransaction) -> ParsedTransactionResult:
        is_new = parsed_txn.category_name.lower() not in existing_category_names_lower
        tags = [
            SuggestedTagResult(name=n, is_new=n.lower() not in existing_tag_names_lower)
            for n in parsed_txn.suggested_tags
        ]
        return ParsedTransactionResult(
            amount=parsed_txn.amount,
            category_name=parsed_txn.category_name,
            is_new_category=is_new,
            description=parsed_txn.description,
            date=parsed_txn.date,
            ai_context=parsed_txn.ai_context,
            type=parsed_txn.type,
            suggested_tags=tags,
            suggested_icon=parsed_txn.suggested_icon
            if (is_new and parsed_txn.suggested_icon in LUCIDE_ICONS)
            else None,
        )

    enriched_transactions = [_enrich_transaction(e) for e in output.expenses]

    enriched_group: ParsedGroupResult | None = None
    if output.group is not None:
        g = output.group
        is_new = g.category_name.lower() not in existing_category_names_lower
        g_tags = [
            SuggestedTagResult(name=n, is_new=n.lower() not in existing_tag_names_lower)
            for n in g.suggested_tags
        ]
        enriched_group = ParsedGroupResult(
            description=g.description,
            amount=g.amount,
            category_name=g.category_name,
            is_new_category=is_new,
            date=g.date,
            ai_context=g.ai_context,
            type=g.type,
            suggested_tags=g_tags,
            suggested_icon=g.suggested_icon
            if (is_new and g.suggested_icon in LUCIDE_ICONS)
            else None,
        )

    enriched_recurring: ParsedRecurringResult | None = None
    if output.recurring is not None:
        enriched_recurring = _enrich_recurring(output.recurring)

    suggested_wallet_id: str | None = None
    if output.suggested_wallet_name:
        suggested_wallet_id = wallet_by_name.get(output.suggested_wallet_name.lower())

    return ParsedTransactionsResult(
        result_type=output.result_type,
        expenses=enriched_transactions,
        group=enriched_group,
        recurring=enriched_recurring,
        suggested_wallet_id=suggested_wallet_id,
    )


@dataclass
class CategorizeTransactionResult:
    category_name: str
    is_new_category: bool
    suggested_icon: str | None
    suggested_tags: list[SuggestedTagResult]


async def categorize_transaction_with_ai(  # noqa: PLR0913, PLR0917
    user_id: uuid.UUID,
    description: str | None,
    amount: float,
    transaction_type: str,
    date: str,
    session: AsyncSession,
) -> CategorizeTransactionResult:
    text_parts: list[str] = []
    if description:
        text_parts.append(f"Description: {description}")
    text_parts.extend([f"Amount: {amount}", f"Type: {transaction_type}", f"Date: {date}"])
    text = "\n".join(text_parts)

    result = await parse_transactions_with_ai(
        user_id=user_id, text=text, images=[], session=session
    )

    if not result.expenses:
        msg = "AI could not suggest a category for this transaction"
        raise ValueError(msg)

    expense = result.expenses[0]
    return CategorizeTransactionResult(
        category_name=expense.category_name,
        is_new_category=expense.is_new_category,
        suggested_icon=expense.suggested_icon,
        suggested_tags=expense.suggested_tags,
    )
