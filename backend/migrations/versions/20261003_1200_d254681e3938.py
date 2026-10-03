"""drop ai_context from transactions

Revision ID: d254681e3938
Revises: 2388d3e24b50
Create Date: 2026-10-03 12:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "d254681e3938"
down_revision: Union[str, Sequence[str], None] = "2388d3e24b50"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_column("transactions", "ai_context")


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column("transactions", sa.Column("ai_context", sa.String(), nullable=True))
