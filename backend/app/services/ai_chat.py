from __future__ import annotations

import logging
import operator
import time
import uuid
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any

import httpx
from fastapi import HTTPException, status
from sqlmodel import and_, col, select

from app.models.category import Category
from app.models.tag import Tag
from app.models.transaction import Transaction, TransactionTag
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
from app.services.category_tag import find_or_create_category, find_or_create_tag
from app.services.transfers import (
    create_transfer_pair,
    delete_transfer_pair,
    exclude_transfer_transactions,
    get_counterpart_transaction,
    get_transfer_transaction_ids,
    is_transfer_transaction,
    replace_transaction_tags,
    update_transfer_pair,
)

if TYPE_CHECKING:
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
                "include_transfers": {
                    "type": "boolean",
                    "description": "Whether to include internal wallet transfers in the list. Defaults to true.",
                    "default": True,
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
            "Returns total amounts, counts, and net balance. Transfers are excluded by default."
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
                "include_transfers": {
                    "type": "boolean",
                    "description": "Include internal wallet transfers in totals. Defaults to false.",
                    "default": False,
                },
            },
            "required": [],
        },
    ),
    ChatTool(
        name="get_category_breakdown",
        description=(
            "Get spending or income totals grouped by category over a date range. "
            "Useful for 'what did I spend most on' or 'top categories' questions. "
            "Transfers are excluded by default."
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
                "include_transfers": {
                    "type": "boolean",
                    "description": "Include internal wallet transfers in the category totals. Defaults to false.",
                    "default": False,
                },
            },
            "required": [],
        },
    ),
    ChatTool(
        name="get_monthly_trend",
        description=(
            "Get expense and income totals grouped by month. "
            "Useful for trend analysis, comparing months, or spotting patterns over time. "
            "Transfers are excluded by default."
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
                "include_transfers": {
                    "type": "boolean",
                    "description": "Include internal wallet transfers in the monthly totals. Defaults to false.",
                    "default": False,
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
    ChatTool(
        name="list_wallets",
        description="List all wallets for the current user with their IDs, names, and currencies.",
        parameters={"type": "object", "properties": {}, "required": []},
    ),
    ChatTool(
        name="list_categories",
        description="List all categories for the current user. Use to find category IDs before creating or filtering transactions.",
        parameters={"type": "object", "properties": {}, "required": []},
    ),
    ChatTool(
        name="list_tags",
        description="List all tags for the current user. Use to find tag IDs or names before creating transactions.",
        parameters={"type": "object", "properties": {}, "required": []},
    ),
    ChatTool(
        name="get_transaction",
        description="Get a single transaction by its ID.",
        parameters={
            "type": "object",
            "properties": {
                "wallet_id": {
                    "type": "string",
                    "description": "UUID of the wallet containing the transaction.",
                },
                "transaction_id": {"type": "string", "description": "UUID of the transaction."},
            },
            "required": ["wallet_id", "transaction_id"],
        },
    ),
    ChatTool(
        name="create_transaction",
        description=(
            "Create a new expense or income transaction. "
            "Categories and tags are auto-created if they don't exist. "
            "Do not use this for transfers between the user's own wallets; use create_transfer. "
            "Use list_wallets first if you don't know the wallet ID."
        ),
        parameters={
            "type": "object",
            "properties": {
                "wallet_id": {
                    "type": "string",
                    "description": "UUID of the wallet to add the transaction to.",
                },
                "amount": {
                    "type": "number",
                    "description": "Transaction amount (must be positive).",
                },
                "type": {
                    "type": "string",
                    "enum": ["expense", "income"],
                    "description": "Transaction type (default: expense).",
                    "default": "expense",
                },
                "category_name": {
                    "type": "string",
                    "description": "Category name — created if it doesn't exist. Use this or category_id, not both.",
                },
                "category_id": {
                    "type": "string",
                    "description": "UUID of an existing category. Use this or category_name, not both.",
                },
                "description": {"type": "string", "description": "Optional description."},
                "ai_context": {
                    "type": "string",
                    "description": "Optional context or notes about this transfer.",
                },
                "date": {
                    "type": "string",
                    "description": "ISO 8601 date (defaults to now if omitted).",
                },
                "tag_names": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Tag names to attach — created if they don't exist.",
                },
            },
            "required": ["wallet_id", "amount"],
        },
    ),
    ChatTool(
        name="create_transfer",
        description=(
            "Create a transfer between two of the user's own wallets. "
            "This creates the linked expense and income entries and marks both as transfers. "
            "Use list_wallets first if you don't know the wallet IDs."
        ),
        parameters={
            "type": "object",
            "properties": {
                "from_wallet_id": {
                    "type": "string",
                    "description": "UUID of the source wallet the money leaves.",
                },
                "to_wallet_id": {
                    "type": "string",
                    "description": "UUID of the destination wallet receiving the money.",
                },
                "amount": {
                    "type": "number",
                    "description": "Amount leaving the source wallet (must be positive).",
                },
                "to_amount": {
                    "type": "number",
                    "description": "Amount received by the destination wallet. Omit when it is the same as amount.",
                },
                "category_name": {
                    "type": "string",
                    "description": "Category name, defaults to Transfer and is created if needed.",
                    "default": "Transfer",
                },
                "category_id": {
                    "type": "string",
                    "description": "UUID of an existing category. Use this or category_name, not both.",
                },
                "description": {"type": "string", "description": "Optional description."},
                "date": {
                    "type": "string",
                    "description": "ISO 8601 date (defaults to now if omitted).",
                },
                "tag_names": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Tag names to attach to both transfer entries.",
                },
            },
            "required": ["from_wallet_id", "to_wallet_id", "amount"],
        },
    ),
    ChatTool(
        name="update_transaction",
        description="Update an existing transaction. Only provided fields are changed.",
        parameters={
            "type": "object",
            "properties": {
                "wallet_id": {
                    "type": "string",
                    "description": "UUID of the wallet containing the transaction.",
                },
                "transaction_id": {
                    "type": "string",
                    "description": "UUID of the transaction to update.",
                },
                "amount": {"type": "number", "description": "New amount (must be positive)."},
                "type": {
                    "type": "string",
                    "enum": ["expense", "income"],
                    "description": "New transaction type.",
                },
                "category_id": {"type": "string", "description": "New category UUID."},
                "description": {"type": "string", "description": "New description."},
                "date": {"type": "string", "description": "New date (ISO 8601)."},
                "tag_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Replace all tags with these tag UUIDs.",
                },
            },
            "required": ["wallet_id", "transaction_id"],
        },
    ),
    ChatTool(
        name="delete_transaction",
        description="Delete a transaction by ID. Also deletes child transactions if this is a group parent.",
        parameters={
            "type": "object",
            "properties": {
                "wallet_id": {
                    "type": "string",
                    "description": "UUID of the wallet containing the transaction.",
                },
                "transaction_id": {
                    "type": "string",
                    "description": "UUID of the transaction to delete.",
                },
            },
            "required": ["wallet_id", "transaction_id"],
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


def _bool_arg(args: dict[str, Any], key: str, default: bool) -> bool:
    value = args.get(key, default)
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower() in {"1", "true", "yes", "on"}
    return bool(value)


def _make_executor(
    wallet_ids: list[Any],
    all_wallet_ids: list[Any],
    wallets: list[Wallet],
    user_id: uuid.UUID,
    session: AsyncSession,
) -> Any:
    async def execute_tool(tool_name: str, args: dict[str, Any]) -> Any:  # noqa: PLR0912
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
        elif tool_name == "list_wallets":
            result = _tool_list_wallets(wallets)
        elif tool_name == "list_categories":
            result = await _tool_list_categories(user_id, session)
        elif tool_name == "list_tags":
            result = await _tool_list_tags(user_id, session)
        elif tool_name == "get_transaction":
            result = await _tool_get_transaction(wallet_ids, session, args)
        elif tool_name == "create_transaction":
            result = await _tool_create_transaction(wallet_ids, user_id, session, args)
        elif tool_name == "create_transfer":
            result = await _tool_create_transfer(all_wallet_ids, user_id, session, args)
        elif tool_name == "update_transaction":
            result = await _tool_update_transaction(wallet_ids, user_id, session, args)
        elif tool_name == "delete_transaction":
            result = await _tool_delete_transaction(wallet_ids, session, args)
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


async def _tool_get_transactions(  # noqa: PLR0914
    wallet_ids: list[Any], session: AsyncSession, args: dict[str, Any]
) -> dict[str, Any]:
    date_from: str | None = args.get("date_from")
    date_to: str | None = args.get("date_to")
    txn_type: str | None = args.get("type")
    category_name: str | None = args.get("category_name")
    include_transfers = _bool_arg(args, "include_transfers", True)
    limit = min(int(args.get("limit", 50)), _MAX_TOOL_RESULTS)
    offset = int(args.get("offset", 0))

    filters: list[Any] = [col(Transaction.wallet_id).in_(wallet_ids)]
    filters.extend(_build_date_filters(date_from, date_to))
    if txn_type:
        filters.append(Transaction.type == txn_type)

    query = select(Transaction).where(and_(*filters)).order_by(col(Transaction.date).desc())
    if not include_transfers:
        query = exclude_transfer_transactions(query)

    result = await session.exec(query)
    all_txns = list(result.all())
    cat_map = await _resolve_cat_map(all_txns, session)
    transfer_ids = await get_transfer_transaction_ids(session, [t.id for t in all_txns])

    if category_name:
        needle = category_name.lower()
        all_txns = [t for t in all_txns if needle in cat_map.get(t.category_id, "").lower()]

    total = len(all_txns)
    page = all_txns[offset : offset + limit]

    rows = [
        {
            "id": str(t.id),
            "wallet_id": str(t.wallet_id),
            "date": t.date.strftime("%Y-%m-%d"),
            "type": t.type,
            "amount": t.amount,
            "is_transfer": t.id in transfer_ids,
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
    include_transfers = _bool_arg(args, "include_transfers", False)

    filters: list[Any] = [col(Transaction.wallet_id).in_(wallet_ids)]
    filters.extend(_build_date_filters(date_from, date_to))
    query = select(Transaction).where(and_(*filters))
    if not include_transfers:
        query = exclude_transfer_transactions(query)

    result = await session.exec(query)
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


async def _tool_get_category_breakdown(  # noqa: PLR0914
    wallet_ids: list[Any], session: AsyncSession, args: dict[str, Any]
) -> dict[str, Any]:
    date_from: str | None = args.get("date_from")
    date_to: str | None = args.get("date_to")
    txn_type: str = args.get("type", "expense")
    limit = int(args.get("limit", 20))
    include_transfers = _bool_arg(args, "include_transfers", False)

    filters: list[Any] = [col(Transaction.wallet_id).in_(wallet_ids), Transaction.type == txn_type]
    filters.extend(_build_date_filters(date_from, date_to))
    query = select(Transaction).where(and_(*filters))
    if not include_transfers:
        query = exclude_transfer_transactions(query)

    result = await session.exec(query)
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
    include_transfers = _bool_arg(args, "include_transfers", False)

    filters: list[Any] = [col(Transaction.wallet_id).in_(wallet_ids)]
    filters.extend(_build_date_filters(date_from, date_to))
    query = select(Transaction).where(and_(*filters)).order_by(col(Transaction.date).desc())
    if not include_transfers:
        query = exclude_transfer_transactions(query)

    result = await session.exec(query)
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


# Cache full rates dict per base currency: {base: (rates_dict, fetched_at)}
_fx_cache: dict[str, tuple[dict[str, float], float]] = {}
_FX_TTL = 3600.0


async def _tool_convert_currency(args: dict[str, Any]) -> dict[str, Any]:
    amount = float(args["amount"])
    from_cur = str(args["from_currency"]).upper()
    to_cur = str(args["to_currency"]).upper()

    if from_cur == to_cur:
        return {"from_currency": from_cur, "to_currency": to_cur, "rate": 1.0, "result": amount}

    cached = _fx_cache.get(from_cur)
    if cached and time.time() - cached[1] < _FX_TTL:
        rates = cached[0]
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
        rates = {k: float(v) for k, v in data["rates"].items()}
        _fx_cache[from_cur] = (rates, time.time())

    rate = rates.get(to_cur)
    if rate is None:
        msg = f"Unsupported currency: {to_cur}"
        raise ValueError(msg)

    return {
        "from_currency": from_cur,
        "to_currency": to_cur,
        "rate": rate,
        "amount": amount,
        "result": round(amount * rate, 6),
    }


def _tool_list_wallets(wallets: list[Wallet]) -> dict[str, Any]:
    return {"wallets": [{"id": str(w.id), "name": w.name, "currency": w.currency} for w in wallets]}


async def _tool_list_categories(user_id: uuid.UUID, session: AsyncSession) -> dict[str, Any]:
    result = await session.exec(select(Category).where(Category.user_id == user_id))
    return {
        "categories": [
            {"id": str(c.id), "name": c.name, "icon": c.icon, "color": c.color}
            for c in result.all()
        ]
    }


async def _tool_list_tags(user_id: uuid.UUID, session: AsyncSession) -> dict[str, Any]:
    result = await session.exec(select(Tag).where(Tag.user_id == user_id))
    return {"tags": [{"id": str(t.id), "name": t.name, "color": t.color} for t in result.all()]}


async def _tool_get_transaction(
    wallet_ids: list[Any], session: AsyncSession, args: dict[str, Any]
) -> dict[str, Any]:
    try:
        wallet_id = uuid.UUID(args["wallet_id"])
        transaction_id = uuid.UUID(args["transaction_id"])
    except (ValueError, KeyError) as exc:
        return {"error": str(exc)}

    if wallet_id not in wallet_ids:
        return {"error": "Wallet not found or not accessible"}

    t_result = await session.exec(
        select(Transaction).where(
            Transaction.id == transaction_id, Transaction.wallet_id == wallet_id
        )
    )
    t = t_result.first()
    if not t:
        return {"error": "Transaction not found"}

    cat_result = await session.exec(select(Category).where(Category.id == t.category_id))
    cat = cat_result.first()

    tag_result = await session.exec(
        select(Tag)
        .join(TransactionTag, col(Tag.id) == col(TransactionTag.tag_id))
        .where(col(TransactionTag.transaction_id) == t.id)
    )
    tags = [{"id": str(tag.id), "name": tag.name} for tag in tag_result.all()]
    linked_rows: list[dict[str, Any]] = []
    counterpart = await get_counterpart_transaction(session, t.id)
    if counterpart is not None:
        linked_rows = [
            {
                "id": str(counterpart.id),
                "wallet_id": str(counterpart.wallet_id),
                "type": counterpart.type,
                "amount": counterpart.amount,
                "description": counterpart.description or "",
                "date": counterpart.date.strftime("%Y-%m-%d"),
            }
        ]

    return {
        "id": str(t.id),
        "wallet_id": str(t.wallet_id),
        "type": t.type,
        "amount": t.amount,
        "is_transfer": counterpart is not None,
        "category": cat.name if cat else "Unknown",
        "category_id": str(t.category_id),
        "description": t.description or "",
        "date": t.date.strftime("%Y-%m-%d"),
        "tags": tags,
        "linked_transactions": linked_rows,
    }


async def _tool_create_transfer(  # noqa: PLR0911, PLR0912, PLR0914
    wallet_ids: list[Any], user_id: uuid.UUID, session: AsyncSession, args: dict[str, Any]
) -> dict[str, Any]:
    try:
        from_wallet_id = uuid.UUID(args["from_wallet_id"])
        to_wallet_id = uuid.UUID(args["to_wallet_id"])
    except ValueError, KeyError:
        return {"error": "Invalid from_wallet_id or to_wallet_id"}

    if from_wallet_id not in wallet_ids or to_wallet_id not in wallet_ids:
        return {"error": "Wallet not found or not accessible"}
    if from_wallet_id == to_wallet_id:
        return {"error": "Transfer destination must be a different wallet"}

    from_wallet_result = await session.exec(
        select(Wallet).where(Wallet.id == from_wallet_id, Wallet.user_id == user_id)
    )
    from_wallet = from_wallet_result.first()
    to_wallet_result = await session.exec(
        select(Wallet).where(Wallet.id == to_wallet_id, Wallet.user_id == user_id)
    )
    to_wallet = to_wallet_result.first()
    if from_wallet is None or to_wallet is None:
        return {"error": "Wallet not found or not accessible"}

    amount = float(args.get("amount", 0))
    if amount <= 0:
        return {"error": "Amount must be positive"}
    to_amount = float(args["to_amount"]) if args.get("to_amount") is not None else None
    if to_amount is not None and to_amount <= 0:
        return {"error": "Destination amount must be positive"}

    category_id_str: str | None = args.get("category_id")
    category_name: str | None = args.get("category_name")
    if category_id_str and category_name:
        return {"error": "Provide either category_id or category_name, not both"}
    if category_id_str:
        try:
            category_id = uuid.UUID(category_id_str)
        except ValueError:
            return {"error": "Invalid category_id"}
        category_result = await session.exec(
            select(Category).where(Category.id == category_id, Category.user_id == user_id)
        )
        category = category_result.first()
        if category is None:
            return {"error": "Category not found"}
    else:
        category = await find_or_create_category(
            user_id=user_id,
            name=category_name or "Transfer",
            session=session,
            icon="arrow-left-right",
        )
        category_id = category.id

    transfer_date = datetime.now(UTC)
    date_str: str | None = args.get("date")
    if date_str:
        parsed = _parse_date(date_str)
        if parsed:
            transfer_date = parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed

    tag_ids: list[uuid.UUID] = []
    for name in args.get("tag_names", []):
        tag = await find_or_create_tag(user_id=user_id, name=name, session=session)
        if tag.id not in tag_ids:
            tag_ids.append(tag.id)

    source_description = args.get("description") or f"Transfer to {to_wallet.name}"
    destination_description = args.get("description") or f"Transfer from {from_wallet.name}"

    source_transaction, destination_transaction, _ = await create_transfer_pair(
        session=session,
        source_wallet_id=from_wallet.id,
        destination_wallet_id=to_wallet.id,
        category_id=category_id,
        source_amount=amount,
        destination_amount=to_amount,
        description=args.get("description"),
        date=transfer_date,
        source_description=source_description,
        ai_context=args.get("ai_context"),
        destination_description=destination_description,
        tag_ids=tag_ids,
    )

    await session.commit()
    await session.refresh(source_transaction)
    await session.refresh(destination_transaction)

    return {
        "id": str(source_transaction.id),
        "linked_id": str(destination_transaction.id),
        "from_wallet_id": str(from_wallet.id),
        "to_wallet_id": str(to_wallet.id),
        "amount": source_transaction.amount,
        "to_amount": destination_transaction.amount,
        "category": category.name,
        "description": source_transaction.description or "",
        "date": source_transaction.date.strftime("%Y-%m-%d"),
        "is_transfer": True,
    }


async def _tool_create_transaction(  # noqa: PLR0911, PLR0912
    wallet_ids: list[Any], user_id: uuid.UUID, session: AsyncSession, args: dict[str, Any]
) -> dict[str, Any]:
    try:
        wallet_id = uuid.UUID(args["wallet_id"])
    except ValueError, KeyError:
        return {"error": "Invalid wallet_id"}

    if wallet_id not in wallet_ids:
        return {"error": "Wallet not found or not accessible"}

    amount = float(args.get("amount", 0))
    if amount <= 0:
        return {"error": "Amount must be positive"}

    txn_type = args.get("type", "expense")
    if txn_type not in {"expense", "income"}:
        return {"error": "type must be 'expense' or 'income'"}

    category_id_str: str | None = args.get("category_id")
    category_name: str | None = args.get("category_name")
    if category_id_str and category_name:
        return {"error": "Provide either category_id or category_name, not both"}
    if not category_id_str and not category_name:
        return {"error": "Provide either category_id or category_name"}

    if category_id_str:
        try:
            cat_id = uuid.UUID(category_id_str)
        except ValueError:
            return {"error": "Invalid category_id"}
        cat_result = await session.exec(
            select(Category).where(Category.id == cat_id, Category.user_id == user_id)
        )
        cat = cat_result.first()
        if not cat:
            return {"error": "Category not found"}
        resolved_category_id = cat_id
    else:
        assert category_name is not None
        cat = await find_or_create_category(user_id=user_id, name=category_name, session=session)
        resolved_category_id = cat.id

    transaction_date = datetime.now(UTC)
    date_str: str | None = args.get("date")
    if date_str:
        parsed = _parse_date(date_str)
        if parsed:
            transaction_date = parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed

    tag_ids: list[uuid.UUID] = []
    for name in args.get("tag_names", []):
        tag = await find_or_create_tag(user_id=user_id, name=name, session=session)
        if tag.id not in tag_ids:
            tag_ids.append(tag.id)

    transaction = Transaction(
        wallet_id=wallet_id,
        category_id=resolved_category_id,
        type=txn_type,
        amount=amount,
        description=args.get("description"),
        date=transaction_date,
    )
    session.add(transaction)
    await session.flush()

    for tag_id in tag_ids:
        session.add(TransactionTag(transaction_id=transaction.id, tag_id=tag_id))

    await session.commit()
    await session.refresh(transaction)

    return {
        "id": str(transaction.id),
        "wallet_id": str(transaction.wallet_id),
        "type": transaction.type,
        "amount": transaction.amount,
        "is_transfer": False,
        "category": cat.name,
        "description": transaction.description or "",
        "date": transaction.date.strftime("%Y-%m-%d"),
    }


async def _tool_update_transaction(  # noqa: C901, PLR0911, PLR0912, PLR0915
    wallet_ids: list[Any], user_id: uuid.UUID, session: AsyncSession, args: dict[str, Any]
) -> dict[str, Any]:
    try:
        wallet_id = uuid.UUID(args["wallet_id"])
        transaction_id = uuid.UUID(args["transaction_id"])
    except ValueError, KeyError:
        return {"error": "Invalid wallet_id or transaction_id"}

    if wallet_id not in wallet_ids:
        return {"error": "Wallet not found or not accessible"}

    t_result = await session.exec(
        select(Transaction).where(
            Transaction.id == transaction_id, Transaction.wallet_id == wallet_id
        )
    )
    t = t_result.first()
    if not t:
        return {"error": "Transaction not found"}

    if "type" in args and await is_transfer_transaction(session, t.id):
        return {"error": "Transfer transaction type cannot be changed"}

    amount: float | None = None
    if "amount" in args:
        amount = float(args["amount"])
        if amount <= 0:
            return {"error": "Amount must be positive"}

    parsed_date: datetime | None = None
    if "date" in args:
        parsed = _parse_date(args["date"])
        if not parsed:
            return {"error": "Invalid date format"}
        parsed_date = parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed

    cat_id: uuid.UUID | None = None
    if "category_id" in args:
        try:
            cat_id = uuid.UUID(args["category_id"])
        except ValueError:
            return {"error": "Invalid category_id"}
        cat_result = await session.exec(
            select(Category).where(Category.id == cat_id, Category.user_id == user_id)
        )
        if not cat_result.first():
            return {"error": "Category not found"}

    new_tag_ids: list[uuid.UUID] | None = None
    if "tag_ids" in args:
        new_tag_ids = []
        for tid_str in args["tag_ids"]:
            try:
                tid = uuid.UUID(tid_str)
            except ValueError:
                return {"error": f"Invalid tag_id: {tid_str}"}
            tag_check = await session.exec(select(Tag).where(Tag.id == tid, Tag.user_id == user_id))
            if not tag_check.first():
                return {"error": f"Tag {tid_str} not found"}
            new_tag_ids.append(tid)

    updated_at = datetime.now(UTC)
    transfer_updated = await update_transfer_pair(
        session=session,
        transaction=t,
        amount=amount,
        category_id=cat_id,
        description=args.get("description") if "description" in args else None,
        date=parsed_date,
        tag_ids=new_tag_ids,
        updated_at=updated_at,
    )

    if not transfer_updated:
        if amount is not None:
            t.amount = amount
        if "type" in args:
            if args["type"] not in {"expense", "income"}:
                return {"error": "type must be 'expense' or 'income'"}
            t.type = args["type"]
        if "description" in args:
            t.description = args["description"]
        if parsed_date is not None:
            t.date = parsed_date
        if cat_id is not None:
            t.category_id = cat_id
        t.updated_at = updated_at
        if new_tag_ids is not None:
            await replace_transaction_tags(session, t, new_tag_ids)
        session.add(t)

    await session.commit()
    await session.refresh(t)

    cat_result = await session.exec(select(Category).where(Category.id == t.category_id))
    cat = cat_result.first()

    return {
        "id": str(t.id),
        "wallet_id": str(t.wallet_id),
        "type": t.type,
        "amount": t.amount,
        "is_transfer": await is_transfer_transaction(session, t.id),
        "category": cat.name if cat else "Unknown",
        "description": t.description or "",
        "date": t.date.strftime("%Y-%m-%d"),
    }


async def _tool_delete_transaction(
    wallet_ids: list[Any], session: AsyncSession, args: dict[str, Any]
) -> dict[str, Any]:
    try:
        wallet_id = uuid.UUID(args["wallet_id"])
        transaction_id = uuid.UUID(args["transaction_id"])
    except ValueError, KeyError:
        return {"error": "Invalid wallet_id or transaction_id"}

    if wallet_id not in wallet_ids:
        return {"error": "Wallet not found or not accessible"}

    t_result = await session.exec(
        select(Transaction).where(
            Transaction.id == transaction_id, Transaction.wallet_id == wallet_id
        )
    )
    t = t_result.first()
    if not t:
        return {"error": "Transaction not found"}

    transactions_to_delete = await delete_transfer_pair(session, t)
    await session.commit()
    return {"deleted": [str(transaction.id) for transaction in transactions_to_delete]}


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
    all_wallets = await _load_wallets(user_id, None, session)

    wallet_ids = [w.id for w in wallets]
    all_wallet_ids = [w.id for w in all_wallets]
    currency = wallets[0].currency if len(wallets) == 1 else "mixed"

    context = ChatContext(
        wallet_ids=[str(w) for w in wallet_ids],
        wallet_names=[w.name for w in wallets],
        currency=currency,
        timezone=timezone or "UTC",
    )

    tool_executor = _make_executor(wallet_ids, all_wallet_ids, all_wallets, user_id, session)
    provider = get_provider(
        record.provider,
        api_key=_decrypt_key(record.api_key_encrypted),
        model=record.chat_model or record.model,
        base_url=record.base_url,
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
