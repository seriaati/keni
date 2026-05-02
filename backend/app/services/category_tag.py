from __future__ import annotations

from typing import TYPE_CHECKING

from sqlmodel import select

from app.models.category import Category
from app.models.tag import Tag

if TYPE_CHECKING:
    import uuid

    from sqlmodel.ext.asyncio.session import AsyncSession


async def find_or_create_category(
    user_id: uuid.UUID,
    name: str,
    session: AsyncSession,
    icon: str | None = None,
) -> Category:
    result = await session.exec(select(Category).where(Category.user_id == user_id))
    for cat in result.all():
        if cat.name.lower() == name.lower():
            return cat

    category = Category(user_id=user_id, name=name, icon=icon)
    session.add(category)
    await session.flush()
    await session.refresh(category)
    return category


async def find_or_create_tag(user_id: uuid.UUID, name: str, session: AsyncSession) -> Tag:
    result = await session.exec(select(Tag).where(Tag.user_id == user_id))
    for tag in result.all():
        if tag.name.lower() == name.lower():
            return tag

    tag = Tag(user_id=user_id, name=name[:100])
    session.add(tag)
    await session.flush()
    await session.refresh(tag)
    return tag
