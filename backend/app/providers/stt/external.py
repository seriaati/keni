from __future__ import annotations

from fastapi import HTTPException, status

from app.providers.stt.base import STTProvider


class ExternalSTTProvider(STTProvider):
    """Placeholder for future BYOK external STT providers (e.g. OpenAI Whisper API)."""

    def __init__(self, provider: str, api_key: str) -> None:
        self._provider = provider
        self._api_key = api_key

    async def transcribe(self, audio_bytes: bytes, content_type: str) -> str:  # noqa: ARG002
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail=f"External STT provider '{self._provider}' is not yet implemented.",
        )
