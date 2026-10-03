import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.color import COLOR_PATTERN


class TagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    color: str | None = Field(default=None, max_length=20, pattern=COLOR_PATTERN)


class TagUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    color: str | None = Field(default=None, max_length=20, pattern=COLOR_PATTERN)


class TagResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    color: str | None
    created_at: datetime
