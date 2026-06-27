from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING, Any, Literal, cast, get_args

import anthropic
from anthropic.types import (
    Base64ImageSourceParam,
    ImageBlockParam,
    TextBlockParam,
    ToolParam,
    ToolResultBlockParam,
    ToolUseBlock,
)

from app.providers.base import (
    CHAT_SYSTEM_PROMPT,
    ICON_SEARCH_SYSTEM_PROMPT,
    ICON_SEARCH_TOOL,
    SYSTEM_PROMPT,
    ChatResponse,
    LLMProvider,
    ParsedTransactionOutput,
    build_chat_user_message,
    build_parse_prompt,
    search_icons,
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

    from anthropic.types import MessageParam

    from app.providers.base import ChatContext, ChatTool

logger = logging.getLogger(__name__)

_MAX_TOOL_ROUNDS = 10

_SupportedMediaType = Literal["image/jpeg", "image/png", "image/gif", "image/webp"]
_SUPPORTED_MEDIA_TYPES: frozenset[str] = frozenset(get_args(_SupportedMediaType))


def _wrap_anthropic_error(exc: Exception) -> Exception:
    if isinstance(exc, anthropic.AuthenticationError):
        return ProviderAuthError(exc.message or str(exc))
    if isinstance(exc, anthropic.PermissionDeniedError):
        return ProviderPermissionError(exc.message or str(exc))
    if isinstance(exc, anthropic.RateLimitError):
        return ProviderRateLimitError(exc.message or str(exc))
    if isinstance(exc, anthropic.APIConnectionError):
        return ProviderConnectionError(str(exc))
    if isinstance(exc, anthropic.APIError):
        return ProviderAPIError(exc.message or str(exc))
    return exc


class AnthropicProvider(LLMProvider):
    def __init__(self, api_key: str, model: str) -> None:
        self._client = anthropic.AsyncAnthropic(api_key=api_key)
        self._model = model

    async def _fetch_icon_suggestions(
        self, *, text: str | None, images: list[tuple[str, str]], categories: list[str]
    ) -> dict[str, list[str]]:
        icon_tool = ToolParam(
            name=ICON_SEARCH_TOOL.name,
            description=ICON_SEARCH_TOOL.description,
            input_schema=ICON_SEARCH_TOOL.parameters,  # type: ignore[arg-type]
        )
        parts: list[TextBlockParam | ImageBlockParam] = []
        for img_b64, img_media_type in images:
            safe_media_type = cast(
                "_SupportedMediaType",
                img_media_type if img_media_type in _SUPPORTED_MEDIA_TYPES else "image/jpeg",
            )
            parts.append(
                ImageBlockParam(
                    type="image",
                    source=Base64ImageSourceParam(
                        type="base64", media_type=safe_media_type, data=img_b64
                    ),
                )
            )
        cat_list = ", ".join(categories) if categories else "none"
        parts.append(
            TextBlockParam(
                type="text",
                text=f"Existing categories: {cat_list}\n\nUser input: {text or '[image only]'}",
            )
        )
        messages: list[MessageParam] = [{"role": "user", "content": parts}]
        icon_context: dict[str, list[str]] = {}
        for _ in range(5):
            try:
                response = await self._client.messages.create(
                    model=self._model,
                    max_tokens=256,
                    system=ICON_SEARCH_SYSTEM_PROMPT,
                    messages=messages,
                    tools=[icon_tool],
                )
            except Exception as exc:
                logger.warning("Icon search phase failed: %s", exc)
                return icon_context
            tool_uses = [b for b in response.content if isinstance(b, ToolUseBlock)]
            if not tool_uses:
                break
            messages.append({"role": "assistant", "content": response.content})  # type: ignore[arg-type]
            tool_results: list[ToolResultBlockParam] = []
            for use in tool_uses:
                query = str(use.input.get("query", ""))
                results = search_icons(query)
                icon_context[query] = results
                tool_results.append(
                    ToolResultBlockParam(
                        type="tool_result", tool_use_id=use.id, content=json.dumps(results)
                    )
                )
            messages.append({"role": "user", "content": tool_results})  # type: ignore[arg-type]
        return icon_context

    async def parse_transactions(  # noqa: PLR0913
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

        icon_context = await self._fetch_icon_suggestions(
            text=text, images=images, categories=categories
        )

        parts: list[TextBlockParam | ImageBlockParam] = []

        for img_b64, img_media_type in images:
            safe_media_type = cast(
                "_SupportedMediaType",
                img_media_type if img_media_type in _SUPPORTED_MEDIA_TYPES else "image/jpeg",
            )
            parts.append(
                ImageBlockParam(
                    type="image",
                    source=Base64ImageSourceParam(
                        type="base64", media_type=safe_media_type, data=img_b64
                    ),
                )
            )

        prompt_text = build_parse_prompt(
            text=text,
            categories=categories,
            tags=tags,
            wallets=wallets,
            timezone=timezone,
            custom_prompt=custom_prompt,
            icon_context=icon_context or None,
            examples=examples,
        )
        parts.append(TextBlockParam(type="text", text=prompt_text))

        try:
            response = await self._client.messages.parse(
                model=self._model,
                max_tokens=2048,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": parts}],
                output_format=ParsedTransactionOutput,
            )
        except Exception as exc:
            raise _wrap_anthropic_error(exc) from exc

        parsed = response.parsed_output
        if parsed is None:
            msg = "Failed to parse expense from input"
            raise ValueError(msg)
        return parsed

    async def _run_tool_round(
        self,
        messages: list[MessageParam],
        anthropic_tools: list[ToolParam],
        tool_executor: Callable[[str, dict[str, Any]], Awaitable[Any]],
    ) -> tuple[bool, list[MessageParam], list[Any]]:
        """Execute one tool round. Returns (done, updated_messages, last_response_content)."""
        try:
            response = await self._client.messages.create(
                model=self._model,
                max_tokens=1024,
                system=CHAT_SYSTEM_PROMPT,
                messages=messages,
                tools=anthropic_tools,
            )
        except Exception as exc:
            raise _wrap_anthropic_error(exc) from exc

        tool_uses = [b for b in response.content if isinstance(b, ToolUseBlock)]
        if response.stop_reason == "end_turn" or not tool_uses:
            logger.debug("Anthropic chat finished: stop_reason=%s", response.stop_reason)
            messages.append({"role": "assistant", "content": response.content})  # type: ignore[arg-type]
            return True, messages, response.content

        logger.info("Anthropic requesting %d tool call(s)", len(tool_uses))

        messages.append({"role": "assistant", "content": response.content})  # type: ignore[arg-type]

        tool_results: list[ToolResultBlockParam] = []
        for tool_use in tool_uses:
            fn_args: dict[str, Any] = dict(tool_use.input)
            try:
                result = await tool_executor(tool_use.name, fn_args)
            except Exception as exc:
                logger.warning("Tool %s failed: %s", tool_use.name, exc)
                result = {"error": str(exc)}

            tool_results.append(
                ToolResultBlockParam(
                    type="tool_result", tool_use_id=tool_use.id, content=json.dumps(result)
                )
            )

        messages.append({"role": "user", "content": tool_results})  # type: ignore[arg-type]
        return False, messages, []

    async def chat_with_data(
        self,
        *,
        message: str,
        context: ChatContext,
        tools: list[ChatTool],
        tool_executor: Callable[[str, dict[str, Any]], Awaitable[Any]],
    ) -> ChatResponse:
        user_message = build_chat_user_message(message=message, context=context)

        anthropic_tools: list[ToolParam] = [
            ToolParam(
                name=t.name,
                description=t.description,
                input_schema=t.parameters,  # type: ignore[arg-type]
            )
            for t in tools
        ]

        messages: list[MessageParam] = [{"role": "user", "content": user_message}]

        for _ in range(_MAX_TOOL_ROUNDS):
            done, messages, content = await self._run_tool_round(
                messages, anthropic_tools, tool_executor
            )
            if done:
                for block in content:
                    if block.type == "text":
                        return ChatResponse(response=block.text)
                return ChatResponse(response="")

        try:
            response = await self._client.messages.create(
                model=self._model, max_tokens=1024, system=CHAT_SYSTEM_PROMPT, messages=messages
            )
        except Exception as exc:
            raise _wrap_anthropic_error(exc) from exc

        for block in response.content:
            if block.type == "text":
                return ChatResponse(response=block.text)
        return ChatResponse(response="")

    async def list_models(self) -> list[str]:
        try:
            page = await self._client.models.list(limit=100)
        except Exception as exc:
            raise _wrap_anthropic_error(exc) from exc
        else:
            return [m.id for m in page.data]

    async def validate_key(self) -> bool:
        try:
            await self.list_models()
        except ProviderAuthError:
            return False
        else:
            return True
