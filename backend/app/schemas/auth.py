import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class SignupRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8)
    display_name: str = Field(min_length=1, max_length=100)


class LoginRequest(BaseModel):
    username: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"  # noqa: S105


class UserResponse(BaseModel):
    id: uuid.UUID
    username: str
    display_name: str
    is_admin: bool
    created_at: datetime
    timezone: str | None = None
    custom_ai_prompt: str | None = None
    global_currency: str | None = None
    language: str | None = None


class UpdateProfileRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=100)
    password: str | None = Field(default=None, min_length=8)
    timezone: str | None = Field(default=None, max_length=50)
    custom_ai_prompt: str | None = Field(default=None, max_length=500)
    global_currency: str | None = Field(default=None, max_length=10)
    language: str | None = Field(default=None, max_length=10)


class AdminSettingsRequest(BaseModel):
    signups_enabled: bool


class AdminSettingsResponse(BaseModel):
    signups_enabled: bool
