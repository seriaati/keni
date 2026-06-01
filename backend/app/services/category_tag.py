from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy.exc import IntegrityError
from sqlmodel import select

from app.models.category import Category
from app.models.tag import Tag

if TYPE_CHECKING:
    import uuid

    from sqlmodel.ext.asyncio.session import AsyncSession


async def find_or_create_category(
    user_id: uuid.UUID, name: str, session: AsyncSession, icon: str | None = None
) -> Category:
    async def _find() -> Category | None:
        result = await session.exec(select(Category).where(Category.user_id == user_id))
        for cat in result.all():
            if cat.name.lower() == name.lower():
                return cat
        return None

    existing = await _find()
    if existing is not None:
        return existing

    category = Category(user_id=user_id, name=name, icon=icon)
    try:
        async with session.begin_nested():
            session.add(category)
            await session.flush()
    except IntegrityError:
        # A concurrent transaction created the same category first; reuse it.
        existing = await _find()
        if existing is None:
            raise
        return existing
    await session.refresh(category)
    return category


async def find_or_create_tag(user_id: uuid.UUID, name: str, session: AsyncSession) -> Tag:
    stored_name = name[:100]

    async def _find() -> Tag | None:
        result = await session.exec(select(Tag).where(Tag.user_id == user_id))
        for tag in result.all():
            if tag.name.lower() == stored_name.lower():
                return tag
        return None

    existing = await _find()
    if existing is not None:
        return existing

    tag = Tag(user_id=user_id, name=stored_name)
    try:
        async with session.begin_nested():
            session.add(tag)
            await session.flush()
    except IntegrityError:
        # A concurrent transaction created the same tag first; reuse it.
        existing = await _find()
        if existing is None:
            raise
        return existing
    await session.refresh(tag)
    return tag
