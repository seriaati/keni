from __future__ import annotations

import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlmodel import Field, SQLModel, text


class AIConnection(SQLModel, table=True):
    """A saved LLM endpoint. ``user_id`` NULL means an admin-managed shared connection."""

    __tablename__: str = "ai_connections"

    id: uuid.UUID = Field(
        default=None,
        primary_key=True,
        sa_column_kwargs={"server_default": text("gen_random_uuid()")},
    )
    user_id: uuid.UUID | None = Field(default=None, foreign_key="users.id", index=True)
    name: str = Field(max_length=100)
    kind: str = Field(max_length=50)
    base_url: str | None = Field(default=None, max_length=500)
    api_key_encrypted: str | None = Field(default=None)
    created_at: datetime = Field(
        default=None,
        sa_column=sa.Column(
            sa.DateTime(timezone=True), server_default=text("NOW()"), nullable=False
        ),
    )
    updated_at: datetime = Field(
        default=None,
        sa_column=sa.Column(
            sa.DateTime(timezone=True), server_default=text("NOW()"), nullable=False
        ),
    )
