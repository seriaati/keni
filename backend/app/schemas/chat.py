from __future__ import annotations

import uuid

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    wallet_id: uuid.UUID | None = None


class ChatResponse(BaseModel):
    response: str
    data: dict | None = None
