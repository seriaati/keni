"""store palette color ids instead of hex for categories and tags

Revision ID: 2388d3e24b50
Revises: 731672a281f9
Create Date: 2026-10-03 10:09:00.000000

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "2388d3e24b50"
down_revision: Union[str, Sequence[str], None] = "731672a281f9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Frozen snapshot of the frontend palette (light hex -> palette id) at the time of this
# migration. Do not import it from app code: later palette edits must not change history.
HEX_TO_ID = {
    "#6aab8a": "green-1",
    "#5e8c6a": "green-2",
    "#7a9e7e": "green-3",
    "#4a7c6f": "green-4",
    "#7ab89a": "green-5",
    "#7a9fd0": "blue-1",
    "#6b8fba": "blue-2",
    "#5a7aaa": "blue-3",
    "#4a6fa0": "blue-4",
    "#8aaac8": "blue-5",
    "#6ab0b8": "teal-1",
    "#5a9ea8": "teal-2",
    "#4a8e98": "teal-3",
    "#7abac0": "teal-4",
    "#3a7e90": "teal-5",
    "#9e80b8": "purple-1",
    "#8b6fa8": "purple-2",
    "#7a5e98": "purple-3",
    "#6a4e88": "purple-4",
    "#b090c8": "purple-5",
    "#c07888": "pink-1",
    "#b06b7a": "pink-2",
    "#d08898": "pink-3",
    "#985868": "pink-4",
    "#a87888": "pink-5",
    "#c08070": "red-1",
    "#b07060": "red-2",
    "#a06050": "red-3",
    "#987060": "red-4",
    "#c89080": "red-5",
    "#c49a6a": "orange-1",
    "#b8895a": "orange-2",
    "#d4a870": "orange-3",
    "#a07848": "orange-4",
    "#b89870": "orange-5",
    "#b8a060": "yellow-1",
    "#a89050": "yellow-2",
    "#988040": "yellow-3",
    "#c8b070": "yellow-4",
    "#887030": "yellow-5",
    "#8a9faa": "slate-1",
    "#7a8f9a": "slate-2",
    "#6a7f8a": "slate-3",
    "#5a6f7a": "slate-4",
    "#9aafba": "slate-5",
    "#9a8070": "brown-1",
    "#8a7060": "brown-2",
    "#aa9080": "brown-3",
    "#7a6050": "brown-4",
    "#6a5040": "brown-5",
    "#aa8aaa": "mauve-1",
    "#9a7a9a": "mauve-2",
    "#8a6a8a": "mauve-3",
    "#ba9aba": "mauve-4",
    "#7a5a7a": "mauve-5",
    "#8aaa8a": "sage-1",
    "#7a9a7a": "sage-2",
    "#6a8a6a": "sage-3",
    "#9aba9a": "sage-4",
    "#5a7a5a": "sage-5",
    "#9ca3af": "neutral-1",
    "#8b929c": "neutral-2",
    "#a8aeb8": "neutral-3",
    "#7a818b": "neutral-4",
    "#6b7280": "neutral-5",
}

TABLES = ("categories", "tags")


def _values(pairs: list[tuple[str, str]]) -> str:
    return ", ".join(f"('{a}', '{b}')" for a, b in pairs)


def upgrade() -> None:
    """Upgrade schema."""
    values = _values(list(HEX_TO_ID.items()))
    for table in TABLES:
        op.execute(
            f"UPDATE {table} SET color = m.id FROM (VALUES {values}) AS m(hex, id) "
            f"WHERE lower({table}.color) = m.hex"
        )


def downgrade() -> None:
    """Downgrade schema."""
    values = _values([(v, k) for k, v in HEX_TO_ID.items()])
    for table in TABLES:
        op.execute(
            f"UPDATE {table} SET color = m.hex FROM (VALUES {values}) AS m(id, hex) "
            f"WHERE {table}.color = m.id"
        )
