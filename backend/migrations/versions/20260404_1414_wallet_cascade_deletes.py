"""Add cascade deletes for wallet-owned tables

Revision ID: wallet_cascade_deletes
Revises: timezone_aware_datetimes
Create Date: 2026-04-04 14:14:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "wallet_cascade_deletes"
down_revision: Union[str, Sequence[str], None] = "timezone_aware_datetimes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("expenses_wallet_id_fkey", "expenses", type_="foreignkey")
    op.create_foreign_key(
        "expenses_wallet_id_fkey", "expenses", "wallets", ["wallet_id"], ["id"], ondelete="CASCADE"
    )

    op.drop_constraint("expense_tags_expense_id_fkey", "expense_tags", type_="foreignkey")
    op.create_foreign_key(
        "expense_tags_expense_id_fkey",
        "expense_tags",
        "expenses",
        ["expense_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.drop_constraint(
        "recurring_expenses_wallet_id_fkey", "recurring_expenses", type_="foreignkey"
    )
    op.create_foreign_key(
        "recurring_expenses_wallet_id_fkey",
        "recurring_expenses",
        "wallets",
        ["wallet_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.drop_constraint("budgets_wallet_id_fkey", "budgets", type_="foreignkey")
    op.create_foreign_key(
        "budgets_wallet_id_fkey", "budgets", "wallets", ["wallet_id"], ["id"], ondelete="SET NULL"
    )


def downgrade() -> None:
    op.drop_constraint("budgets_wallet_id_fkey", "budgets", type_="foreignkey")
    op.create_foreign_key("budgets_wallet_id_fkey", "budgets", "wallets", ["wallet_id"], ["id"])

    op.drop_constraint(
        "recurring_expenses_wallet_id_fkey", "recurring_expenses", type_="foreignkey"
    )
    op.create_foreign_key(
        "recurring_expenses_wallet_id_fkey", "recurring_expenses", "wallets", ["wallet_id"], ["id"]
    )

    op.drop_constraint("expense_tags_expense_id_fkey", "expense_tags", type_="foreignkey")
    op.create_foreign_key(
        "expense_tags_expense_id_fkey", "expense_tags", "expenses", ["expense_id"], ["id"]
    )

    op.drop_constraint("expenses_wallet_id_fkey", "expenses", type_="foreignkey")
    op.create_foreign_key("expenses_wallet_id_fkey", "expenses", "wallets", ["wallet_id"], ["id"])
