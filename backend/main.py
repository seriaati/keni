from __future__ import annotations

import logging
import tomllib
from contextlib import asynccontextmanager
from pathlib import Path
from typing import TYPE_CHECKING

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.mcp_server import mcp
from app.routers import (
    ai_connections,
    ai_provider,
    auth,
    budgets,
    categories,
    chat,
    export,
    oauth,
    recurring,
    tags,
    tokens,
    transaction_links,
    transactions,
    users,
    wallets,
)
from app.services.scheduler import run_data_retention, run_recurring_transactions

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

logger = logging.getLogger(__name__)

_pyproject = tomllib.loads((Path(__file__).parent / "pyproject.toml").read_text())
VERSION = _pyproject["project"]["version"]


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None]:
    scheduler = AsyncIOScheduler()

    scheduler.add_job(
        run_recurring_transactions,
        IntervalTrigger(minutes=settings.recurring_interval_minutes),
        id="recurring-transactions",
        replace_existing=True,
    )
    scheduler.add_job(
        run_data_retention,
        IntervalTrigger(hours=settings.data_retention_interval_hours),
        id="data-retention",
        replace_existing=True,
    )

    scheduler.start()
    async with mcp.session_manager.run():
        yield
    scheduler.shutdown(wait=True)


app = FastAPI(title="Keni API", version=VERSION, lifespan=lifespan)

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
app.include_router(transactions.router)
app.include_router(transaction_links.router)
app.include_router(ai_provider.router)
app.include_router(ai_connections.router)
app.include_router(ai_connections.admin_router)
app.include_router(chat.router)
app.include_router(recurring.router)
app.include_router(budgets.router)
app.include_router(export.router)
app.include_router(tokens.router)
app.include_router(oauth.router)


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


# MCP clients: /mcp, and the OAuth endpoints and metadata they sign in with, which the spec puts
# at the root (/.well-known/..., /authorize, /token, /register, /revoke). Mounted last, since a
# root mount shadows every route registered after it.
app.mount("/", mcp.streamable_http_app())
