from pydantic import BaseModel, Field


class AIProviderUpsert(BaseModel):
    provider: str = Field(default="anthropic", pattern="^anthropic$")
    api_key: str = Field(min_length=1)
    model: str = Field(default="claude-opus-4-5", min_length=1)


class AIProviderResponse(BaseModel):
    provider: str
    model: str
    api_key_masked: str


class AIExpenseRequest(BaseModel):
    text: str | None = Field(default=None, max_length=2000)
    image_base64: str | None = None
    image_media_type: str | None = None


class AIExpenseResponse(BaseModel):
    amount: float
    currency: str
    category_name: str
    description: str
    date: str
    ai_context: str


class VoiceExpenseResponse(BaseModel):
    transcript: str
    amount: float
    currency: str
    category_name: str
    description: str
    date: str
    ai_context: str
