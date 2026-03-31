import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class WalletCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    currency: str = Field(min_length=1, max_length=10)
    is_default: bool = False


class WalletUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    currency: str | None = Field(default=None, min_length=1, max_length=10)
    is_default: bool | None = None


class WalletResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    currency: str
    is_default: bool
    created_at: datetime


class WalletSummary(WalletResponse):
    total_expenses: float
    expense_count: int
