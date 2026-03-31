from __future__ import annotations

from typing import TYPE_CHECKING

from app.config import settings
from app.providers.stt.external import ExternalSTTProvider
from app.providers.stt.local import LocalSTTProvider

if TYPE_CHECKING:
    from app.providers.stt.base import STTProvider

_stt_instance: STTProvider | None = None


def get_stt_provider() -> STTProvider:
    global _stt_instance  # noqa: PLW0603
    if _stt_instance is not None:
        return _stt_instance

    if settings.stt_provider == "local":
        _stt_instance = LocalSTTProvider(
            model_size=settings.whisper_model_size, device=settings.whisper_device
        )
    else:
        _stt_instance = ExternalSTTProvider(provider=settings.stt_provider, api_key="")

    return _stt_instance


async def transcribe_audio(audio_bytes: bytes, content_type: str) -> str:
    provider = get_stt_provider()
    return await provider.transcribe(audio_bytes, content_type)
