import uuid
from datetime import datetime

from sqlmodel import Field, SQLModel, text


class APIToken(SQLModel, table=True):
    __tablename__: str = "api_tokens"

    id: uuid.UUID = Field(
        default=None,
        primary_key=True,
        sa_column_kwargs={"server_default": text("gen_random_uuid()")},
    )
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    name: str = Field(max_length=100)
    token_hash: str = Field(unique=True, index=True)
    last_used: datetime | None = Field(default=None)
    created_at: datetime = Field(default=None, sa_column_kwargs={"server_default": text("NOW()")})
    expires_at: datetime | None = Field(default=None)
