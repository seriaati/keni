from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel.ext.asyncio.session import AsyncSession

from app.dependencies import DateRange, get_current_user, get_date_range, get_db
from app.models.user import User
from app.schemas.transfer import (
    TransferCreate,
    TransferListResponse,
    TransferResponse,
    TransferUpdate,
)
from app.services.transfer import (
    TransferError,
    TransferNotFoundError,
    build_transfer_response,
    create_transfer,
    delete_transfer,
    get_owned_transfer,
    list_transfers,
    update_transfer,
)

router = APIRouter(prefix="/api/transfers", tags=["transfers"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]
DateRangeDep = Annotated[DateRange, Depends(get_date_range)]


def _http_error(e: TransferError) -> HTTPException:
    code = (
        status.HTTP_404_NOT_FOUND
        if isinstance(e, TransferNotFoundError)
        else status.HTTP_422_UNPROCESSABLE_ENTITY
    )
    return HTTPException(status_code=code, detail=str(e))


@router.post("", status_code=status.HTTP_201_CREATED)
async def create(
    body: TransferCreate, current_user: CurrentUser, session: DbDep
) -> TransferResponse:
    try:
        transfer = await create_transfer(session, current_user.id, body)
    except TransferError as e:
        raise _http_error(e) from e
    return await build_transfer_response(session, transfer)


@router.get("")
async def list_(  # ruff: ignore[too-many-arguments, too-many-positional-arguments]
    current_user: CurrentUser,
    session: DbDep,
    date_range: DateRangeDep,
    wallet_id: Annotated[uuid.UUID | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> TransferListResponse:
    transfers, total = await list_transfers(
        session,
        current_user.id,
        wallet_id=wallet_id,
        start=date_range.start,
        end=date_range.end,
        page=page,
        page_size=page_size,
    )
    items = [await build_transfer_response(session, t) for t in transfers]
    return TransferListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/{transfer_id}")
async def get(
    transfer_id: uuid.UUID, current_user: CurrentUser, session: DbDep
) -> TransferResponse:
    try:
        transfer = await get_owned_transfer(session, transfer_id, current_user.id)
    except TransferError as e:
        raise _http_error(e) from e
    return await build_transfer_response(session, transfer)


@router.patch("/{transfer_id}")
async def update(
    transfer_id: uuid.UUID, body: TransferUpdate, current_user: CurrentUser, session: DbDep
) -> TransferResponse:
    try:
        transfer = await get_owned_transfer(session, transfer_id, current_user.id)
        transfer = await update_transfer(session, transfer, body)
    except TransferError as e:
        raise _http_error(e) from e
    return await build_transfer_response(session, transfer)


@router.delete("/{transfer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete(transfer_id: uuid.UUID, current_user: CurrentUser, session: DbDep) -> None:
    try:
        transfer = await get_owned_transfer(session, transfer_id, current_user.id)
    except TransferError as e:
        raise _http_error(e) from e
    await delete_transfer(session, transfer)
