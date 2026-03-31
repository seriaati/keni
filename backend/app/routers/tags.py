from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.tag import Tag
from app.models.user import User
from app.schemas.tag import TagCreate, TagResponse, TagUpdate

router = APIRouter(prefix="/api/tags", tags=["tags"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


def _tag_to_response(tag: Tag) -> TagResponse:
    return TagResponse(
        id=tag.id, user_id=tag.user_id, name=tag.name, color=tag.color, created_at=tag.created_at
    )


async def _get_tag_or_404(tag_id: uuid.UUID, user_id: uuid.UUID, session: AsyncSession) -> Tag:
    result = await session.exec(select(Tag).where(Tag.id == tag_id, Tag.user_id == user_id))
    tag = result.first()
    if not tag:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag not found")
    return tag


@router.get("")
async def list_tags(current_user: CurrentUser, session: DbDep) -> list[TagResponse]:
    result = await session.exec(select(Tag).where(Tag.user_id == current_user.id))
    return [_tag_to_response(t) for t in result.all()]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_tag(body: TagCreate, current_user: CurrentUser, session: DbDep) -> TagResponse:
    tag = Tag(user_id=current_user.id, name=body.name, color=body.color)
    session.add(tag)
    await session.commit()
    await session.refresh(tag)
    return _tag_to_response(tag)


@router.patch("/{tag_id}")
async def update_tag(
    tag_id: uuid.UUID, body: TagUpdate, current_user: CurrentUser, session: DbDep
) -> TagResponse:
    tag = await _get_tag_or_404(tag_id, current_user.id, session)

    if body.name is not None:
        tag.name = body.name
    if body.color is not None:
        tag.color = body.color

    session.add(tag)
    await session.commit()
    await session.refresh(tag)
    return _tag_to_response(tag)


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag(tag_id: uuid.UUID, current_user: CurrentUser, session: DbDep) -> None:
    tag = await _get_tag_or_404(tag_id, current_user.id, session)
    await session.delete(tag)
    await session.commit()
