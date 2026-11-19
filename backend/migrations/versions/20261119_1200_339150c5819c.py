"""add base_url to ai_providers

Revision ID: 339150c5819c
Revises: 49c2f3fba7bb
Create Date: 2026-11-19 12:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "339150c5819c"
down_revision: Union[str, Sequence[str], None] = "49c2f3fba7bb"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("ai_providers", sa.Column("base_url", sa.String(length=500), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("ai_providers", "base_url")
