import uuid
from datetime import datetime

from sqlmodel import Field, SQLModel, text


class Expense(SQLModel, table=True):
    __tablename__: str = "expenses"

    id: uuid.UUID = Field(
        default=None,
        primary_key=True,
        sa_column_kwargs={"server_default": text("gen_random_uuid()")},
    )
    wallet_id: uuid.UUID = Field(foreign_key="wallets.id", index=True)
    category_id: uuid.UUID = Field(foreign_key="categories.id")
    amount: float
    description: str | None = Field(default=None, max_length=500)
    date: datetime = Field(default=None, sa_column_kwargs={"server_default": text("NOW()")})
    ai_context: str | None = Field(default=None)
    created_at: datetime = Field(default=None, sa_column_kwargs={"server_default": text("NOW()")})
    updated_at: datetime = Field(default=None, sa_column_kwargs={"server_default": text("NOW()")})


class ExpenseTag(SQLModel, table=True):
    __tablename__: str = "expense_tags"

    expense_id: uuid.UUID = Field(foreign_key="expenses.id", primary_key=True)
    tag_id: uuid.UUID = Field(foreign_key="tags.id", primary_key=True)
