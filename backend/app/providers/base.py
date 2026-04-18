from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Literal

from pydantic import BaseModel, Field


class ParsedTransaction(BaseModel):
    amount: float
    currency: str
    category_name: str
    description: str
    date: str
    ai_context: str
    type: str = "expense"
    suggested_tags: list[str] = Field(default_factory=list)


class ParsedTransactionGroupInfo(BaseModel):
    description: str
    amount: float
    currency: str
    category_name: str
    date: str
    ai_context: str
    type: str = "expense"
    suggested_tags: list[str] = Field(default_factory=list)


class ParsedRecurringTransaction(BaseModel):
    amount: float
    currency: str
    category_name: str
    description: str
    frequency: str
    next_due: str
    ai_context: str
    type: str = "expense"
    suggested_tags: list[str] = Field(default_factory=list)


class ParsedTransactionOutput(BaseModel):
    result_type: Literal["single", "multiple", "group", "recurring"]
    expenses: list[ParsedTransaction]
    group: ParsedTransactionGroupInfo | None = None
    recurring: ParsedRecurringTransaction | None = None


@dataclass
class ChatContext:
    total_expenses: int
    total_amount: float
    currency: str
    date_range: str
    by_category: list[dict]
    by_month: list[dict]
    recent_expenses: list[dict]
    total_income: float = 0.0
    income_count: int = 0
    wallet_names: list[str] = field(default_factory=list)
    timezone: str = "UTC"


@dataclass
class ChatResponse:
    response: str
    data: dict | None = None


SYSTEM_PROMPT = """\
You are a financial transaction parsing assistant. Extract transaction information from the user's \
input (text, image, or both) and return structured data.

You must decide which result_type to use:
- "single": exactly one transaction item (e.g. "coffee 4.5")
- "multiple": two or more independent, unrelated transaction items listed together \
(e.g. "coffee 4.5, salad 2.3, phone 3000") — each gets its own category and tags; \
do NOT infer a group just because items appear together
- "group": contextually related items under one explicit umbrella \
(e.g. "lunch with Sarah: burger 10$, coke 2$", or a receipt scan with a store name and \
line items) — only use "group" when there is clear context tying the items together; \
NEVER infer groups from coincidental or unrelated purchases
- "recurring": user describes a repeating transaction with explicit or implied periodicity \
(e.g. "Netflix monthly", "rent every month", "gym membership $50/mo", "weekly grocery budget $100")

For "group" result_type:
- The `group` field must be filled with the parent transaction metadata \
(description = the umbrella label, amount = sum of all children, same currency/date)
- The `expenses` list contains the individual sub-transactions (children)
- The parent amount must equal the sum of children amounts
- For receipts showing pre-tax prices (e.g. Japanese receipts with consumption tax applied to \
the total): set each item's amount to its after-tax price (pre-tax * tax_rate), then if the \
sum of rounded item amounts does not equal the receipt total due to decimal rounding, add a \
final line item with category_name "Tax rounding", description "Rounding adjustment", and \
amount = receipt_total - sum_of_items (this will be a small positive or negative value)

For "single" and "multiple":
- The `group` field must be null
- For "single", `expenses` has exactly 1 item
- For "multiple", `expenses` has N items (one per independent transaction)

For "recurring" result_type:
- The `recurring` field must be filled; `expenses` must be empty; `group` must be null
- `frequency` must be one of: "daily", "weekly", "bi-weekly", "monthly", "yearly"
- `next_due`: infer the next occurrence date in ISO 8601 (YYYY-MM-DD). If user specifies a \
start date, use that. If unspecified: use the 1st of next month for monthly, next Monday for \
weekly, tomorrow for daily, next year's current month/day for yearly

Rules for each transaction item:
- amount must be a positive number
- currency must be a 3-letter ISO currency code (e.g. "USD")
- type: either "expense" or "income". Income examples: salary, bonus, refund, reimbursement, \
cashback, gift received, freelance payment, dividend, interest received, rental income, \
commission, allowance, pension, grant, prize, side income. Default to "expense" if unclear.
- category_name: FIRST check the provided categories list for a good match. If a match exists, \
use it exactly. If NO good match exists, you MUST invent a specific, descriptive new category \
name — for expenses e.g. "Electronics", "Gaming", "Healthcare", "Transport"; for income e.g. \
"Salary", "Bonus", "Freelance", "Dividends", "Rental Income", "Refund", "Cashback" — NEVER \
use "Others" unless the transaction is completely ambiguous and cannot be described more \
specifically.
- description should be concise (max 100 chars)
- date: use ISO 8601 format YYYY-MM-DD; use today's date if not specified
- ai_context: brief summary of what you extracted and why you chose the category
- suggested_tags: FIRST check the provided tags list for relevant matches. Then, for any \
concrete purchase (a product, service, or activity) OR income source (e.g. for salary: \
"monthly", "recurring"; for freelance: "project", "client"; for dividends: "investment"), \
you may also suggest new descriptive short tags that are NOT in the provided list. \
One transaction can only have 3 tags in maximum, so if existing tags already match and the \
maximum will be exceeded, don't suggest. Return an empty array if no tags are suggested.
"""

CHAT_SYSTEM_PROMPT = """\
You are a personal finance assistant helping a user understand their financial habits. \
You have access to a summary of the user's transaction data (both expenses and income) \
provided in the user message.

Guidelines:
- Be concise, friendly, and insightful
- Focus on actionable financial insights and tips when relevant
- When the user asks for numbers, reference the data provided
- If the data doesn't contain enough information to answer, say so honestly
- Do not make up transaction data that isn't in the context
- Respond in plain text; do not use markdown formatting
"""


class LLMProvider(ABC):
    @abstractmethod
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
    ) -> ParsedTransactionOutput: ...

    @abstractmethod
    async def chat_with_data(self, *, message: str, context: ChatContext) -> ChatResponse: ...

    @abstractmethod
    async def list_models(self) -> list[str]: ...

    @abstractmethod
    async def validate_key(self) -> bool: ...
