import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

PeriodType = Literal["weekly", "monthly"]


class BudgetCreate(BaseModel):
    wallet_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    amount: float = Field(gt=0)
    period: PeriodType


class BudgetUpdate(BaseModel):
    wallet_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    amount: float | None = Field(default=None, gt=0)
    period: PeriodType | None = None


class BudgetResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    wallet_id: uuid.UUID | None
    category_id: uuid.UUID | None
    amount: float
    period: str
    start_date: datetime
    created_at: datetime
    spent: float
    remaining: float
    percentage_used: float
    is_over_budget: bool
