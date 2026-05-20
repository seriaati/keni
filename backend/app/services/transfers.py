from __future__ import annotations

from typing import TYPE_CHECKING, Any

from sqlalchemy import or_
from sqlmodel import col, select

from app.models.transaction import Transaction, TransactionLink, TransactionTag, Transfer

if TYPE_CHECKING:
    import uuid
    from datetime import datetime

    from sqlmodel.ext.asyncio.session import AsyncSession


def exclude_transfer_transactions(query: Any) -> Any:
    return query.where(
        ~col(Transaction.id).in_(select(Transfer.source_transaction_id)),
        ~col(Transaction.id).in_(select(Transfer.destination_transaction_id)),
    )


async def get_transfer_for_transaction(
    session: AsyncSession, transaction_id: uuid.UUID
) -> Transfer | None:
    result = await session.exec(
        select(Transfer).where(
            or_(
                col(Transfer.source_transaction_id) == transaction_id,
                col(Transfer.destination_transaction_id) == transaction_id,
            )
        )
    )
    return result.first()


async def get_transfer_for_pair(
    session: AsyncSession, first_transaction_id: uuid.UUID, second_transaction_id: uuid.UUID
) -> Transfer | None:
    result = await session.exec(
        select(Transfer).where(
            or_(
                (col(Transfer.source_transaction_id) == first_transaction_id)
                & (col(Transfer.destination_transaction_id) == second_transaction_id),
                (col(Transfer.source_transaction_id) == second_transaction_id)
                & (col(Transfer.destination_transaction_id) == first_transaction_id),
            )
        )
    )
    return result.first()


async def get_transfer_transaction_ids(
    session: AsyncSession, transaction_ids: list[uuid.UUID]
) -> set[uuid.UUID]:
    if not transaction_ids:
        return set()
    result = await session.exec(
        select(Transfer).where(
            or_(
                col(Transfer.source_transaction_id).in_(transaction_ids),
                col(Transfer.destination_transaction_id).in_(transaction_ids),
            )
        )
    )
    ids: set[uuid.UUID] = set()
    for transfer in result.all():
        ids.add(transfer.source_transaction_id)
        ids.add(transfer.destination_transaction_id)
    return ids


async def is_transfer_transaction(session: AsyncSession, transaction_id: uuid.UUID) -> bool:
    return await get_transfer_for_transaction(session, transaction_id) is not None


async def has_transfer_transaction(session: AsyncSession, transaction_ids: list[uuid.UUID]) -> bool:
    return bool(await get_transfer_transaction_ids(session, transaction_ids))


async def get_counterpart_transaction(
    session: AsyncSession, transaction_id: uuid.UUID
) -> Transaction | None:
    transfer = await get_transfer_for_transaction(session, transaction_id)
    if transfer is None:
        return None
    counterpart_id = (
        transfer.destination_transaction_id
        if transfer.source_transaction_id == transaction_id
        else transfer.source_transaction_id
    )
    result = await session.exec(select(Transaction).where(Transaction.id == counterpart_id))
    return result.first()


async def get_transfer_transactions(
    session: AsyncSession, transfer: Transfer
) -> tuple[Transaction | None, Transaction | None]:
    result = await session.exec(
        select(Transaction).where(
            col(Transaction.id).in_(
                [transfer.source_transaction_id, transfer.destination_transaction_id]
            )
        )
    )
    transactions = {transaction.id: transaction for transaction in result.all()}
    return (
        transactions.get(transfer.source_transaction_id),
        transactions.get(transfer.destination_transaction_id),
    )


async def create_transfer_pair(  # noqa: PLR0913, PLR0917
    session: AsyncSession,
    source_wallet_id: uuid.UUID,
    destination_wallet_id: uuid.UUID,
    category_id: uuid.UUID,
    source_amount: float,
    destination_amount: float | None,
    description: str | None,
    date: datetime,
    source_description: str,
    ai_context: str | None,
    destination_description: str,
    tag_ids: list[uuid.UUID],
) -> tuple[Transaction, Transaction, Transfer]:
    effective_destination_amount = (
        destination_amount if destination_amount is not None else source_amount
    )
    source_transaction = Transaction(
        wallet_id=source_wallet_id,
        category_id=category_id,
        type="expense",
        amount=source_amount,
        description=source_description,
        date=date,
        ai_context=ai_context,
    )
    destination_transaction = Transaction(
        wallet_id=destination_wallet_id,
        category_id=category_id,
        type="income",
        amount=effective_destination_amount,
        description=destination_description,
        date=date,
        ai_context=ai_context,
    )
    session.add(source_transaction)
    session.add(destination_transaction)
    await session.flush()

    for tag_id in tag_ids:
        session.add(TransactionTag(transaction_id=source_transaction.id, tag_id=tag_id))
        session.add(TransactionTag(transaction_id=destination_transaction.id, tag_id=tag_id))

    transfer = Transfer(
        source_wallet_id=source_wallet_id,
        destination_wallet_id=destination_wallet_id,
        source_amount=source_amount,
        destination_amount=destination_amount,
        date=date,
        description=description,
        source_transaction_id=source_transaction.id,
        destination_transaction_id=destination_transaction.id,
    )
    session.add(transfer)
    await session.flush()
    return source_transaction, destination_transaction, transfer


