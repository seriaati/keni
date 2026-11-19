from __future__ import annotations

from typing import TYPE_CHECKING
from urllib.parse import urlsplit

from app.config import settings
from app.providers.anthropic import AnthropicProvider
from app.providers.errors import ProviderConfigError
from app.providers.gemini import GeminiProvider
from app.providers.openai_compat import OpenAICompatibleProvider

if TYPE_CHECKING:
    from app.providers.base import LLMProvider

# The OpenAI SDK needs some key; local servers like Ollama ignore it.
_NO_KEY_PLACEHOLDER = "not-needed"


def _origin(url: str) -> tuple[str, str, int] | None:
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError:
        return None
    if parts.scheme not in {"http", "https"} or not parts.hostname:
        return None
    return parts.scheme, parts.hostname.lower(), port or (443 if parts.scheme == "https" else 80)


def check_base_url(base_url: str | None) -> None:
    origin = _origin(base_url or "")
    allowlist = settings.ai_base_url_allowlist
    if origin is None or not ("*" in allowlist or origin in {_origin(u) for u in allowlist}):
        msg = "Base URL is invalid or not allowed on this server"
        raise ProviderConfigError(msg)


def get_provider(
    provider_name: str, api_key: str, model: str, base_url: str | None = None
) -> LLMProvider:
    match provider_name:
        case "anthropic":
            return AnthropicProvider(api_key=api_key, model=model)
        case "gemini":
            return GeminiProvider(api_key=api_key, model=model)
        case "openai":
            return OpenAICompatibleProvider(api_key=api_key, model=model)
        case "openrouter":
            return OpenAICompatibleProvider(
                api_key=api_key, model=model, base_url="https://openrouter.ai/api/v1"
            )
        case "openai_compatible":
            # Re-checked on every use so tightening the allowlist also blocks saved URLs.
            check_base_url(base_url)
            return OpenAICompatibleProvider(
                api_key=api_key or _NO_KEY_PLACEHOLDER, model=model, base_url=base_url, custom=True
            )
        case _:
            msg = f"Unknown provider: {provider_name}"
            raise ValueError(msg)


def get_provider_client(
    provider_name: str, api_key: str, base_url: str | None = None
) -> LLMProvider:
    return get_provider(provider_name, api_key, model="", base_url=base_url)
