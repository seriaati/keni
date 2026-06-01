"""unique tag name per user (case-insensitive)

Revision ID: 471e6e0223f8
Revises: 4b1464fbd894
Create Date: 2026-06-01 09:15:48.046900

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision: str = '471e6e0223f8'
down_revision: Union[str, Sequence[str], None] = '4b1464fbd894'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Merge pre-existing duplicate tags (same user, case-insensitive name) into a
    # single canonical tag (earliest created_at) before enforcing uniqueness.
    op.execute(
        sa.text(
            """
            WITH ranked AS (
                SELECT id,
                       first_value(id) OVER (
                           PARTITION BY user_id, lower(name)
                           ORDER BY created_at, id
                       ) AS canonical_id
                FROM tags
            ),
            dups AS (
                SELECT id, canonical_id FROM ranked WHERE id <> canonical_id
            ),
            moved AS (
                INSERT INTO transaction_tags (transaction_id, tag_id)
                SELECT tt.transaction_id, d.canonical_id
                FROM transaction_tags tt
                JOIN dups d ON tt.tag_id = d.id
                ON CONFLICT DO NOTHING
                RETURNING 1
            ),
            del_links AS (
                DELETE FROM transaction_tags tt
                USING dups d
                WHERE tt.tag_id = d.id
                RETURNING 1
            )
            DELETE FROM tags t USING dups d WHERE t.id = d.id
            """
        )
    )
    op.create_index(
        "ix_tags_user_id_lower_name",
        "tags",
        ["user_id", sa.text("lower(name)")],
        unique=True,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_tags_user_id_lower_name", table_name="tags")
