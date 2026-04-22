from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING, Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from fastapi import FastAPI, Request  # noqa: TC002
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

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
    from collections.abc import AsyncGenerator, MutableMapping

logger = logging.getLogger(__name__)


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

_mcp_app = mcp.streamable_http_app()
app.mount("/mcp", _mcp_app)


async def _proxy_to_mcp(request: Request) -> Response:
    """Forward root-level OAuth/well-known requests to the MCP sub-app."""
    path = request.url.path
    scope: dict[str, Any] = {
        **request.scope,
        "path": path,
        "raw_path": path.encode(),
        "root_path": "",
    }

    response_started: dict[str, Any] = {}
    body_parts: list[bytes] = []

    async def _send(message: MutableMapping[str, Any]) -> None:  # noqa: RUF029
        if message["type"] == "http.response.start":
            response_started["status"] = message["status"]
            response_started["headers"] = message.get("headers", [])
        elif message["type"] == "http.response.body":
            body_parts.append(message.get("body", b""))

    await _mcp_app(scope, request.receive, _send)  # type: ignore[arg-type]

    status = int(response_started.get("status", 500))
    raw_headers: list[tuple[bytes, bytes]] = response_started.get("headers", [])
    headers = {k.decode(): v.decode() for k, v in raw_headers}
    body = b"".join(body_parts)
    if status >= 400:
        logger.warning(
            "_proxy_to_mcp %s %s → %d: %s",
            request.method,
            path,
            status,
            body.decode(errors="replace"),
        )
    else:
        logger.info("_proxy_to_mcp %s %s → %d", request.method, path, status)
    return Response(content=body, status_code=status, headers=headers)


_MCP_ROOT_PATHS = [
    "/.well-known/oauth-authorization-server",
    "/.well-known/oauth-protected-resource/mcp",
    "/authorize",
    "/token",
    "/register",
    "/revoke",
]

for _path in _MCP_ROOT_PATHS:
    app.add_api_route(_path, _proxy_to_mcp, methods=["GET", "POST"])


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
