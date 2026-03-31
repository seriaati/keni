from __future__ import annotations

import tempfile
from typing import Any

from fastapi import HTTPException, status

from app.providers.stt.base import STTProvider

try:
    from faster_whisper import WhisperModel as _WhisperModel

    _FASTER_WHISPER_AVAILABLE = True
except ImportError:
    _FASTER_WHISPER_AVAILABLE = False
    _WhisperModel = None

try:
    import torch as _torch  # pyright: ignore[reportMissingImports]

    _TORCH_AVAILABLE = True
except ImportError:
    _TORCH_AVAILABLE = False
    _torch = None

_EXTENSION_MAP: dict[str, str] = {
    "audio/webm": ".webm",
    "audio/wav": ".wav",
    "audio/wave": ".wav",
    "audio/x-wav": ".wav",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/ogg": ".ogg",
}


class LocalSTTProvider(STTProvider):
    def __init__(self, model_size: str = "base", device: str = "auto") -> None:
        self._model_size = model_size
        self._device = device
        self._model: Any = None

    def _load_model(self) -> None:
        if self._model is not None:
            return
        if not _FASTER_WHISPER_AVAILABLE:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    "Local STT is not available. Install the voice extras: uv sync --extra voice"
                ),
            )

        device = self._device
        if device == "auto":
            device = "cuda" if (_TORCH_AVAILABLE and _torch.cuda.is_available()) else "cpu"  # pyright: ignore[reportOptionalMemberAccess]

        compute_type = "float16" if device == "cuda" else "int8"
        self._model = _WhisperModel(self._model_size, device=device, compute_type=compute_type)  # pyright: ignore[reportOptionalCall]

    async def transcribe(self, audio_bytes: bytes, content_type: str) -> str:
        self._load_model()

        ext = _EXTENSION_MAP.get(content_type, ".webm")

        with tempfile.NamedTemporaryFile(suffix=ext, delete=True) as tmp:
            tmp.write(audio_bytes)
            tmp.flush()
            segments, _ = self._model.transcribe(tmp.name, beam_size=5)
            transcript = " ".join(seg.text.strip() for seg in segments).strip()

        if not transcript:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Could not transcribe audio. The recording may be silent or unclear.",
            )

        return transcript
