from __future__ import annotations

import base64
import operator
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.provider import AccessToken, TokenVerifier
from mcp.server.auth.settings import AuthSettings
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import Icon
from pydantic import AnyHttpUrl
from sqlmodel import col, select

from app.config import settings as app_settings
from app.database import get_session
from app.models.api_token import APIToken
from app.models.category import Category
from app.models.transaction import Transaction
from app.models.user import User
from app.models.wallet import Wallet
from app.services.auth import hash_api_token

_icons_dir = Path(__file__).parent / "icons"


def _load_icon(filename: str, size: str) -> Icon:
    data = base64.standard_b64encode((_icons_dir / filename).read_bytes()).decode()
    return Icon(src=f"data:image/png;base64,{data}", mimeType="image/png", sizes=[size])


class ZeniTokenVerifier(TokenVerifier):
    async def verify_token(self, token: str) -> AccessToken | None:
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
            return AccessToken(
                token=token,
                client_id=str(api_token.user_id),
                scopes=["user"],
                expires_at=(
                    int(api_token.expires_at.timestamp()) if api_token.expires_at else None
                ),
            )
        return None


mcp = FastMCP(
    name="Zeni",
    icons=[
        _load_icon("favicon-96x96.png", "96x96"),
        _load_icon("icon-192.png", "192x192"),
        _load_icon("icon-512.png", "512x512"),
    ],
    transport_security=TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=app_settings.mcp_allowed_hosts,
        allowed_origins=app_settings.mcp_allowed_origins,
    ),
    instructions=(
        "Zeni is a personal finance tracker. "
        "Use these tools to create and query transaction records on behalf of the authenticated user. "
        "Authentication is handled via Bearer token in the Authorization header."
    ),
    token_verifier=ZeniTokenVerifier(),
    auth=AuthSettings(
        issuer_url=AnyHttpUrl(app_settings.mcp_issuer_url),
        resource_server_url=AnyHttpUrl(app_settings.mcp_resource_server_url),
        required_scopes=["user"],
    ),
)


async def _get_authenticated_user() -> User:
    access_token = get_access_token()
    if not access_token:
        msg = "Not authenticated"
        raise ValueError(msg)
    user_id = uuid.UUID(access_token.client_id)
    async for session in get_session():
        result = await session.exec(select(User).where(User.id == user_id))
        user = result.first()
        if not user:
            msg = "User not found"
            raise ValueError(msg)
        return user
    msg = "Database error"
    raise ValueError(msg)


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
async def list_wallets() -> list[dict[str, Any]]:
    """List all wallets belonging to the authenticated user."""
    user = await _get_authenticated_user()
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
async def list_categories() -> list[dict[str, Any]]:
    """List all categories belonging to the authenticated user."""
    user = await _get_authenticated_user()
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
class ListTransactionsInput:
    wallet_id: str
    limit: int = 20
    start_date: str | None = None
    end_date: str | None = None
    category_id: str | None = None
    type: str | None = None


def _apply_date_filters(
    query: Any, start_date: str | None, end_date: str | None
) -> tuple[Any, str | None]:
    if start_date:
        dt = _parse_dt(start_date, "start_date")
        if isinstance(dt, str):
            return query, dt
        query = query.where(col(Transaction.date) >= dt)
    if end_date:
        dt = _parse_dt(end_date, "end_date")
        if isinstance(dt, str):
            return query, dt
        query = query.where(col(Transaction.date) <= dt)
    return query, None


