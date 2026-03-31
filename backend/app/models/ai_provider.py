import uuid
from datetime import datetime

from sqlmodel import Field, SQLModel, text


class AIProvider(SQLModel, table=True):
    __tablename__: str = "ai_providers"

    id: uuid.UUID = Field(
        default=None,
        primary_key=True,
        sa_column_kwargs={"server_default": text("gen_random_uuid()")},
    )
    user_id: uuid.UUID = Field(foreign_key="users.id", unique=True, index=True)
    provider: str = Field(default="anthropic", max_length=50)
    api_key_encrypted: str
    model: str = Field(default="claude-opus-4-5", max_length=100)
    created_at: datetime = Field(default=None, sa_column_kwargs={"server_default": text("NOW()")})
    updated_at: datetime = Field(default=None, sa_column_kwargs={"server_default": text("NOW()")})
