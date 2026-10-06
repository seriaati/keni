"""add transfers between wallets

Revision ID: 5c1e7a9b2d40
Revises: d254681e3938
Create Date: 2026-10-04 12:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "5c1e7a9b2d40"
down_revision: Union[str, Sequence[str], None] = "d254681e3938"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "transfers",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("from_wallet_id", sa.Uuid(), nullable=False),
        sa.Column("to_wallet_id", sa.Uuid(), nullable=False),
        sa.Column("from_amount", sa.Float(), nullable=False),
        sa.Column("to_amount", sa.Float(), nullable=False),
        sa.Column("fee_amount", sa.Float(), nullable=True),
        sa.Column("description", sqlmodel.sql.sqltypes.AutoString(length=500), nullable=True),
        sa.Column(
            "date", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False
        ),
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
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["from_wallet_id"], ["wallets.id"]),
        sa.ForeignKeyConstraint(["to_wallet_id"], ["wallets.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_transfers_user_id"), "transfers", ["user_id"], unique=False)
    op.create_index(
        op.f("ix_transfers_from_wallet_id"), "transfers", ["from_wallet_id"], unique=False
    )
    op.create_index(op.f("ix_transfers_to_wallet_id"), "transfers", ["to_wallet_id"], unique=False)

    op.add_column("transactions", sa.Column("transfer_id", sa.Uuid(), nullable=True))
    op.create_index(
        op.f("ix_transactions_transfer_id"), "transactions", ["transfer_id"], unique=False
    )
    op.create_foreign_key(
        "transactions_transfer_id_fkey",
        "transactions",
        "transfers",
        ["transfer_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.alter_column("transactions", "category_id", existing_type=sa.Uuid(), nullable=True)
    op.alter_column(
        "transactions",
        "type",
        existing_type=sa.String(length=10),
        type_=sqlmodel.sql.sqltypes.AutoString(length=20),
        existing_nullable=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DELETE FROM transactions WHERE transfer_id IS NOT NULL")
    op.alter_column(
        "transactions",
        "type",
        existing_type=sqlmodel.sql.sqltypes.AutoString(length=20),
        type_=sa.String(length=10),
        existing_nullable=False,
    )
    op.alter_column("transactions", "category_id", existing_type=sa.Uuid(), nullable=False)
    op.drop_constraint("transactions_transfer_id_fkey", "transactions", type_="foreignkey")
    op.drop_index(op.f("ix_transactions_transfer_id"), table_name="transactions")
    op.drop_column("transactions", "transfer_id")
    op.drop_index(op.f("ix_transfers_to_wallet_id"), table_name="transfers")
    op.drop_index(op.f("ix_transfers_from_wallet_id"), table_name="transfers")
    op.drop_index(op.f("ix_transfers_user_id"), table_name="transfers")
    op.drop_table("transfers")
