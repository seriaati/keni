from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel.ext.asyncio.session import AsyncSession

from app.dependencies import get_current_user, get_db, require_admin
from app.models.ai_connection import AIConnection
from app.models.user import User
from app.schemas.ai_provider import (
    AIConnectionCreate,
    AIConnectionResponse,
    AIConnectionTest,
    AIConnectionUpdate,
    AIProviderModelsResponse,
)
from app.services.ai_connections import (
    connection_api_key,
    create_connection,
    delete_connection,
    get_accessible_connection,
    get_owned_connection,
    list_accessible_connections,
    list_connection_models,
    list_models_for,
    list_shared_connections,
    masked_key,
    update_connection,
    validate_connection_fields,
)

router = APIRouter(prefix="/api/users/me/ai-connections", tags=["ai-connections"])
admin_router = APIRouter(prefix="/api/admin/ai-connections", tags=["ai-connections"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]
AdminUser = Annotated[User, Depends(require_admin)]


def _to_response(connection: AIConnection, *, reveal_shared: bool = False) -> AIConnectionResponse:
    shared = connection.user_id is None
    return AIConnectionResponse(
        id=connection.id,
        name=connection.name,
        kind=connection.kind,
        base_url=connection.base_url,
        api_key_masked=masked_key(connection) if (reveal_shared or not shared) else None,
        has_api_key=connection.api_key_encrypted is not None,
        shared=shared,
    )


def _unprocessable(exc: ValueError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


async def _create(
    owner_id: uuid.UUID | None, body: AIConnectionCreate, session: AsyncSession
) -> AIConnection:
    try:
        return await create_connection(
            owner_id, body.name, body.kind, body.base_url, body.api_key, session
        )
    except ValueError as exc:
        raise _unprocessable(exc) from exc


async def _update(
    connection: AIConnection, body: AIConnectionUpdate, session: AsyncSession
) -> AIConnection:
    try:
        return await update_connection(
            connection,
            session,
            fields_set=body.model_fields_set,
            name=body.name,
            kind=body.kind,
            base_url=body.base_url,
            api_key=body.api_key,
        )
    except ValueError as exc:
        await session.rollback()
        raise _unprocessable(exc) from exc


# --- User-owned connections (plus read access to shared ones) ---


@router.get("")
async def list_ai_connections(
    current_user: CurrentUser, session: DbDep
) -> list[AIConnectionResponse]:
    connections = await list_accessible_connections(current_user.id, session)
    return [_to_response(c) for c in connections]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_ai_connection(
    body: AIConnectionCreate, current_user: CurrentUser, session: DbDep
) -> AIConnectionResponse:
    return _to_response(await _create(current_user.id, body, session))


@router.post("/models")
async def test_ai_connection(
    body: AIConnectionTest, current_user: CurrentUser, session: DbDep
) -> AIProviderModelsResponse:
    """List models for connection details that haven't been saved yet."""
    api_key = body.api_key or None
    if api_key is None and body.connection_id is not None:
        saved = await get_accessible_connection(body.connection_id, current_user.id, session)
        api_key = connection_api_key(saved)
    try:
        validate_connection_fields(
            body.kind, body.base_url or None, api_key, is_admin_owned=current_user.is_admin
        )
    except ValueError as exc:
        raise _unprocessable(exc) from exc
    return AIProviderModelsResponse(
        models=await list_models_for(body.kind, body.base_url, api_key)
    )


@router.patch("/{connection_id}")
async def update_ai_connection(
    connection_id: uuid.UUID, body: AIConnectionUpdate, current_user: CurrentUser, session: DbDep
) -> AIConnectionResponse:
    connection = await get_owned_connection(connection_id, current_user.id, session)
    return _to_response(await _update(connection, body, session))


@router.delete("/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ai_connection(
    connection_id: uuid.UUID, current_user: CurrentUser, session: DbDep
) -> None:
    connection = await get_owned_connection(connection_id, current_user.id, session)
    await delete_connection(connection, session)


@router.post("/{connection_id}/models")
async def list_ai_connection_models(
    connection_id: uuid.UUID, current_user: CurrentUser, session: DbDep
) -> AIProviderModelsResponse:
    connection = await get_accessible_connection(connection_id, current_user.id, session)
    return AIProviderModelsResponse(models=await list_connection_models(connection))


# --- Admin-managed shared connections ---


@admin_router.get("")
async def list_shared_ai_connections(_: AdminUser, session: DbDep) -> list[AIConnectionResponse]:
    connections = await list_shared_connections(session)
    return [_to_response(c, reveal_shared=True) for c in connections]


@admin_router.post("", status_code=status.HTTP_201_CREATED)
async def create_shared_ai_connection(
    body: AIConnectionCreate, _: AdminUser, session: DbDep
) -> AIConnectionResponse:
    return _to_response(await _create(None, body, session), reveal_shared=True)


@admin_router.patch("/{connection_id}")
async def update_shared_ai_connection(
    connection_id: uuid.UUID, body: AIConnectionUpdate, _: AdminUser, session: DbDep
) -> AIConnectionResponse:
    connection = await get_owned_connection(connection_id, None, session)
    return _to_response(await _update(connection, body, session), reveal_shared=True)


@admin_router.delete("/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_shared_ai_connection(
    connection_id: uuid.UUID, _: AdminUser, session: DbDep
) -> None:
    connection = await get_owned_connection(connection_id, None, session)
    await delete_connection(connection, session)
