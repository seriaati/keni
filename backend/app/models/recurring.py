import uuid
from datetime import datetime

from sqlmodel import Field, SQLModel, text


class RecurringExpense(SQLModel, table=True):
    __tablename__: str = "recurring_expenses"

    id: uuid.UUID = Field(
        default=None,
        primary_key=True,
        sa_column_kwargs={"server_default": text("gen_random_uuid()")},
    )
    wallet_id: uuid.UUID = Field(foreign_key="wallets.id", index=True)
    category_id: uuid.UUID = Field(foreign_key="categories.id")
    amount: float
    description: str | None = Field(default=None, max_length=500)
    frequency: str = Field(max_length=20)
    next_due: datetime
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default=None, sa_column_kwargs={"server_default": text("NOW()")})
