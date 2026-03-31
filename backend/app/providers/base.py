from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class ParsedExpense:
    amount: float
    currency: str
    category_name: str
    description: str
    date: str
    ai_context: str


@dataclass
class ChatContext:
    total_expenses: int
    total_amount: float
    currency: str
    date_range: str
    by_category: list[dict]
    by_month: list[dict]
    recent_expenses: list[dict]
    wallet_names: list[str] = field(default_factory=list)


@dataclass
class ChatResponse:
    response: str
    data: dict | None = None


class LLMProvider(ABC):
    @abstractmethod
    async def parse_expense(
        self,
        *,
        text: str | None,
        image_base64: str | None,
        image_media_type: str | None,
        categories: list[str],
    ) -> ParsedExpense: ...

    @abstractmethod
    async def chat_with_data(self, *, message: str, context: ChatContext) -> ChatResponse: ...
