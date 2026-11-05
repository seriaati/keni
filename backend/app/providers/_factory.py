from __future__ import annotations

from typing import TYPE_CHECKING

from app.providers.anthropic import AnthropicProvider
from app.providers.gemini import GeminiProvider
from app.providers.openai_compat import OpenAICompatibleProvider

if TYPE_CHECKING:
    from app.providers.base import LLMProvider

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
# The OpenAI SDK refuses an empty key; local servers (Ollama, LM Studio) ignore it.
_NO_KEY_PLACEHOLDER = "not-needed"


def get_provider(
    provider_name: str, api_key: str | None, model: str, base_url: str | None = None
) -> LLMProvider:
    match provider_name:
        case "anthropic":
            return AnthropicProvider(api_key=api_key or "", model=model)
        case "gemini":
            return GeminiProvider(api_key=api_key or "", model=model)
        case "openai":
            return OpenAICompatibleProvider(api_key=api_key or "", model=model, base_url=base_url)
        case "openrouter":
            return OpenAICompatibleProvider(
                api_key=api_key or "", model=model, base_url=base_url or OPENROUTER_BASE_URL
            )
        case "openai_compatible":
            if not base_url:
                msg = "A base URL is required for custom OpenAI-compatible providers"
                raise ValueError(msg)
            return OpenAICompatibleProvider(
                api_key=api_key or _NO_KEY_PLACEHOLDER, model=model, base_url=base_url
            )
        case _:
            msg = f"Unknown provider: {provider_name}"
            raise ValueError(msg)


def get_provider_client(
    provider_name: str, api_key: str | None, base_url: str | None = None
) -> LLMProvider:
    return get_provider(provider_name, api_key, model="", base_url=base_url)
