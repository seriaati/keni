from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

from sqlmodel import col, delete, select

from app.config import settings
from app.models.transaction import Transaction
from app.models.user import User
from app.models.wallet import Wallet

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

logger = logging.getLogger(__name__)


async def purge_expired_transactions(session: AsyncSession) -> int:
    if not settings.data_retention_enabled:
        return 0

    cutoff = datetime.now(UTC) - timedelta(days=settings.data_retention_days)

    exempt_usernames = settings.data_retention_exempt_usernames

    if exempt_usernames:
        exempt_user_ids = await session.exec(
            select(User.id).where(col(User.username).in_(exempt_usernames))
        )
        exempt_ids = set(exempt_user_ids.all())
    else:
        exempt_ids = set()

    if exempt_ids:
        non_exempt_wallet_ids = await session.exec(
            select(Wallet.id).where(~col(Wallet.user_id).in_(exempt_ids))
        )
    else:
        non_exempt_wallet_ids = await session.exec(select(Wallet.id))

    wallet_ids = non_exempt_wallet_ids.all()

    stmt = delete(Transaction).where(
        col(Transaction.created_at) < cutoff,
        col(Transaction.wallet_id).in_(wallet_ids),
        col(Transaction.group_id).is_(None),
    )

    result = await session.exec(stmt)
    deleted_count = result.rowcount

    await session.commit()

    logger.info("Purged %s expired transactions (cutoff: %s)", deleted_count, cutoff)

    return deleted_count
