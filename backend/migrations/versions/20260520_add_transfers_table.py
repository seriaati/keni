"""add transfers table

Revision ID: add_transfers_table
Revises: add_base_url_to_ai_providers
Create Date: 2026-05-20 12:00:00.000000

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "add_transfers_table"
down_revision: Union[str, Sequence[str], None] = "add_base_url_to_ai_providers"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "transfers",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("source_wallet_id", sa.Uuid(), nullable=False),
        sa.Column("destination_wallet_id", sa.Uuid(), nullable=False),
        sa.Column("source_amount", sa.Float(), nullable=False),
        sa.Column("destination_amount", sa.Float(), nullable=True),
        sa.Column(
            "date", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False
        ),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("source_transaction_id", sa.Uuid(), nullable=False),
        sa.Column("destination_transaction_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["source_wallet_id"], ["wallets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["destination_wallet_id"], ["wallets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_transaction_id"], ["transactions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["destination_transaction_id"], ["transactions.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_transfers_source_wallet_id"), "transfers", ["source_wallet_id"])
    op.create_index(
        op.f("ix_transfers_destination_wallet_id"), "transfers", ["destination_wallet_id"]
    )
    op.create_index(
        op.f("ix_transfers_source_transaction_id"),
        "transfers",
        ["source_transaction_id"],
        unique=True,
    )
    op.create_index(
        op.f("ix_transfers_destination_transaction_id"),
        "transfers",
        ["destination_transaction_id"],
        unique=True,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_transfers_destination_transaction_id"), table_name="transfers")
    op.drop_index(op.f("ix_transfers_source_transaction_id"), table_name="transfers")
    op.drop_index(op.f("ix_transfers_destination_wallet_id"), table_name="transfers")
    op.drop_index(op.f("ix_transfers_source_wallet_id"), table_name="transfers")
    op.drop_table("transfers")
