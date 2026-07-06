from __future__ import annotations

import base64
import operator
import time
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import TYPE_CHECKING, Any, cast

import httpx
from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.settings import AuthSettings, ClientRegistrationOptions, RevocationOptions
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import Icon
from pydantic import AnyHttpUrl
from sqlalchemy import func, or_
from sqlmodel import col, select

from app.config import settings as app_settings
from app.database import get_session
from app.models.budget import Budget
from app.models.category import Category
from app.models.recurring import RecurringTransaction
from app.models.tag import Tag
from app.models.transaction import Transaction, TransactionLink, TransactionTag
from app.models.user import User
from app.models.wallet import Wallet
from app.services.category_tag import find_or_create_category, find_or_create_tag
from app.services.mcp_oauth_provider import KeniOAuthProvider

if TYPE_CHECKING:
    from app.services.mcp_oauth_provider import KeniAccessToken

_icons_dir = Path(__file__).parent / "icons"


def _load_icon(filename: str, size: str) -> Icon:
    data = base64.standard_b64encode((_icons_dir / filename).read_bytes()).decode()
    return Icon(src=f"data:image/png;base64,{data}", mimeType="image/png", sizes=[size])


oauth_provider = KeniOAuthProvider(frontend_url=app_settings.mcp_frontend_url)

mcp = FastMCP(
    name="Keni",
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
        "Keni is a personal finance tracker. "
        "Use these tools to manage transactions (single, batch, and parent-child groups), "
        "recurring transactions, budgets, wallets, categories, tags, and transaction links "
        "on behalf of the authenticated user. "
        "Authentication is handled via Bearer token in the Authorization header."
    ),
    auth_server_provider=oauth_provider,
    auth=AuthSettings(
        issuer_url=AnyHttpUrl(app_settings.mcp_issuer_url),
        resource_server_url=AnyHttpUrl(app_settings.mcp_resource_server_url),
        required_scopes=["user"],
        client_registration_options=ClientRegistrationOptions(
            enabled=True, valid_scopes=["user"], default_scopes=["user"]
        ),
        revocation_options=RevocationOptions(enabled=True),
    ),
)


async def _get_authenticated_user() -> User:
    raw_token = get_access_token()
    if not raw_token:
        msg = "Not authenticated"
        raise ValueError(msg)
    access_token = cast("KeniAccessToken", raw_token)
    user_id = uuid.UUID(access_token.user_id)
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


async def _get_transaction_tags(transaction_id: uuid.UUID, session: Any) -> list[dict[str, Any]]:
    tag_result = await session.exec(
        select(Tag)
        .join(TransactionTag, col(Tag.id) == col(TransactionTag.tag_id))
        .where(col(TransactionTag.transaction_id) == transaction_id)
    )
    return [{"id": str(t.id), "name": t.name, "color": t.color} for t in tag_result.all()]


async def _get_linked_count(transaction_id: uuid.UUID, session: Any) -> int:
    count_result = await session.exec(
        select(func.count())
        .select_from(TransactionLink)
        .where(
            or_(
                col(TransactionLink.transaction_id_a) == transaction_id,
                col(TransactionLink.transaction_id_b) == transaction_id,
            )
        )
    )
    return int(count_result.one())


async def _get_linked_transactions(transaction_id: uuid.UUID, session: Any) -> list[dict[str, Any]]:
    linked_result = await session.exec(
        select(Transaction).join(
            TransactionLink,
            or_(
                (col(TransactionLink.transaction_id_a) == transaction_id)
                & (col(TransactionLink.transaction_id_b) == col(Transaction.id)),
                (col(TransactionLink.transaction_id_b) == transaction_id)
                & (col(TransactionLink.transaction_id_a) == col(Transaction.id)),
            ),
        )
    )
    linked = []
    for lt in linked_result.all():
        cat_result = await session.exec(select(Category).where(Category.id == lt.category_id))
        cat = cat_result.first()
        linked.append(
            {
                "id": str(lt.id),
                "wallet_id": str(lt.wallet_id),
                "type": lt.type,
                "amount": lt.amount,
                "description": lt.description,
                "date": lt.date.isoformat(),
                "category": cat.name if cat else "Unknown",
                "category_id": str(lt.category_id),
            }
        )
    return linked


def _transaction_to_dict(
    t: Transaction, cat: Category | None, tags: list[dict[str, Any]]
) -> dict[str, Any]:
    return {
        "id": str(t.id),
        "wallet_id": str(t.wallet_id),
        "type": t.type,
        "amount": t.amount,
        "description": t.description,
        "date": t.date.isoformat(),
        "category": cat.name if cat else "Unknown",
        "category_id": str(t.category_id),
        "category_icon": cat.icon if cat else None,
        "category_color": cat.color if cat else None,
        "tags": tags,
        "group_id": str(t.group_id) if t.group_id else None,
        "created_at": t.created_at.isoformat(),
        "updated_at": t.updated_at.isoformat(),
    }


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
                "created_at": w.created_at.isoformat(),
            }
            for w in result.all()
        ]
    return []


def _wallet_to_dict(w: Wallet) -> dict[str, Any]:
    return {
        "id": str(w.id),
        "name": w.name,
        "currency": w.currency,
        "created_at": w.created_at.isoformat(),
    }


@mcp.tool()
async def create_wallet(name: str, currency: str) -> dict[str, Any]:
    """
    Create a new wallet.

    Args:
        name: Wallet name (1-100 characters).
        currency: Currency code for the wallet (e.g. USD, EUR).
    """
    user = await _get_authenticated_user()
    if not name.strip() or len(name) > 100:
        return {"error": "name must be 1-100 characters"}
    if not currency.strip() or len(currency) > 10:
        return {"error": "currency must be 1-10 characters"}

    async for session in get_session():
        wallet = Wallet(user_id=user.id, name=name, currency=currency)
        session.add(wallet)
        await session.commit()
        await session.refresh(wallet)
        return _wallet_to_dict(wallet)
    return {"error": "Database error"}


@mcp.tool()
async def update_wallet(
    wallet_id: str, name: str | None = None, currency: str | None = None
) -> dict[str, Any]:
    """
    Update a wallet's name and/or currency. Omitted fields remain unchanged.

    Args:
        wallet_id: UUID of the wallet to update.
        name: New wallet name (1-100 characters).
        currency: New currency code (e.g. USD, EUR).
    """
    user = await _get_authenticated_user()
    w_id = _parse_uuid(wallet_id, "wallet_id")
    if isinstance(w_id, str):
        return {"error": w_id}
    if name is not None and (not name.strip() or len(name) > 100):
        return {"error": "name must be 1-100 characters"}
    if currency is not None and (not currency.strip() or len(currency) > 10):
        return {"error": "currency must be 1-10 characters"}

    async for session in get_session():
        result = await session.exec(
            select(Wallet).where(Wallet.id == w_id, Wallet.user_id == user.id)
        )
        wallet = result.first()
        if not wallet:
            return {"error": "Wallet not found"}

        if name is not None:
            wallet.name = name
        if currency is not None:
            wallet.currency = currency

        session.add(wallet)
        await session.commit()
        await session.refresh(wallet)
        return _wallet_to_dict(wallet)
    return {"error": "Database error"}


@mcp.tool()
async def delete_wallet(wallet_id: str) -> dict[str, Any]:
    """
    Delete a wallet permanently.

    WARNING: this also permanently deletes ALL transactions and recurring transactions
    in the wallet. Budgets scoped to the wallet become all-wallet budgets.

    Args:
        wallet_id: UUID of the wallet to delete.
    """
    user = await _get_authenticated_user()
    w_id = _parse_uuid(wallet_id, "wallet_id")
    if isinstance(w_id, str):
        return {"error": w_id}

    async for session in get_session():
        result = await session.exec(
            select(Wallet).where(Wallet.id == w_id, Wallet.user_id == user.id)
        )
        wallet = result.first()
        if not wallet:
            return {"error": "Wallet not found"}

        await session.delete(wallet)
        await session.commit()
        return {"deleted": wallet_id}
    return {"error": "Database error"}


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
                "is_system": c.is_system,
            }
            for c in result.all()
        ]
    return []


