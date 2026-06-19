from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING, Any

from google import genai
from google.genai import errors as genai_errors
from google.genai import types as genai_types

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

    from app.providers.base import ChatContext, ChatTool

logger = logging.getLogger(__name__)

_MAX_TOOL_ROUNDS = 10


def _wrap_google_error(exc: Exception) -> Exception:
    if isinstance(exc, genai_errors.ClientError):
        return _wrap_client_error(exc)
    if isinstance(exc, genai_errors.ServerError):
        return ProviderAPIError(exc.message or str(exc))
    if isinstance(exc, (ConnectionError, TimeoutError, OSError)):
        return ProviderConnectionError(str(exc))
    return exc


def _wrap_client_error(exc: genai_errors.ClientError) -> Exception:
    msg = exc.message or str(exc)
    code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
    if code == 401 or "API_KEY_INVALID" in msg or "UNAUTHENTICATED" in msg:
        return ProviderAuthError(msg)
    if code == 403 or "PERMISSION_DENIED" in msg:
        return ProviderPermissionError(msg)
    if code == 429 or "RESOURCE_EXHAUSTED" in msg:
        return ProviderRateLimitError(msg)
    return ProviderAPIError(msg)


class GeminiProvider(LLMProvider):
    def __init__(self, api_key: str, model: str, base_url: str | None = None) -> None:
        http_options: genai_types.HttpOptionsDict | None = (
            {"base_url": base_url} if base_url else None
        )
        self._client = genai.Client(api_key=api_key, http_options=http_options)
        self._model = model

    async def _fetch_icon_suggestions(
        self, *, text: str | None, images: list[tuple[str, str]], categories: list[str]
    ) -> dict[str, list[str]]:
        tool_decl = genai_types.FunctionDeclaration(
            name=ICON_SEARCH_TOOL.name,
            description=ICON_SEARCH_TOOL.description,
            parameters=genai_types.Schema.model_validate(ICON_SEARCH_TOOL.parameters),
        )
        gemini_tool = genai_types.Tool(function_declarations=[tool_decl])
        parts: list[genai_types.Part] = []
        for img_b64, img_media_type in images:
            parts.append(
                genai_types.Part.from_bytes(
                    data=__import__("base64").b64decode(img_b64), mime_type=img_media_type
                )
            )
        cat_list = ", ".join(categories) if categories else "none"
        parts.append(
            genai_types.Part.from_text(
                text=f"Existing categories: {cat_list}\n\nUser input: {text or '[image only]'}"
            )
        )
        contents: list[Any] = [genai_types.Content(role="user", parts=parts)]
        icon_context: dict[str, list[str]] = {}
        for _ in range(5):
            try:
                response = await self._client.aio.models.generate_content(
                    model=self._model,
                    contents=contents,  # type: ignore[arg-type]
                    config=genai_types.GenerateContentConfig(
                        system_instruction=ICON_SEARCH_SYSTEM_PROMPT,
                        tools=[gemini_tool],
                        max_output_tokens=256,
                    ),
                )
            except Exception as exc:
                logger.warning("Icon search phase failed: %s", exc)
                return icon_context
            candidate = response.candidates[0] if response.candidates else None
            if candidate is None or candidate.content is None:
                break
            function_calls = [
                p.function_call
                for p in (candidate.content.parts or [])
                if p.function_call is not None
            ]
            if not function_calls:
                break
            contents.append(candidate.content)
            tool_parts: list[genai_types.Part] = []
            for fc in function_calls:
                query = str((fc.args or {}).get("query", ""))
                results = search_icons(query)
                icon_context[query] = results
                tool_parts.append(
                    genai_types.Part.from_function_response(
                        name=fc.name or "", response={"icons": results}
                    )
                )
            contents.append(genai_types.Content(role="tool", parts=tool_parts))
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
    ) -> ParsedTransactionOutput:
        if not text and not images:
            msg = "At least one of text or image must be provided"
            raise ValueError(msg)

        icon_context = await self._fetch_icon_suggestions(
            text=text, images=images, categories=categories
        )

        parts: list[genai_types.Part] = []

        for img_b64, img_media_type in images:
            parts.append(
                genai_types.Part.from_bytes(
                    data=__import__("base64").b64decode(img_b64), mime_type=img_media_type
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
        )
        parts.append(genai_types.Part.from_text(text=prompt_text))

        schema = ParsedTransactionOutput.model_json_schema()

        try:
            response = await self._client.aio.models.generate_content(
                model=self._model,
                contents=genai_types.Content(role="user", parts=parts),
                config=genai_types.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT,
                    response_mime_type="application/json",
                    response_schema=schema,
                ),
            )
        except Exception as exc:
            raise _wrap_google_error(exc) from exc

        raw_text = response.text
        if not raw_text:
            msg = "Failed to parse expense from input"
            raise ValueError(msg)

        return ParsedTransactionOutput.model_validate(json.loads(raw_text))

    async def chat_with_data(
        self,
        *,
        message: str,
        context: ChatContext,
        tools: list[ChatTool],
        tool_executor: Callable[[str, dict[str, Any]], Awaitable[Any]],
    ) -> ChatResponse:
        user_message = build_chat_user_message(message=message, context=context)

        gemini_tools = genai_types.Tool(
            function_declarations=[
                genai_types.FunctionDeclaration(
                    name=t.name,
                    description=t.description,
                    parameters=genai_types.Schema.model_validate(t.parameters),
                )
                for t in tools
            ]
        )

        contents: list[Any] = [
            genai_types.Content(role="user", parts=[genai_types.Part.from_text(text=user_message)])
        ]

        for _ in range(_MAX_TOOL_ROUNDS):
            try:
                response = await self._client.aio.models.generate_content(
                    model=self._model,
                    contents=contents,  # type: ignore[arg-type]
                    config=genai_types.GenerateContentConfig(
                        system_instruction=CHAT_SYSTEM_PROMPT, tools=[gemini_tools]
                    ),
                )
            except Exception as exc:
                raise _wrap_google_error(exc) from exc

            candidate = response.candidates[0] if response.candidates else None
            if candidate is None or candidate.content is None:
                return ChatResponse(response="")

            function_calls = [
                p.function_call
                for p in (candidate.content.parts or [])
                if p.function_call is not None
            ]

            if not function_calls:
                logger.debug("Gemini chat finished: no function calls in response")
                return ChatResponse(response=response.text or "")

            logger.info("Gemini requesting %d tool call(s)", len(function_calls))

            contents.append(candidate.content)

            tool_response_parts: list[genai_types.Part] = []
            for fc in function_calls:
                fn_name = fc.name or ""
                fn_args: dict[str, Any] = dict(fc.args) if fc.args else {}
                try:
                    result = await tool_executor(fn_name, fn_args)
                except Exception as exc:
                    logger.warning("Tool %s failed: %s", fn_name, exc)
                    result = {"error": str(exc)}

                tool_response_parts.append(
                    genai_types.Part.from_function_response(name=fn_name, response=result)
                )

            contents.append(genai_types.Content(role="tool", parts=tool_response_parts))

        try:
            response = await self._client.aio.models.generate_content(
                model=self._model,
                contents=contents,  # type: ignore[arg-type]
                config=genai_types.GenerateContentConfig(system_instruction=CHAT_SYSTEM_PROMPT),
            )
        except Exception as exc:
            raise _wrap_google_error(exc) from exc

        return ChatResponse(response=response.text or "")

    async def list_models(self) -> list[str]:
        model_ids: list[str] = []
        try:
            async for m in await self._client.aio.models.list():
                name: str = m.name or ""
                if "generateContent" in (m.supported_actions or []):
                    model_ids.append(name.removeprefix("models/"))
        except Exception as exc:
            raise _wrap_google_error(exc) from exc
        else:
            return model_ids

    async def validate_key(self) -> bool:
        try:
            await self.list_models()
        except ProviderAuthError:
            return False
        else:
            return True
