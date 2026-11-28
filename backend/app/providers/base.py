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
    category_name: str
    description: str
    date: str
    type: str = "expense"
    suggested_tags: list[str] = Field(default_factory=list)
    suggested_icon: str | None = None


class ParsedTransactionGroupInfo(BaseModel):
    description: str
    amount: float
    category_name: str
    date: str
    type: str = "expense"
    suggested_tags: list[str] = Field(default_factory=list)
    suggested_icon: str | None = None


class ParsedRecurringTransaction(BaseModel):
    amount: float
    category_name: str
    description: str
    frequency: str
    next_due: str
    type: str = "expense"
    suggested_tags: list[str] = Field(default_factory=list)
    suggested_icon: str | None = None


class ParsedTransactionOutput(BaseModel):
    # Generated first on purpose: the model commits to a currency before the items, and
    # the wallet is then resolved from it.
    currency: str | None = None
    suggested_wallet_name: str | None = None
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


LUCIDE_ICONS: frozenset[str] = frozenset(
    {
        "Utensils",
        "Coffee",
        "Pizza",
        "Wine",
        "Beer",
        "Apple",
        "Sandwich",
        "IceCream",
        "Soup",
        "ShoppingCart",
        "ShoppingBag",
        "Shirt",
        "Package",
        "Tag",
        "Car",
        "Bus",
        "Train",
        "Bike",
        "Plane",
        "Fuel",
        "Truck",
        "Ship",
        "Taxi",
        "Cable",
        "MapPin",
        "Navigation",
        "Home",
        "Building2",
        "Hotel",
        "Tent",
        "Sofa",
        "Hammer",
        "Paintbrush",
        "Key",
        "Lightbulb",
        "Zap",
        "Droplets",
        "Flame",
        "Wifi",
        "Wrench",
        "Phone",
        "Tv",
        "Smartphone",
        "Laptop",
        "Monitor",
        "Headphones",
        "Camera",
        "Printer",
        "Pill",
        "Stethoscope",
        "Heart",
        "Dumbbell",
        "Syringe",
        "Brain",
        "Eye",
        "Smile",
        "BookOpen",
        "GraduationCap",
        "Globe",
        "Pen",
        "Newspaper",
        "Clapperboard",
        "Music",
        "Gamepad2",
        "Palette",
        "Volleyball",
        "Mountain",
        "Waves",
        "Ticket",
        "Briefcase",
        "Landmark",
        "TrendingUp",
        "PiggyBank",
        "CreditCard",
        "Receipt",
        "Banknote",
        "Coins",
        "Wallet",
        "DollarSign",
        "Rocket",
        "Star",
        "Sparkles",
        "Gift",
        "PartyPopper",
        "Users",
        "Baby",
        "PawPrint",
        "Scissors",
        "Diamond",
        "Leaf",
    }
)

