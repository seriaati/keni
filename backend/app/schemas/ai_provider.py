from __future__ import annotations

import uuid

from pydantic import BaseModel, Field


_KIND_PATTERN = "^(anthropic|gemini|openai|openrouter|openai_compatible)$"


class AIConnectionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    kind: str = Field(pattern=_KIND_PATTERN)
    base_url: str | None = Field(default=None, max_length=500)
    api_key: str | None = None


class AIConnectionUpdate(BaseModel):
    """Omitted fields are left unchanged; ``api_key: ""`` clears the stored key."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    kind: str | None = Field(default=None, pattern=_KIND_PATTERN)
    base_url: str | None = Field(default=None, max_length=500)
    api_key: str | None = None


class AIConnectionTest(BaseModel):
    kind: str = Field(pattern=_KIND_PATTERN)
    base_url: str | None = Field(default=None, max_length=500)
    api_key: str | None = None
    # When editing a saved connection without retyping the key, use its stored key.
    connection_id: uuid.UUID | None = None


class AIConnectionResponse(BaseModel):
    id: uuid.UUID
    name: str
    kind: str
    base_url: str | None
    # None for shared connections viewed by non-admins, or when no key is stored.
    api_key_masked: str | None
    has_api_key: bool
    shared: bool


class AIProviderUpsert(BaseModel):
    connection_id: uuid.UUID
    model: str = Field(min_length=1, max_length=100)
    chat_connection_id: uuid.UUID | None = None
    chat_model: str | None = Field(default=None, max_length=100)
    attachment_connection_id: uuid.UUID | None = None
    attachment_model: str | None = Field(default=None, max_length=100)
    ocr_enabled: bool = True


class AIProviderResponse(BaseModel):
    connection_id: uuid.UUID | None
    model: str
    chat_connection_id: uuid.UUID | None
    chat_model: str | None
    attachment_connection_id: uuid.UUID | None
    attachment_model: str | None
    ocr_enabled: bool


class AIProviderModelsResponse(BaseModel):
    models: list[str]


class AIExpenseRequest(BaseModel):
    text: str | None = Field(default=None, max_length=2000)
    image_base64: str | None = None
    image_media_type: str | None = None


class SuggestedTag(BaseModel):
    name: str
    is_new: bool


class AITransactionItem(BaseModel):
    amount: float
    category_name: str
    is_new_category: bool
    description: str
    date: str
    type: str
    suggested_tags: list[SuggestedTag]
    suggested_icon: str | None = None


class AITransactionGroupInfo(BaseModel):
    description: str
    amount: float
    category_name: str
    is_new_category: bool
    date: str
    type: str
    suggested_tags: list[SuggestedTag]
    suggested_icon: str | None = None


class AIRecurringItem(BaseModel):
    amount: float
    category_name: str
    is_new_category: bool
    description: str
    frequency: str
    next_due: str
    type: str
    suggested_tags: list[SuggestedTag]
    suggested_icon: str | None = None


class AITransactionsResponse(BaseModel):
    result_type: str
    expenses: list[AITransactionItem]
    group: AITransactionGroupInfo | None
    recurring: AIRecurringItem | None = None
    suggested_wallet_id: str | None = None


class VoiceTransactionsResponse(BaseModel):
    transcript: str
    result_type: str
    expenses: list[AITransactionItem]
    group: AITransactionGroupInfo | None
    recurring: AIRecurringItem | None = None
    suggested_wallet_id: str | None = None


class AICategorizeResponse(BaseModel):
    category_name: str
    is_new_category: bool
    suggested_icon: str | None
    suggested_tags: list[SuggestedTag]
