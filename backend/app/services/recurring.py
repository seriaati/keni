from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

from sqlmodel import select

from app.models.expense import Expense
from app.models.recurring import RecurringExpense

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession


def _compute_next_due(current: datetime, frequency: str) -> datetime:
    match frequency:
        case "daily":
            return current + timedelta(days=1)
        case "weekly":
            return current + timedelta(weeks=1)
        case "bi-weekly":
            return current + timedelta(weeks=2)
        case "monthly":
            month = current.month + 1
            year = current.year + (month - 1) // 12
            month = (month - 1) % 12 + 1
            day = min(current.day, _days_in_month(year, month))
            return current.replace(year=year, month=month, day=day)
        case "yearly":
            year = current.year + 1
            day = min(current.day, _days_in_month(year, current.month))
            return current.replace(year=year, day=day)
        case _:
            return current + timedelta(days=30)


def _days_in_month(year: int, month: int) -> int:
    if month == 12:
        return 31
    return (datetime(year, month + 1, 1, tzinfo=UTC) - timedelta(days=1)).day


async def process_due_recurring_expenses(session: AsyncSession) -> int:
    now = datetime.now(UTC)
    result = await session.exec(
        select(RecurringExpense).where(RecurringExpense.is_active, RecurringExpense.next_due <= now)
    )
    due = result.all()

    created = 0
    for recurring in due:
        expense = Expense(
            wallet_id=recurring.wallet_id,
            category_id=recurring.category_id,
            amount=recurring.amount,
            description=recurring.description,
            date=recurring.next_due,
        )
        session.add(expense)

        next_due = _compute_next_due(recurring.next_due, recurring.frequency)
        recurring.next_due = next_due
        session.add(recurring)
        created += 1

    if created:
        await session.commit()

    return created
