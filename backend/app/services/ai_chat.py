from __future__ import annotations

import logging
import operator
import time
from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Any

import httpx
from fastapi import HTTPException, status
from sqlmodel import and_, col, select

from app.models.category import Category
from app.models.transaction import Transaction
from app.models.wallet import Wallet
from app.providers import get_provider
from app.providers.base import ChatContext, ChatTool
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

logger = logging.getLogger(__name__)

_MAX_TOOL_RESULTS = 200

CHAT_TOOLS: list[ChatTool] = [
    ChatTool(
        name="get_transactions",
        description=(
            "Fetch individual transactions with optional filters. "
            "Use this to look up specific transactions, recent activity, or filtered lists."
        ),
        parameters={
            "type": "object",
            "properties": {
                "date_from": {
                    "type": "string",
                    "description": "Start date filter (ISO 8601, YYYY-MM-DD), inclusive.",
                },
                "date_to": {
                    "type": "string",
                    "description": "End date filter (ISO 8601, YYYY-MM-DD), inclusive.",
                },
                "type": {
                    "type": "string",
                    "enum": ["expense", "income"],
                    "description": "Filter by transaction type. Omit to include both.",
                },
                "category_name": {
                    "type": "string",
                    "description": "Filter by category name (case-insensitive, partial match).",
                },
                "limit": {
                    "type": "integer",
                    "description": f"Maximum number of results to return (default 50, max {_MAX_TOOL_RESULTS}).",
                    "default": 50,
                },
                "offset": {
                    "type": "integer",
                    "description": "Number of results to skip for pagination (default 0).",
                    "default": 0,
                },
            },
            "required": [],
        },
    ),
    ChatTool(
        name="get_spending_summary",
        description=(
            "Get aggregate totals for expenses and income over a date range. "
            "Returns total amounts, counts, and net balance."
        ),
        parameters={
            "type": "object",
            "properties": {
                "date_from": {
                    "type": "string",
                    "description": "Start date (ISO 8601, YYYY-MM-DD), inclusive.",
                },
                "date_to": {
                    "type": "string",
                    "description": "End date (ISO 8601, YYYY-MM-DD), inclusive.",
                },
            },
            "required": [],
        },
    ),
    ChatTool(
        name="get_category_breakdown",
        description=(
            "Get spending or income totals grouped by category over a date range. "
            "Useful for 'what did I spend most on' or 'top categories' questions."
        ),
        parameters={
            "type": "object",
            "properties": {
                "date_from": {
                    "type": "string",
                    "description": "Start date (ISO 8601, YYYY-MM-DD), inclusive.",
                },
                "date_to": {
                    "type": "string",
                    "description": "End date (ISO 8601, YYYY-MM-DD), inclusive.",
                },
                "type": {
                    "type": "string",
                    "enum": ["expense", "income"],
                    "description": "Which transaction type to break down. Defaults to 'expense'.",
                    "default": "expense",
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of categories to return (default 20).",
                    "default": 20,
                },
            },
            "required": [],
        },
    ),
    ChatTool(
        name="get_monthly_trend",
        description=(
            "Get expense and income totals grouped by month. "
            "Useful for trend analysis, comparing months, or spotting patterns over time."
        ),
        parameters={
            "type": "object",
            "properties": {
                "date_from": {
                    "type": "string",
                    "description": "Start date (ISO 8601, YYYY-MM-DD), inclusive.",
                },
                "date_to": {
                    "type": "string",
                    "description": "End date (ISO 8601, YYYY-MM-DD), inclusive.",
                },
                "months": {
                    "type": "integer",
                    "description": "Number of most recent months to return if no date range given (default 12).",
                    "default": 12,
                },
            },
            "required": [],
        },
    ),
    ChatTool(
        name="convert_currency",
        description=(
            "Convert an amount from one currency to another using live exchange rates. "
            "Use this when the user asks 'how much is X in Y', wants amounts shown in a different currency, "
            "or asks about exchange rates between currencies."
        ),
        parameters={
            "type": "object",
            "properties": {
                "amount": {"type": "number", "description": "The amount to convert."},
                "from_currency": {
                    "type": "string",
                    "description": "Source currency code (e.g. USD, EUR, GBP).",
                },
                "to_currency": {
                    "type": "string",
                    "description": "Target currency code (e.g. USD, EUR, GBP).",
                },
            },
            "required": ["amount", "from_currency", "to_currency"],
        },
    ),
]


