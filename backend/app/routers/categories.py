from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.category import Category
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.category import CategoryCreate, CategoryResponse, CategoryUpdate

router = APIRouter(prefix="/api/categories", tags=["categories"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


def _category_to_response(cat: Category) -> CategoryResponse:
    return CategoryResponse(
        id=cat.id,
        user_id=cat.user_id,
        name=cat.name,
        icon=cat.icon,
        color=cat.color,
        is_system=cat.is_system,
        created_at=cat.created_at,
    )


async def _get_category_or_404(
    category_id: uuid.UUID, user_id: uuid.UUID, session: AsyncSession
) -> Category:
    result = await session.exec(
        select(Category).where(Category.id == category_id, Category.user_id == user_id)
    )
    cat = result.first()
    if not cat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    return cat


async def _get_others_category(user_id: uuid.UUID, session: AsyncSession) -> Category:
    result = await session.exec(
        select(Category).where(Category.user_id == user_id, Category.is_system)
    )
    cat = result.first()
    if not cat:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="System category not found"
        )
    return cat


@router.get("")
async def list_categories(current_user: CurrentUser, session: DbDep) -> list[CategoryResponse]:
    result = await session.exec(select(Category).where(Category.user_id == current_user.id))
    return [_category_to_response(c) for c in result.all()]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_category(
    body: CategoryCreate, current_user: CurrentUser, session: DbDep
) -> CategoryResponse:
    cat = Category(
        user_id=current_user.id,
        name=body.name,
        icon=body.icon,
        color=body.color,
        type=body.type,
        is_system=False,
    )
    session.add(cat)
    await session.commit()
    await session.refresh(cat)
    return _category_to_response(cat)


@router.patch("/{category_id}")
async def update_category(
    category_id: uuid.UUID, body: CategoryUpdate, current_user: CurrentUser, session: DbDep
) -> CategoryResponse:
    cat = await _get_category_or_404(category_id, current_user.id, session)

    if cat.is_system:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot modify the system 'Others' category",
        )

    if "name" in body.model_fields_set and body.name is not None:
        cat.name = body.name
    if "icon" in body.model_fields_set:
        cat.icon = body.icon
    if "color" in body.model_fields_set:
        cat.color = body.color
    session.add(cat)
    await session.commit()
    await session.refresh(cat)
    return _category_to_response(cat)


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    category_id: uuid.UUID, current_user: CurrentUser, session: DbDep
) -> None:
    cat = await _get_category_or_404(category_id, current_user.id, session)

    if cat.is_system:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot delete the system 'Others' category",
        )

    others = await _get_others_category(current_user.id, session)

    result = await session.exec(select(Transaction).where(Transaction.category_id == category_id))
    for transaction in result.all():
        transaction.category_id = others.id
        session.add(transaction)

    await session.delete(cat)
    await session.commit()
