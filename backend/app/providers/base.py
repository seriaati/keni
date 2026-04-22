from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, Field

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable
    from datetime import timezone


class ParsedTransaction(BaseModel):
    amount: float
    currency: str
    category_name: str
    description: str
    date: str
    ai_context: str
    type: str = "expense"
    suggested_tags: list[str] = Field(default_factory=list)
    suggested_icon: str | None = None


class ParsedTransactionGroupInfo(BaseModel):
    description: str
    amount: float
    currency: str
    category_name: str
    date: str
    ai_context: str
    type: str = "expense"
    suggested_tags: list[str] = Field(default_factory=list)
    suggested_icon: str | None = None


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
    suggested_icon: str | None = None


class ParsedTransactionOutput(BaseModel):
    result_type: Literal["single", "multiple", "group", "recurring"]
    expenses: list[ParsedTransaction]
    group: ParsedTransactionGroupInfo | None = None
    recurring: ParsedRecurringTransaction | None = None


@dataclass
class ChatContext:
    wallet_ids: list[str]
    wallet_names: list[str]
    currency: str
    timezone: str = "UTC"


@dataclass
class ChatResponse:
    response: str
    data: dict | None = None


@dataclass
class ChatTool:
    name: str
    description: str
    parameters: dict[str, Any]


ToolExecutor = "Callable[[str, dict[str, Any]], Awaitable[Any]]"


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

Rules for each transaction item (applies to every item in expenses[], group, and recurring):
- amount MUST always be a strictly positive number — NEVER zero or negative under any \
circumstances. Discounts, coupons, and promotional deductions must be subtracted directly \
from the item's price to produce the net positive amount; do NOT create a separate line item \
with a negative amount for a discount. For example, if an item costs 100 and has a -30 \
discount, set amount = 70, not 100 with a separate -30 entry.
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
- suggested_tags: applies to ALL result types (single, multiple, group children, group parent, \
and recurring). FIRST check the provided tags list for relevant matches. Then, for any \
concrete purchase (a product, service, or activity) OR income source (e.g. for salary: \
"monthly", "recurring"; for freelance: "project", "client"; for dividends: "investment"), \
you may also suggest new descriptive short tags that are NOT in the provided list. \
One transaction can only have 3 tags maximum, so if existing tags already match and the \
maximum will be exceeded, don't suggest new ones. Return an empty array if no tags apply.
- suggested_icon: only set this field when you are creating a NEW category (i.e. the \
category_name is not in the provided categories list). Suggest a single icon name from the \
following list that best represents the category. Use null if the category already exists or \
no icon fits well. Available icons: \
"Utensils", "Coffee", "Pizza", "Wine", "Beer", "Apple", "ShoppingCart", "ShoppingBag", \
"Shirt", "Car", "Bus", "Train", "Bike", "Plane", "Fuel", "Truck", "Ship", "MapPin", \
"Home", "Building2", "Hotel", "Tent", "Sofa", "Hammer", "Paintbrush", "Lightbulb", \
"Zap", "Droplets", "Flame", "Wifi", "Phone", "Tv", "Smartphone", "Laptop", "Monitor", \
"Headphones", "Camera", "Pill", "Stethoscope", "Heart", "Dumbbell", "Syringe", \
"Brain", "Eye", "Smile", "BookOpen", "GraduationCap", "Globe", "Pen", "Newspaper", \
"Clapperboard", "Music", "Gamepad2", "Palette", "Volleyball", "Mountain", "Waves", \
"Briefcase", "Rocket", "Star", "Sparkles", "Gift", "PartyPopper", "Users", "Baby", \
"PawPrint", "Wrench", "Scissors", "Landmark", "TrendingUp", "PiggyBank", "CreditCard", \
"Receipt", "Banknote", "Coins", "Diamond", "Package", "Ticket", "Leaf", "Wallet"
"""

CHAT_SYSTEM_PROMPT = """\
You are a personal finance assistant helping a user understand their financial habits. \
You have access to tools to query the user's transaction data on demand.

Guidelines:
- Be concise, friendly, and insightful
- Focus on actionable financial insights and tips when relevant
- Use the provided tools to fetch the data you need to answer the question accurately
- Call tools as many times as needed to gather sufficient information before responding
- If the data doesn't contain enough information to answer, say so honestly
- Do not make up transaction data that isn't returned by the tools
- Respond in plain text; do not use markdown formatting
"""


def resolve_tz(tz_name: str) -> ZoneInfo | timezone:
    try:
        return ZoneInfo(tz_name)
    except KeyError, ZoneInfoNotFoundError:
        return UTC


def build_parse_prompt(
    *,
    text: str | None,
    categories: list[str],
    tags: list[str],
    timezone: str = "UTC",
    custom_prompt: str | None = None,
) -> str:
    today = datetime.now(resolve_tz(timezone)).strftime("%Y-%m-%d")
    category_list = ", ".join(categories) if categories else "Others"
    tag_list = ", ".join(tags) if tags else ""

    prompt = f"Today's date: {today}\nAvailable categories: {category_list}\n"
    if tag_list:
        prompt += f"Available tags: {tag_list}\n"
    if custom_prompt:
        prompt += f"Custom instructions: {custom_prompt}\n"
    prompt += "\n"
    prompt += (
        f"User input: {text}" if text else "Please extract the transaction from the image above."
    )
    return prompt


def build_chat_user_message(*, message: str, context: ChatContext) -> str:
    wallets_line = ", ".join(context.wallet_names) if context.wallet_names else "all wallets"
    today = datetime.now(resolve_tz(context.timezone)).strftime("%Y-%m-%d")
    return (
        f"Wallet(s): {wallets_line}\n"
        f"Today's date: {today}\n"
        f"Currency: {context.currency}\n\n"
        f"User question: {message}"
    )


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
    async def chat_with_data(
        self,
        *,
        message: str,
        context: ChatContext,
        tools: list[ChatTool],
        tool_executor: Callable[[str, dict[str, Any]], Awaitable[Any]],
    ) -> ChatResponse: ...

    @abstractmethod
    async def list_models(self) -> list[str]: ...

    @abstractmethod
    async def validate_key(self) -> bool: ...
