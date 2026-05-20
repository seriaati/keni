from __future__ import annotations

import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlmodel import Field, SQLModel, text


class Transaction(SQLModel, table=True):
    __tablename__: str = "transactions"

    id: uuid.UUID = Field(
        default=None,
        primary_key=True,
        sa_column_kwargs={"server_default": text("gen_random_uuid()")},
    )
    wallet_id: uuid.UUID = Field(foreign_key="wallets.id", index=True, ondelete="CASCADE")
    category_id: uuid.UUID = Field(foreign_key="categories.id")
    group_id: uuid.UUID | None = Field(
        default=None, foreign_key="transactions.id", index=True, ondelete="CASCADE"
    )
    type: str = Field(default="expense", max_length=10)
    amount: float
    description: str | None = Field(default=None, max_length=500)
    date: datetime = Field(
        default=None,
        sa_column=sa.Column(
            sa.DateTime(timezone=True), server_default=text("NOW()"), nullable=False
        ),
    )
    ai_context: str | None = Field(default=None)
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


class TransactionTag(SQLModel, table=True):
    __tablename__: str = "transaction_tags"

    transaction_id: uuid.UUID = Field(
        foreign_key="transactions.id", primary_key=True, ondelete="CASCADE"
    )
    tag_id: uuid.UUID = Field(foreign_key="tags.id", primary_key=True, ondelete="CASCADE")


class TransactionLink(SQLModel, table=True):
    __tablename__: str = "transaction_links"

    transaction_id_a: uuid.UUID = Field(
        foreign_key="transactions.id", primary_key=True, ondelete="CASCADE"
    )
    transaction_id_b: uuid.UUID = Field(
        foreign_key="transactions.id", primary_key=True, ondelete="CASCADE"
    )
    created_at: datetime = Field(
        default=None,
        sa_column=sa.Column(
            sa.DateTime(timezone=True), server_default=text("NOW()"), nullable=False
        ),
    )


class Transfer(SQLModel, table=True):
    __tablename__: str = "transfers"

    id: uuid.UUID = Field(
        default=None,
        primary_key=True,
        sa_column_kwargs={"server_default": text("gen_random_uuid()")},
    )
    source_wallet_id: uuid.UUID = Field(foreign_key="wallets.id", index=True, ondelete="CASCADE")
    destination_wallet_id: uuid.UUID = Field(
        foreign_key="wallets.id", index=True, ondelete="CASCADE"
    )
    source_amount: float
    destination_amount: float | None = None
    date: datetime = Field(
        default=None,
        sa_column=sa.Column(
            sa.DateTime(timezone=True), server_default=text("NOW()"), nullable=False
        ),
    )
    description: str | None = Field(default=None, max_length=500)
    source_transaction_id: uuid.UUID = Field(
        foreign_key="transactions.id", index=True, unique=True, ondelete="CASCADE"
    )
    destination_transaction_id: uuid.UUID = Field(
        foreign_key="transactions.id", index=True, unique=True, ondelete="CASCADE"
    )
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