SYSTEM_PROMPT = f"""\
You are a financial transaction parsing assistant. Extract transaction information from the user's \
input (text, image, or both) and return structured data.

result_type rules:
- "single": one transaction (e.g. "coffee 4.5")
- "multiple": two or more independent, unrelated items (e.g. "coffee 4.5, salad 2.3") — each gets \
its own category/tags; do NOT infer a group just because items appear together
- "group": items explicitly tied under one umbrella (e.g. "lunch with Sarah: burger 10$, coke 2$", \
or a receipt with a store name and line items) — NEVER infer groups from unrelated purchases
- "recurring": repeating transaction with explicit or implied periodicity \
(e.g. "Netflix monthly", "gym $50/mo")

"group" rules:
- group field: description = umbrella label, amount = sum of children, same date
- expenses: individual sub-transactions; parent amount must equal sum of children \
(negative discount items included)
- Pre-tax receipts (e.g. Japanese consumption tax): set each item's amount to after-tax price \
(pre-tax × tax_rate); frontend handles rounding discrepancies

"single"/"multiple": group must be null; "single" has 1 expense, "multiple" has N

"recurring": recurring field filled; expenses empty; group null
- frequency: one of "daily", "weekly", "bi-weekly", "monthly", "yearly"
- next_due (ISO 8601): use stated date if given; otherwise: monthly → 1st of next month, \
weekly → next Monday, daily → tomorrow, yearly → next year same date

Per-item rules (applies to every item in expenses, group, and recurring):
- amount: positive, except discounts/coupons/promotions on expenses: record each as its own \
expense item with a negative amount (e.g. item 100 with -30 discount → items 100 and -30). \
Income and recurring amounts are never negative.
- type: "expense" or "income". Income: salary, bonus, refund, freelance, dividend, cashback, \
rental income, etc. Default "expense" if unclear.
- category_name: match from provided list exactly if a good match exists; otherwise invent a \
specific name (e.g. "Electronics", "Healthcare", "Salary", "Freelance"). NEVER use "Others" \
unless truly unclassifiable.
- description: concise, max 100 chars. Capture ONLY the specific detail of the transaction. Do \
NOT restate the category or type — those are stored separately and shown alongside the description. \
E.g. for category "Freelance" / type income, write "Setup Discord bot for user-a", NOT \
"Freelance income for setting up Discord bot for user-a".
- date: ISO 8601 YYYY-MM-DD; today if unspecified
- suggested_tags: check provided tags first; may also suggest new ones for any concrete purchase \
or income source. Tags must be more specific than the category (if category is "Food", tag \
"burger" not "food"). Max 3 tags per item. Return [] if none apply.
- suggested_icon: set ONLY for a NEW category (not in the provided list). Pick the best match \
from these lucide-react icon names: {", ".join(sorted(LUCIDE_ICONS))}. \
Null if the category already exists.
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


def build_parse_prompt(  # ruff: ignore[too-many-arguments]
    *,
    text: str | None,
    categories: list[str],
    tags: list[str],
    wallets: list[tuple[str, str]] | None = None,
    timezone: str = "UTC",
    custom_prompt: str | None = None,
    examples: list[tuple[str, str, str]] | None = None,
) -> str:
    today = datetime.now(resolve_tz(timezone)).strftime("%Y-%m-%d")
    category_list = ", ".join(categories) if categories else "Others"
    tag_list = ", ".join(tags) if tags else ""

    prompt = f"Today's date: {today}\nAvailable categories: {category_list}\n"
    if tag_list:
        prompt += f"Available tags: {tag_list}\n"
    if wallets:
        wallet_list = ", ".join(f"{name} ({currency})" for name, currency in wallets)
        prompt += f"Available wallets: {wallet_list}\n"
        prompt += (
            "Set currency to the ISO 4217 code of the money in the input, judged from the "
            "evidence below, in order:\n"
            "1. Explicit code or symbol: NT$/NTD/TWD -> TWD, HK$ -> HKD, US$ -> USD, "
            "円/税込/税抜 -> JPY, RMB/人民币 -> CNY, 원/₩ -> KRW, € -> EUR, £ -> GBP.\n"
            "2. Script and wording, for bare ¥, 元 or $: Japanese kana (ひらがな/カタカナ) or "
            "Japanese-only terms (領収書, 税込, お会計) -> JPY; Traditional Chinese (發票, 統一編號, "
            "總計, 台北, 新台幣) -> TWD; Simplified Chinese (发票, 合计, 支付宝, 微信支付) -> CNY. "
            "Chinese characters alone do NOT mean Japanese; Japanese text almost always "
            "contains kana.\n"
            "3. Place names, store chains, or tax formats in the input.\n"
            "Set it to null only if there is no evidence at all.\n"
            "Set suggested_wallet_name to the exact name (without the currency in parentheses) "
            "of the wallet whose currency equals currency; if several share it, pick by "
            "context. Null if no wallet fits.\n"
        )
    if custom_prompt:
        prompt += f"Custom instructions: {custom_prompt}\n"
    if examples:
        example_lines = "\n".join(f'- "{desc}" [{cat}, {typ}]' for desc, cat, typ in examples)
        prompt += (
            "\nThe user's recent transaction descriptions, newest first. Match this style, "
            "wording, and casing. Note the descriptions never repeat their category or type:\n"
            f"{example_lines}\n"
        )
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
