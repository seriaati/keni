from __future__ import annotations

import base64
import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Literal

from fastapi import HTTPException, status
from sqlmodel import col, or_, select

from app.config import settings
from app.models.ai_connection import AIConnection
from app.models.ai_provider import AIProvider
from app.providers import get_provider, get_provider_client
from app.providers.errors import ProviderAPIError, ProviderAuthError, ProviderConnectionError

if TYPE_CHECKING:
    import uuid
    from collections.abc import Sequence

    from sqlmodel.ext.asyncio.session import AsyncSession

    from app.providers.base import LLMProvider

logger = logging.getLogger(__name__)

AIRole = Literal["parse", "chat", "attachment"]

PROVIDER_LABELS = {
    "anthropic": "Anthropic",
    "gemini": "Google Gemini",
    "openai": "OpenAI",
    "openrouter": "OpenRouter",
    "openai_compatible": "Custom (OpenAI-compatible)",
}
# Kinds that accept a base URL override; required for openai_compatible.
BASE_URL_KINDS = {"openai", "openrouter", "openai_compatible"}
# Kinds that cannot work without an API key.
KEY_REQUIRED_KINDS = {"anthropic", "gemini", "openai", "openrouter"}

_NOT_CONFIGURED = "No AI provider configured. Set up your API key at /api/users/me/ai-provider."


def _mask_key(key: str) -> str:
    if len(key) <= 8:
        return "****"
    return key[:4] + "****" + key[-4:]


def _encrypt_key(key: str) -> str:
    return base64.b64encode(key.encode()).decode()


def _decrypt_key(encrypted: str) -> str:
    return base64.b64decode(encrypted.encode()).decode()


def masked_key(connection: AIConnection) -> str | None:
    if not connection.api_key_encrypted:
        return None
    return _mask_key(_decrypt_key(connection.api_key_encrypted))


def connection_api_key(connection: AIConnection) -> str | None:
    if not connection.api_key_encrypted:
        return None
    return _decrypt_key(connection.api_key_encrypted)


def _normalize_base_url(base_url: str | None) -> str | None:
    if base_url is None:
        return None
    base_url = base_url.strip().rstrip("/")
    return base_url or None


def validate_connection_fields(
    kind: str, base_url: str | None, api_key: str | None, *, is_admin_owned: bool
) -> None:
    """Raise ValueError if the combination of fields can't produce a working connection."""
    if base_url is not None:
        if kind not in BASE_URL_KINDS:
            msg = f"{PROVIDER_LABELS.get(kind, kind)} does not support a custom base URL"
            raise ValueError(msg)
        if not base_url.startswith(("http://", "https://")):
            msg = "Base URL must start with http:// or https://"
            raise ValueError(msg)
        if not is_admin_owned and not settings.allow_user_custom_base_urls:
            msg = "Custom base URLs are disabled on this server; ask an admin for a shared connection"
            raise ValueError(msg)
    if kind == "openai_compatible" and base_url is None:
        msg = "A base URL is required for custom OpenAI-compatible providers"
        raise ValueError(msg)
    if kind in KEY_REQUIRED_KINDS and not api_key:
        msg = f"An API key is required for {PROVIDER_LABELS[kind]}"
        raise ValueError(msg)


async def list_accessible_connections(
    user_id: uuid.UUID, session: AsyncSession
) -> Sequence[AIConnection]:
    """The user's own connections followed by admin-shared ones."""
    result = await session.exec(
        select(AIConnection)
        .where(or_(col(AIConnection.user_id) == user_id, col(AIConnection.user_id).is_(None)))
        .order_by(col(AIConnection.user_id).is_(None), col(AIConnection.created_at))
    )
    return result.all()


async def list_shared_connections(session: AsyncSession) -> Sequence[AIConnection]:
    result = await session.exec(
        select(AIConnection)
        .where(col(AIConnection.user_id).is_(None))
        .order_by(col(AIConnection.created_at))
    )
    return result.all()


async def get_accessible_connection(
    connection_id: uuid.UUID, user_id: uuid.UUID, session: AsyncSession
) -> AIConnection:
    """A connection the user may use: their own or a shared one."""
    connection = await session.get(AIConnection, connection_id)
    if connection is None or connection.user_id not in (user_id, None):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")
    return connection


async def get_owned_connection(
    connection_id: uuid.UUID, owner_id: uuid.UUID | None, session: AsyncSession
) -> AIConnection:
    """A connection the caller may edit. ``owner_id=None`` targets shared (admin) connections."""
    connection = await session.get(AIConnection, connection_id)
    if connection is None or connection.user_id != owner_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")
    return connection


