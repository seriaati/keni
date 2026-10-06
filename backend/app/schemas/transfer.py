from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.schemas.transaction import CategoryBrief


class TransferCreate(BaseModel):
    from_wallet_id: uuid.UUID
    to_wallet_id: uuid.UUID
    from_amount: float = Field(gt=0)
    to_amount: float = Field(gt=0)
    fee_amount: float | None = Field(default=None, ge=0)
    fee_category_id: uuid.UUID | None = None
    description: str | None = Field(default=None, max_length=500)
    date: datetime | None = None

    @model_validator(mode="after")
    def validate_wallets(self) -> TransferCreate:
        if self.from_wallet_id == self.to_wallet_id:
            msg = "Cannot transfer to the same wallet"
            raise ValueError(msg)
        return self


class TransferUpdate(BaseModel):
    """Omitted fields stay unchanged. A fee_amount of 0 removes the fee."""

    from_wallet_id: uuid.UUID | None = None
    to_wallet_id: uuid.UUID | None = None
    from_amount: float | None = Field(default=None, gt=0)
    to_amount: float | None = Field(default=None, gt=0)
    fee_amount: float | None = Field(default=None, ge=0)
    fee_category_id: uuid.UUID | None = None
    description: str | None = Field(default=None, max_length=500)
    date: datetime | None = None


class TransferSide(BaseModel):
    wallet_id: uuid.UUID
    wallet_name: str
    currency: str
    amount: float
    transaction_id: uuid.UUID | None


class TransferFee(BaseModel):
    amount: float
    currency: str
    category: CategoryBrief | None
    transaction_id: uuid.UUID | None


class TransferResponse(BaseModel):
    id: uuid.UUID
    date: datetime
    description: str | None
    source: TransferSide
    destination: TransferSide
    effective_rate: float
    fee: TransferFee | None
    created_at: datetime
    updated_at: datetime


class TransferListResponse(BaseModel):
    items: list[TransferResponse]
    total: int
    page: int
    page_size: int
