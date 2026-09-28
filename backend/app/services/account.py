from __future__ import annotations

from typing import TYPE_CHECKING

from sqlmodel import col, delete

from app.models.ai_provider import AIProvider
from app.models.api_token import APIToken
from app.models.budget import Budget
from app.models.category import Category
from app.models.oauth_authorization_code import OAuthAuthorizationCode
from app.models.oauth_token import OAuthToken
from app.models.tag import Tag
from app.models.user import User
from app.models.wallet import Wallet

if TYPE_CHECKING:
    import uuid

    from sqlmodel.ext.asyncio.session import AsyncSession


async def delete_user_account(user_id: uuid.UUID, session: AsyncSession) -> None:
    """Delete a user and everything they own.

    Order matters: budgets reference categories, transactions and recurring rules
    reference categories and cascade from wallets, so wallets go before categories.
    """
    for model in (Budget, Wallet, Category, Tag, APIToken, AIProvider, OAuthToken):
        await session.exec(delete(model).where(col(model.user_id) == user_id))
    await session.exec(
        delete(OAuthAuthorizationCode).where(col(OAuthAuthorizationCode.user_id) == user_id)
    )
    await session.exec(delete(User).where(col(User.id) == user_id))
    await session.commit()
