"""add client_secret to oauth_clients

Revision ID: 49c2f3fba7bb
Revises: 5c1e7a9d3b42
Create Date: 2026-10-25 12:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "49c2f3fba7bb"
down_revision: Union[str, Sequence[str], None] = "5c1e7a9d3b42"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("oauth_clients", sa.Column("client_secret", sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("oauth_clients", "client_secret")
