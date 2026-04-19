from __future__ import annotations

from contextlib import asynccontextmanager
from typing import TYPE_CHECKING

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.mcp_server import mcp
from app.routers import (
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
    transactions,
    users,
    wallets,
)
from app.services.scheduler import run_data_retention, run_recurring_transactions

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None]:  # noqa: RUF029
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
    yield
    scheduler.shutdown(wait=True)


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
app.include_router(transactions.router)
app.include_router(ai_provider.router)
app.include_router(chat.router)
app.include_router(recurring.router)
app.include_router(budgets.router)
app.include_router(export.router)
app.include_router(tokens.router)
app.include_router(oauth.router)

app.mount("/mcp", mcp.streamable_http_app())


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
