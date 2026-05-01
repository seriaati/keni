from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.category import Category
from app.models.tag import Tag
from app.models.transaction import Transaction, TransactionLink, TransactionTag
from app.models.user import User
from app.models.wallet import Wallet
from app.schemas.transaction import (
    CategoryBrief,
    TagBrief,
    TransactionLinkBrief,
    TransactionListResponse,
    TransactionResponse,
)

router = APIRouter(prefix="/api/transactions", tags=["transaction-links"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]
QParam = Annotated[str | None, Query()]
WalletIdParam = Annotated[uuid.UUID | None, Query()]
ExcludeIdParam = Annotated[uuid.UUID | None, Query()]
PageParam = Annotated[int, Query(ge=1)]
PageSizeParam = Annotated[int, Query(ge=1, le=100)]


class AddLinkRequest(BaseModel):
    target_transaction_id: uuid.UUID


async def _assert_owned(
    transaction_id: uuid.UUID, user_id: uuid.UUID, session: AsyncSession
) -> Transaction:
    result = await session.exec(
        select(Transaction)
        .join(Wallet, col(Transaction.wallet_id) == col(Wallet.id))
        .where(Transaction.id == transaction_id, Wallet.user_id == user_id)
    )
    t = result.first()
    if not t:
        msg = "Transaction not found"
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg)
    return t


async def _build_brief(transaction: Transaction, session: AsyncSession) -> TransactionLinkBrief:
    cat_result = await session.exec(select(Category).where(Category.id == transaction.category_id))
    cat = cat_result.first()
    category_brief = (
        CategoryBrief(id=cat.id, name=cat.name, icon=cat.icon, color=cat.color)
        if cat
        else CategoryBrief(id=transaction.category_id, name="Unknown", icon=None, color=None)
    )
    tag_result = await session.exec(
        select(Tag)
        .join(TransactionTag, col(Tag.id) == col(TransactionTag.tag_id))
        .where(col(TransactionTag.transaction_id) == transaction.id)
    )
    tags = [TagBrief(id=t.id, name=t.name, color=t.color) for t in tag_result.all()]
    return TransactionLinkBrief(
        id=transaction.id,
        wallet_id=transaction.wallet_id,
        category=category_brief,
        type=transaction.type,
        amount=transaction.amount,
        description=transaction.description,
        date=transaction.date,
        tags=tags,
    )


async def _build_response(transaction: Transaction, session: AsyncSession) -> TransactionResponse:
    brief = await _build_brief(transaction, session)
    return TransactionResponse(
        id=brief.id,
        wallet_id=brief.wallet_id,
        category=brief.category,
        type=brief.type,
        amount=brief.amount,
        description=brief.description,
        date=brief.date,
        ai_context=transaction.ai_context,
        tags=brief.tags,
        created_at=transaction.created_at,
        updated_at=transaction.updated_at,
        group_id=transaction.group_id,
    )


def _canonical(a: uuid.UUID, b: uuid.UUID) -> tuple[uuid.UUID, uuid.UUID]:
    if str(a) < str(b):
        return a, b
    return b, a


@router.get("/search")
async def search_transactions(  # noqa: PLR0913, PLR0917
    session: DbDep,
    current_user: CurrentUser,
    q: QParam = None,
    wallet_id: WalletIdParam = None,
    exclude_id: ExcludeIdParam = None,
    page: PageParam = 1,
    page_size: PageSizeParam = 20,
) -> TransactionListResponse:
    wallet_result = await session.exec(select(Wallet).where(Wallet.user_id == current_user.id))
    user_wallets = wallet_result.all()
    wallet_ids = [w.id for w in user_wallets]

    if wallet_id is not None:
        if wallet_id not in wallet_ids:
            msg = "Wallet not found"
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg)
        wallet_ids = [wallet_id]

    query = select(Transaction).where(col(Transaction.wallet_id).in_(wallet_ids))

    if exclude_id is not None:
        query = query.where(Transaction.id != exclude_id)

    if q:
        query = query.where(col(Transaction.description).ilike(f"%{q}%"))

    count_result = await session.exec(select(func.count()).select_from(query.subquery()))
    total = count_result.one()

    query = query.order_by(col(Transaction.date).desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await session.exec(query)
    transactions = result.all()

    items = [await _build_response(t, session) for t in transactions]
    return TransactionListResponse(items=items, total=total, page=page, page_size=page_size)


@router.post("/{transaction_id}/links", status_code=status.HTTP_201_CREATED)
async def add_link(
    transaction_id: uuid.UUID, body: AddLinkRequest, session: DbDep, current_user: CurrentUser
) -> dict:
    if transaction_id == body.target_transaction_id:
        msg = "Cannot link a transaction to itself"
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)

    await _assert_owned(transaction_id, current_user.id, session)
    await _assert_owned(body.target_transaction_id, current_user.id, session)

    id_a, id_b = _canonical(transaction_id, body.target_transaction_id)

    existing = await session.exec(
        select(TransactionLink).where(
            TransactionLink.transaction_id_a == id_a, TransactionLink.transaction_id_b == id_b
        )
    )
    if existing.first():
        msg = "Link already exists"
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=msg)

    link = TransactionLink(transaction_id_a=id_a, transaction_id_b=id_b)
    session.add(link)
    await session.commit()
    return {"transaction_id_a": id_a, "transaction_id_b": id_b}


@router.delete(
    "/{transaction_id}/links/{target_transaction_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def remove_link(
    transaction_id: uuid.UUID,
    target_transaction_id: uuid.UUID,
    session: DbDep,
    current_user: CurrentUser,
) -> None:
    await _assert_owned(transaction_id, current_user.id, session)
    await _assert_owned(target_transaction_id, current_user.id, session)

    id_a, id_b = _canonical(transaction_id, target_transaction_id)

    result = await session.exec(
        select(TransactionLink).where(
            TransactionLink.transaction_id_a == id_a, TransactionLink.transaction_id_b == id_b
        )
    )
    link = result.first()
    if not link:
        msg = "Link not found"
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg)

    await session.delete(link)
    await session.commit()
