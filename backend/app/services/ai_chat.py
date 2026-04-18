from __future__ import annotations

import operator
from typing import TYPE_CHECKING

from fastapi import HTTPException, status
from sqlmodel import col, select

from app.models.category import Category
from app.models.transaction import Transaction
from app.models.wallet import Wallet
from app.providers import get_provider
from app.providers.base import ChatContext
from app.providers.errors import (
    ProviderAPIError,
    ProviderAuthError,
    ProviderPermissionError,
    ProviderRateLimitError,
)
from app.services.ai_transaction import _decrypt_key, get_ai_provider_record

if TYPE_CHECKING:
    import uuid

    from sqlmodel.ext.asyncio.session import AsyncSession

    from app.providers.base import ChatResponse

_MAX_RECENT = 10
_MAX_CATEGORIES = 20
_MAX_MONTHS = 12


async def _load_wallets(
    user_id: uuid.UUID, wallet_id: uuid.UUID | None, session: AsyncSession
) -> list[Wallet]:
    query = select(Wallet).where(Wallet.user_id == user_id)
    if wallet_id is not None:
        query = query.where(Wallet.id == wallet_id)
    result = await session.exec(query)
    return list(result.all())


async def _load_category_map(expense_list: list[Transaction], session: AsyncSession) -> dict:
    cat_ids = {e.category_id for e in expense_list}
    cat_map: dict = {}
    for cat_id in cat_ids:
        result = await session.exec(select(Category).where(Category.id == cat_id))
        cat = result.first()
        cat_map[cat_id] = cat.name if cat else "Unknown"
    return cat_map


def _build_by_category(expenses: list[Transaction], cat_map: dict) -> list[dict]:
    raw: dict = {}
    for e in expenses:
        name = cat_map.get(e.category_id, "Unknown")
        if name not in raw:
            raw[name] = {"category_name": name, "total": 0.0, "count": 0}
        raw[name]["total"] += e.amount
        raw[name]["count"] += 1
    return sorted(raw.values(), key=operator.itemgetter("total"), reverse=True)[:_MAX_CATEGORIES]


def _build_by_month(expenses: list[Transaction]) -> list[dict]:
    raw: dict = {}
    for e in expenses:
        period = e.date.strftime("%Y-%m")
        if period not in raw:
            raw[period] = {"period": period, "total": 0.0, "count": 0}
        raw[period]["total"] += e.amount
        raw[period]["count"] += 1
    return sorted(raw.values(), key=operator.itemgetter("period"), reverse=True)[:_MAX_MONTHS]


def _build_recent(expenses: list[Transaction], cat_map: dict) -> list[dict]:
    recent = sorted(expenses, key=operator.attrgetter("date"), reverse=True)[:_MAX_RECENT]
    return [
        {
            "date": e.date.strftime("%Y-%m-%d"),
            "category": cat_map.get(e.category_id, "Unknown"),
            "amount": e.amount,
            "description": e.description or "",
        }
        for e in recent
    ]


async def _build_context(
    expenses: list[Transaction], wallets: list[Wallet], session: AsyncSession, timezone: str = "UTC"
) -> ChatContext:
    wallet_names = [w.name for w in wallets]
    currency = wallets[0].currency if len(wallets) == 1 else "mixed"

    if not expenses:
        return ChatContext(
            total_expenses=0,
            total_amount=0.0,
            currency=currency,
            date_range="no data",
            by_category=[],
            by_month=[],
            recent_expenses=[],
            total_income=0.0,
            income_count=0,
            wallet_names=wallet_names,
            timezone=timezone,
        )

    expense_txns = [e for e in expenses if e.type == "expense"]
    income_txns = [e for e in expenses if e.type == "income"]
    cat_map = await _load_category_map(expense_txns, session)
    dates = [e.date for e in expenses]

    return ChatContext(
        total_expenses=len(expense_txns),
        total_amount=sum(e.amount for e in expense_txns),
        currency=currency,
        date_range=f"{min(dates).strftime('%Y-%m-%d')} to {max(dates).strftime('%Y-%m-%d')}",
        by_category=_build_by_category(expense_txns, cat_map),
        by_month=_build_by_month(expense_txns),
        recent_expenses=_build_recent(expenses, cat_map),
        total_income=sum(e.amount for e in income_txns),
        income_count=len(income_txns),
        wallet_names=wallet_names,
        timezone=timezone,
    )


async def chat_about_expenses(
    user_id: uuid.UUID,
    message: str,
    wallet_id: uuid.UUID | None,
    session: AsyncSession,
    timezone: str | None = None,
) -> ChatResponse:
    record = await get_ai_provider_record(user_id, session)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No AI provider configured. Set up your API key at /api/users/me/ai-provider.",
        )

    wallets = await _load_wallets(user_id, wallet_id, session)
    if wallet_id is not None and not wallets:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wallet not found")

    wallet_ids = [w.id for w in wallets]
    expense_result = await session.exec(
        select(Transaction).where(col(Transaction.wallet_id).in_(wallet_ids))
    )
    expenses = list(expense_result.all())

    context = await _build_context(expenses, wallets, session, timezone=timezone or "UTC")
    provider = get_provider(
        record.provider, api_key=_decrypt_key(record.api_key_encrypted), model=record.model
    )

    try:
        return await provider.chat_with_data(message=message, context=context)
    except ProviderAuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid API key. Please update your AI provider configuration.",
        ) from exc
    except ProviderPermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="AI provider request was denied. Your API key may have insufficient credits or billing issues.",
        ) from exc
    except ProviderRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="AI provider rate limit exceeded. Please try again later.",
        ) from exc
    except ProviderAPIError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"AI provider error: {exc}"
        ) from exc
