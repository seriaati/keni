from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

from sqlalchemy import func
from sqlmodel import col, select

from app.models.transaction import Transaction
from app.models.wallet import Wallet
from app.services.fx import FxUnavailableError, get_rates
from app.services.transaction_group import counted_filter

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

    from app.models.budget import Budget
    from app.models.user import User


def period_start(period: str) -> datetime:
    now = datetime.now(UTC)
    if period == "weekly":
        return now - timedelta(days=now.weekday())
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def default_currency(user: User, wallet: Wallet | None) -> str | None:
    if wallet is not None:
        return wallet.currency
    return user.global_currency


async def compute_spent(
    budget: Budget, session: AsyncSession, count_sub_transactions: bool
) -> float:
    """Expenses in the current period, converted to ``budget.currency`` at latest rates.

    Raises FxUnavailableError when a wallet currency can't be converted.
    """
    query = (
        select(Wallet.currency, func.sum(Transaction.amount))
        .join(Wallet, col(Transaction.wallet_id) == col(Wallet.id))
        .where(
            Wallet.user_id == budget.user_id,
            col(Transaction.date) >= period_start(budget.period),
            Transaction.type == "expense",
            counted_filter(count_sub_transactions),
        )
        .group_by(Wallet.currency)
    )
    if budget.wallet_id is not None:
        query = query.where(Transaction.wallet_id == budget.wallet_id)
    if budget.category_id is not None:
        query = query.where(Transaction.category_id == budget.category_id)

    result = await session.exec(query)
    target = budget.currency.upper()
    rates: dict[str, float] | None = None
    spent = 0.0
    for currency, total in result.all():
        source = currency.upper()
        if source == target:
            spent += total
            continue
        if rates is None:
            rates = await get_rates(target)
        rate = rates.get(source)
        if rate is None:
            msg = f"No exchange rate from {source} to {target}"
            raise FxUnavailableError(msg)
        spent += total / rate
    return round(spent, 2)
