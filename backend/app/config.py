from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore", env_parse_none_str="null"
    )

    database_url: str = "postgresql+asyncpg://zeni:zeni@localhost:5432/zeni"
    secret_key: str = "change-me-in-production"  # noqa: S105
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]
    signups_enabled: bool = True

    stt_provider: Literal["local", "external"] = "local"
    whisper_model_size: Literal["tiny", "base", "small", "medium", "large"] = "base"
    whisper_device: Literal["cpu", "cuda", "auto"] = "auto"

    data_retention_enabled: bool = False
    data_retention_days: int = 14
    data_retention_exempt_usernames: list[str] = []

    recurring_interval_minutes: int = 60
    data_retention_interval_hours: int = 24

    mcp_allowed_hosts: list[str] = ["127.0.0.1:*", "localhost:*", "[::1]:*"]
    mcp_allowed_origins: list[str] = ["http://127.0.0.1:*", "http://localhost:*", "http://[::1]:*"]
    mcp_resource_server_url: str = "http://localhost:8000/mcp"
    mcp_issuer_url: str = "http://localhost:8000"


settings = Settings()
