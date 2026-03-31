from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.expense import Expense
from app.models.user import User
from app.models.wallet import Wallet
from app.schemas.wallet import WalletCreate, WalletResponse, WalletSummary, WalletUpdate

router = APIRouter(prefix="/api/wallets", tags=["wallets"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


def _wallet_to_response(wallet: Wallet) -> WalletResponse:
    return WalletResponse(
        id=wallet.id,
        user_id=wallet.user_id,
        name=wallet.name,
        currency=wallet.currency,
        is_default=wallet.is_default,
        created_at=wallet.created_at,
    )


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


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_wallet(
    body: WalletCreate, current_user: CurrentUser, session: DbDep
) -> WalletResponse:
    if body.is_default:
        result = await session.exec(
            select(Wallet).where(Wallet.user_id == current_user.id, Wallet.is_default)
        )
        for w in result.all():
            w.is_default = False
            session.add(w)

    wallet = Wallet(
        user_id=current_user.id, name=body.name, currency=body.currency, is_default=body.is_default
    )
    session.add(wallet)
    await session.commit()
    await session.refresh(wallet)
    return _wallet_to_response(wallet)


@router.get("")
async def list_wallets(current_user: CurrentUser, session: DbDep) -> list[WalletResponse]:
    result = await session.exec(select(Wallet).where(Wallet.user_id == current_user.id))
    return [_wallet_to_response(w) for w in result.all()]


@router.get("/{wallet_id}")
async def get_wallet(
    wallet_id: uuid.UUID, current_user: CurrentUser, session: DbDep
) -> WalletSummary:
    wallet = await _get_wallet_or_404(wallet_id, current_user.id, session)

    total_result = await session.exec(
        select(func.coalesce(func.sum(Expense.amount), 0.0)).where(Expense.wallet_id == wallet_id)
    )
    total = total_result.one()

    count_result = await session.exec(
        select(func.count()).select_from(
            select(Expense).where(Expense.wallet_id == wallet_id).subquery()
        )
    )
    count = count_result.one()

    return WalletSummary(
        id=wallet.id,
        user_id=wallet.user_id,
        name=wallet.name,
        currency=wallet.currency,
        is_default=wallet.is_default,
        created_at=wallet.created_at,
        total_expenses=float(total),
        expense_count=int(count),
    )


@router.patch("/{wallet_id}")
async def update_wallet(
    wallet_id: uuid.UUID, body: WalletUpdate, current_user: CurrentUser, session: DbDep
) -> WalletResponse:
    wallet = await _get_wallet_or_404(wallet_id, current_user.id, session)

    if body.name is not None:
        wallet.name = body.name
    if body.currency is not None:
        wallet.currency = body.currency
    if body.is_default is not None:
        if body.is_default:
            result = await session.exec(
                select(Wallet).where(Wallet.user_id == current_user.id, Wallet.is_default)
            )
            for w in result.all():
                w.is_default = False
                session.add(w)
        wallet.is_default = body.is_default

    session.add(wallet)
    await session.commit()
    await session.refresh(wallet)
    return _wallet_to_response(wallet)


@router.delete("/{wallet_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_wallet(wallet_id: uuid.UUID, current_user: CurrentUser, session: DbDep) -> None:
    wallet = await _get_wallet_or_404(wallet_id, current_user.id, session)
    await session.delete(wallet)
    await session.commit()
