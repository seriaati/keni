import uuid
from datetime import datetime

from sqlmodel import Field, SQLModel, text


class Tag(SQLModel, table=True):
    __tablename__: str = "tags"

    id: uuid.UUID = Field(
        default=None,
        primary_key=True,
        sa_column_kwargs={"server_default": text("gen_random_uuid()")},
    )
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    name: str = Field(max_length=100)
    color: str | None = Field(default=None, max_length=20)
    created_at: datetime = Field(default=None, sa_column_kwargs={"server_default": text("NOW()")})
