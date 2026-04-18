import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlmodel import Field, SQLModel, text


class User(SQLModel, table=True):
    __tablename__: str = "users"

    id: uuid.UUID = Field(
        default=None,
        primary_key=True,
        sa_column_kwargs={"server_default": text("gen_random_uuid()")},
    )
    username: str = Field(unique=True, index=True, max_length=50)
    password_hash: str
    display_name: str = Field(max_length=100)
    is_admin: bool = Field(default=False)
    timezone: str | None = Field(default=None, max_length=50)
    custom_ai_prompt: str | None = Field(default=None, max_length=500)
    created_at: datetime = Field(
        default=None,
        sa_column=sa.Column(
            sa.DateTime(timezone=True), server_default=text("NOW()"), nullable=False
        ),
    )
