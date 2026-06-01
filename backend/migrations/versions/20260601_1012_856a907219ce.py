"""unique category name per user (case-insensitive)

Revision ID: 856a907219ce
Revises: 471e6e0223f8
Create Date: 2026-06-01 10:12:09.634128

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision: str = "856a907219ce"
down_revision: Union[str, Sequence[str], None] = "471e6e0223f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Merge pre-existing duplicate categories (same user, case-insensitive name) into
    # a single canonical category (earliest created_at) before enforcing uniqueness.
    op.execute(
        sa.text(
            """
            WITH ranked AS (
                SELECT id,
                       first_value(id) OVER (
                           PARTITION BY user_id, lower(name)
                           ORDER BY created_at, id
                       ) AS canonical_id
                FROM categories
            ),
            dups AS (
                SELECT id, canonical_id FROM ranked WHERE id <> canonical_id
            ),
            t AS (
                UPDATE transactions tx SET category_id = d.canonical_id
                FROM dups d WHERE tx.category_id = d.id RETURNING 1
            ),
            r AS (
                UPDATE recurring_transactions rt SET category_id = d.canonical_id
                FROM dups d WHERE rt.category_id = d.id RETURNING 1
            ),
            b AS (
                UPDATE budgets bg SET category_id = d.canonical_id
                FROM dups d WHERE bg.category_id = d.id RETURNING 1
            )
            DELETE FROM categories c USING dups d WHERE c.id = d.id
            """
        )
    )
    op.create_index(
        "ix_categories_user_id_lower_name",
        "categories",
        ["user_id", sa.text("lower(name)")],
        unique=True,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_categories_user_id_lower_name", table_name="categories")
