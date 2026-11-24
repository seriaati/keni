"""add currency to budgets

Revision ID: 0d08234ee914
Revises: 339150c5819c
Create Date: 2026-11-25 12:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0d08234ee914"
down_revision: Union[str, Sequence[str], None] = "339150c5819c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("budgets", sa.Column("currency", sa.String(length=10), nullable=True))
    op.execute(
        """
        UPDATE budgets b SET currency = COALESCE(
            (SELECT w.currency FROM wallets w WHERE w.id = b.wallet_id),
            (SELECT u.global_currency FROM users u WHERE u.id = b.user_id),
            (SELECT w.currency FROM wallets w WHERE w.user_id = b.user_id
             ORDER BY w.created_at LIMIT 1),
            'USD'
        )
        """
    )
    op.alter_column("budgets", "currency", nullable=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("budgets", "currency")
