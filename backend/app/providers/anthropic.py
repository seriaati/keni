from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Literal, cast, get_args

import anthropic
from anthropic.types import Base64ImageSourceParam, ImageBlockParam, TextBlockParam

from app.providers.base import ChatResponse, LLMProvider, ParsedExpense

if TYPE_CHECKING:
    from app.providers.base import ChatContext

SYSTEM_PROMPT = """\
You are an expense parsing assistant. Extract expense information from the user's input \
(text, image, or both) and return a JSON object with exactly these fields:

{
  "amount": <number, required>,
  "currency": <3-letter ISO currency code, e.g. "USD", required>,
  "category_name": <string matching one of the provided categories, required>,
  "description": <short description of the expense, required>,
  "date": <ISO 8601 date string YYYY-MM-DD, use today if not specified, required>,
  "ai_context": <brief summary of what you extracted and why you chose the category, required>
}

Rules:
- amount must be a positive number
- category_name must exactly match one of the categories provided by the user; \
if nothing fits, use "Others"
- description should be concise (max 100 chars)
- Return ONLY the JSON object, no markdown, no explanation outside the JSON
"""

CHAT_SYSTEM_PROMPT = """\
You are a personal finance assistant helping a user understand their spending habits. \
You have access to a summary of the user's expense data provided in the user message.

Guidelines:
- Be concise, friendly, and insightful
- Focus on actionable spending insights and tips when relevant
- When the user asks for numbers, reference the data provided
- If the data doesn't contain enough information to answer, say so honestly
- Do not make up expense data that isn't in the context
- Respond in plain text; do not use markdown formatting
"""

_SupportedMediaType = Literal["image/jpeg", "image/png", "image/gif", "image/webp"]
_SUPPORTED_MEDIA_TYPES: frozenset[str] = frozenset(get_args(_SupportedMediaType))


class AnthropicProvider(LLMProvider):
    def __init__(self, api_key: str, model: str) -> None:
        self._client = anthropic.AsyncAnthropic(api_key=api_key)
        self._model = model

    async def parse_expense(
        self,
        *,
        text: str | None,
        image_base64: str | None,
        image_media_type: str | None,
        categories: list[str],
    ) -> ParsedExpense:
        if not text and not image_base64:
            msg = "At least one of text or image must be provided"
            raise ValueError(msg)

        today = datetime.now(UTC).strftime("%Y-%m-%d")
        category_list = ", ".join(categories) if categories else "Others"

        parts: list[TextBlockParam | ImageBlockParam] = []

        if image_base64 and image_media_type:
            safe_media_type = cast(
                "_SupportedMediaType",
                image_media_type if image_media_type in _SUPPORTED_MEDIA_TYPES else "image/jpeg",
            )
            parts.append(
                ImageBlockParam(
                    type="image",
                    source=Base64ImageSourceParam(
                        type="base64", media_type=safe_media_type, data=image_base64
                    ),
                )
            )

        prompt_text = f"Today's date: {today}\nAvailable categories: {category_list}\n\n"
        if text:
            prompt_text += f"User input: {text}"
        else:
            prompt_text += "Please extract the expense from the image above."

        parts.append(TextBlockParam(type="text", text=prompt_text))

        response = await self._client.messages.create(
            model=self._model,
            max_tokens=512,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": parts}],
        )

        raw = response.content[0]
        if raw.type != "text":
            msg = "Unexpected response type from Anthropic"
            raise ValueError(msg)

        data = json.loads(raw.text)

        return ParsedExpense(
            amount=float(data["amount"]),
            currency=str(data["currency"]).upper(),
            category_name=str(data["category_name"]),
            description=str(data["description"]),
            date=str(data["date"]),
            ai_context=str(data["ai_context"]),
        )

    async def chat_with_data(self, *, message: str, context: ChatContext) -> ChatResponse:
        by_category_lines = "\n".join(
            f"  - {row['category_name']}: {row['total']:.2f} ({row['count']} expenses)"
            for row in context.by_category
        )
        by_month_lines = "\n".join(
            f"  - {row['period']}: {row['total']:.2f} ({row['count']} expenses)"
            for row in context.by_month
        )
        recent_lines = "\n".join(
            f"  - {row['date']} | {row['category']} | {row['amount']:.2f} | {row['description']}"
            for row in context.recent_expenses
        )
        wallets_line = ", ".join(context.wallet_names) if context.wallet_names else "all wallets"

        data_context = f"""\
Expense data summary ({wallets_line}):
- Date range: {context.date_range}
- Total expenses: {context.total_expenses}
- Total amount spent: {context.total_amount:.2f} {context.currency}

Spending by category:
{by_category_lines or "  (no data)"}

Spending by month:
{by_month_lines or "  (no data)"}

Recent expenses (up to 10):
{recent_lines or "  (no data)"}

User question: {message}"""

        response = await self._client.messages.create(
            model=self._model,
            max_tokens=1024,
            system=CHAT_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": data_context}],
        )

        raw = response.content[0]
        if raw.type != "text":
            msg = "Unexpected response type from Anthropic"
            raise ValueError(msg)

        return ChatResponse(response=raw.text)
