from __future__ import annotations

import uuid

import sqlalchemy as sa
from sqlmodel import Field, SQLModel


class OAuthClient(SQLModel, table=True):
    __tablename__: str = "oauth_clients"

    client_id: str = Field(primary_key=True)
    client_data: str = Field(sa_column=sa.Column(sa.Text, nullable=False))


class OAuthPendingRequest(SQLModel, table=True):
    __tablename__: str = "oauth_pending_requests"

    request_id: str = Field(primary_key=True)
    client_id: str
    redirect_uri: str
    redirect_uri_provided_explicitly: bool
    code_challenge: str
    state: str | None = Field(default=None, nullable=True)
    scopes: str = Field(sa_column=sa.Column(sa.Text, nullable=False))
    resource: str | None = Field(default=None, nullable=True)
    created_at: float


class OAuthAuthCode(SQLModel, table=True):
    __tablename__: str = "oauth_auth_codes"

    code: str = Field(primary_key=True)
    client_id: str
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    scopes: str = Field(sa_column=sa.Column(sa.Text, nullable=False))
    expires_at: float
    code_challenge: str
    redirect_uri: str
    redirect_uri_provided_explicitly: bool
    resource: str | None = Field(default=None, nullable=True)


class OAuthRefreshToken(SQLModel, table=True):
    __tablename__: str = "oauth_refresh_tokens"

    token: str = Field(primary_key=True)
    client_id: str
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    scopes: str = Field(sa_column=sa.Column(sa.Text, nullable=False))