def _category_to_dict(c: Category) -> dict[str, Any]:
    return {
        "id": str(c.id),
        "name": c.name,
        "icon": c.icon,
        "color": c.color,
        "is_system": c.is_system,
    }


@mcp.tool()
async def create_category(
    name: str, icon: str | None = None, color: str | None = None
) -> dict[str, Any]:
    """
    Create a new category.

    Args:
        name: Category name (1-100 characters).
        icon: Optional icon name (max 50 characters).
        color: Optional color value (max 20 characters).
    """
    user = await _get_authenticated_user()
    if not name.strip() or len(name) > 100:
        return {"error": "name must be 1-100 characters"}
    if icon is not None and len(icon) > 50:
        return {"error": "icon must be at most 50 characters"}
    if color is not None and len(color) > 20:
        return {"error": "color must be at most 20 characters"}

    async for session in get_session():
        cat = Category(user_id=user.id, name=name, icon=icon, color=color, is_system=False)
        session.add(cat)
        await session.commit()
        await session.refresh(cat)
        return _category_to_dict(cat)
    return {"error": "Database error"}


@mcp.tool()
async def update_category(  # noqa: PLR0911
    category_id: str, name: str | None = None, icon: str | None = None, color: str | None = None
) -> dict[str, Any]:
    """
    Update a category's name, icon, and/or color. Omitted fields remain unchanged.

    The system "Others" category cannot be modified.

    Args:
        category_id: UUID of the category to update.
        name: New category name (1-100 characters).
        icon: New icon name (max 50 characters).
        color: New color value (max 20 characters).
    """
    user = await _get_authenticated_user()
    c_id = _parse_uuid(category_id, "category_id")
    if isinstance(c_id, str):
        return {"error": c_id}
    if name is not None and (not name.strip() or len(name) > 100):
        return {"error": "name must be 1-100 characters"}
    if icon is not None and len(icon) > 50:
        return {"error": "icon must be at most 50 characters"}
    if color is not None and len(color) > 20:
        return {"error": "color must be at most 20 characters"}

    async for session in get_session():
        result = await session.exec(
            select(Category).where(Category.id == c_id, Category.user_id == user.id)
        )
        cat = result.first()
        if not cat:
            return {"error": "Category not found"}
        if cat.is_system:
            return {"error": "Cannot modify the system 'Others' category"}

        if name is not None:
            cat.name = name
        if icon is not None:
            cat.icon = icon
        if color is not None:
            cat.color = color

        session.add(cat)
        await session.commit()
        await session.refresh(cat)
        return _category_to_dict(cat)
    return {"error": "Database error"}


@mcp.tool()
async def delete_category(category_id: str) -> dict[str, Any]:
    """
    Delete a category. Transactions in the category are reassigned to the system
    "Others" category. The system "Others" category itself cannot be deleted.

    Args:
        category_id: UUID of the category to delete.
    """
    user = await _get_authenticated_user()
    c_id = _parse_uuid(category_id, "category_id")
    if isinstance(c_id, str):
        return {"error": c_id}

    async for session in get_session():
        result = await session.exec(
            select(Category).where(Category.id == c_id, Category.user_id == user.id)
        )
        cat = result.first()
        if not cat:
            return {"error": "Category not found"}
        if cat.is_system:
            return {"error": "Cannot delete the system 'Others' category"}

        others_result = await session.exec(
            select(Category).where(Category.user_id == user.id, Category.is_system)
        )
        others = others_result.first()
        if not others:
            return {"error": "System category not found"}

        t_result = await session.exec(select(Transaction).where(Transaction.category_id == c_id))
        reassigned = 0
        for transaction in t_result.all():
            transaction.category_id = others.id
            session.add(transaction)
            reassigned += 1

        await session.delete(cat)
        await session.commit()
        return {"deleted": category_id, "transactions_reassigned": reassigned}
    return {"error": "Database error"}


@mcp.tool()
async def list_tags() -> list[dict[str, Any]]:
    """List all tags belonging to the authenticated user."""
    user = await _get_authenticated_user()
    async for session in get_session():
        result = await session.exec(select(Tag).where(Tag.user_id == user.id))
        return [
            {
                "id": str(t.id),
                "name": t.name,
                "color": t.color,
                "created_at": t.created_at.isoformat(),
            }
            for t in result.all()
        ]
    return []


def _tag_to_dict(t: Tag) -> dict[str, Any]:
    return {
        "id": str(t.id),
        "name": t.name,
        "color": t.color,
        "created_at": t.created_at.isoformat(),
    }


@mcp.tool()
async def create_tag(name: str, color: str | None = None) -> dict[str, Any]:
    """
    Create a new tag.

    Args:
        name: Tag name (1-100 characters).
        color: Optional color value (max 20 characters).
    """
    user = await _get_authenticated_user()
    if not name.strip() or len(name) > 100:
        return {"error": "name must be 1-100 characters"}
    if color is not None and len(color) > 20:
        return {"error": "color must be at most 20 characters"}

    async for session in get_session():
        tag = Tag(user_id=user.id, name=name, color=color)
        session.add(tag)
        await session.commit()
        await session.refresh(tag)
        return _tag_to_dict(tag)
    return {"error": "Database error"}


@mcp.tool()
async def update_tag(
    tag_id: str, name: str | None = None, color: str | None = None
) -> dict[str, Any]:
    """
    Update a tag's name and/or color. Omitted fields remain unchanged.

    Args:
        tag_id: UUID of the tag to update.
        name: New tag name (1-100 characters).
        color: New color value (max 20 characters).
    """
    user = await _get_authenticated_user()
    t_id = _parse_uuid(tag_id, "tag_id")
    if isinstance(t_id, str):
        return {"error": t_id}
    if name is not None and (not name.strip() or len(name) > 100):
        return {"error": "name must be 1-100 characters"}
    if color is not None and len(color) > 20:
        return {"error": "color must be at most 20 characters"}

    async for session in get_session():
        result = await session.exec(select(Tag).where(Tag.id == t_id, Tag.user_id == user.id))
        tag = result.first()
        if not tag:
            return {"error": "Tag not found"}

        if name is not None:
            tag.name = name
        if color is not None:
            tag.color = color

        session.add(tag)
        await session.commit()
        await session.refresh(tag)
        return _tag_to_dict(tag)
    return {"error": "Database error"}


@mcp.tool()
async def delete_tag(tag_id: str) -> dict[str, Any]:
    """
    Delete a tag. The tag is removed from all transactions it is attached to;
    the transactions themselves are not deleted.

    Args:
        tag_id: UUID of the tag to delete.
    """
    user = await _get_authenticated_user()
    t_id = _parse_uuid(tag_id, "tag_id")
    if isinstance(t_id, str):
        return {"error": t_id}

    async for session in get_session():
        result = await session.exec(select(Tag).where(Tag.id == t_id, Tag.user_id == user.id))
        tag = result.first()
        if not tag:
            return {"error": "Tag not found"}

        await session.delete(tag)
        await session.commit()
        return {"deleted": tag_id}
    return {"error": "Database error"}


@dataclass
class ListTransactionsInput:
    wallet_id: str
    page: int = 1
    page_size: int = 20
    start_date: str | None = None
    end_date: str | None = None
    category_id: str | None = None
    tag_ids: list[str] = field(default_factory=list)
    type: str | None = None
    search: str | None = None
    min_amount: float | None = None
    max_amount: float | None = None
    sort_by: str = "date"
    sort_order: str = "desc"


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


