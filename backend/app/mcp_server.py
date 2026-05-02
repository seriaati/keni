from __future__ import annotations

import base64
import operator
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any, cast

from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.settings import AuthSettings, ClientRegistrationOptions, RevocationOptions
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import Icon
from pydantic import AnyHttpUrl
from sqlalchemy import func
from sqlmodel import col, select

from app.config import settings as app_settings
from app.database import get_session
from app.models.category import Category
from app.models.tag import Tag
from app.models.transaction import Transaction, TransactionTag
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
        "Use these tools to create, query, update, and delete transaction records on behalf of the authenticated user. "
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
                "is_system": c.is_system,
            }
            for c in result.all()
        ]
    return []


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
            rows.append(_transaction_to_dict(t, cat, tags))

        return {"items": rows, "total": int(total), "page": page, "page_size": page_size}
    return "Database error"


@mcp.tool()
async def list_transactions(params: ListTransactionsInput) -> dict[str, Any]:
    """
    List transactions for a wallet with optional filters.

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
        return _transaction_to_dict(t, cat, tags)
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


async def _insert_transaction(  # noqa: C901, PLR0911, PLR0912
    params: CreateTransactionInput, user_id: uuid.UUID
) -> dict[str, Any] | str:
    w_id = _parse_uuid(params.wallet_id, "wallet_id")
    if isinstance(w_id, str):
        return w_id

    if params.category_id and params.category_name:
        return "Provide either category_id or category_name, not both"
    if not params.category_id and not params.category_name:
        return "Provide either category_id or category_name"

    transaction_date: datetime = datetime.now(UTC)
    if params.date:
        parsed_dt = _parse_dt(params.date, "date")
        if isinstance(parsed_dt, str):
            return parsed_dt
        transaction_date = parsed_dt

    async for session in get_session():
        wallet_result = await session.exec(
            select(Wallet).where(Wallet.id == w_id, Wallet.user_id == user_id)
        )
        if not wallet_result.first():
            return "Wallet not found"

        if params.category_id:
            c_id = _parse_uuid(params.category_id, "category_id")
            if isinstance(c_id, str):
                return c_id
            cat_result = await session.exec(
                select(Category).where(Category.id == c_id, Category.user_id == user_id)
            )
            cat = cat_result.first()
            if not cat:
                return "Category not found"
            resolved_category_id = c_id
        else:
            assert params.category_name is not None
            cat = await find_or_create_category(
                user_id=user_id,
                name=params.category_name,
                session=session,
                icon=params.category_icon,
            )
            resolved_category_id = cat.id

        all_tag_ids: list[uuid.UUID] = []
        for tid in params.tag_ids:
            parsed_tid = _parse_uuid(tid, "tag_id")
            if isinstance(parsed_tid, str):
                return parsed_tid
            tag_check = await session.exec(
                select(Tag).where(Tag.id == parsed_tid, Tag.user_id == user_id)
            )
            if not tag_check.first():
                return f"Tag {tid} not found"
            all_tag_ids.append(parsed_tid)

        for name in params.tag_names:
            tag = await find_or_create_tag(user_id=user_id, name=name, session=session)
            if tag.id not in all_tag_ids:
                all_tag_ids.append(tag.id)

        transaction = Transaction(
            wallet_id=w_id,
            category_id=resolved_category_id,
            type=params.type,
            amount=params.amount,
            description=params.description,
            date=transaction_date,
            ai_context=params.ai_context,
        )
        session.add(transaction)
        await session.flush()

        for tag_id in all_tag_ids:
            session.add(TransactionTag(transaction_id=transaction.id, tag_id=tag_id))

        await session.commit()
        await session.refresh(transaction)

        tags = [{"id": str(tid), "name": None, "color": None} for tid in all_tag_ids]
        return _transaction_to_dict(transaction, cat, tags)
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
        params.amount: Transaction amount (must be positive).
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
    if params.amount <= 0:
        return {"error": "Amount must be positive"}
    if params.type not in {"expense", "income"}:
        return {"error": "type must be 'expense' or 'income'"}
    result = await _insert_transaction(params, user.id)
    if isinstance(result, str):
        return {"error": result}
    return result


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
async def update_transaction(params: UpdateTransactionInput) -> dict[str, Any]:  # noqa: C901, PLR0911, PLR0912
    """
    Update an existing transaction.

    Only provided fields are updated; omitted fields remain unchanged.
    To replace all tags, pass the full desired list in tag_ids.

    Args:
        params.wallet_id: UUID of the wallet containing the transaction.
        params.transaction_id: UUID of the transaction to update.
        params.category_id: New category UUID.
        params.type: New type: "expense" or "income".
        params.amount: New amount (must be positive).
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
    if params.amount is not None and params.amount <= 0:
        return {"error": "Amount must be positive"}

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
        return _transaction_to_dict(t, cat, tags)
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
