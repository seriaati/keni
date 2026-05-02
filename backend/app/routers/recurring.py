from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.category import Category
from app.models.recurring import RecurringTransaction
from app.models.user import User
from app.models.wallet import Wallet
from app.schemas.recurring import (
    RecurringTransactionCreate,
    RecurringTransactionResponse,
    RecurringTransactionUpdate,
)
from app.services.category_tag import find_or_create_category

router = APIRouter(prefix="/api/wallets/{wallet_id}/recurring", tags=["recurring"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


async def _get_wallet_or_404(
    wallet_id: uuid.UUID, user_id: uuid.UUID, session: AsyncSession
) -> Wallet:
    result = await session.exec(
        select(Wallet).where(Wallet.id == wallet_id, Wallet.user_id == user_id)
    )
    wallet = result.first()
    if not wallet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wallet not found")
    return wallet


async def _get_recurring_or_404(
    recurring_id: uuid.UUID, wallet_id: uuid.UUID, session: AsyncSession
) -> RecurringTransaction:
    result = await session.exec(
        select(RecurringTransaction).where(
            RecurringTransaction.id == recurring_id, RecurringTransaction.wallet_id == wallet_id
        )
    )
    recurring = result.first()
    if not recurring:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Recurring transaction not found"
        )
    return recurring


async def _validate_category(
    category_id: uuid.UUID, user_id: uuid.UUID, session: AsyncSession
) -> None:
    result = await session.exec(
        select(Category).where(Category.id == category_id, Category.user_id == user_id)
    )
    if not result.first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")


def _to_response(r: RecurringTransaction) -> RecurringTransactionResponse:
    return RecurringTransactionResponse(
        id=r.id,
        wallet_id=r.wallet_id,
        category_id=r.category_id,
        type=r.type,
        amount=r.amount,
        description=r.description,
        frequency=r.frequency,
        next_due=r.next_due,
        is_active=r.is_active,
        created_at=r.created_at,
    )


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_recurring(
    wallet_id: uuid.UUID,
    body: RecurringTransactionCreate,
    current_user: CurrentUser,
    session: DbDep,
) -> RecurringTransactionResponse:
    await _get_wallet_or_404(wallet_id, current_user.id, session)

    if body.category_id is not None:
        await _validate_category(body.category_id, current_user.id, session)
        resolved_category_id = body.category_id
    else:
        assert body.category_name is not None
        category = await find_or_create_category(
            user_id=current_user.id,
            name=body.category_name,
            session=session,
        )
        resolved_category_id = category.id

    recurring = RecurringTransaction(
        wallet_id=wallet_id,
        category_id=resolved_category_id,
        type=body.type,
        amount=body.amount,
        description=body.description,
        frequency=body.frequency,
        next_due=body.next_due,
    )
    session.add(recurring)
    await session.commit()
    await session.refresh(recurring)
    return _to_response(recurring)


@router.get("")
async def list_recurring(
    wallet_id: uuid.UUID, current_user: CurrentUser, session: DbDep
) -> list[RecurringTransactionResponse]:
    await _get_wallet_or_404(wallet_id, current_user.id, session)
    result = await session.exec(
        select(RecurringTransaction).where(RecurringTransaction.wallet_id == wallet_id)
    )
    return [_to_response(r) for r in result.all()]


@router.patch("/{recurring_id}")
async def update_recurring(
    wallet_id: uuid.UUID,
    recurring_id: uuid.UUID,
    body: RecurringTransactionUpdate,
    current_user: CurrentUser,
    session: DbDep,
) -> RecurringTransactionResponse:
    await _get_wallet_or_404(wallet_id, current_user.id, session)
    recurring = await _get_recurring_or_404(recurring_id, wallet_id, session)

    if body.category_id is not None:
        await _validate_category(body.category_id, current_user.id, session)
        recurring.category_id = body.category_id
    if body.type is not None:
        recurring.type = body.type
    if body.amount is not None:
        recurring.amount = body.amount
    if body.description is not None:
        recurring.description = body.description
    if body.frequency is not None:
        recurring.frequency = body.frequency
    if body.next_due is not None:
        recurring.next_due = body.next_due
    if body.is_active is not None:
        recurring.is_active = body.is_active

    session.add(recurring)
    await session.commit()
    await session.refresh(recurring)
    return _to_response(recurring)


@router.delete("/{recurring_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_recurring(
    wallet_id: uuid.UUID, recurring_id: uuid.UUID, current_user: CurrentUser, session: DbDep
) -> None:
    await _get_wallet_or_404(wallet_id, current_user.id, session)
    recurring = await _get_recurring_or_404(recurring_id, wallet_id, session)
    await session.delete(recurring)
    await session.commit()
