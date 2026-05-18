from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

FrequencyType = Literal["daily", "weekly", "bi-weekly", "monthly", "yearly"]


class RecurringTransactionCreate(BaseModel):
    category_id: uuid.UUID | None = None
    category_name: str | None = None
    type: Literal["expense", "income"] = "expense"
    amount: float = Field(gt=0)
    description: str | None = Field(default=None, max_length=500)
    frequency: FrequencyType
    next_due: datetime
    tag_names: list[str] = Field(default_factory=list)

    @field_validator("next_due")
    @classmethod
    def next_due_not_in_past(cls, v: datetime) -> datetime:
        if v.date() < datetime.now(UTC).date():
            msg = "next_due cannot be in the past"
            raise ValueError(msg)
        return v

    @model_validator(mode="after")
    def validate_category(self) -> RecurringTransactionCreate:
        if self.category_id is None and self.category_name is None:
            msg = "Either category_id or category_name must be provided"
            raise ValueError(msg)
        return self


class RecurringTransactionUpdate(BaseModel):
    category_id: uuid.UUID | None = None
    type: Literal["expense", "income"] | None = None
    amount: float | None = Field(default=None, gt=0)
    description: str | None = Field(default=None, max_length=500)
    frequency: FrequencyType | None = None
    next_due: datetime | None = None
    is_active: bool | None = None

    @field_validator("next_due")
    @classmethod
    def next_due_not_in_past(cls, v: datetime | None) -> datetime | None:
        if v is not None and v.date() < datetime.now(UTC).date():
            msg = "next_due cannot be in the past"
            raise ValueError(msg)
        return v


class RecurringTransactionResponse(BaseModel):
    id: uuid.UUID
    wallet_id: uuid.UUID
    category_id: uuid.UUID
    type: str
    amount: float
    description: str | None
    frequency: str
    next_due: datetime
    is_active: bool
    created_at: datetime