async def _load_wallets(
    user_id: uuid.UUID, wallet_id: uuid.UUID | None, session: AsyncSession
) -> list[Wallet]:
    query = select(Wallet).where(Wallet.user_id == user_id)
    if wallet_id is not None:
        query = query.where(Wallet.id == wallet_id)
    result = await session.exec(query)
    return list(result.all())


def _parse_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _build_date_filters(date_from: str | None, date_to: str | None) -> list[Any]:
    filters: list[Any] = []
    df = _parse_date(date_from)
    dt = _parse_date(date_to)
    if df:
        filters.append(Transaction.date >= df)
    if dt:
        filters.append(Transaction.date < dt + timedelta(days=1))
    return filters


def _make_executor(wallet_ids: list[Any], session: AsyncSession) -> Any:
    async def execute_tool(tool_name: str, args: dict[str, Any]) -> Any:
        logger.info("AI tool call: %s(%s)", tool_name, args)
        if tool_name == "get_transactions":
            result = await _tool_get_transactions(wallet_ids, session, args)
        elif tool_name == "get_spending_summary":
            result = await _tool_get_spending_summary(wallet_ids, session, args)
        elif tool_name == "get_category_breakdown":
            result = await _tool_get_category_breakdown(wallet_ids, session, args)
        elif tool_name == "get_monthly_trend":
            result = await _tool_get_monthly_trend(wallet_ids, session, args)
        elif tool_name == "convert_currency":
            result = await _tool_convert_currency(args)
        else:
            msg = f"Unknown tool: {tool_name}"
            raise ValueError(msg)
        logger.debug("AI tool result: %s → %s", tool_name, result)
        return result

    return execute_tool


async def _resolve_cat_map(txns: list[Transaction], session: AsyncSession) -> dict[Any, str]:
    cat_ids = {t.category_id for t in txns}
    cat_map: dict[Any, str] = {}
    for cat_id in cat_ids:
        r = await session.exec(select(Category).where(Category.id == cat_id))
        cat = r.first()
        if cat:
            cat_map[cat_id] = cat.name
    return cat_map


async def _tool_get_transactions(
    wallet_ids: list[Any], session: AsyncSession, args: dict[str, Any]
) -> dict[str, Any]:
    date_from: str | None = args.get("date_from")
    date_to: str | None = args.get("date_to")
    txn_type: str | None = args.get("type")
    category_name: str | None = args.get("category_name")
    limit = min(int(args.get("limit", 50)), _MAX_TOOL_RESULTS)
    offset = int(args.get("offset", 0))

    filters: list[Any] = [col(Transaction.wallet_id).in_(wallet_ids)]
    filters.extend(_build_date_filters(date_from, date_to))
    if txn_type:
        filters.append(Transaction.type == txn_type)

    result = await session.exec(
        select(Transaction).where(and_(*filters)).order_by(col(Transaction.date).desc())
    )
    all_txns = list(result.all())
    cat_map = await _resolve_cat_map(all_txns, session)

    if category_name:
        needle = category_name.lower()
        all_txns = [t for t in all_txns if needle in cat_map.get(t.category_id, "").lower()]

    total = len(all_txns)
    page = all_txns[offset : offset + limit]

    rows = [
        {
            "date": t.date.strftime("%Y-%m-%d"),
            "type": t.type,
            "amount": t.amount,
            "category": cat_map.get(t.category_id, "Unknown"),
            "description": t.description or "",
        }
        for t in page
    ]

    return {"transactions": rows, "total": total, "offset": offset, "limit": limit}


async def _tool_get_spending_summary(
    wallet_ids: list[Any], session: AsyncSession, args: dict[str, Any]
) -> dict[str, Any]:
    date_from: str | None = args.get("date_from")
    date_to: str | None = args.get("date_to")

    filters: list[Any] = [col(Transaction.wallet_id).in_(wallet_ids)]
    filters.extend(_build_date_filters(date_from, date_to))

    result = await session.exec(select(Transaction).where(and_(*filters)))
    txns = list(result.all())

    expenses = [t for t in txns if t.type == "expense"]
    income = [t for t in txns if t.type == "income"]

    return {
        "expense_total": sum(t.amount for t in expenses),
        "expense_count": len(expenses),
        "income_total": sum(t.amount for t in income),
        "income_count": len(income),
        "net_balance": sum(t.amount for t in income) - sum(t.amount for t in expenses),
        "date_from": date_from,
        "date_to": date_to,
    }


