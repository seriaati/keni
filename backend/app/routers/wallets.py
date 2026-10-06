from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.transaction import Transaction
from app.models.user import User
from app.models.wallet import Wallet
from app.schemas.wallet import WalletCreate, WalletResponse, WalletSummary, WalletUpdate
from app.services.transfer import TRANSFER_IN, TRANSFER_OUT, count_wallet_transfers

router = APIRouter(prefix="/api/wallets", tags=["wallets"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


def _wallet_to_response(wallet: Wallet) -> WalletResponse:
    return WalletResponse(
        id=wallet.id,
        user_id=wallet.user_id,
        name=wallet.name,
        currency=wallet.currency,
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
    wallet = Wallet(user_id=current_user.id, name=body.name, currency=body.currency)
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

    expense_total_result = await session.exec(
        select(func.coalesce(func.sum(Transaction.amount), 0.0)).where(
            Transaction.wallet_id == wallet_id, Transaction.type == "expense"
        )
    )
    total_expenses = expense_total_result.one()

    expense_count_result = await session.exec(
        select(func.count()).select_from(
            select(Transaction)
            .where(Transaction.wallet_id == wallet_id, Transaction.type == "expense")
            .subquery()
        )
    )
    expense_count = expense_count_result.one()

    income_total_result = await session.exec(
        select(func.coalesce(func.sum(Transaction.amount), 0.0)).where(
            Transaction.wallet_id == wallet_id, Transaction.type == "income"
        )
    )
    total_income = income_total_result.one()

    income_count_result = await session.exec(
        select(func.count()).select_from(
            select(Transaction)
            .where(Transaction.wallet_id == wallet_id, Transaction.type == "income")
            .subquery()
        )
    )
    income_count = income_count_result.one()

    transfer_totals_result = await session.exec(
        select(Transaction.type, func.coalesce(func.sum(Transaction.amount), 0.0))
        .where(
            Transaction.wallet_id == wallet_id,
            col(Transaction.type).in_([TRANSFER_IN, TRANSFER_OUT]),
        )
        .group_by(Transaction.type)
    )
    transfer_totals = {t: float(total) for t, total in transfer_totals_result.all()}
    total_transfers_in = transfer_totals.get(TRANSFER_IN, 0.0)
    total_transfers_out = transfer_totals.get(TRANSFER_OUT, 0.0)

    return WalletSummary(
        id=wallet.id,
        user_id=wallet.user_id,
        name=wallet.name,
        currency=wallet.currency,
        created_at=wallet.created_at,
        total_expenses=float(total_expenses),
        expense_count=int(expense_count),
        total_income=float(total_income),
        income_count=int(income_count),
        total_transfers_in=total_transfers_in,
        total_transfers_out=total_transfers_out,
        balance=float(total_income)
        - float(total_expenses)
        + total_transfers_in
        - total_transfers_out,
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

    session.add(wallet)
    await session.commit()
    await session.refresh(wallet)
    return _wallet_to_response(wallet)


@router.delete("/{wallet_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_wallet(wallet_id: uuid.UUID, current_user: CurrentUser, session: DbDep) -> None:
    wallet = await _get_wallet_or_404(wallet_id, current_user.id, session)
    transfer_count = await count_wallet_transfers(session, wallet_id)
    if transfer_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Wallet has {transfer_count} transfer(s); delete them first",
        )
    await session.delete(wallet)
    await session.commit()
