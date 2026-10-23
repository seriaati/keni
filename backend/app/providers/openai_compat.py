from __future__ import annotations

import json
import logging
import time
from typing import TYPE_CHECKING, Any, Literal, cast

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

    from openai.types import CompletionUsage
    from openai.types.chat import ChatCompletionMessageParam

    from app.providers.base import ChatContext, ChatTool

logger = logging.getLogger(__name__)

_MAX_TOOL_ROUNDS = 10

_ParseMode = Literal["schema", "json_object", "prompt"]
_PARSE_MODES: tuple[_ParseMode, ...] = ("schema", "json_object", "prompt")
# First parse mode that worked per (base_url, model), so later requests skip known failures.
_parse_mode_cache: dict[tuple[str, str], _ParseMode] = {}
# Errors a server returns when it doesn't understand a response_format.
_UNSUPPORTED_FORMAT_ERRORS = (
    openai.BadRequestError,
    openai.UnprocessableEntityError,
    openai.NotFoundError,
)


def _extract_json(raw: str) -> Any:
    """Parse JSON from a model reply that may be wrapped in code fences or prose."""
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else ""
        text = text.rsplit("```", 1)[0]
    first, last = text.find("{"), text.rfind("}")
    if first != -1 and last > first:
        text = text[first : last + 1]
    return json.loads(text)


def _validate_output(raw: str | None) -> ParsedTransactionOutput:
    try:
        return ParsedTransactionOutput.model_validate(_extract_json(raw or ""))
    except Exception as exc:
        msg = "Failed to parse expense from input"
        raise ValueError(msg) from exc


def _wrap_openai_error(exc: Exception) -> Exception:
    if isinstance(exc, openai.AuthenticationError):
        return ProviderAuthError(exc.message or str(exc))
    if isinstance(exc, openai.PermissionDeniedError):
        return ProviderPermissionError(exc.message or str(exc))
    if isinstance(exc, openai.RateLimitError):
        return ProviderRateLimitError(exc.message or str(exc))
    if isinstance(exc, openai.APIConnectionError):
        return ProviderConnectionError(str(exc))
    if isinstance(exc, openai.APIError):
        return ProviderAPIError(exc.message or str(exc))
    return exc


class OpenAICompatibleProvider(LLMProvider):
    def __init__(self, api_key: str, model: str, base_url: str | None = None) -> None:
        self._client = openai.AsyncOpenAI(api_key=api_key, base_url=base_url)
        self._model = model

    async def parse_transactions(  # ruff: ignore[too-many-arguments]
        self,
        *,
        text: str | None,
        images: list[tuple[str, str]],
        categories: list[str],
        tags: list[str],
        wallets: list[tuple[str, str]] | None = None,
        timezone: str = "UTC",
        custom_prompt: str | None = None,
        examples: list[tuple[str, str, str]] | None = None,
    ) -> ParsedTransactionOutput:
        if not text and not images:
            msg = "At least one of text or image must be provided"
            raise ValueError(msg)

        parts: list[ChatCompletionContentPartTextParam | ChatCompletionContentPartImageParam] = []

        for img_b64, img_media_type in images:
            parts.append(
                ChatCompletionContentPartImageParam(
                    type="image_url", image_url={"url": f"data:{img_media_type};base64,{img_b64}"}
                )
            )

        prompt_text = build_parse_prompt(
            text=text,
            categories=categories,
            tags=tags,
            wallets=wallets,
            timezone=timezone,
            custom_prompt=custom_prompt,
            examples=examples,
        )
        parts.append(ChatCompletionContentPartTextParam(type="text", text=prompt_text))

        cache_key = (str(self._client.base_url), self._model)
        cached_mode = _parse_mode_cache.get(cache_key)
        modes = _PARSE_MODES[_PARSE_MODES.index(cached_mode) :] if cached_mode else _PARSE_MODES

        start = time.perf_counter()
        for i, mode in enumerate(modes):
            try:
                output, usage = await self._parse_with_mode(mode, parts)
            except _UNSUPPORTED_FORMAT_ERRORS as exc:
                if i == len(modes) - 1:
                    raise _wrap_openai_error(exc) from exc
                logger.info(
                    "OpenAI parse: mode=%s rejected by %s model=%s (%s); falling back",
                    mode,
                    cache_key[0],
                    self._model,
                    exc.message,
                )
                continue
            except ValueError:
                raise
            except Exception as exc:
                raise _wrap_openai_error(exc) from exc

            _parse_mode_cache[cache_key] = mode
            logger.info(
                "OpenAI parse: model=%s mode=%s elapsed_ms=%.0f input=%s output=%s reasoning=%s "
                "cached=%s",
                self._model,
                mode,
                (time.perf_counter() - start) * 1000,
                usage and usage.prompt_tokens,
                usage and usage.completion_tokens,
                usage
                and usage.completion_tokens_details
                and usage.completion_tokens_details.reasoning_tokens,
                usage
                and usage.prompt_tokens_details
                and usage.prompt_tokens_details.cached_tokens,
            )
            return output

        msg = "Failed to parse expense from input"
        raise ValueError(msg)

    async def _parse_with_mode(
        self,
        mode: _ParseMode,
        parts: list[ChatCompletionContentPartTextParam | ChatCompletionContentPartImageParam],
    ) -> tuple[ParsedTransactionOutput, CompletionUsage | None]:
        if mode == "schema":
            response = await self._client.beta.chat.completions.parse(
                model=self._model,
                max_tokens=4096,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": parts},
                ],
                response_format=ParsedTransactionOutput,
            )
            message = response.choices[0].message
            if message.parsed is not None:
                return message.parsed, response.usage
            return _validate_output(message.content), response.usage

        # Servers without json_schema support: describe the schema in the prompt instead.
        schema_part = ChatCompletionContentPartTextParam(
            type="text",
            text=(
                "Respond with a single JSON object only, no prose or code fences, "
                "matching this JSON schema:\n"
                + json.dumps(ParsedTransactionOutput.model_json_schema())
            ),
        )
        messages: list[ChatCompletionMessageParam] = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": [*parts, schema_part]},
        ]
        if mode == "json_object":
            completion = await self._client.chat.completions.create(
                model=self._model,
                max_tokens=4096,
                messages=messages,
                response_format={"type": "json_object"},
            )
        else:
            completion = await self._client.chat.completions.create(
                model=self._model, max_tokens=4096, messages=messages
            )
        return _validate_output(completion.choices[0].message.content), completion.usage

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
