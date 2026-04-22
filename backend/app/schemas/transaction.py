from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class TransactionCreate(BaseModel):
    category_id: uuid.UUID | None = None
    category_name: str | None = None
    category_icon: str | None = None
    type: Literal["expense", "income"] = "expense"
    amount: float = Field(gt=0)
    description: str | None = Field(default=None, max_length=500)
    date: datetime | None = None
    tag_ids: list[uuid.UUID] = Field(default_factory=list)
    tag_names: list[str] = Field(default_factory=list)
    ai_context: str | None = None
    group_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def validate_category(self) -> TransactionCreate:
        has_id = self.category_id is not None
        has_name = self.category_name is not None
        if has_id and has_name:
            msg = "Provide either category_id or category_name, not both"
            raise ValueError(msg)
        if not has_id and not has_name:
            msg = "Provide either category_id or category_name"
            raise ValueError(msg)
        return self


class TransactionGroupCreate(BaseModel):
    group: TransactionCreate
    items: list[TransactionCreate]


class TransactionUpdate(BaseModel):
    category_id: uuid.UUID | None = None
    type: Literal["expense", "income"] | None = None
    amount: float | None = Field(default=None, gt=0)
    description: str | None = Field(default=None, max_length=500)
    date: datetime | None = None
    tag_ids: list[uuid.UUID] | None = None


class TagBrief(BaseModel):
    id: uuid.UUID
    name: str
    color: str | None


class CategoryBrief(BaseModel):
    id: uuid.UUID
    name: str
    icon: str | None
    color: str | None


class TransactionResponse(BaseModel):
    id: uuid.UUID
    wallet_id: uuid.UUID
    category: CategoryBrief
    type: str
    amount: float
    description: str | None
    date: datetime
    ai_context: str | None
    tags: list[TagBrief]
    created_at: datetime
    updated_at: datetime
    group_id: uuid.UUID | None = None
    children: list[TransactionResponse] | None = None


class TransactionListResponse(BaseModel):
    items: list[TransactionResponse]
    total: int
    page: int
    page_size: int


class TransactionSummary(BaseModel):
    total_amount: float
    expense_count: int
    total_income: float
    income_count: int
    by_category: list[dict]
    income_by_category: list[dict]
    by_period: list[dict]
