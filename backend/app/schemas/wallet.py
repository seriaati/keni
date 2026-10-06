import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class WalletCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    currency: str = Field(min_length=1, max_length=10)


class WalletUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    currency: str | None = Field(default=None, min_length=1, max_length=10)


class WalletResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    currency: str
    created_at: datetime


class WalletSummary(WalletResponse):
    total_expenses: float
    expense_count: int
    total_income: float
    income_count: int
    total_transfers_in: float
    total_transfers_out: float
    balance: float
