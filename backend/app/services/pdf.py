from __future__ import annotations

import logging

import fitz

logger = logging.getLogger(__name__)

_MIN_TEXT_LENGTH = 10


def extract_text_from_pdf(pdf_bytes: bytes) -> str | None:
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        parts: list[str] = []
        for page in doc:
            text: str = str(page.get_text())
            if text.strip():
                parts.append(text.strip())
        doc.close()
        if not parts:
            return None
        combined = "\n\n---\n\n".join(parts)
        if len(combined.strip()) < _MIN_TEXT_LENGTH:
            return None
        return combined.strip()
    except Exception:
        logger.warning("PDF text extraction failed", exc_info=True)
        return None
