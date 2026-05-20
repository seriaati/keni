from __future__ import annotations

from typing import TYPE_CHECKING

from app.providers.anthropic import AnthropicProvider
from app.providers.gemini import GeminiProvider
from app.providers.openai_compat import OpenAICompatibleProvider

if TYPE_CHECKING:
    from app.providers.base import LLMProvider


def get_provider(
    provider_name: str, api_key: str, model: str, base_url: str | None = None
) -> LLMProvider:
    match provider_name:
        case "anthropic":
            return AnthropicProvider(api_key=api_key, model=model, base_url=base_url)
        case "gemini":
            return GeminiProvider(api_key=api_key, model=model, base_url=base_url)
        case "openai":
            return OpenAICompatibleProvider(api_key=api_key, model=model, base_url=base_url)
        case "openrouter":
            return OpenAICompatibleProvider(
                api_key=api_key, model=model, base_url=base_url or "https://openrouter.ai/api/v1"
            )
        case _:
            msg = f"Unknown provider: {provider_name}"
            raise ValueError(msg)


def get_provider_client(
    provider_name: str, api_key: str, base_url: str | None = None
) -> LLMProvider:
    return get_provider(provider_name, api_key, model="", base_url=base_url)
