from __future__ import annotations

from contextlib import asynccontextmanager
from typing import TYPE_CHECKING

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import get_session
from app.mcp_server import mcp
from app.routers import (
    ai_provider,
    auth,
    budgets,
    categories,
    chat,
    expenses,
    export,
    recurring,
    tags,
    tokens,
    users,
    wallets,
)
from app.services.recurring import process_due_recurring_expenses

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None]:
    async for session in get_session():
        await process_due_recurring_expenses(session)
        break
    yield


app = FastAPI(title="Zeni API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(wallets.router)
app.include_router(categories.router)
app.include_router(tags.router)
app.include_router(expenses.router)
app.include_router(ai_provider.router)
app.include_router(chat.router)
app.include_router(recurring.router)
app.include_router(budgets.router)
app.include_router(export.router)
app.include_router(tokens.router)

app.mount("/mcp", mcp.sse_app())


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
