import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class TokenCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    expires_at: datetime | None = None


class TokenResponse(BaseModel):
    id: uuid.UUID
    name: str
    last_used: datetime | None
    created_at: datetime
    expires_at: datetime | None


class TokenCreateResponse(TokenResponse):
    token: str
