"""ocr_enabled_default_false

Revision ID: 82f15786d962
Revises: b71ff816f398
Create Date: 2026-04-23 12:20:28.722437

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision: str = "82f15786d962"
down_revision: Union[str, Sequence[str], None] = "b71ff816f398"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column("ai_providers", "ocr_enabled", server_default=sa.text("false"))


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column("ai_providers", "ocr_enabled", server_default=sa.text("true"))
