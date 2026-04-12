from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import TYPE_CHECKING

import openai
from openai.types.chat import (
    ChatCompletionContentPartImageParam,
    ChatCompletionContentPartTextParam,
)

from app.providers.base import (
    CHAT_SYSTEM_PROMPT,
    SYSTEM_PROMPT,
    ChatResponse,
    LLMProvider,
    ParsedExpense,
)
from app.providers.errors import (
    ProviderAPIError,
    ProviderAuthError,
    ProviderConnectionError,
    ProviderPermissionError,
    ProviderRateLimitError,
)

if TYPE_CHECKING:
    from app.providers.base import ChatContext


def _wrap_openai_error(exc: Exception) -> Exception:
    if isinstance(exc, openai.AuthenticationError):
        return ProviderAuthError(str(exc))
    if isinstance(exc, openai.PermissionDeniedError):
        return ProviderPermissionError(str(exc))
    if isinstance(exc, openai.RateLimitError):
        return ProviderRateLimitError(str(exc))
    if isinstance(exc, openai.APIConnectionError):
        return ProviderConnectionError(str(exc))
    if isinstance(exc, openai.APIError):
        return ProviderAPIError(str(exc))
    return exc


class OpenAICompatibleProvider(LLMProvider):
    def __init__(self, api_key: str, model: str, base_url: str | None = None) -> None:
        self._client = openai.AsyncOpenAI(api_key=api_key, base_url=base_url)
        self._model = model

    async def parse_expense(
        self,
        *,
        text: str | None,
        image_base64: str | None,
        image_media_type: str | None,
        categories: list[str],
        tags: list[str],
    ) -> ParsedExpense:
        if not text and not image_base64:
            msg = "At least one of text or image must be provided"
            raise ValueError(msg)

        today = datetime.now(UTC).strftime("%Y-%m-%d")
        category_list = ", ".join(categories) if categories else "Others"
        tag_list = ", ".join(tags) if tags else ""

        parts: list[ChatCompletionContentPartTextParam | ChatCompletionContentPartImageParam] = []

        if image_base64 and image_media_type:
            parts.append(
                ChatCompletionContentPartImageParam(
                    type="image_url",
                    image_url={"url": f"data:{image_media_type};base64,{image_base64}"},
                )
            )

        prompt_text = f"Today's date: {today}\nAvailable categories: {category_list}\n"
        if tag_list:
            prompt_text += f"Available tags: {tag_list}\n"
        prompt_text += "\n"

        if text:
            prompt_text += f"User input: {text}"
        else:
            prompt_text += "Please extract the expense from the image above."

        parts.append(ChatCompletionContentPartTextParam(type="text", text=prompt_text))

        try:
            response = await self._client.beta.chat.completions.parse(
                model=self._model,
                max_tokens=1024,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": parts},
                ],
                response_format=ParsedExpense,
            )
        except Exception as exc:
            raise _wrap_openai_error(exc) from exc

        parsed = response.choices[0].message.parsed
        if parsed is None:
            raw = response.choices[0].message.content or ""
            try:
                return ParsedExpense.model_validate(json.loads(raw))
            except Exception as exc:
                msg = "Failed to parse expense from input"
                raise ValueError(msg) from exc
        return parsed

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

        try:
            response = await self._client.chat.completions.create(
                model=self._model,
                max_tokens=1024,
                messages=[
                    {"role": "system", "content": CHAT_SYSTEM_PROMPT},
                    {"role": "user", "content": data_context},
                ],
            )
        except Exception as exc:
            raise _wrap_openai_error(exc) from exc

        return ChatResponse(response=response.choices[0].message.content or "")

    async def list_models(self) -> list[str]:
        try:
            page = await self._client.models.list()
        except Exception as exc:
            raise _wrap_openai_error(exc) from exc
        else:
            return [m.id for m in page.data]

    async def validate_key(self) -> bool:
        try:
            await self.list_models()
        except ProviderAuthError:
            return False
        else:
            return True
