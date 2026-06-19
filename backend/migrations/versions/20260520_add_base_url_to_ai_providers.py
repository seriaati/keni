"""add_base_url_to_ai_providers

Revision ID: add_base_url_to_ai_providers
Revises: add_chat_model_to_ai_providers
Create Date: 2026-05-20 00:00:00.000000

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "add_base_url_to_ai_providers"
down_revision: Union[str, Sequence[str], None] = "add_chat_model_to_ai_providers"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("ai_providers", sa.Column("base_url", sa.String(length=500), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("ai_providers", "base_url")
