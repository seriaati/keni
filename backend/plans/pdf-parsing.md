# PDF Parsing Support

## Summary

Add PDF document parsing to the expense AI endpoint. Users upload a PDF (receipt, invoice, statement) and the system extracts text from all pages, then feeds it to the LLM for expense parsing — same as the existing image/text flow.

## Requirements

- Text-based PDFs only (digital invoices/receipts, not scanned images)
- Multi-page support (extract text from all pages, concatenated)
- Reuse existing `POST /ai` endpoint; rename `image` field → `file`
- Auto-detect PDF vs image by content type
- No new DB models or migrations needed

## Architecture

### Current Flow

```
POST /ai (text + image) → read bytes → base64 encode → OCR? → LLM provider
```

### New Flow

```
POST /ai (text + file) → read bytes → detect content type
  ├─ image/* → base64 encode → OCR? → LLM provider (unchanged)
  └─ application/pdf → extract text from all pages → LLM provider (text-only)
```

PDF text extraction happens **before** the LLM call. The extracted text replaces/augments the `text` parameter — the LLM never sees the raw PDF. This is the same pattern used by OCR today: extract text locally, then send text to the LLM.

## Implementation Plan

### 1. Add `pymupdf` dependency

**File**: `pyproject.toml`

Add `pymupdf>=1.25.0` to `dependencies`. This is a lightweight, pure-Python-compatible PDF text extraction library (formerly `fitz`). It handles multi-page text extraction with no external system dependencies.

Alternative considered: `pypdf` — also viable but `pymupdf` has better text extraction quality and layout preservation.

### 2. Create PDF text extraction service

**File**: `app/services/pdf.py` (new)

```python
def extract_text_from_pdf(pdf_bytes: bytes) -> str | None
```

- Takes raw PDF bytes
- Opens with `pymupdf`, iterates all pages
- Concatenates extracted text with page separators
- Returns `None` if no meaningful text extracted (same pattern as OCR)
- Logs warning on failure (same pattern as `app/services/ocr.py`)

### 3. Update expense router — rename `image` → `file`, add PDF branching

**File**: `app/routers/expenses.py`

In `create_expense_ai`:
- Rename `image: UploadFile` parameter to `file: UploadFile`
- After reading bytes, check `file.content_type`:
  - If `application/pdf` → call `extract_text_from_pdf(raw)`, prepend to `text`, set `image_base64 = None`
  - If `image/*` → existing base64 encode flow (unchanged)
  - Otherwise → reject with 422
- Add content-type validation: accept `image/*` and `application/pdf` only

### 4. Update `parse_expense_with_ai` signature doc (optional)

**File**: `app/services/ai_expense.py`

No code changes needed — the service already accepts `text` + optional `image_base64`. For PDFs, the router passes extracted text as `text` and `image_base64=None`. The existing flow handles this correctly.

### 5. Run linting/formatting

```sh
uv run ruff format .
uv run ruff check --fix .
uv run pyright
```

## Files Changed

| File | Change |
|------|--------|
| `pyproject.toml` | Add `pymupdf` dependency |
| `app/services/pdf.py` | **New** — `extract_text_from_pdf()` |
| `app/routers/expenses.py` | Rename `image` → `file`, add PDF content-type branching |

## Not In Scope

- Scanned/image-based PDF support (would require rendering PDF pages to images, then OCR)
- Per-page expense extraction (returning multiple expenses from one PDF)
- PDF-specific response schema changes
- Frontend changes (tracked separately)
