from __future__ import annotations

import operator
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from mcp.server.fastmcp import FastMCP
from sqlmodel import col, select

from app.database import get_session
from app.models.api_token import APIToken
from app.models.category import Category
from app.models.expense import Expense
from app.models.user import User
from app.models.wallet import Wallet
from app.services.auth import hash_api_token

mcp = FastMCP(
    name="Zeni",
    instructions=(
        "Zeni is a personal expense tracker. "
        "Use these tools to create and query expense records on behalf of the authenticated user. "
        "All tools require a valid API token passed as the `token` argument."
    ),
)


async def _resolve_user(token: str) -> User | None:
    token_hash = hash_api_token(token)
    async for session in get_session():
        result = await session.exec(select(APIToken).where(APIToken.token_hash == token_hash))
        api_token = result.first()
        if not api_token:
            return None
        if api_token.expires_at and api_token.expires_at < datetime.now(UTC):
            return None
        api_token.last_used = datetime.now(UTC)
        session.add(api_token)
        await session.commit()
        user_result = await session.exec(select(User).where(User.id == api_token.user_id))
        return user_result.first()
    return None


def _parse_uuid(value: str, name: str) -> uuid.UUID | str:
    try:
        return uuid.UUID(value)
    except ValueError:
        return f"Invalid {name}"


def _parse_dt(value: str, name: str) -> datetime | str:
    try:
        return datetime.fromisoformat(value).replace(tzinfo=UTC)
    except ValueError:
        return f"Invalid {name}: {value}"


@mcp.tool()
async def list_wallets(token: str) -> list[dict[str, Any]]:
    """List all wallets belonging to the authenticated user."""
    user = await _resolve_user(token)
    if not user:
        return [{"error": "Invalid or expired token"}]
    async for session in get_session():
        result = await session.exec(select(Wallet).where(Wallet.user_id == user.id))
        return [
            {
                "id": str(w.id),
                "name": w.name,
                "currency": w.currency,
                "is_default": w.is_default,
                "created_at": w.created_at.isoformat(),
            }
            for w in result.all()
        ]
    return []


@mcp.tool()
async def list_categories(token: str) -> list[dict[str, Any]]:
    """List all categories belonging to the authenticated user."""
    user = await _resolve_user(token)
    if not user:
        return [{"error": "Invalid or expired token"}]
    async for session in get_session():
        result = await session.exec(select(Category).where(Category.user_id == user.id))
        return [
            {
                "id": str(c.id),
                "name": c.name,
                "icon": c.icon,
                "color": c.color,
                "type": c.type,
                "is_system": c.is_system,
            }
            for c in result.all()
        ]
    return []


@dataclass
class ListExpensesInput:
    token: str
    wallet_id: str
    limit: int = 20
    start_date: str | None = None
    end_date: str | None = None
    category_id: str | None = None


def _apply_date_filters(
    query: Any, start_date: str | None, end_date: str | None
) -> tuple[Any, str | None]:
    if start_date:
        dt = _parse_dt(start_date, "start_date")
        if isinstance(dt, str):
            return query, dt
        query = query.where(col(Expense.date) >= dt)
    if end_date:
        dt = _parse_dt(end_date, "end_date")
        if isinstance(dt, str):
            return query, dt
        query = query.where(col(Expense.date) <= dt)
    return query, None


async def _fetch_expenses(
    params: ListExpensesInput, user_id: uuid.UUID
) -> list[dict[str, Any]] | str:
    w_id = _parse_uuid(params.wallet_id, "wallet_id")
    if isinstance(w_id, str):
        return w_id

    limit = min(max(1, params.limit), 100)

    async for session in get_session():
        wallet_result = await session.exec(
            select(Wallet).where(Wallet.id == w_id, Wallet.user_id == user_id)
        )
        if not wallet_result.first():
            return "Wallet not found"

        query = select(Expense).where(Expense.wallet_id == w_id)
        query, err = _apply_date_filters(query, params.start_date, params.end_date)
        if err:
            return err

        if params.category_id:
            c_id = _parse_uuid(params.category_id, "category_id")
            if isinstance(c_id, str):
                return c_id
            query = query.where(Expense.category_id == c_id)

        query = query.order_by(col(Expense.date).desc()).limit(limit)
        result = await session.exec(query)
        expenses = result.all()

        rows = []
        for e in expenses:
            cat_result = await session.exec(select(Category).where(Category.id == e.category_id))
            cat = cat_result.first()
            rows.append(
                {
                    "id": str(e.id),
                    "wallet_id": str(e.wallet_id),
                    "amount": e.amount,
                    "description": e.description,
                    "date": e.date.isoformat(),
                    "category": cat.name if cat else "Unknown",
                    "category_id": str(e.category_id),
                    "created_at": e.created_at.isoformat(),
                }
            )
        return rows
    return "Database error"


@mcp.tool()
async def list_expenses(params: ListExpensesInput) -> list[dict[str, Any]]:
    """
    List expenses for a wallet with optional filters.

    Args:
        params.token: API token for authentication.
        params.wallet_id: UUID of the wallet to query.
        params.limit: Maximum number of results (default 20, max 100).
        params.start_date: ISO 8601 start date filter (e.g. "2024-01-01").
        params.end_date: ISO 8601 end date filter (e.g. "2024-01-31").
        params.category_id: UUID of category to filter by.
    """
    user = await _resolve_user(params.token)
    if not user:
        return [{"error": "Invalid or expired token"}]
    result = await _fetch_expenses(params, user.id)
    if isinstance(result, str):
        return [{"error": result}]
    return result