async def _fetch_transactions(  # noqa: PLR0911, PLR0912, PLR0914
    params: ListTransactionsInput, user_id: uuid.UUID
) -> dict[str, Any] | str:
    w_id = _parse_uuid(params.wallet_id, "wallet_id")
    if isinstance(w_id, str):
        return w_id

    page = max(1, params.page)
    page_size = min(max(1, params.page_size), 100)

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

        if params.search:
            query = query.where(col(Transaction.description).ilike(f"%{params.search}%"))

        if params.min_amount is not None:
            query = query.where(col(Transaction.amount) >= params.min_amount)

        if params.max_amount is not None:
            query = query.where(col(Transaction.amount) <= params.max_amount)

        if params.tag_ids:
            parsed_tag_ids: list[uuid.UUID] = []
            for tid in params.tag_ids:
                parsed = _parse_uuid(tid, "tag_id")
                if isinstance(parsed, str):
                    return parsed
                parsed_tag_ids.append(parsed)
            query = (
                query.join(
                    TransactionTag, col(Transaction.id) == col(TransactionTag.transaction_id)
                )
                .where(col(TransactionTag.tag_id).in_(parsed_tag_ids))
                .distinct()
            )

        order_col = col(Transaction.amount) if params.sort_by == "amount" else col(Transaction.date)
        query = query.order_by(order_col.desc() if params.sort_order == "desc" else order_col.asc())

        count_result = await session.exec(select(func.count()).select_from(query.subquery()))
        total = count_result.one()

        query = query.offset((page - 1) * page_size).limit(page_size)
        result = await session.exec(query)
        transactions = result.all()

        rows = []
        for t in transactions:
            cat_result = await session.exec(select(Category).where(Category.id == t.category_id))
            cat = cat_result.first()
            tags = await _get_transaction_tags(t.id, session)
            row = _transaction_to_dict(t, cat, tags)
            row["linked_count"] = await _get_linked_count(t.id, session)
            rows.append(row)

        return {"items": rows, "total": int(total), "page": page, "page_size": page_size}
    return "Database error"


@mcp.tool()
async def list_transactions(params: ListTransactionsInput) -> dict[str, Any]:
    """
    List transactions for a wallet with optional filters.

    Each item includes a "linked_count" field — the number of other transactions linked to it.
    The linked transactions themselves are not included here; call get_transaction to retrieve
    the full "linked_transactions" objects for any item where linked_count > 0.

    Args:
        params.wallet_id: UUID of the wallet to query.
        params.page: Page number (default 1).
        params.page_size: Results per page (default 20, max 100).
        params.start_date: ISO 8601 start date filter (e.g. "2024-01-01").
        params.end_date: ISO 8601 end date filter (e.g. "2024-01-31").
        params.category_id: UUID of category to filter by.
        params.tag_ids: List of tag UUIDs to filter by.
        params.type: Filter by type: "expense" or "income".
        params.search: Search in transaction descriptions.
        params.min_amount: Minimum amount filter.
        params.max_amount: Maximum amount filter.
        params.sort_by: Sort field: "date" (default) or "amount".
        params.sort_order: Sort direction: "desc" (default) or "asc".
    """
    user = await _get_authenticated_user()
    result = await _fetch_transactions(params, user.id)
    if isinstance(result, str):
        return {"error": result}
    return result


@mcp.tool()
async def get_transaction(wallet_id: str, transaction_id: str) -> dict[str, Any]:
    """
    Get a single transaction by ID.

    The result includes a "linked_transactions" list with the full details of every
    transaction linked to this one.

    Args:
        wallet_id: UUID of the wallet.
        transaction_id: UUID of the transaction.
    """
    user = await _get_authenticated_user()

    w_id = _parse_uuid(wallet_id, "wallet_id")
    if isinstance(w_id, str):
        return {"error": w_id}
    t_id = _parse_uuid(transaction_id, "transaction_id")
    if isinstance(t_id, str):
        return {"error": t_id}

    async for session in get_session():
        wallet_result = await session.exec(
            select(Wallet).where(Wallet.id == w_id, Wallet.user_id == user.id)
        )
        if not wallet_result.first():
            return {"error": "Wallet not found"}

        t_result = await session.exec(
            select(Transaction).where(Transaction.id == t_id, Transaction.wallet_id == w_id)
        )
        t = t_result.first()
        if not t:
            return {"error": "Transaction not found"}

        cat_result = await session.exec(select(Category).where(Category.id == t.category_id))
        cat = cat_result.first()
        tags = await _get_transaction_tags(t.id, session)
        row = _transaction_to_dict(t, cat, tags)
        row["linked_transactions"] = await _get_linked_transactions(t.id, session)
        return row
    return {"error": "Database error"}


@dataclass
class GetSummaryInput:
    wallet_id: str
    start_date: str | None = None
    end_date: str | None = None


async def _compute_summary(params: GetSummaryInput, user_id: uuid.UUID) -> dict[str, Any] | str:  # noqa: PLR0914
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
                    "category_color": cat.color if cat else None,
                    "total": 0.0,
                    "count": 0,
                }
            by_category[cid]["total"] += t.amount
            by_category[cid]["count"] += 1

        income_by_category: dict[str, dict[str, Any]] = {}
        for t in income:
            cid = str(t.category_id)
            if cid not in income_by_category:
                cat_result = await session.exec(
                    select(Category).where(Category.id == t.category_id)
                )
                cat = cat_result.first()
                income_by_category[cid] = {
                    "category_id": cid,
                    "category_name": cat.name if cat else "Unknown",
                    "category_color": cat.color if cat else None,
                    "total": 0.0,
                    "count": 0,
                }
            income_by_category[cid]["total"] += t.amount
            income_by_category[cid]["count"] += 1

        by_period: dict[str, dict[str, Any]] = {}
        for t in expenses:
            period_key = t.date.strftime("%Y-%m")
            if period_key not in by_period:
                by_period[period_key] = {"period": period_key, "total": 0.0, "count": 0}
            by_period[period_key]["total"] += t.amount
            by_period[period_key]["count"] += 1

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
            "income_by_category": sorted(
                income_by_category.values(), key=operator.itemgetter("total"), reverse=True
            ),
            "by_period": sorted(by_period.values(), key=operator.itemgetter("period")),
        }
    return "Database error"


