from __future__ import annotations

from pydantic import BaseModel, Field


class AIProviderUpsert(BaseModel):
    provider: str = Field(default="anthropic", pattern="^(anthropic|gemini|openai|openrouter)$")
    api_key: str = Field(min_length=1)
    model: str = Field(default="claude-opus-4-5", min_length=1)
    ocr_enabled: bool = True


class AIProviderResponse(BaseModel):
    provider: str
    model: str
    api_key_masked: str
    ocr_enabled: bool


class AIProviderModelsResponse(BaseModel):
    models: list[str]


class AIProviderValidateResponse(BaseModel):
    valid: bool
    detail: str


class AIExpenseRequest(BaseModel):
    text: str | None = Field(default=None, max_length=2000)
    image_base64: str | None = None
    image_media_type: str | None = None


class SuggestedTag(BaseModel):
    name: str
    is_new: bool


class AIExpenseResponse(BaseModel):
    amount: float
    currency: str
    category_name: str
    is_new_category: bool
    description: str
    date: str
    ai_context: str
    suggested_tags: list[SuggestedTag]


class VoiceExpenseResponse(BaseModel):
    transcript: str
    amount: float
    currency: str
    category_name: str
    is_new_category: bool
    description: str
    date: str
    ai_context: str
    suggested_tags: list[SuggestedTag]
