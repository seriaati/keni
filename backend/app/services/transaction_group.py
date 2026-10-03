from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlmodel import col, select

from app.models.transaction import Transaction

if TYPE_CHECKING:
    import uuid

    from sqlmodel.ext.asyncio.session import AsyncSession


async def has_children(session: AsyncSession, transaction_id: uuid.UUID) -> bool:
    result = await session.exec(
        select(Transaction.id).where(col(Transaction.group_id) == transaction_id).limit(1)
    )
    return result.first() is not None


async def adjust_group_parent_amount(
    session: AsyncSession, group_id: uuid.UUID | None, delta: float
) -> None:
    """Shift a group parent's amount by delta so it stays the sum of its children."""
    if group_id is None or delta == 0:
        return
    result = await session.exec(select(Transaction).where(Transaction.id == group_id))
    parent = result.first()
    if parent is None:
        return
    parent.amount += delta
    parent.updated_at = datetime.now(UTC)
    session.add(parent)
