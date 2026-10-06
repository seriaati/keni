from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import func, or_
from sqlmodel import col, select

from app.models.category import Category
from app.models.transaction import Transaction
from app.models.transfer import Transfer
from app.models.wallet import Wallet
from app.schemas.transaction import CategoryBrief, TransferBrief
from app.schemas.transfer import TransferFee, TransferResponse, TransferSide

if TYPE_CHECKING:
    import uuid

    from sqlmodel.ext.asyncio.session import AsyncSession

    from app.schemas.transfer import TransferCreate, TransferUpdate

TRANSFER_OUT = "transfer_out"
TRANSFER_IN = "transfer_in"
FEE = "expense"


class TransferError(Exception):
    """Invalid transfer input."""


class TransferNotFoundError(TransferError):
    """A referenced wallet, category or transfer does not exist for this user."""


async def _get_owned_wallet(
    session: AsyncSession, wallet_id: uuid.UUID, user_id: uuid.UUID
) -> Wallet:
    result = await session.exec(
        select(Wallet).where(Wallet.id == wallet_id, Wallet.user_id == user_id)
    )
    wallet = result.first()
    if wallet is None:
        msg = "Wallet not found"
        raise TransferNotFoundError(msg)
    return wallet


async def _validate_fee_category(
    session: AsyncSession, category_id: uuid.UUID, user_id: uuid.UUID
) -> None:
    result = await session.exec(
        select(Category).where(Category.id == category_id, Category.user_id == user_id)
    )
    if result.first() is None:
        msg = "Fee category not found"
        raise TransferNotFoundError(msg)


async def get_owned_transfer(
    session: AsyncSession, transfer_id: uuid.UUID, user_id: uuid.UUID
) -> Transfer:
    result = await session.exec(
        select(Transfer).where(Transfer.id == transfer_id, Transfer.user_id == user_id)
    )
    transfer = result.first()
    if transfer is None:
        msg = "Transfer not found"
        raise TransferNotFoundError(msg)
    return transfer


async def _get_legs(session: AsyncSession, transfer_id: uuid.UUID) -> dict[str, Transaction]:
    result = await session.exec(
        select(Transaction).where(col(Transaction.transfer_id) == transfer_id)
    )
    return {t.type: t for t in result.all()}


async def _validate(
    session: AsyncSession, transfer: Transfer, fee_category_id: uuid.UUID | None
) -> None:
    if transfer.from_wallet_id == transfer.to_wallet_id:
        msg = "Cannot transfer to the same wallet"
        raise TransferError(msg)
    source = await _get_owned_wallet(session, transfer.from_wallet_id, transfer.user_id)
    destination = await _get_owned_wallet(session, transfer.to_wallet_id, transfer.user_id)
    if source.currency == destination.currency and transfer.from_amount != transfer.to_amount:
        msg = "Wallets share a currency, so the amount sent must equal the amount received"
        raise TransferError(msg)
    if transfer.fee_amount:
        if fee_category_id is None:
            msg = "A fee needs a category"
            raise TransferError(msg)
        await _validate_fee_category(session, fee_category_id, transfer.user_id)


async def _sync_legs(
    session: AsyncSession, transfer: Transfer, fee_category_id: uuid.UUID | None
) -> None:
    """Make the transfer's transaction rows mirror the transfer record."""
    legs = await _get_legs(session, transfer.id)
    now = datetime.now(UTC)
    wanted: list[tuple[str, uuid.UUID, float, uuid.UUID | None]] = [
        (TRANSFER_OUT, transfer.from_wallet_id, transfer.from_amount, None),
        (TRANSFER_IN, transfer.to_wallet_id, transfer.to_amount, None),
    ]
    if transfer.fee_amount:
        wanted.append((FEE, transfer.from_wallet_id, transfer.fee_amount, fee_category_id))
    elif FEE in legs:
        await session.delete(legs.pop(FEE))

    for leg_type, wallet_id, amount, category_id in wanted:
        leg = legs.get(leg_type) or Transaction(
            transfer_id=transfer.id, type=leg_type, wallet_id=wallet_id, amount=amount
        )
        leg.wallet_id = wallet_id
        leg.amount = amount
        leg.category_id = category_id
        leg.description = transfer.description
        leg.date = transfer.date
        leg.updated_at = now
        session.add(leg)


async def create_transfer(
    session: AsyncSession, user_id: uuid.UUID, data: TransferCreate
) -> Transfer:
    transfer = Transfer(
        user_id=user_id,
        from_wallet_id=data.from_wallet_id,
        to_wallet_id=data.to_wallet_id,
        from_amount=data.from_amount,
        to_amount=data.to_amount,
        fee_amount=data.fee_amount or None,
        description=data.description,
        date=data.date or datetime.now(UTC),
    )
    await _validate(session, transfer, data.fee_category_id)
    session.add(transfer)
    await session.flush()
    await _sync_legs(session, transfer, data.fee_category_id)
    await session.commit()
    await session.refresh(transfer)
    return transfer


