from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field, model_validator


class ExpenseCreate(BaseModel):
    category_id: uuid.UUID | None = None
    category_name: str | None = None
    amount: float = Field(ge=0)
    description: str | None = Field(default=None, max_length=500)
    date: datetime | None = None
    tag_ids: list[uuid.UUID] = Field(default_factory=list)
    tag_names: list[str] = Field(default_factory=list)
    ai_context: str | None = None
    group_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def validate_category(self) -> ExpenseCreate:
        has_id = self.category_id is not None
        has_name = self.category_name is not None
        if has_id and has_name:
            msg = "Provide either category_id or category_name, not both"
            raise ValueError(msg)
        if not has_id and not has_name:
            msg = "Provide either category_id or category_name"
            raise ValueError(msg)
        return self


class ExpenseGroupCreate(BaseModel):
    group: ExpenseCreate
    items: list[ExpenseCreate]


class ExpenseUpdate(BaseModel):
    category_id: uuid.UUID | None = None
    amount: float | None = Field(default=None, ge=0)
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


class ExpenseResponse(BaseModel):
    id: uuid.UUID
    wallet_id: uuid.UUID
    category: CategoryBrief
    amount: float
    description: str | None
    date: datetime
    ai_context: str | None
    tags: list[TagBrief]
    created_at: datetime
    updated_at: datetime
    group_id: uuid.UUID | None = None
    children: list[ExpenseResponse] | None = None


class ExpenseListResponse(BaseModel):
    items: list[ExpenseResponse]
    total: int
    page: int
    page_size: int


class ExpenseSummary(BaseModel):
    total_amount: float
    expense_count: int
    by_category: list[dict]
    by_period: list[dict]
