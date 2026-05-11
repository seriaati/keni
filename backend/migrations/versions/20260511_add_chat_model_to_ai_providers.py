"""add_chat_model_to_ai_providers

Revision ID: add_chat_model_to_ai_providers
Revises: f5afe3c7e436
Create Date: 2026-05-11 00:00:00.000000

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "add_chat_model_to_ai_providers"
down_revision: Union[str, Sequence[str], None] = "f5afe3c7e436"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("ai_providers", sa.Column("chat_model", sa.String(length=100), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("ai_providers", "chat_model")
