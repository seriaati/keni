from __future__ import annotations

import base64
import logging

from rapidocr_onnxruntime import RapidOCR

logger = logging.getLogger(__name__)

_MIN_TEXT_LENGTH = 10
_ocr: RapidOCR | None = None


def _get_ocr() -> RapidOCR:
    global _ocr  # noqa: PLW0603
    if _ocr is None:
        _ocr = RapidOCR()
    return _ocr


def extract_text_from_base64(image_base64: str) -> str | None:
    try:
        image_bytes = base64.b64decode(image_base64)
        result, _ = _get_ocr()(image_bytes)
        if not result:
            return None
        text = "\n".join(line[1] for line in result if line and len(line) > 1)
        if len(text.strip()) < _MIN_TEXT_LENGTH:
            return None
        return text.strip()
    except Exception:
        logger.warning("OCR extraction failed", exc_info=True)
        return None
