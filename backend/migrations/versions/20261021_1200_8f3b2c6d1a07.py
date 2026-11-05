"""add ai_connections and per-role connection selection

Revision ID: 8f3b2c6d1a07
Revises: 5c1e7a9d3b42
Create Date: 2026-10-21 12:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
import sqlmodel
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "8f3b2c6d1a07"
down_revision: Union[str, Sequence[str], None] = "5c1e7a9d3b42"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CONNECTION_FKS = ("connection_id", "chat_connection_id", "attachment_connection_id")


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "ai_connections",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
        sa.Column("kind", sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column("base_url", sqlmodel.sql.sqltypes.AutoString(length=500), nullable=True),
        sa.Column("api_key_encrypted", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_ai_connections_user_id"), "ai_connections", ["user_id"], unique=False)

    for column in _CONNECTION_FKS:
        op.add_column("ai_providers", sa.Column(column, sa.Uuid(), nullable=True))
        op.create_foreign_key(
            f"ai_providers_{column}_fkey",
            "ai_providers",
            "ai_connections",
            [column],
            ["id"],
            ondelete="SET NULL",
        )

    # Move each user's single provider + key into a connection and point the
    # main role at it.
    op.execute(
        """
        INSERT INTO ai_connections (user_id, name, kind, api_key_encrypted)
        SELECT user_id,
               CASE provider
                   WHEN 'anthropic' THEN 'Anthropic'
                   WHEN 'gemini' THEN 'Google Gemini'
                   WHEN 'openai' THEN 'OpenAI'
                   WHEN 'openrouter' THEN 'OpenRouter'
                   ELSE provider
               END,
               provider,
               api_key_encrypted
        FROM ai_providers
        """
    )
    op.execute(
        """
        UPDATE ai_providers
        SET connection_id = c.id
        FROM ai_connections c
        WHERE c.user_id = ai_providers.user_id
        """
    )

    op.drop_column("ai_providers", "provider")
    op.drop_column("ai_providers", "api_key_encrypted")


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column(
        "ai_providers",
        sa.Column("api_key_encrypted", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    )
    op.add_column(
        "ai_providers",
        sa.Column(
            "provider",
            sqlmodel.sql.sqltypes.AutoString(length=50),
            nullable=False,
            server_default="anthropic",
        ),
    )
    op.execute(
        """
        UPDATE ai_providers
        SET provider = c.kind, api_key_encrypted = c.api_key_encrypted
        FROM ai_connections c
        WHERE c.id = ai_providers.connection_id
        """
    )
    for column in reversed(_CONNECTION_FKS):
        op.drop_constraint(f"ai_providers_{column}_fkey", "ai_providers", type_="foreignkey")
        op.drop_column("ai_providers", column)
    op.drop_index(op.f("ix_ai_connections_user_id"), table_name="ai_connections")
    op.drop_table("ai_connections")
