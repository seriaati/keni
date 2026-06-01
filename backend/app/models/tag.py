import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlmodel import Field, SQLModel, text


class Tag(SQLModel, table=True):
    __tablename__: str = "tags"
    __table_args__ = (
        sa.Index("ix_tags_user_id_lower_name", "user_id", sa.text("lower(name)"), unique=True),
    )

    id: uuid.UUID = Field(
        default=None,
        primary_key=True,
        sa_column_kwargs={"server_default": text("gen_random_uuid()")},
    )
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    name: str = Field(max_length=100)
    color: str | None = Field(default=None, max_length=20)
    created_at: datetime = Field(
        default=None,
        sa_column=sa.Column(
            sa.DateTime(timezone=True), server_default=text("NOW()"), nullable=False
        ),
    )