async def update_transfer(
    session: AsyncSession, transfer: Transfer, data: TransferUpdate
) -> Transfer:
    if data.from_wallet_id is not None:
        transfer.from_wallet_id = data.from_wallet_id
    if data.to_wallet_id is not None:
        transfer.to_wallet_id = data.to_wallet_id
    if data.from_amount is not None:
        transfer.from_amount = data.from_amount
    if data.to_amount is not None:
        transfer.to_amount = data.to_amount
    if data.fee_amount is not None:
        transfer.fee_amount = data.fee_amount or None
    if data.description is not None:
        transfer.description = data.description
    if data.date is not None:
        transfer.date = data.date

    fee_category_id = data.fee_category_id
    if fee_category_id is None:
        fee_leg = (await _get_legs(session, transfer.id)).get(FEE)
        fee_category_id = fee_leg.category_id if fee_leg else None

    await _validate(session, transfer, fee_category_id)
    transfer.updated_at = datetime.now(UTC)
    session.add(transfer)
    await _sync_legs(session, transfer, fee_category_id)
    await session.commit()
    await session.refresh(transfer)
    return transfer


async def delete_transfer(session: AsyncSession, transfer: Transfer) -> None:
    """Its transaction rows go with it through the ON DELETE CASCADE foreign key."""
    await session.delete(transfer)
    await session.commit()


async def build_transfer_response(session: AsyncSession, transfer: Transfer) -> TransferResponse:
    wallets_result = await session.exec(
        select(Wallet).where(col(Wallet.id).in_([transfer.from_wallet_id, transfer.to_wallet_id]))
    )
    wallets = {w.id: w for w in wallets_result.all()}
    source = wallets[transfer.from_wallet_id]
    destination = wallets[transfer.to_wallet_id]
    legs = await _get_legs(session, transfer.id)

    fee: TransferFee | None = None
    if transfer.fee_amount:
        fee_leg = legs.get(FEE)
        category = None
        if fee_leg is not None and fee_leg.category_id is not None:
            cat_result = await session.exec(
                select(Category).where(Category.id == fee_leg.category_id)
            )
            cat = cat_result.first()
            if cat is not None:
                category = CategoryBrief(id=cat.id, name=cat.name, icon=cat.icon, color=cat.color)
        fee = TransferFee(
            amount=transfer.fee_amount,
            currency=source.currency,
            category=category,
            transaction_id=fee_leg.id if fee_leg else None,
        )

    out_leg = legs.get(TRANSFER_OUT)
    in_leg = legs.get(TRANSFER_IN)
    return TransferResponse(
        id=transfer.id,
        date=transfer.date,
        description=transfer.description,
        source=TransferSide(
            wallet_id=source.id,
            wallet_name=source.name,
            currency=source.currency,
            amount=transfer.from_amount,
            transaction_id=out_leg.id if out_leg else None,
        ),
        destination=TransferSide(
            wallet_id=destination.id,
            wallet_name=destination.name,
            currency=destination.currency,
            amount=transfer.to_amount,
            transaction_id=in_leg.id if in_leg else None,
        ),
        effective_rate=transfer.to_amount / transfer.from_amount,
        fee=fee,
        created_at=transfer.created_at,
        updated_at=transfer.updated_at,
    )


async def build_transfer_brief(
    session: AsyncSession, transaction: Transaction
) -> TransferBrief | None:
    """The other side of a transfer leg: the source for the incoming leg, else the destination."""
    if transaction.transfer_id is None:
        return None
    result = await session.exec(select(Transfer).where(Transfer.id == transaction.transfer_id))
    transfer = result.first()
    if transfer is None:
        return None
    incoming = transaction.type == TRANSFER_IN
    wallet_id = transfer.from_wallet_id if incoming else transfer.to_wallet_id
    wallet_result = await session.exec(select(Wallet).where(Wallet.id == wallet_id))
    wallet = wallet_result.one()
    return TransferBrief(
        id=transfer.id,
        counterpart_wallet_id=wallet.id,
        counterpart_wallet_name=wallet.name,
        counterpart_currency=wallet.currency,
        counterpart_amount=transfer.from_amount if incoming else transfer.to_amount,
    )


async def list_transfers(  # ruff: ignore[too-many-arguments]
    session: AsyncSession,
    user_id: uuid.UUID,
    *,
    wallet_id: uuid.UUID | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Transfer], int]:
    query = select(Transfer).where(Transfer.user_id == user_id)
    if wallet_id is not None:
        query = query.where(
            or_(col(Transfer.from_wallet_id) == wallet_id, col(Transfer.to_wallet_id) == wallet_id)
        )
    if start is not None:
        query = query.where(col(Transfer.date) >= start)
    if end is not None:
        query = query.where(col(Transfer.date) <= end)

    total = (await session.exec(select(func.count()).select_from(query.subquery()))).one()
    query = (
        query.order_by(col(Transfer.date).desc()).offset((page - 1) * page_size).limit(page_size)
    )
    result = await session.exec(query)
    return list(result.all()), int(total)


async def count_wallet_transfers(session: AsyncSession, wallet_id: uuid.UUID) -> int:
    result = await session.exec(
        select(func.count())
        .select_from(Transfer)
        .where(
            or_(col(Transfer.from_wallet_id) == wallet_id, col(Transfer.to_wallet_id) == wallet_id)
        )
    )
    return int(result.one())
