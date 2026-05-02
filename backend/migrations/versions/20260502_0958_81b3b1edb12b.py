"""drop category type column

Revision ID: 81b3b1edb12b
Revises: 82f15786d962
Create Date: 2026-05-02 09:58:24.560872

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes

# revision identifiers, used by Alembic.
revision: str = '81b3b1edb12b'
down_revision: Union[str, Sequence[str], None] = '82f15786d962'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_column('categories', 'type')


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column('categories', sa.Column('type', sa.VARCHAR(length=10), autoincrement=False, nullable=False))
