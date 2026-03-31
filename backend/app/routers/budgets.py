from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.budget import Budget
from app.models.category import Category
from app.models.expense import Expense
from app.models.user import User
from app.models.wallet import Wallet
from app.schemas.budget import BudgetCreate, BudgetResponse, BudgetUpdate

router = APIRouter(prefix="/api/budgets", tags=["budgets"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


async def _get_budget_or_404(
    budget_id: uuid.UUID, user_id: uuid.UUID, session: AsyncSession
) -> Budget:
    result = await session.exec(
        select(Budget).where(Budget.id == budget_id, Budget.user_id == user_id)
    )
    budget = result.first()
    if not budget:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Budget not found")
    return budget


async def _validate_wallet(wallet_id: uuid.UUID, user_id: uuid.UUID, session: AsyncSession) -> None:
    result = await session.exec(
        select(Wallet).where(Wallet.id == wallet_id, Wallet.user_id == user_id)
    )
    if not result.first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wallet not found")


async def _validate_category(
    category_id: uuid.UUID, user_id: uuid.UUID, session: AsyncSession
) -> None:
    result = await session.exec(
        select(Category).where(Category.id == category_id, Category.user_id == user_id)
    )
    if not result.first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")


def _period_start(period: str) -> datetime:
    now = datetime.now(UTC)
    if period == "weekly":
        return now - timedelta(days=now.weekday())
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


async def _compute_spent(budget: Budget, session: AsyncSession) -> float:
    period_start = _period_start(budget.period)

    query = select(Expense).where(col(Expense.date) >= period_start)

    if budget.wallet_id is not None:
        query = query.where(Expense.wallet_id == budget.wallet_id)
    else:
        wallets_result = await session.exec(select(Wallet).where(Wallet.user_id == budget.user_id))
        wallet_ids = [w.id for w in wallets_result.all()]
        if not wallet_ids:
            return 0.0
        query = query.where(col(Expense.wallet_id).in_(wallet_ids))

    if budget.category_id is not None:
        query = query.where(Expense.category_id == budget.category_id)

    result = await session.exec(query)
    return sum(e.amount for e in result.all())


async def _to_response(budget: Budget, session: AsyncSession) -> BudgetResponse:
    spent = await _compute_spent(budget, session)
    remaining = budget.amount - spent
    percentage_used = (spent / budget.amount * 100) if budget.amount > 0 else 0.0
    return BudgetResponse(
        id=budget.id,
        user_id=budget.user_id,
        wallet_id=budget.wallet_id,
        category_id=budget.category_id,
        amount=budget.amount,
        period=budget.period,
        start_date=budget.start_date,
        created_at=budget.created_at,
        spent=spent,
        remaining=remaining,
        percentage_used=round(percentage_used, 2),
        is_over_budget=spent > budget.amount,
    )


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_budget(
    body: BudgetCreate, current_user: CurrentUser, session: DbDep
) -> BudgetResponse:
    if body.wallet_id is not None:
        await _validate_wallet(body.wallet_id, current_user.id, session)
    if body.category_id is not None:
        await _validate_category(body.category_id, current_user.id, session)

    budget = Budget(
        user_id=current_user.id,
        wallet_id=body.wallet_id,
        category_id=body.category_id,
        amount=body.amount,
        period=body.period,
    )
    session.add(budget)
    await session.commit()
    await session.refresh(budget)
    return await _to_response(budget, session)


@router.get("")
async def list_budgets(current_user: CurrentUser, session: DbDep) -> list[BudgetResponse]:
    result = await session.exec(select(Budget).where(Budget.user_id == current_user.id))
    budgets = result.all()
    return [await _to_response(b, session) for b in budgets]


@router.patch("/{budget_id}")
async def update_budget(
    budget_id: uuid.UUID, body: BudgetUpdate, current_user: CurrentUser, session: DbDep
) -> BudgetResponse:
    budget = await _get_budget_or_404(budget_id, current_user.id, session)

    if body.wallet_id is not None:
        await _validate_wallet(body.wallet_id, current_user.id, session)
        budget.wallet_id = body.wallet_id
    if body.category_id is not None:
        await _validate_category(body.category_id, current_user.id, session)
        budget.category_id = body.category_id
    if body.amount is not None:
        budget.amount = body.amount
    if body.period is not None:
        budget.period = body.period

    session.add(budget)
    await session.commit()
    await session.refresh(budget)
    return await _to_response(budget, session)


@router.delete("/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_budget(budget_id: uuid.UUID, current_user: CurrentUser, session: DbDep) -> None:
    budget = await _get_budget_or_404(budget_id, current_user.id, session)
    await session.delete(budget)
    await session.commit()
