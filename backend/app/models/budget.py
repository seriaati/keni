import uuid
from datetime import datetime

from sqlmodel import Field, SQLModel, text


class Budget(SQLModel, table=True):
    __tablename__: str = "budgets"

    id: uuid.UUID = Field(
        default=None,
        primary_key=True,
        sa_column_kwargs={"server_default": text("gen_random_uuid()")},
    )
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    wallet_id: uuid.UUID | None = Field(default=None, foreign_key="wallets.id")
    category_id: uuid.UUID | None = Field(default=None, foreign_key="categories.id")
    amount: float
    period: str = Field(max_length=20)
    start_date: datetime = Field(default=None, sa_column_kwargs={"server_default": text("NOW()")})
    created_at: datetime = Field(default=None, sa_column_kwargs={"server_default": text("NOW()")})