async def create_connection(  # ruff: ignore[too-many-arguments]
    owner_id: uuid.UUID | None,
    name: str,
    kind: str,
    base_url: str | None,
    api_key: str | None,
    session: AsyncSession,
) -> AIConnection:
    base_url = _normalize_base_url(base_url)
    api_key = api_key or None
    validate_connection_fields(kind, base_url, api_key, is_admin_owned=owner_id is None)
    connection = AIConnection(
        user_id=owner_id,
        name=name.strip(),
        kind=kind,
        base_url=base_url,
        api_key_encrypted=_encrypt_key(api_key) if api_key else None,
    )
    session.add(connection)
    await session.commit()
    await session.refresh(connection)
    return connection


async def update_connection(  # ruff: ignore[too-many-arguments]
    connection: AIConnection,
    session: AsyncSession,
    *,
    fields_set: set[str],
    name: str | None = None,
    kind: str | None = None,
    base_url: str | None = None,
    api_key: str | None = None,
) -> AIConnection:
    """Apply only the fields the client sent. ``api_key=""`` clears the stored key."""
    if "name" in fields_set and name:
        connection.name = name.strip()
    if "kind" in fields_set and kind:
        connection.kind = kind
    if "base_url" in fields_set:
        connection.base_url = _normalize_base_url(base_url)
    if "api_key" in fields_set:
        connection.api_key_encrypted = _encrypt_key(api_key) if api_key else None

    validate_connection_fields(
        connection.kind,
        connection.base_url,
        connection_api_key(connection),
        is_admin_owned=connection.user_id is None,
    )
    connection.updated_at = datetime.now(UTC)
    session.add(connection)
    await session.commit()
    await session.refresh(connection)
    return connection


async def delete_connection(connection: AIConnection, session: AsyncSession) -> None:
    await session.delete(connection)
    await session.commit()


async def list_models_for(
    kind: str, base_url: str | None, api_key: str | None
) -> list[str]:
    """List model ids from an endpoint, mapping provider errors to HTTP errors."""
    try:
        client = get_provider_client(kind, api_key, base_url=_normalize_base_url(base_url))
        return sorted(await client.list_models())
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    except ProviderAuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid API key."
        ) from exc
    except ProviderConnectionError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not connect to AI provider: {exc}",
        ) from exc
    except ProviderAPIError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Failed to fetch models: {exc}"
        ) from exc


async def list_connection_models(connection: AIConnection) -> list[str]:
    return await list_models_for(
        connection.kind, connection.base_url, connection_api_key(connection)
    )


def build_provider(connection: AIConnection, model: str) -> LLMProvider:
    return get_provider(
        connection.kind,
        api_key=connection_api_key(connection),
        model=model,
        base_url=connection.base_url,
    )


async def get_ai_provider_record(user_id: uuid.UUID, session: AsyncSession) -> AIProvider | None:
    result = await session.exec(select(AIProvider).where(AIProvider.user_id == user_id))
    return result.first()


async def upsert_ai_provider(  # ruff: ignore[too-many-arguments]
    user_id: uuid.UUID,
    session: AsyncSession,
    *,
    connection_id: uuid.UUID,
    model: str,
    chat_connection_id: uuid.UUID | None = None,
    chat_model: str | None = None,
    attachment_connection_id: uuid.UUID | None = None,
    attachment_model: str | None = None,
    ocr_enabled: bool = True,
) -> AIProvider:
    if chat_connection_id is not None and not chat_model:
        msg = "Choose a chat model for the selected chat connection"
        raise ValueError(msg)
    if attachment_connection_id is not None and not attachment_model:
        msg = "Choose an attachment model for the selected attachment connection"
        raise ValueError(msg)
    for cid in (connection_id, chat_connection_id, attachment_connection_id):
        if cid is not None:
            await get_accessible_connection(cid, user_id, session)

    record = await get_ai_provider_record(user_id, session)
    if record is None:
        record = AIProvider(user_id=user_id)
    record.connection_id = connection_id
    record.model = model
    record.chat_connection_id = chat_connection_id
    record.chat_model = chat_model
    record.attachment_connection_id = attachment_connection_id
    record.attachment_model = attachment_model
    record.ocr_enabled = ocr_enabled
    record.updated_at = datetime.now(UTC)

    session.add(record)
    await session.commit()
    await session.refresh(record)
    return record


async def resolve_provider(
    record: AIProvider | None, role: AIRole, session: AsyncSession
) -> tuple[LLMProvider, str]:
    """Build the provider and model for a role, falling back to the main connection/model.

    Raises a 422 when the main connection is missing (never set, or deleted).
    """
    if record is None or record.connection_id is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=_NOT_CONFIGURED)

    connection_id = record.connection_id
    model = record.model
    if role == "chat":
        connection_id = record.chat_connection_id or connection_id
        model = record.chat_model or model
    elif role == "attachment":
        connection_id = record.attachment_connection_id or connection_id
        model = record.attachment_model or model

    connection = await session.get(AIConnection, connection_id)
    if connection is None or connection.user_id not in (record.user_id, None):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=_NOT_CONFIGURED)

    try:
        return build_provider(connection, model), model
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
