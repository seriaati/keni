from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

import sqlalchemy as sa
from sqlmodel import Field, SQLModel, text


class OAuthAuthorizationCode(SQLModel, table=True):
    __tablename__: str = "oauth_authorization_codes"

    id: uuid.UUID = Field(
        default=None,
        primary_key=True,
        sa_column_kwargs={"server_default": text("gen_random_uuid()")},
    )
    code: str = Field(unique=True, index=True)  # SHA-256 of the code, like OAuthToken.token_hash
    client_id: str = Field(foreign_key="oauth_clients.client_id", index=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    redirect_uri: str
    redirect_uri_provided_explicitly: bool = Field(default=False)
    code_challenge: str
    scopes: list[Any] = Field(default_factory=list, sa_column=sa.Column(sa.JSON, nullable=False))
    resource: str | None = Field(default=None, nullable=True)
    expires_at: datetime = Field(sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False))
    created_at: datetime = Field(
        default=None,
        sa_column=sa.Column(
            sa.DateTime(timezone=True), server_default=text("NOW()"), nullable=False
        ),
    )
