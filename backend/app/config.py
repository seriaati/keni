from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

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

    @field_validator("cors_origins", mode="before")
    @classmethod
    def __parse_cors_origins(cls, v: str | list[str]) -> list[str]:
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",")]
        return v


settings = Settings()