@dataclass
class GetSummaryInput:
    token: str
    wallet_id: str
    start_date: str | None = None
    end_date: str | None = None


async def _compute_summary(params: GetSummaryInput, user_id: uuid.UUID) -> dict[str, Any] | str:
    w_id = _parse_uuid(params.wallet_id, "wallet_id")
    if isinstance(w_id, str):
        return w_id

    async for session in get_session():
        wallet_result = await session.exec(
            select(Wallet).where(Wallet.id == w_id, Wallet.user_id == user_id)
        )
        if not wallet_result.first():
            return "Wallet not found"

        query = select(Expense).where(Expense.wallet_id == w_id)
        query, err = _apply_date_filters(query, params.start_date, params.end_date)
        if err:
            return err

        result = await session.exec(query)
        expenses = result.all()

        total = sum(e.amount for e in expenses)
        by_category: dict[str, dict[str, Any]] = {}
        for e in expenses:
            cid = str(e.category_id)
            if cid not in by_category:
                cat_result = await session.exec(
                    select(Category).where(Category.id == e.category_id)
                )
                cat = cat_result.first()
                by_category[cid] = {
                    "category_id": cid,
                    "category_name": cat.name if cat else "Unknown",
                    "total": 0.0,
                    "count": 0,
                }
            by_category[cid]["total"] += e.amount
            by_category[cid]["count"] += 1

        return {
            "wallet_id": params.wallet_id,
            "total_amount": total,
            "expense_count": len(expenses),
            "by_category": sorted(
                by_category.values(), key=operator.itemgetter("total"), reverse=True
            ),
        }
    return "Database error"


@mcp.tool()
async def get_summary(params: GetSummaryInput) -> dict[str, Any]:
    """
    Get a spending summary for a wallet.

    Returns total amount, expense count, and breakdown by category.

    Args:
        params.token: API token for authentication.
        params.wallet_id: UUID of the wallet to summarize.
        params.start_date: ISO 8601 start date filter.
        params.end_date: ISO 8601 end date filter.
    """
    user = await _resolve_user(params.token)
    if not user:
        return {"error": "Invalid or expired token"}
    result = await _compute_summary(params, user.id)
    if isinstance(result, str):
        return {"error": result}
    return result


@dataclass
class CreateExpenseInput:
    token: str
    wallet_id: str
    category_id: str
    amount: float
    description: str | None = None
    date: str | None = None


def _parse_create_expense_input(
    params: CreateExpenseInput,
) -> tuple[uuid.UUID, uuid.UUID, datetime] | str:
    w_id = _parse_uuid(params.wallet_id, "wallet_id")
    if isinstance(w_id, str):
        return w_id
    c_id = _parse_uuid(params.category_id, "category_id")
    if isinstance(c_id, str):
        return c_id
    expense_date: datetime = datetime.now(UTC)
    if params.date:
        parsed = _parse_dt(params.date, "date")
        if isinstance(parsed, str):
            return parsed
        expense_date = parsed
    return w_id, c_id, expense_date


async def _insert_expense(params: CreateExpenseInput, user_id: uuid.UUID) -> dict[str, Any] | str:
    parsed = _parse_create_expense_input(params)
    if isinstance(parsed, str):
        return parsed
    w_id, c_id, expense_date = parsed

    async for session in get_session():
        wallet_result = await session.exec(
            select(Wallet).where(Wallet.id == w_id, Wallet.user_id == user_id)
        )
        if not wallet_result.first():
            return "Wallet not found"

        cat_result = await session.exec(
            select(Category).where(Category.id == c_id, Category.user_id == user_id)
        )
        cat = cat_result.first()
        if not cat:
            return "Category not found"

        expense = Expense(
            wallet_id=w_id,
            category_id=c_id,
            amount=params.amount,
            description=params.description,
            date=expense_date,
        )
        session.add(expense)
        await session.commit()
        await session.refresh(expense)

        return {
            "id": str(expense.id),
            "wallet_id": str(expense.wallet_id),
            "category": cat.name,
            "category_id": str(expense.category_id),
            "amount": expense.amount,
            "description": expense.description,
            "date": expense.date.isoformat(),
            "created_at": expense.created_at.isoformat(),
        }
    return "Database error"


@mcp.tool()
async def create_expense(params: CreateExpenseInput) -> dict[str, Any]:
    """
    Create a new expense record.

    Args:
        params.token: API token for authentication.
        params.wallet_id: UUID of the wallet to add the expense to.
        params.category_id: UUID of the category for this expense.
        params.amount: Expense amount (must be positive).
        params.description: Optional description of the expense.
        params.date: ISO 8601 date string (defaults to now if omitted).
    """
    user = await _resolve_user(params.token)
    if not user:
        return {"error": "Invalid or expired token"}
    if params.amount <= 0:
        return {"error": "Amount must be positive"}
    result = await _insert_expense(params, user.id)
    if isinstance(result, str):
        return {"error": result}
    return result