async def _tool_get_category_breakdown(
    wallet_ids: list[Any], session: AsyncSession, args: dict[str, Any]
) -> dict[str, Any]:
    date_from: str | None = args.get("date_from")
    date_to: str | None = args.get("date_to")
    txn_type: str = args.get("type", "expense")
    limit = int(args.get("limit", 20))

    filters: list[Any] = [col(Transaction.wallet_id).in_(wallet_ids), Transaction.type == txn_type]
    filters.extend(_build_date_filters(date_from, date_to))

    result = await session.exec(select(Transaction).where(and_(*filters)))
    txns = list(result.all())

    cat_ids = {t.category_id for t in txns}
    cat_map: dict[Any, str] = {}
    for cat_id in cat_ids:
        r = await session.exec(select(Category).where(Category.id == cat_id))
        cat = r.first()
        if cat:
            cat_map[cat_id] = cat.name

    raw: dict[str, dict[str, Any]] = {}
    for t in txns:
        name = cat_map.get(t.category_id, "Unknown")
        if name not in raw:
            raw[name] = {"category": name, "total": 0.0, "count": 0}
        raw[name]["total"] += t.amount
        raw[name]["count"] += 1

    breakdown = sorted(raw.values(), key=operator.itemgetter("total"), reverse=True)[:limit]
    return {"type": txn_type, "breakdown": breakdown, "date_from": date_from, "date_to": date_to}


async def _tool_get_monthly_trend(
    wallet_ids: list[Any], session: AsyncSession, args: dict[str, Any]
) -> dict[str, Any]:
    date_from: str | None = args.get("date_from")
    date_to: str | None = args.get("date_to")

    filters: list[Any] = [col(Transaction.wallet_id).in_(wallet_ids)]
    filters.extend(_build_date_filters(date_from, date_to))

    result = await session.exec(
        select(Transaction).where(and_(*filters)).order_by(col(Transaction.date).desc())
    )
    txns = list(result.all())

    months_limit = int(args.get("months", 12))

    raw: dict[str, dict[str, Any]] = {}
    for t in txns:
        period = t.date.strftime("%Y-%m")
        if period not in raw:
            raw[period] = {"period": period, "expense_total": 0.0, "income_total": 0.0, "count": 0}
        if t.type == "expense":
            raw[period]["expense_total"] += t.amount
        else:
            raw[period]["income_total"] += t.amount
        raw[period]["count"] += 1

    trend = sorted(raw.values(), key=operator.itemgetter("period"), reverse=True)[:months_limit]
    return {"trend": trend}


_fx_cache: dict[str, tuple[float, float]] = {}
_FX_TTL = 3600.0


async def _tool_convert_currency(args: dict[str, Any]) -> dict[str, Any]:
    amount = float(args["amount"])
    from_cur = str(args["from_currency"]).upper()
    to_cur = str(args["to_currency"]).upper()

    if from_cur == to_cur:
        return {"from_currency": from_cur, "to_currency": to_cur, "rate": 1.0, "result": amount}

    cache_key = f"{from_cur}:{to_cur}"
    cached = _fx_cache.get(cache_key)
    if cached and time.time() - cached[1] < _FX_TTL:
        rate = cached[0]
    else:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"https://open.er-api.com/v6/latest/{from_cur}")
        if resp.status_code != 200:
            msg = f"Exchange rate API returned {resp.status_code}"
            raise ValueError(msg)
        data = resp.json()
        if data.get("result") != "success":
            msg = f"Exchange rate API error: {data.get('error-type', 'unknown')}"
            raise ValueError(msg)
        rate = data["rates"].get(to_cur)
        if rate is None:
            msg = f"Unsupported currency: {to_cur}"
            raise ValueError(msg)
        _fx_cache[cache_key] = (float(rate), time.time())

    return {
        "from_currency": from_cur,
        "to_currency": to_cur,
        "rate": rate,
        "amount": amount,
        "result": round(amount * rate, 6),
    }


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
    currency = wallets[0].currency if len(wallets) == 1 else "mixed"

    context = ChatContext(
        wallet_ids=[str(w) for w in wallet_ids],
        wallet_names=[w.name for w in wallets],
        currency=currency,
        timezone=timezone or "UTC",
    )

    tool_executor = _make_executor(wallet_ids, session)
    provider = get_provider(
        record.provider, api_key=_decrypt_key(record.api_key_encrypted), model=record.model
    )

    try:
        return await provider.chat_with_data(
            message=message, context=context, tools=CHAT_TOOLS, tool_executor=tool_executor
        )
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