async def replace_transaction_tags(
    session: AsyncSession, transaction: Transaction, tag_ids: list[uuid.UUID]
) -> None:
    existing = await session.exec(
        select(TransactionTag).where(col(TransactionTag.transaction_id) == transaction.id)
    )
    for transaction_tag in existing.all():
        await session.delete(transaction_tag)
    for tag_id in tag_ids:
        session.add(TransactionTag(transaction_id=transaction.id, tag_id=tag_id))


async def update_transfer_pair(  # noqa: PLR0912, PLR0913, PLR0917
    session: AsyncSession,
    transaction: Transaction,
    amount: float | None = None,
    category_id: uuid.UUID | None = None,
    description: str | None = None,
    date: datetime | None = None,
    tag_ids: list[uuid.UUID] | None = None,
    updated_at: datetime | None = None,
) -> bool:
    transfer = await get_transfer_for_transaction(session, transaction.id)
    if transfer is None:
        return False

    source_transaction, destination_transaction = await get_transfer_transactions(session, transfer)
    if source_transaction is None or destination_transaction is None:
        return False

    if amount is not None:
        if transaction.id == transfer.source_transaction_id:
            source_transaction.amount = amount
            transfer.source_amount = amount
            if transfer.destination_amount is None:
                destination_transaction.amount = amount
        else:
            destination_transaction.amount = amount
            if transfer.destination_amount is None:
                source_transaction.amount = amount
                transfer.source_amount = amount
            else:
                transfer.destination_amount = amount

    if category_id is not None:
        source_transaction.category_id = category_id
        destination_transaction.category_id = category_id

    if description is not None:
        source_transaction.description = description
        destination_transaction.description = description
        transfer.description = description

    if date is not None:
        source_transaction.date = date
        destination_transaction.date = date
        transfer.date = date

    if updated_at is not None:
        source_transaction.updated_at = updated_at
        destination_transaction.updated_at = updated_at
        transfer.updated_at = updated_at

    if tag_ids is not None:
        await replace_transaction_tags(session, source_transaction, tag_ids)
        await replace_transaction_tags(session, destination_transaction, tag_ids)

    session.add(source_transaction)
    session.add(destination_transaction)
    session.add(transfer)
    return True


async def delete_transaction_tree(
    session: AsyncSession, transaction: Transaction
) -> list[Transaction]:
    deleted = [transaction]
    existing_tags = await session.exec(
        select(TransactionTag).where(col(TransactionTag.transaction_id) == transaction.id)
    )
    for transaction_tag in existing_tags.all():
        await session.delete(transaction_tag)

    links = await session.exec(
        select(TransactionLink).where(
            or_(
                col(TransactionLink.transaction_id_a) == transaction.id,
                col(TransactionLink.transaction_id_b) == transaction.id,
            )
        )
    )
    for link in links.all():
        await session.delete(link)

    children = await session.exec(
        select(Transaction).where(col(Transaction.group_id) == transaction.id)
    )
    for child in children.all():
        deleted.extend(await delete_transaction_tree(session, child))

    await session.delete(transaction)
    return deleted


async def delete_transfer_pair(
    session: AsyncSession, transaction: Transaction
) -> list[Transaction]:
    transfer = await get_transfer_for_transaction(session, transaction.id)
    if transfer is None:
        return await delete_transaction_tree(session, transaction)

    transaction_ids = [transfer.source_transaction_id, transfer.destination_transaction_id]
    result = await session.exec(select(Transaction).where(col(Transaction.id).in_(transaction_ids)))
    transactions = list(result.all())
    await session.delete(transfer)
    deleted: list[Transaction] = []
    for transfer_transaction in transactions:
        deleted.extend(await delete_transaction_tree(session, transfer_transaction))
    return deleted


async def delete_transfers_for_wallet(
    session: AsyncSession, wallet_id: uuid.UUID
) -> list[Transaction]:
    result = await session.exec(
        select(Transfer).where(
            or_(
                col(Transfer.source_wallet_id) == wallet_id,
                col(Transfer.destination_wallet_id) == wallet_id,
            )
        )
    )
    transfers = list(result.all())
    deleted: list[Transaction] = []
    for transfer in transfers:
        transaction_result = await session.exec(
            select(Transaction).where(Transaction.id == transfer.source_transaction_id)
        )
        source_transaction = transaction_result.first()
        if source_transaction is not None:
            deleted.extend(await delete_transfer_pair(session, source_transaction))
    return deleted
