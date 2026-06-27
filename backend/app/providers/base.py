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
    ai_context: str
    type: str = "expense"
    suggested_tags: list[str] = Field(default_factory=list)
    suggested_icon: str | None = None


class ParsedTransactionGroupInfo(BaseModel):
    description: str
    amount: float
    category_name: str
    date: str
    ai_context: str
    type: str = "expense"
    suggested_tags: list[str] = Field(default_factory=list)
    suggested_icon: str | None = None


class ParsedRecurringTransaction(BaseModel):
    amount: float
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
    suggested_wallet_name: str | None = None


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
        # Food & drink
        "Utensils",
        "Coffee",
        "Pizza",
        "Wine",
        "Beer",
        "Apple",
        "Sandwich",
        "IceCream",
        "Soup",
        # Shopping
        "ShoppingCart",
        "ShoppingBag",
        "Shirt",
        "Package",
        "Tag",
        # Transport
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
        # Location
        "MapPin",
        "Navigation",
        # Home & living
        "Home",
        "Building2",
        "Hotel",
        "Tent",
        "Sofa",
        "Hammer",
        "Paintbrush",
        "Key",
        # Utilities
        "Lightbulb",
        "Zap",
        "Droplets",
        "Flame",
        "Wifi",
        "Wrench",
        # Tech & devices
        "Phone",
        "Tv",
        "Smartphone",
        "Laptop",
        "Monitor",
        "Headphones",
        "Camera",
        "Printer",
        # Health & fitness
        "Pill",
        "Stethoscope",
        "Heart",
        "Dumbbell",
        "Syringe",
        "Brain",
        "Eye",
        "Smile",
        # Education & media
        "BookOpen",
        "GraduationCap",
        "Globe",
        "Pen",
        "Newspaper",
        # Entertainment & leisure
        "Clapperboard",
        "Music",
        "Gamepad2",
        "Palette",
        "Volleyball",
        "Mountain",
        "Waves",
        "Ticket",
        # Finance & work
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
        # Misc
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

_ICON_KEYWORD_MAP: dict[str, list[str]] = {
    "food": [
        "Utensils",
        "Coffee",
        "Pizza",
        "Wine",
        "Beer",
        "Apple",
        "Sandwich",
        "IceCream",
        "Soup",
    ],
    "dining": ["Utensils", "Pizza", "Wine", "Coffee"],
    "restaurant": ["Utensils", "Pizza", "Wine"],
    "cafe": ["Coffee", "Utensils"],
    "drink": ["Coffee", "Wine", "Beer", "IceCream"],
    "grocery": ["ShoppingCart", "Apple", "Utensils"],
    "shopping": ["ShoppingCart", "ShoppingBag", "Shirt", "Package", "Tag"],
    "clothing": ["Shirt", "ShoppingBag", "Scissors"],
    "fashion": ["Shirt", "ShoppingBag", "Scissors", "Sparkles"],
    "transport": ["Car", "Bus", "Train", "Bike", "Plane", "Fuel", "Truck", "Taxi"],
    "travel": ["Plane", "MapPin", "Hotel", "Navigation", "Mountain", "Tent"],
    "fuel": ["Fuel", "Car", "Truck"],
    "home": ["Home", "Building2", "Sofa", "Hammer", "Key", "Paintbrush"],
    "rent": ["Home", "Building2", "Key"],
    "utilities": ["Lightbulb", "Zap", "Droplets", "Flame", "Wifi", "Wrench"],
    "electric": ["Zap", "Lightbulb"],
    "water": ["Droplets", "Waves"],
    "tech": ["Laptop", "Smartphone", "Monitor", "Tv", "Camera", "Headphones"],
    "electronics": ["Laptop", "Smartphone", "Monitor", "Tv", "Camera", "Headphones", "Printer"],
    "phone": ["Phone", "Smartphone"],
    "health": ["Pill", "Stethoscope", "Heart", "Syringe", "Brain", "Eye"],
    "medical": ["Pill", "Stethoscope", "Syringe", "Heart"],
    "fitness": ["Dumbbell", "Heart", "Volleyball", "Mountain"],
    "gym": ["Dumbbell", "Heart", "Volleyball"],
    "education": ["BookOpen", "GraduationCap", "Globe", "Pen"],
    "books": ["BookOpen", "Pen", "Newspaper"],
    "entertainment": ["Clapperboard", "Music", "Gamepad2", "Palette", "Ticket"],
    "gaming": ["Gamepad2", "Rocket", "Star"],
    "music": ["Music", "Headphones"],
    "finance": [
        "Briefcase",
        "Landmark",
        "TrendingUp",
        "PiggyBank",
        "CreditCard",
        "Banknote",
        "Coins",
        "Wallet",
    ],
    "income": ["Banknote", "TrendingUp", "DollarSign", "Coins", "Briefcase"],
    "salary": ["Briefcase", "Banknote", "DollarSign"],
    "investment": ["TrendingUp", "PiggyBank", "Landmark", "DollarSign"],
    "savings": ["PiggyBank", "Coins", "Wallet"],
    "insurance": ["Stethoscope", "Heart", "Briefcase", "Landmark"],
    "gift": ["Gift", "PartyPopper", "Sparkles"],
    "pets": ["PawPrint", "Heart"],
    "beauty": ["Scissors", "Sparkles", "Smile"],
    "personal": ["Smile", "Sparkles", "Users"],
    "charity": ["Heart", "Gift", "Users"],
    "social": ["Users", "Gift", "PartyPopper"],
    "nature": ["Leaf", "Mountain", "Waves"],
    "children": ["Baby", "Users", "BookOpen"],
    "hobby": ["Palette", "Music", "Gamepad2", "Mountain", "Volleyball"],
}