async def _fetch_transactions(
    params: ListTransactionsInput, user_id: uuid.UUID
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

        query = select(Transaction).where(
            Transaction.wallet_id == w_id, col(Transaction.group_id).is_(None)
        )
        query, err = _apply_date_filters(query, params.start_date, params.end_date)
        if err:
            return err

        if params.category_id:
            c_id = _parse_uuid(params.category_id, "category_id")
            if isinstance(c_id, str):
                return c_id
            query = query.where(Transaction.category_id == c_id)

        if params.type:
            query = query.where(Transaction.type == params.type)

        query = query.order_by(col(Transaction.date).desc()).limit(limit)
        result = await session.exec(query)
        transactions = result.all()

        rows = []
        for t in transactions:
            cat_result = await session.exec(select(Category).where(Category.id == t.category_id))
            cat = cat_result.first()
            rows.append(
                {
                    "id": str(t.id),
                    "wallet_id": str(t.wallet_id),
                    "type": t.type,
                    "amount": t.amount,
                    "description": t.description,
                    "date": t.date.isoformat(),
                    "category": cat.name if cat else "Unknown",
                    "category_id": str(t.category_id),
                    "created_at": t.created_at.isoformat(),
                }
            )
        return rows
    return "Database error"


@mcp.tool()
async def list_transactions(params: ListTransactionsInput) -> list[dict[str, Any]]:
    """
    List transactions for a wallet with optional filters.

    Args:
        params.wallet_id: UUID of the wallet to query.
        params.limit: Maximum number of results (default 20, max 100).
        params.start_date: ISO 8601 start date filter (e.g. "2024-01-01").
        params.end_date: ISO 8601 end date filter (e.g. "2024-01-31").
        params.category_id: UUID of category to filter by.
        params.type: Filter by type: "expense" or "income".
    """
    user = await _get_authenticated_user()
    result = await _fetch_transactions(params, user.id)
    if isinstance(result, str):
        return [{"error": result}]
    return result


@dataclass
class GetSummaryInput:
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

        query = select(Transaction).where(
            Transaction.wallet_id == w_id, col(Transaction.group_id).is_(None)
        )
        query, err = _apply_date_filters(query, params.start_date, params.end_date)
        if err:
            return err

        result = await session.exec(query)
        transactions = result.all()

        expenses = [t for t in transactions if t.type == "expense"]
        income = [t for t in transactions if t.type == "income"]

        by_category: dict[str, dict[str, Any]] = {}
        for t in expenses:
            cid = str(t.category_id)
            if cid not in by_category:
                cat_result = await session.exec(
                    select(Category).where(Category.id == t.category_id)
                )
                cat = cat_result.first()
                by_category[cid] = {
                    "category_id": cid,
                    "category_name": cat.name if cat else "Unknown",
                    "total": 0.0,
                    "count": 0,
                }
            by_category[cid]["total"] += t.amount
            by_category[cid]["count"] += 1

        total_expenses = sum(t.amount for t in expenses)
        total_income = sum(t.amount for t in income)

        return {
            "wallet_id": params.wallet_id,
            "total_expenses": total_expenses,
            "expense_count": len(expenses),
            "total_income": total_income,
            "income_count": len(income),
            "balance": total_income - total_expenses,
            "by_category": sorted(
                by_category.values(), key=operator.itemgetter("total"), reverse=True
            ),
        }
    return "Database error"


@mcp.tool()
async def get_summary(params: GetSummaryInput) -> dict[str, Any]:
    """
    Get a financial summary for a wallet.

    Returns total expenses, total income, balance, and breakdown by category.

    Args:
        params.wallet_id: UUID of the wallet to summarize.
        params.start_date: ISO 8601 start date filter.
        params.end_date: ISO 8601 end date filter.
    """
    user = await _get_authenticated_user()
    result = await _compute_summary(params, user.id)
    if isinstance(result, str):
        return {"error": result}
    return result


@dataclass
class CreateTransactionInput:
    wallet_id: str
    category_id: str
    amount: float
    type: str = "expense"
    description: str | None = None
    date: str | None = None


def _parse_create_transaction_input(
    params: CreateTransactionInput,
) -> tuple[uuid.UUID, uuid.UUID, datetime] | str:
    w_id = _parse_uuid(params.wallet_id, "wallet_id")
    if isinstance(w_id, str):
        return w_id
    c_id = _parse_uuid(params.category_id, "category_id")
    if isinstance(c_id, str):
        return c_id
    transaction_date: datetime = datetime.now(UTC)
    if params.date:
        parsed = _parse_dt(params.date, "date")
        if isinstance(parsed, str):
            return parsed
        transaction_date = parsed
    return w_id, c_id, transaction_date


async def _insert_transaction(
    params: CreateTransactionInput, user_id: uuid.UUID
) -> dict[str, Any] | str:
    parsed = _parse_create_transaction_input(params)
    if isinstance(parsed, str):
        return parsed
    w_id, c_id, transaction_date = parsed

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

        transaction = Transaction(
            wallet_id=w_id,
            category_id=c_id,
            type=params.type,
            amount=params.amount,
            description=params.description,
            date=transaction_date,
        )
        session.add(transaction)
        await session.commit()
        await session.refresh(transaction)

        return {
            "id": str(transaction.id),
            "wallet_id": str(transaction.wallet_id),
            "type": transaction.type,
            "category": cat.name,
            "category_id": str(transaction.category_id),
            "amount": transaction.amount,
            "description": transaction.description,
            "date": transaction.date.isoformat(),
            "created_at": transaction.created_at.isoformat(),
        }
    return "Database error"


@mcp.tool()
async def create_transaction(params: CreateTransactionInput) -> dict[str, Any]:
    """
    Create a new transaction record (expense or income).

    Args:
        params.wallet_id: UUID of the wallet to add the transaction to.
        params.category_id: UUID of the category for this transaction.
        params.amount: Transaction amount (must be positive).
        params.type: Transaction type: "expense" (default) or "income".
        params.description: Optional description of the transaction.
        params.date: ISO 8601 date string (defaults to now if omitted).
    """
    user = await _get_authenticated_user()
    if params.amount <= 0:
        return {"error": "Amount must be positive"}
    if params.type not in {"expense", "income"}:
        return {"error": "type must be 'expense' or 'income'"}
    result = await _insert_transaction(params, user.id)
    if isinstance(result, str):
        return {"error": result}
    return result