@mcp.tool()
async def get_summary(params: GetSummaryInput) -> dict[str, Any]:
    """
    Get a financial summary for a wallet.

    Returns total expenses, total income, balance, breakdown by category (expense and income),
    and monthly spending by period.

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
class TransactionItemInput:
    amount: float
    type: str = "expense"
    category_id: str | None = None
    category_name: str | None = None
    category_icon: str | None = None
    description: str | None = None
    date: str | None = None
    tag_ids: list[str] = field(default_factory=list)
    tag_names: list[str] = field(default_factory=list)
    ai_context: str | None = None


@dataclass
class CreateTransactionInput:
    wallet_id: str
    amount: float
    type: str = "expense"
    category_id: str | None = None
    category_name: str | None = None
    category_icon: str | None = None
    description: str | None = None
    date: str | None = None
    tag_ids: list[str] = field(default_factory=list)
    tag_names: list[str] = field(default_factory=list)
    ai_context: str | None = None


def _validate_item(item: TransactionItemInput) -> str | None:
    if item.amount < 0:
        return "Amount must not be negative"
    if item.type not in {"expense", "income"}:
        return "type must be 'expense' or 'income'"
    if item.category_id and item.category_name:
        return "Provide either category_id or category_name, not both"
    if not item.category_id and not item.category_name:
        return "Provide either category_id or category_name"
    if item.date:
        parsed_dt = _parse_dt(item.date, "date")
        if isinstance(parsed_dt, str):
            return parsed_dt
    return None


async def _insert_item(
    session: Any,
    user_id: uuid.UUID,
    wallet_id: uuid.UUID,
    item: TransactionItemInput,
    group_id: uuid.UUID | None = None,
) -> dict[str, Any] | str:
    """Insert one transaction on an open session without committing. Returns dict or error."""
    if item.category_id:
        c_id = _parse_uuid(item.category_id, "category_id")
        if isinstance(c_id, str):
            return c_id
        cat_result = await session.exec(
            select(Category).where(Category.id == c_id, Category.user_id == user_id)
        )
        cat = cat_result.first()
        if not cat:
            return "Category not found"
    else:
        assert item.category_name is not None
        cat = await find_or_create_category(
            user_id=user_id, name=item.category_name, session=session, icon=item.category_icon
        )

    all_tag_ids: list[uuid.UUID] = []
    for tid in item.tag_ids:
        parsed_tid = _parse_uuid(tid, "tag_id")
        if isinstance(parsed_tid, str):
            return parsed_tid
        tag_check = await session.exec(
            select(Tag).where(Tag.id == parsed_tid, Tag.user_id == user_id)
        )
        if not tag_check.first():
            return f"Tag {tid} not found"
        all_tag_ids.append(parsed_tid)

    for name in item.tag_names:
        tag = await find_or_create_tag(user_id=user_id, name=name, session=session)
        if tag.id not in all_tag_ids:
            all_tag_ids.append(tag.id)

    transaction_date: datetime = datetime.now(UTC)
    if item.date:
        parsed_dt = _parse_dt(item.date, "date")
        if isinstance(parsed_dt, str):
            return parsed_dt
        transaction_date = parsed_dt

    transaction = Transaction(
        wallet_id=wallet_id,
        category_id=cat.id,
        group_id=group_id,
        type=item.type,
        amount=item.amount,
        description=item.description,
        date=transaction_date,
        ai_context=item.ai_context,
    )
    session.add(transaction)
    await session.flush()

    for tag_id in all_tag_ids:
        session.add(TransactionTag(transaction_id=transaction.id, tag_id=tag_id))

    await session.refresh(transaction)
    tags = [{"id": str(tid), "name": None, "color": None} for tid in all_tag_ids]
    return _transaction_to_dict(transaction, cat, tags)


async def _insert_transaction(
    params: CreateTransactionInput, user_id: uuid.UUID
) -> dict[str, Any] | str:
    w_id = _parse_uuid(params.wallet_id, "wallet_id")
    if isinstance(w_id, str):
        return w_id

    item = TransactionItemInput(
        amount=params.amount,
        type=params.type,
        category_id=params.category_id,
        category_name=params.category_name,
        category_icon=params.category_icon,
        description=params.description,
        date=params.date,
        tag_ids=params.tag_ids,
        tag_names=params.tag_names,
        ai_context=params.ai_context,
    )
    err = _validate_item(item)
    if err:
        return err

    async for session in get_session():
        wallet_result = await session.exec(
            select(Wallet).where(Wallet.id == w_id, Wallet.user_id == user_id)
        )
        if not wallet_result.first():
            return "Wallet not found"

        result = await _insert_item(session, user_id, w_id, item)
        if isinstance(result, str):
            return result
        await session.commit()
        return result
    return "Database error"


@mcp.tool()
async def create_transaction(params: CreateTransactionInput) -> dict[str, Any]:
    """
    Create a new transaction record (expense or income).

    You can reference a category by ID or by name. If a category name is given that doesn't
    exist yet, it will be created automatically. Similarly, tags can be specified by ID or name
    and will be created if they don't exist.

    Args:
        params.wallet_id: UUID of the wallet to add the transaction to.
        params.amount: Transaction amount (zero or positive).
        params.type: Transaction type: "expense" (default) or "income".
        params.category_id: UUID of an existing category (mutually exclusive with category_name).
        params.category_name: Name of the category — matched case-insensitively or created if new.
        params.category_icon: Icon name for a new category (ignored if category already exists).
        params.description: Optional description of the transaction.
        params.date: ISO 8601 date string (defaults to now if omitted).
        params.tag_ids: List of existing tag UUIDs to attach.
        params.tag_names: List of tag names — matched case-insensitively or created if new.
        params.ai_context: Optional AI context/notes about this transaction.
    """
    user = await _get_authenticated_user()
    if params.amount < 0:
        return {"error": "Amount must not be negative"}
    if params.type not in {"expense", "income"}:
        return {"error": "type must be 'expense' or 'income'"}
    result = await _insert_transaction(params, user.id)
    if isinstance(result, str):
        return {"error": result}
    return result


@dataclass
class CreateTransactionsInput:
    wallet_id: str
    items: list[TransactionItemInput]


@mcp.tool()
async def create_transactions(params: CreateTransactionsInput) -> dict[str, Any]:  # noqa: PLR0911
    """
    Create multiple independent transactions in one wallet in a single call.

    All items are created atomically — if any item is invalid, nothing is created.
    Each item accepts the same fields as create_transaction (category by ID or name,
    tags by ID or name, created automatically if new).

    Args:
        params.wallet_id: UUID of the wallet to add the transactions to.
        params.items: List of transactions to create. Per item: amount (required),
            type ("expense"/"income"), category_id or category_name, category_icon,
            description, date (ISO 8601), tag_ids, tag_names, ai_context.
    """
    user = await _get_authenticated_user()
    if not params.items:
        return {"error": "items must not be empty"}
    w_id = _parse_uuid(params.wallet_id, "wallet_id")
    if isinstance(w_id, str):
        return {"error": w_id}
    for i, item in enumerate(params.items):
        err = _validate_item(item)
        if err:
            return {"error": f"items[{i}]: {err}"}

    async for session in get_session():
        wallet_result = await session.exec(
            select(Wallet).where(Wallet.id == w_id, Wallet.user_id == user.id)
        )
        if not wallet_result.first():
            return {"error": "Wallet not found"}

        created: list[dict[str, Any]] = []
        for i, item in enumerate(params.items):
            result = await _insert_item(session, user.id, w_id, item)
            if isinstance(result, str):
                await session.rollback()
                return {"error": f"items[{i}]: {result}"}
            created.append(result)

        await session.commit()
        return {"created": created, "count": len(created)}
    return {"error": "Database error"}


@dataclass
class CreateTransactionGroupInput:
    wallet_id: str
    parent: TransactionItemInput
    children: list[TransactionItemInput]


@mcp.tool()
async def create_transaction_group(params: CreateTransactionGroupInput) -> dict[str, Any]:  # noqa: PLR0911
    """
    Create a parent transaction with child transactions (e.g. an itemized receipt).

    The parent represents the whole purchase; each child is one item of it. The sum of
    the children's amounts must equal the parent's amount. Children are hidden from
    normal transaction lists and summaries — only the parent is counted. Deleting the
    parent deletes all children. Everything is created atomically.

    Args:
        params.wallet_id: UUID of the wallet to add the group to.
        params.parent: The parent transaction. Same fields as create_transaction items.
        params.children: Child transactions (at least one). Amounts must sum to the
            parent's amount.
    """
    user = await _get_authenticated_user()
    if not params.children:
        return {"error": "children must not be empty"}
    w_id = _parse_uuid(params.wallet_id, "wallet_id")
    if isinstance(w_id, str):
        return {"error": w_id}

    err = _validate_item(params.parent)
    if err:
        return {"error": f"parent: {err}"}
    for i, child in enumerate(params.children):
        err = _validate_item(child)
        if err:
            return {"error": f"children[{i}]: {err}"}

    children_total = sum(child.amount for child in params.children)
    if abs(children_total - params.parent.amount) > 0.001:
        return {
            "error": (
                f"Sum of children amounts ({children_total}) must equal "
                f"parent amount ({params.parent.amount})"
            )
        }

    async for session in get_session():
        wallet_result = await session.exec(
            select(Wallet).where(Wallet.id == w_id, Wallet.user_id == user.id)
        )
        if not wallet_result.first():
            return {"error": "Wallet not found"}

        parent_result = await _insert_item(session, user.id, w_id, params.parent)
        if isinstance(parent_result, str):
            await session.rollback()
            return {"error": f"parent: {parent_result}"}
        parent_id = uuid.UUID(parent_result["id"])

        child_dicts: list[dict[str, Any]] = []
        for i, child in enumerate(params.children):
            child_result = await _insert_item(session, user.id, w_id, child, group_id=parent_id)
            if isinstance(child_result, str):
                await session.rollback()
                return {"error": f"children[{i}]: {child_result}"}
            child_dicts.append(child_result)

        await session.commit()
        parent_result["children"] = child_dicts
        return parent_result
    return {"error": "Database error"}


@dataclass
class UpdateTransactionInput:
    wallet_id: str
    transaction_id: str
    category_id: str | None = None
    type: str | None = None
    amount: float | None = None
    description: str | None = None
    date: str | None = None
    tag_ids: list[str] | None = None


@mcp.tool()
async def update_transaction(params: UpdateTransactionInput) -> dict[str, Any]:  # noqa: C901, PLR0911, PLR0912, PLR0914
    """
    Update an existing transaction.

    Only provided fields are updated; omitted fields remain unchanged.
    To replace all tags, pass the full desired list in tag_ids.

    Args:
        params.wallet_id: UUID of the wallet containing the transaction.
        params.transaction_id: UUID of the transaction to update.
        params.category_id: New category UUID.
        params.type: New type: "expense" or "income".
        params.amount: New amount (zero or positive).
        params.description: New description.
        params.date: New date (ISO 8601).
        params.tag_ids: Replace all tags with this list of tag UUIDs.
    """
    user = await _get_authenticated_user()

    w_id = _parse_uuid(params.wallet_id, "wallet_id")
    if isinstance(w_id, str):
        return {"error": w_id}
    t_id = _parse_uuid(params.transaction_id, "transaction_id")
    if isinstance(t_id, str):
        return {"error": t_id}

    if params.type and params.type not in {"expense", "income"}:
        return {"error": "type must be 'expense' or 'income'"}
    if params.amount is not None and params.amount < 0:
        return {"error": "Amount must not be negative"}

    async for session in get_session():
        wallet_result = await session.exec(
            select(Wallet).where(Wallet.id == w_id, Wallet.user_id == user.id)
        )
        if not wallet_result.first():
            return {"error": "Wallet not found"}

        t_result = await session.exec(
            select(Transaction).where(Transaction.id == t_id, Transaction.wallet_id == w_id)
        )
        t = t_result.first()
        if not t:
            return {"error": "Transaction not found"}

        if params.category_id is not None:
            c_id = _parse_uuid(params.category_id, "category_id")
            if isinstance(c_id, str):
                return {"error": c_id}
            cat_result = await session.exec(
                select(Category).where(Category.id == c_id, Category.user_id == user.id)
            )
            if not cat_result.first():
                return {"error": "Category not found"}
            t.category_id = c_id

        if params.type is not None:
            t.type = params.type
        if params.amount is not None:
            t.amount = params.amount
        if params.description is not None:
            t.description = params.description
        if params.date is not None:
            parsed_dt = _parse_dt(params.date, "date")
            if isinstance(parsed_dt, str):
                return {"error": parsed_dt}
            t.date = parsed_dt

        t.updated_at = datetime.now(UTC)

        if params.tag_ids is not None:
            new_tag_ids: list[uuid.UUID] = []
            for tid in params.tag_ids:
                parsed_tid = _parse_uuid(tid, "tag_id")
                if isinstance(parsed_tid, str):
                    return {"error": parsed_tid}
                tag_check = await session.exec(
                    select(Tag).where(Tag.id == parsed_tid, Tag.user_id == user.id)
                )
                if not tag_check.first():
                    return {"error": f"Tag {tid} not found"}
                new_tag_ids.append(parsed_tid)

            existing = await session.exec(
                select(TransactionTag).where(col(TransactionTag.transaction_id) == t.id)
            )
            for tt in existing.all():
                await session.delete(tt)
            for tag_id in new_tag_ids:
                session.add(TransactionTag(transaction_id=t.id, tag_id=tag_id))

        session.add(t)
        await session.commit()
        await session.refresh(t)

        cat_result = await session.exec(select(Category).where(Category.id == t.category_id))
        cat = cat_result.first()
        tags = await _get_transaction_tags(t.id, session)
        row = _transaction_to_dict(t, cat, tags)
        row["linked_transactions"] = await _get_linked_transactions(t.id, session)
        return row
    return {"error": "Database error"}


@mcp.tool()
async def delete_transaction(wallet_id: str, transaction_id: str) -> dict[str, Any]:
    """
    Delete a transaction by ID.

    Also deletes all child transactions if this is a group parent.

    Args:
        wallet_id: UUID of the wallet containing the transaction.
        transaction_id: UUID of the transaction to delete.
    """
    user = await _get_authenticated_user()

    w_id = _parse_uuid(wallet_id, "wallet_id")
    if isinstance(w_id, str):
        return {"error": w_id}
    t_id = _parse_uuid(transaction_id, "transaction_id")
    if isinstance(t_id, str):
        return {"error": t_id}

    async for session in get_session():
        wallet_result = await session.exec(
            select(Wallet).where(Wallet.id == w_id, Wallet.user_id == user.id)
        )
        if not wallet_result.first():
            return {"error": "Wallet not found"}

        t_result = await session.exec(
            select(Transaction).where(Transaction.id == t_id, Transaction.wallet_id == w_id)
        )
        t = t_result.first()
        if not t:
            return {"error": "Transaction not found"}

        existing_tags = await session.exec(
            select(TransactionTag).where(col(TransactionTag.transaction_id) == t.id)
        )
        for tt in existing_tags.all():
            await session.delete(tt)

        children = await session.exec(select(Transaction).where(col(Transaction.group_id) == t.id))
        for child in children.all():
            child_tags = await session.exec(
                select(TransactionTag).where(col(TransactionTag.transaction_id) == child.id)
            )
            for tt in child_tags.all():
                await session.delete(tt)
            await session.delete(child)

        await session.delete(t)
        await session.commit()
        return {"deleted": transaction_id}
    return {"error": "Database error"}


async def _get_owned_transaction(
    transaction_id: uuid.UUID, user_id: uuid.UUID, session: Any
) -> Transaction | None:
    result = await session.exec(
        select(Transaction)
        .join(Wallet, col(Transaction.wallet_id) == col(Wallet.id))
        .where(Transaction.id == transaction_id, Wallet.user_id == user_id)
    )
    return result.first()


def _canonical_link_ids(a: uuid.UUID, b: uuid.UUID) -> tuple[uuid.UUID, uuid.UUID]:
    if str(a) < str(b):
        return a, b
    return b, a


@mcp.tool()
async def link_transactions(transaction_id: str, target_transaction_id: str) -> dict[str, Any]:  # noqa: PLR0911
    """
    Link two transactions together (e.g. a refund to its original purchase).

    Links are bidirectional and can span different wallets of the same user.
    Linked transactions appear in each other's "linked_transactions" in get_transaction.

    Args:
        transaction_id: UUID of the first transaction.
        target_transaction_id: UUID of the transaction to link it to.
    """
    user = await _get_authenticated_user()
    t_id = _parse_uuid(transaction_id, "transaction_id")
    if isinstance(t_id, str):
        return {"error": t_id}
    target_id = _parse_uuid(target_transaction_id, "target_transaction_id")
    if isinstance(target_id, str):
        return {"error": target_id}
    if t_id == target_id:
        return {"error": "Cannot link a transaction to itself"}

    async for session in get_session():
        if not await _get_owned_transaction(t_id, user.id, session):
            return {"error": "Transaction not found"}
        if not await _get_owned_transaction(target_id, user.id, session):
            return {"error": "Target transaction not found"}

        id_a, id_b = _canonical_link_ids(t_id, target_id)
        existing = await session.exec(
            select(TransactionLink).where(
                TransactionLink.transaction_id_a == id_a, TransactionLink.transaction_id_b == id_b
            )
        )
        if existing.first():
            return {"error": "Link already exists"}

        session.add(TransactionLink(transaction_id_a=id_a, transaction_id_b=id_b))
        await session.commit()
        return {"linked": [str(id_a), str(id_b)]}
    return {"error": "Database error"}


@mcp.tool()
async def unlink_transactions(transaction_id: str, target_transaction_id: str) -> dict[str, Any]:  # noqa: PLR0911
    """
    Remove the link between two transactions. The transactions themselves are not deleted.

    Args:
        transaction_id: UUID of the first transaction.
        target_transaction_id: UUID of the linked transaction to unlink.
    """
    user = await _get_authenticated_user()
    t_id = _parse_uuid(transaction_id, "transaction_id")
    if isinstance(t_id, str):
        return {"error": t_id}
    target_id = _parse_uuid(target_transaction_id, "target_transaction_id")
    if isinstance(target_id, str):
        return {"error": target_id}

    async for session in get_session():
        if not await _get_owned_transaction(t_id, user.id, session):
            return {"error": "Transaction not found"}
        if not await _get_owned_transaction(target_id, user.id, session):
            return {"error": "Target transaction not found"}

        id_a, id_b = _canonical_link_ids(t_id, target_id)
        result = await session.exec(
            select(TransactionLink).where(
                TransactionLink.transaction_id_a == id_a, TransactionLink.transaction_id_b == id_b
            )
        )
        link = result.first()
        if not link:
            return {"error": "Link not found"}

        await session.delete(link)
        await session.commit()
        return {"unlinked": [str(id_a), str(id_b)]}
    return {"error": "Database error"}


@dataclass
class GetSpendingSummaryInput:
    wallet_id: str
    start_date: str | None = None
    end_date: str | None = None


@mcp.tool()
async def get_spending_summary(params: GetSpendingSummaryInput) -> dict[str, Any]:
    """
    Get aggregate expense and income totals for a wallet over a date range.

    Args:
        params.wallet_id: UUID of the wallet to summarize.
        params.start_date: ISO 8601 start date filter.
        params.end_date: ISO 8601 end date filter.
    """
    user = await _get_authenticated_user()
    w_id = _parse_uuid(params.wallet_id, "wallet_id")
    if isinstance(w_id, str):
        return {"error": w_id}

    async for session in get_session():
        wallet_result = await session.exec(
            select(Wallet).where(Wallet.id == w_id, Wallet.user_id == user.id)
        )
        if not wallet_result.first():
            return {"error": "Wallet not found"}

        query = select(Transaction).where(
            Transaction.wallet_id == w_id, col(Transaction.group_id).is_(None)
        )
        query, err = _apply_date_filters(query, params.start_date, params.end_date)
        if err:
            return {"error": err}

        result = await session.exec(query)
        txns = result.all()

        expenses = [t for t in txns if t.type == "expense"]
        income = [t for t in txns if t.type == "income"]

        return {
            "expense_total": sum(t.amount for t in expenses),
            "expense_count": len(expenses),
            "income_total": sum(t.amount for t in income),
            "income_count": len(income),
            "net_balance": sum(t.amount for t in income) - sum(t.amount for t in expenses),
            "start_date": params.start_date,
            "end_date": params.end_date,
        }
    return {"error": "Database error"}


@dataclass
class GetCategoryBreakdownInput:
    wallet_id: str
    start_date: str | None = None
    end_date: str | None = None
    type: str = "expense"
    limit: int = 20


@mcp.tool()
async def get_category_breakdown(params: GetCategoryBreakdownInput) -> dict[str, Any]:
    """
    Get spending or income totals grouped by category for a wallet.

    Args:
        params.wallet_id: UUID of the wallet.
        params.start_date: ISO 8601 start date filter.
        params.end_date: ISO 8601 end date filter.
        params.type: Transaction type: "expense" (default) or "income".
        params.limit: Max categories to return (default 20).
    """
    user = await _get_authenticated_user()
    w_id = _parse_uuid(params.wallet_id, "wallet_id")
    if isinstance(w_id, str):
        return {"error": w_id}

    if params.type not in {"expense", "income"}:
        return {"error": "type must be 'expense' or 'income'"}

    async for session in get_session():
        wallet_result = await session.exec(
            select(Wallet).where(Wallet.id == w_id, Wallet.user_id == user.id)
        )
        if not wallet_result.first():
            return {"error": "Wallet not found"}

        query = select(Transaction).where(
            Transaction.wallet_id == w_id,
            Transaction.type == params.type,
            col(Transaction.group_id).is_(None),
        )
        query, err = _apply_date_filters(query, params.start_date, params.end_date)
        if err:
            return {"error": err}

        result = await session.exec(query)
        txns = result.all()

        cat_ids = {t.category_id for t in txns}
        cat_map: dict[Any, dict[str, Any]] = {}
        for cat_id in cat_ids:
            r = await session.exec(select(Category).where(Category.id == cat_id))
            cat = r.first()
            if cat:
                cat_map[cat_id] = {"name": cat.name, "color": cat.color}

        raw: dict[str, dict[str, Any]] = {}
        for t in txns:
            info = cat_map.get(t.category_id, {"name": "Unknown", "color": None})
            name = info["name"]
            if name not in raw:
                raw[name] = {
                    "category": name,
                    "category_color": info["color"],
                    "total": 0.0,
                    "count": 0,
                }
            raw[name]["total"] += t.amount
            raw[name]["count"] += 1

        breakdown = sorted(raw.values(), key=operator.itemgetter("total"), reverse=True)[
            : params.limit
        ]
        return {
            "type": params.type,
            "breakdown": breakdown,
            "start_date": params.start_date,
            "end_date": params.end_date,
        }
    return {"error": "Database error"}


@dataclass
class GetMonthlyTrendInput:
    wallet_id: str
    start_date: str | None = None
    end_date: str | None = None
    months: int = 12


@mcp.tool()
async def get_monthly_trend(params: GetMonthlyTrendInput) -> dict[str, Any]:
    """
    Get expense and income totals grouped by month for a wallet.

    Args:
        params.wallet_id: UUID of the wallet.
        params.start_date: ISO 8601 start date filter.
        params.end_date: ISO 8601 end date filter.
        params.months: Number of most recent months if no date range given (default 12).
    """
    user = await _get_authenticated_user()
    w_id = _parse_uuid(params.wallet_id, "wallet_id")
    if isinstance(w_id, str):
        return {"error": w_id}

    async for session in get_session():
        wallet_result = await session.exec(
            select(Wallet).where(Wallet.id == w_id, Wallet.user_id == user.id)
        )
        if not wallet_result.first():
            return {"error": "Wallet not found"}

        query = select(Transaction).where(
            Transaction.wallet_id == w_id, col(Transaction.group_id).is_(None)
        )
        query, err = _apply_date_filters(query, params.start_date, params.end_date)
        if err:
            return {"error": err}

        result = await session.exec(query.order_by(col(Transaction.date).desc()))
        txns = result.all()

        raw: dict[str, dict[str, Any]] = {}
        for t in txns:
            period = t.date.strftime("%Y-%m")
            if period not in raw:
                raw[period] = {
                    "period": period,
                    "expense_total": 0.0,
                    "income_total": 0.0,
                    "count": 0,
                }
            if t.type == "expense":
                raw[period]["expense_total"] += t.amount
            else:
                raw[period]["income_total"] += t.amount
            raw[period]["count"] += 1

        trend = sorted(raw.values(), key=operator.itemgetter("period"), reverse=True)[
            : params.months
        ]
        return {"trend": trend}
    return {"error": "Database error"}


_FREQUENCIES = {"daily", "weekly", "bi-weekly", "monthly", "yearly"}


def _recurring_to_dict(r: RecurringTransaction) -> dict[str, Any]:
    return {
        "id": str(r.id),
        "wallet_id": str(r.wallet_id),
        "category_id": str(r.category_id),
        "type": r.type,
        "amount": r.amount,
        "description": r.description,
        "frequency": r.frequency,
        "next_due": r.next_due.isoformat(),
        "is_active": r.is_active,
        "created_at": r.created_at.isoformat(),
    }


def _parse_next_due(value: str) -> datetime | str:
    parsed = _parse_dt(value, "next_due")
    if isinstance(parsed, str):
        return parsed
    if parsed.date() < datetime.now(UTC).date():
        return "next_due cannot be in the past"
    return parsed


@mcp.tool()
async def list_recurring_transactions(wallet_id: str) -> dict[str, Any]:
    """
    List recurring transactions (subscriptions, salaries, rent, ...) for a wallet.

    Each recurring transaction automatically creates a real transaction every time it
    comes due, then advances next_due by its frequency.

    Args:
        wallet_id: UUID of the wallet.
    """
    user = await _get_authenticated_user()
    w_id = _parse_uuid(wallet_id, "wallet_id")
    if isinstance(w_id, str):
        return {"error": w_id}

    async for session in get_session():
        wallet_result = await session.exec(
            select(Wallet).where(Wallet.id == w_id, Wallet.user_id == user.id)
        )
        if not wallet_result.first():
            return {"error": "Wallet not found"}

        result = await session.exec(
            select(RecurringTransaction).where(RecurringTransaction.wallet_id == w_id)
        )
        return {"items": [_recurring_to_dict(r) for r in result.all()]}
    return {"error": "Database error"}


@dataclass
class CreateRecurringInput:
    wallet_id: str
    amount: float
    frequency: str
    next_due: str
    type: str = "expense"
    category_id: str | None = None
    category_name: str | None = None
    description: str | None = None


@mcp.tool()
async def create_recurring_transaction(params: CreateRecurringInput) -> dict[str, Any]:  # noqa: PLR0911, PLR0912
    """
    Create a recurring transaction (subscription, salary, rent, ...).

    A real transaction is created automatically every time it comes due, starting at
    next_due, then repeating at the given frequency.

    Args:
        params.wallet_id: UUID of the wallet.
        params.amount: Amount per occurrence (must be positive).
        params.frequency: "daily", "weekly", "bi-weekly", "monthly", or "yearly".
        params.next_due: ISO 8601 date of the next occurrence (must not be in the past).
        params.type: Transaction type: "expense" (default) or "income".
        params.category_id: UUID of an existing category (mutually exclusive with category_name).
        params.category_name: Name of the category — matched case-insensitively or created if new.
        params.description: Optional description (e.g. "Netflix").
    """
    user = await _get_authenticated_user()
    w_id = _parse_uuid(params.wallet_id, "wallet_id")
    if isinstance(w_id, str):
        return {"error": w_id}
    if params.amount <= 0:
        return {"error": "Amount must be positive"}
    if params.type not in {"expense", "income"}:
        return {"error": "type must be 'expense' or 'income'"}
    if params.frequency not in _FREQUENCIES:
        return {"error": f"frequency must be one of {sorted(_FREQUENCIES)}"}
    if params.category_id and params.category_name:
        return {"error": "Provide either category_id or category_name, not both"}
    if not params.category_id and not params.category_name:
        return {"error": "Provide either category_id or category_name"}
    next_due = _parse_next_due(params.next_due)
    if isinstance(next_due, str):
        return {"error": next_due}

    async for session in get_session():
        wallet_result = await session.exec(
            select(Wallet).where(Wallet.id == w_id, Wallet.user_id == user.id)
        )
        if not wallet_result.first():
            return {"error": "Wallet not found"}

        if params.category_id:
            c_id = _parse_uuid(params.category_id, "category_id")
            if isinstance(c_id, str):
                return {"error": c_id}
            cat_result = await session.exec(
                select(Category).where(Category.id == c_id, Category.user_id == user.id)
            )
            if not cat_result.first():
                return {"error": "Category not found"}
            resolved_category_id = c_id
        else:
            assert params.category_name is not None
            category = await find_or_create_category(
                user_id=user.id, name=params.category_name, session=session
            )
            resolved_category_id = category.id

        recurring = RecurringTransaction(
            wallet_id=w_id,
            category_id=resolved_category_id,
            type=params.type,
            amount=params.amount,
            description=params.description,
            frequency=params.frequency,
            next_due=next_due,
        )
        session.add(recurring)
        await session.commit()
        await session.refresh(recurring)
        return _recurring_to_dict(recurring)
    return {"error": "Database error"}


@dataclass
class UpdateRecurringInput:
    wallet_id: str
    recurring_id: str
    category_id: str | None = None
    type: str | None = None
    amount: float | None = None
    description: str | None = None
    frequency: str | None = None
    next_due: str | None = None
    is_active: bool | None = None


@mcp.tool()
async def update_recurring_transaction(params: UpdateRecurringInput) -> dict[str, Any]:  # noqa: C901, PLR0911, PLR0912
    """
    Update a recurring transaction. Only provided fields are changed.

    Set is_active to false to pause a subscription without deleting it.

    Args:
        params.wallet_id: UUID of the wallet containing the recurring transaction.
        params.recurring_id: UUID of the recurring transaction to update.
        params.category_id: New category UUID.
        params.type: New type: "expense" or "income".
        params.amount: New amount per occurrence (must be positive).
        params.description: New description.
        params.frequency: New frequency: "daily", "weekly", "bi-weekly", "monthly", or "yearly".
        params.next_due: New next occurrence date (ISO 8601, must not be in the past).
        params.is_active: Set false to pause, true to resume.
    """
    user = await _get_authenticated_user()
    w_id = _parse_uuid(params.wallet_id, "wallet_id")
    if isinstance(w_id, str):
        return {"error": w_id}
    r_id = _parse_uuid(params.recurring_id, "recurring_id")
    if isinstance(r_id, str):
        return {"error": r_id}
    if params.amount is not None and params.amount <= 0:
        return {"error": "Amount must be positive"}
    if params.type is not None and params.type not in {"expense", "income"}:
        return {"error": "type must be 'expense' or 'income'"}
    if params.frequency is not None and params.frequency not in _FREQUENCIES:
        return {"error": f"frequency must be one of {sorted(_FREQUENCIES)}"}

    next_due: datetime | None = None
    if params.next_due is not None:
        parsed_due = _parse_next_due(params.next_due)
        if isinstance(parsed_due, str):
            return {"error": parsed_due}
        next_due = parsed_due

    async for session in get_session():
        wallet_result = await session.exec(
            select(Wallet).where(Wallet.id == w_id, Wallet.user_id == user.id)
        )
        if not wallet_result.first():
            return {"error": "Wallet not found"}

        result = await session.exec(
            select(RecurringTransaction).where(
                RecurringTransaction.id == r_id, RecurringTransaction.wallet_id == w_id
            )
        )
        recurring = result.first()
        if not recurring:
            return {"error": "Recurring transaction not found"}

        if params.category_id is not None:
            c_id = _parse_uuid(params.category_id, "category_id")
            if isinstance(c_id, str):
                return {"error": c_id}
            cat_result = await session.exec(
                select(Category).where(Category.id == c_id, Category.user_id == user.id)
            )
            if not cat_result.first():
                return {"error": "Category not found"}
            recurring.category_id = c_id

        if params.type is not None:
            recurring.type = params.type
        if params.amount is not None:
            recurring.amount = params.amount
        if params.description is not None:
            recurring.description = params.description
        if params.frequency is not None:
            recurring.frequency = params.frequency
        if next_due is not None:
            recurring.next_due = next_due
        if params.is_active is not None:
            recurring.is_active = params.is_active

        session.add(recurring)
        await session.commit()
        await session.refresh(recurring)
        return _recurring_to_dict(recurring)
    return {"error": "Database error"}


@mcp.tool()
async def delete_recurring_transaction(wallet_id: str, recurring_id: str) -> dict[str, Any]:
    """
    Delete a recurring transaction. Transactions it already created are not affected.

    Args:
        wallet_id: UUID of the wallet containing the recurring transaction.
        recurring_id: UUID of the recurring transaction to delete.
    """
    user = await _get_authenticated_user()
    w_id = _parse_uuid(wallet_id, "wallet_id")
    if isinstance(w_id, str):
        return {"error": w_id}
    r_id = _parse_uuid(recurring_id, "recurring_id")
    if isinstance(r_id, str):
        return {"error": r_id}

    async for session in get_session():
        wallet_result = await session.exec(
            select(Wallet).where(Wallet.id == w_id, Wallet.user_id == user.id)
        )
        if not wallet_result.first():
            return {"error": "Wallet not found"}

        result = await session.exec(
            select(RecurringTransaction).where(
                RecurringTransaction.id == r_id, RecurringTransaction.wallet_id == w_id
            )
        )
        recurring = result.first()
        if not recurring:
            return {"error": "Recurring transaction not found"}

        await session.delete(recurring)
        await session.commit()
        return {"deleted": recurring_id}
    return {"error": "Database error"}


_BUDGET_PERIODS = {"weekly", "monthly"}


def _budget_period_start(period: str) -> datetime:
    now = datetime.now(UTC)
    if period == "weekly":
        return now - timedelta(days=now.weekday())
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


async def _budget_to_dict(budget: Budget, session: Any) -> dict[str, Any]:
    period_start = _budget_period_start(budget.period)
    query = select(Transaction).where(
        col(Transaction.date) >= period_start,
        Transaction.type == "expense",
        col(Transaction.group_id).is_(None),
    )
    if budget.wallet_id is not None:
        query = query.where(Transaction.wallet_id == budget.wallet_id)
    else:
        wallets_result = await session.exec(select(Wallet).where(Wallet.user_id == budget.user_id))
        wallet_ids = [w.id for w in wallets_result.all()]
        query = query.where(col(Transaction.wallet_id).in_(wallet_ids)) if wallet_ids else None
    if query is not None and budget.category_id is not None:
        query = query.where(Transaction.category_id == budget.category_id)

    spent = 0.0
    if query is not None:
        result = await session.exec(query)
        spent = sum(e.amount for e in result.all())

    percentage_used = (spent / budget.amount * 100) if budget.amount > 0 else 0.0
    return {
        "id": str(budget.id),
        "wallet_id": str(budget.wallet_id) if budget.wallet_id else None,
        "category_id": str(budget.category_id) if budget.category_id else None,
        "amount": budget.amount,
        "period": budget.period,
        "start_date": budget.start_date.isoformat(),
        "created_at": budget.created_at.isoformat(),
        "spent": spent,
        "remaining": budget.amount - spent,
        "percentage_used": round(percentage_used, 2),
        "is_over_budget": spent > budget.amount,
    }


@mcp.tool()
async def list_budgets() -> dict[str, Any]:
    """
    List all budgets with their current spending status.

    Each budget includes spent, remaining, percentage_used, and is_over_budget for the
    current period. A budget without wallet_id covers all wallets; without category_id
    it covers all categories.
    """
    user = await _get_authenticated_user()
    async for session in get_session():
        result = await session.exec(select(Budget).where(Budget.user_id == user.id))
        return {"items": [await _budget_to_dict(b, session) for b in result.all()]}
    return {"error": "Database error"}


@dataclass
class CreateBudgetInput:
    amount: float
    period: str
    wallet_id: str | None = None
    category_id: str | None = None


@mcp.tool()
async def create_budget(params: CreateBudgetInput) -> dict[str, Any]:  # noqa: PLR0911
    """
    Create a spending budget.

    Args:
        params.amount: Budget limit per period (must be positive).
        params.period: "weekly" or "monthly".
        params.wallet_id: Optional wallet UUID to scope the budget to (all wallets if omitted).
        params.category_id: Optional category UUID to scope the budget to (all categories if omitted).
    """
    user = await _get_authenticated_user()
    if params.amount <= 0:
        return {"error": "Amount must be positive"}
    if params.period not in _BUDGET_PERIODS:
        return {"error": "period must be 'weekly' or 'monthly'"}

    async for session in get_session():
        w_id: uuid.UUID | None = None
        if params.wallet_id is not None:
            parsed_w = _parse_uuid(params.wallet_id, "wallet_id")
            if isinstance(parsed_w, str):
                return {"error": parsed_w}
            wallet_result = await session.exec(
                select(Wallet).where(Wallet.id == parsed_w, Wallet.user_id == user.id)
            )
            if not wallet_result.first():
                return {"error": "Wallet not found"}
            w_id = parsed_w

        c_id: uuid.UUID | None = None
        if params.category_id is not None:
            parsed_c = _parse_uuid(params.category_id, "category_id")
            if isinstance(parsed_c, str):
                return {"error": parsed_c}
            cat_result = await session.exec(
                select(Category).where(Category.id == parsed_c, Category.user_id == user.id)
            )
            if not cat_result.first():
                return {"error": "Category not found"}
            c_id = parsed_c

        budget = Budget(
            user_id=user.id,
            wallet_id=w_id,
            category_id=c_id,
            amount=params.amount,
            period=params.period,
        )
        session.add(budget)
        await session.commit()
        await session.refresh(budget)
        return await _budget_to_dict(budget, session)
    return {"error": "Database error"}


@dataclass
class UpdateBudgetInput:
    budget_id: str
    amount: float | None = None
    period: str | None = None
    wallet_id: str | None = None
    category_id: str | None = None


@mcp.tool()
async def update_budget(params: UpdateBudgetInput) -> dict[str, Any]:  # noqa: PLR0911, PLR0912
    """
    Update a budget. Only provided fields are changed.

    Note: wallet_id and category_id can be changed but not cleared back to
    all-wallets/all-categories scope.

    Args:
        params.budget_id: UUID of the budget to update.
        params.amount: New budget limit (must be positive).
        params.period: New period: "weekly" or "monthly".
        params.wallet_id: New wallet UUID to scope the budget to.
        params.category_id: New category UUID to scope the budget to.
    """
    user = await _get_authenticated_user()
    b_id = _parse_uuid(params.budget_id, "budget_id")
    if isinstance(b_id, str):
        return {"error": b_id}
    if params.amount is not None and params.amount <= 0:
        return {"error": "Amount must be positive"}
    if params.period is not None and params.period not in _BUDGET_PERIODS:
        return {"error": "period must be 'weekly' or 'monthly'"}

    async for session in get_session():
        result = await session.exec(
            select(Budget).where(Budget.id == b_id, Budget.user_id == user.id)
        )
        budget = result.first()
        if not budget:
            return {"error": "Budget not found"}

        if params.wallet_id is not None:
            parsed_w = _parse_uuid(params.wallet_id, "wallet_id")
            if isinstance(parsed_w, str):
                return {"error": parsed_w}
            wallet_result = await session.exec(
                select(Wallet).where(Wallet.id == parsed_w, Wallet.user_id == user.id)
            )
            if not wallet_result.first():
                return {"error": "Wallet not found"}
            budget.wallet_id = parsed_w

        if params.category_id is not None:
            parsed_c = _parse_uuid(params.category_id, "category_id")
            if isinstance(parsed_c, str):
                return {"error": parsed_c}
            cat_result = await session.exec(
                select(Category).where(Category.id == parsed_c, Category.user_id == user.id)
            )
            if not cat_result.first():
                return {"error": "Category not found"}
            budget.category_id = parsed_c

        if params.amount is not None:
            budget.amount = params.amount
        if params.period is not None:
            budget.period = params.period

        session.add(budget)
        await session.commit()
        await session.refresh(budget)
        return await _budget_to_dict(budget, session)
    return {"error": "Database error"}


@mcp.tool()
async def delete_budget(budget_id: str) -> dict[str, Any]:
    """
    Delete a budget. Transactions are not affected.

    Args:
        budget_id: UUID of the budget to delete.
    """
    user = await _get_authenticated_user()
    b_id = _parse_uuid(budget_id, "budget_id")
    if isinstance(b_id, str):
        return {"error": b_id}

    async for session in get_session():
        result = await session.exec(
            select(Budget).where(Budget.id == b_id, Budget.user_id == user.id)
        )
        budget = result.first()
        if not budget:
            return {"error": "Budget not found"}

        await session.delete(budget)
        await session.commit()
        return {"deleted": budget_id}
    return {"error": "Database error"}


_fx_cache: dict[str, tuple[dict[str, float], float]] = {}
_FX_TTL = 3600.0


@mcp.tool()
async def convert_currency(amount: float, from_currency: str, to_currency: str) -> dict[str, Any]:
    """
    Convert an amount between currencies using live exchange rates.

    Args:
        amount: The amount to convert.
        from_currency: Source currency code (e.g. USD, EUR, GBP).
        to_currency: Target currency code (e.g. USD, EUR, GBP).
    """
    await _get_authenticated_user()
    from_cur = from_currency.upper()
    to_cur = to_currency.upper()

    if from_cur == to_cur:
        return {
            "from_currency": from_cur,
            "to_currency": to_cur,
            "rate": 1.0,
            "amount": amount,
            "result": amount,
        }

    cached = _fx_cache.get(from_cur)
    if cached and time.time() - cached[1] < _FX_TTL:
        rates = cached[0]
    else:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"https://api.frankfurter.dev/v2/rates?base={from_cur}")
        if resp.status_code != 200:
            return {"error": f"Exchange rate API returned {resp.status_code}"}
        data = resp.json()
        if not isinstance(data, list):
            return {"error": "Exchange rate API error"}
        rates = {item["quote"]: float(item["rate"]) for item in data}
        _fx_cache[from_cur] = (rates, time.time())

    rate = rates.get(to_cur)
    if rate is None:
        return {"error": f"Unsupported currency: {to_cur}"}

    return {
        "from_currency": from_cur,
        "to_currency": to_cur,
        "rate": rate,
        "amount": amount,
        "result": round(amount * rate, 6),
    }