def search_icons(query: str) -> list[str]:
    """Return lucide-react icon names relevant to the query."""
    q = query.lower().strip()
    direct = [name for name in sorted(LUCIDE_ICONS) if q in name.lower()]
    keyword_matches: list[str] = []
    for keyword, icons in _ICON_KEYWORD_MAP.items():
        if keyword in q or q in keyword:
            keyword_matches.extend(i for i in icons if i in LUCIDE_ICONS)
    combined = list(dict.fromkeys(direct + keyword_matches))
    return combined[:20] if combined else sorted(LUCIDE_ICONS)


SYSTEM_PROMPT = """\
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
- expenses: individual sub-transactions; parent amount must equal sum of children
- Pre-tax receipts (e.g. Japanese consumption tax): set each item's amount to after-tax price \
(pre-tax × tax_rate); frontend handles rounding discrepancies

"single"/"multiple": group must be null; "single" has 1 expense, "multiple" has N

"recurring": recurring field filled; expenses empty; group null
- frequency: one of "daily", "weekly", "bi-weekly", "monthly", "yearly"
- next_due (ISO 8601): use stated date if given; otherwise: monthly → 1st of next month, \
weekly → next Monday, daily → tomorrow, yearly → next year same date

Per-item rules (applies to every item in expenses, group, and recurring):
- amount: strictly positive — subtract discounts directly from item price \
(e.g. item 100 with -30 discount → amount 70). Never create a separate negative-amount entry.
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
- ai_context: brief summary of what you extracted and why you chose the category
- suggested_tags: check provided tags first; may also suggest new ones for any concrete purchase \
or income source. Tags must be more specific than the category (if category is "Food", tag \
"burger" not "food"). Max 3 tags per item. Return [] if none apply.
- suggested_icon: set ONLY for a NEW category (not in the provided list). If "Icon options" are \
listed in the prompt for this or a related category, pick the best match from there. Otherwise \
use any valid lucide-react icon name. Null if the category already exists.
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

ICON_SEARCH_SYSTEM_PROMPT = (
    "Given the user's transaction input and their existing expense categories, "
    "call search_icons once for each category you expect to CREATE (i.e. not already in the list). "
    "Pass the likely new category name as the query. "
    "Do not call it for categories already in the list. "
    "If no new categories are needed, do nothing and stop immediately."
)

ICON_SEARCH_TOOL: ChatTool = ChatTool(
    name="search_icons",
    description=(
        "Search for valid lucide-react icon names suitable for a new expense/income category. "
        "Returns a list of matching icon names. Call once per new category."
    ),
    parameters={
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Category name or theme to find icons for (e.g. 'food', 'transport', 'gaming')",
            }
        },
        "required": ["query"],
    },
)


def resolve_tz(tz_name: str) -> ZoneInfo | timezone:
    try:
        return ZoneInfo(tz_name)
    except KeyError, ZoneInfoNotFoundError:
        return UTC


def build_parse_prompt(  # noqa: PLR0913
    *,
    text: str | None,
    categories: list[str],
    tags: list[str],
    wallets: list[tuple[str, str]] | None = None,
    timezone: str = "UTC",
    custom_prompt: str | None = None,
    icon_context: dict[str, list[str]] | None = None,
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
            "Set suggested_wallet_name to the wallet name that best matches the transaction "
            "(based on currency or context). If only one wallet exists or none clearly matches, "
            "set it to null.\n"
        )
    if icon_context:
        icon_lines = "; ".join(
            f"{query}: [{', '.join(icons)}]" for query, icons in icon_context.items()
        )
        prompt += f"Icon options for new categories: {icon_lines}\n"
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
