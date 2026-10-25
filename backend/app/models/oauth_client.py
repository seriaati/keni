from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

import sqlalchemy as sa
from sqlmodel import Field, SQLModel, text


class OAuthClient(SQLModel, table=True):
    __tablename__: str = "oauth_clients"

    id: uuid.UUID = Field(
        default=None,
        primary_key=True,
        sa_column_kwargs={"server_default": text("gen_random_uuid()")},
    )
    client_id: str = Field(unique=True, index=True)
    client_secret_hash: str | None = Field(default=None, nullable=True)
    # Plaintext: the MCP SDK compares it with hmac.compare_digest. None for public clients and for
    # clients registered before secrets were stored.
    client_secret: str | None = Field(default=None, nullable=True)
    client_id_issued_at: datetime = Field(
        default=None,
        sa_column=sa.Column(
            sa.DateTime(timezone=True), server_default=text("NOW()"), nullable=False
        ),
    )
    redirect_uris: list[Any] = Field(
        default_factory=list, sa_column=sa.Column(sa.JSON, nullable=False)
    )
    client_name: str | None = Field(default=None, nullable=True)
    grant_types: list[Any] = Field(
        default_factory=lambda: ["authorization_code", "refresh_token"],
        sa_column=sa.Column(sa.JSON, nullable=False),
    )
    response_types: list[Any] = Field(
        default_factory=lambda: ["code"], sa_column=sa.Column(sa.JSON, nullable=False)
    )
    scope: str | None = Field(default=None, nullable=True)
    token_endpoint_auth_method: str = Field(default="none")
