import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

FrequencyType = Literal["daily", "weekly", "bi-weekly", "monthly", "yearly"]


class RecurringExpenseCreate(BaseModel):
    category_id: uuid.UUID
    amount: float = Field(gt=0)
    description: str | None = Field(default=None, max_length=500)
    frequency: FrequencyType
    next_due: datetime


class RecurringExpenseUpdate(BaseModel):
    category_id: uuid.UUID | None = None
    amount: float | None = Field(default=None, gt=0)
    description: str | None = Field(default=None, max_length=500)
    frequency: FrequencyType | None = None
    next_due: datetime | None = None
    is_active: bool | None = None


class RecurringExpenseResponse(BaseModel):
    id: uuid.UUID
    wallet_id: uuid.UUID
    category_id: uuid.UUID
    amount: float
    description: str | None
    frequency: str
    next_due: datetime
    is_active: bool
    created_at: datetime
