from __future__ import annotations

import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlmodel import Field, SQLModel, text


class AIProvider(SQLModel, table=True):
    """Per-user AI preferences: which connection and model each role uses."""

    __tablename__: str = "ai_providers"

    id: uuid.UUID = Field(
        default=None,
        primary_key=True,
        sa_column_kwargs={"server_default": text("gen_random_uuid()")},
    )
    user_id: uuid.UUID = Field(foreign_key="users.id", unique=True, index=True)
    connection_id: uuid.UUID | None = Field(
        default=None, foreign_key="ai_connections.id", ondelete="SET NULL"
    )
    chat_connection_id: uuid.UUID | None = Field(
        default=None, foreign_key="ai_connections.id", ondelete="SET NULL"
    )
    attachment_connection_id: uuid.UUID | None = Field(
        default=None, foreign_key="ai_connections.id", ondelete="SET NULL"
    )
    model: str = Field(default="claude-opus-4-5", max_length=100)
    chat_model: str | None = Field(default=None, max_length=100)
    attachment_model: str | None = Field(default=None, max_length=100)
    ocr_enabled: bool = Field(default=False, sa_column_kwargs={"server_default": text("false")})
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
