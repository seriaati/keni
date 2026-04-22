from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING, Any, cast

import openai
from openai.types.chat import (
    ChatCompletionContentPartImageParam,
    ChatCompletionContentPartTextParam,
    ChatCompletionToolParam,
)
from openai.types.chat.chat_completion_message_tool_call import ChatCompletionMessageToolCall

from app.providers.base import (
    CHAT_SYSTEM_PROMPT,
    SYSTEM_PROMPT,
    ChatResponse,
    LLMProvider,
    ParsedTransactionOutput,
    build_chat_user_message,
    build_parse_prompt,
)
from app.providers.errors import (
    ProviderAPIError,
    ProviderAuthError,
    ProviderConnectionError,
    ProviderPermissionError,
    ProviderRateLimitError,
)

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from openai.types.chat import ChatCompletionMessageParam

    from app.providers.base import ChatContext, ChatTool

logger = logging.getLogger(__name__)

_MAX_TOOL_ROUNDS = 10


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

    async def parse_transactions(  # noqa: PLR0913
        self,
        *,
        text: str | None,
        image_base64: str | None,
        image_media_type: str | None,
        categories: list[str],
        tags: list[str],
        timezone: str = "UTC",
        custom_prompt: str | None = None,
    ) -> ParsedTransactionOutput:
        if not text and not image_base64:
            msg = "At least one of text or image must be provided"
            raise ValueError(msg)

        parts: list[ChatCompletionContentPartTextParam | ChatCompletionContentPartImageParam] = []

        if image_base64 and image_media_type:
            parts.append(
                ChatCompletionContentPartImageParam(
                    type="image_url",
                    image_url={"url": f"data:{image_media_type};base64,{image_base64}"},
                )
            )

        prompt_text = build_parse_prompt(
            text=text,
            categories=categories,
            tags=tags,
            timezone=timezone,
            custom_prompt=custom_prompt,
        )
        parts.append(ChatCompletionContentPartTextParam(type="text", text=prompt_text))

        try:
            response = await self._client.beta.chat.completions.parse(
                model=self._model,
                max_tokens=2048,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": parts},
                ],
                response_format=ParsedTransactionOutput,
            )
        except Exception as exc:
            raise _wrap_openai_error(exc) from exc

        parsed = response.choices[0].message.parsed
        if parsed is None:
            raw = response.choices[0].message.content or ""
            try:
                return ParsedTransactionOutput.model_validate(json.loads(raw))
            except Exception as exc:
                msg = "Failed to parse expense from input"
                raise ValueError(msg) from exc
        return parsed

    async def chat_with_data(
        self,
        *,
        message: str,
        context: ChatContext,
        tools: list[ChatTool],
        tool_executor: Callable[[str, dict[str, Any]], Awaitable[Any]],
    ) -> ChatResponse:
        user_message = build_chat_user_message(message=message, context=context)

        oai_tools: list[ChatCompletionToolParam] = [
            ChatCompletionToolParam(
                type="function",
                function={"name": t.name, "description": t.description, "parameters": t.parameters},
            )
            for t in tools
        ]

        messages: list[ChatCompletionMessageParam] = [
            {"role": "system", "content": CHAT_SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ]

        for _ in range(_MAX_TOOL_ROUNDS):
            try:
                response = await self._client.chat.completions.create(
                    model=self._model,
                    max_tokens=1024,
                    messages=messages,
                    tools=oai_tools,
                    tool_choice="auto",
                )
            except Exception as exc:
                raise _wrap_openai_error(exc) from exc

            choice = response.choices[0]
            assistant_msg = choice.message

            if choice.finish_reason == "stop" or not assistant_msg.tool_calls:
                logger.debug("OpenAI chat finished: stop_reason=%s", choice.finish_reason)
                return ChatResponse(response=assistant_msg.content or "")

            logger.info("OpenAI requesting %d tool call(s)", len(assistant_msg.tool_calls))

            messages.append(
                cast("ChatCompletionMessageParam", assistant_msg.model_dump(exclude_unset=False))
            )

            for tool_call in assistant_msg.tool_calls:
                if not isinstance(tool_call, ChatCompletionMessageToolCall):
                    continue
                fn_name = tool_call.function.name
                try:
                    fn_args = json.loads(tool_call.function.arguments)
                except json.JSONDecodeError:
                    fn_args = {}

                try:
                    result = await tool_executor(fn_name, fn_args)
                except Exception as exc:
                    logger.warning("Tool %s failed: %s", fn_name, exc)
                    result = {"error": str(exc)}

                messages.append(
                    {"role": "tool", "tool_call_id": tool_call.id, "content": json.dumps(result)}
                )

        try:
            response = await self._client.chat.completions.create(
                model=self._model, max_tokens=1024, messages=messages
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
