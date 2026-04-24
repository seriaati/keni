# AGENTS.md

This file provides guidance to agents working at the **repo root**. Detailed per-package guidance is in [`frontend/AGENTS.md`](frontend/AGENTS.md) and [`backend/AGENTS.md`](backend/AGENTS.md).

## Repo Layout

```
frontend/   React 19 + TypeScript + Vite SPA (personal finance tracker)
backend/    Python 3.14 + FastAPI + SQLModel (PostgreSQL)
website/    Static marketing site
plans/      Architecture/design docs
docker-compose.yml  Full-stack local dev via Docker
```

No test suite exists in either package.

## Frontend

**Package manager: `bun`** — `bun.lock` is present; do not use npm or yarn.

```bash
# Run from frontend/
bun dev          # dev server on :5173
bun run build    # tsc -b && vite build
bun run lint     # eslint
```

Vite proxies `/api/*` → `http://localhost:8000`. No CORS config needed in dev.

## Backend

**Always prepend `uv run`** — never call `python`, `alembic`, `ruff`, or `uvicorn` directly.

```bash
# Run from backend/
uv run uvicorn main:app --reload              # dev server on :8000
uv run alembic upgrade head                   # apply migrations
uv run alembic revision --autogenerate -m ""  # generate migration
uv run ruff format . && uv run ruff check .   # format + lint (run after every Python edit)
uv run pyright                                # type check
```

Migrations are forward-only and run automatically via `entrypoint.sh` on container start.

## Full Stack (Docker)

```bash
docker compose up -d   # starts postgres + backend + frontend
```

## Frontend Architecture

All API calls go through `request<T>()` in `frontend/src/lib/api.ts`:
- Auto-attaches `Authorization: Bearer <token>` from `localStorage`
- On 401, silently retries after token refresh via `/api/auth/refresh`; on second 401, clears tokens and redirects to `/login`
- For `FormData` bodies (AI/voice uploads), pass `headers: {}` to skip `Content-Type: application/json`
- Returns `undefined as T` for 204 responses

`WalletProvider` is nested inside `RequireAuth` — wallet context is only available on authenticated routes. Expenses are always scoped to a wallet.

### Key utilities (`frontend/src/lib/utils.ts`)

- `fmt(amount, currency)` — currency formatting; use instead of manual `Intl.NumberFormat`
- `fmtDate` / `fmtDateShort` / `fmtRelative` — date helpers
- `startOfMonth()` / `endOfMonth()` / `startOfWeek()` — return ISO strings
- `cn(...classes)` — className helper (project's own, not clsx directly)
- `isEmoji(str)` — validates emoji for category icons
- `CURRENCIES`, `FREQUENCIES`, `AI_PROVIDERS` — shared constant arrays

### Design tokens (`frontend/src/index.css`)

- Colors: `--cream`, `--forest`, `--ink`, `--amber`, `--rose`, `--sky` (oklch-based)
- Fonts: `--font-display` (Instrument Serif), `--font-body` (DM Sans)
- Radii: `--radius-sm` / `--radius` / `--radius-lg` / `--radius-xl`
- Layout: `--nav-width: 240px`, `--header-height: 56px`

### TypeScript

Strict mode + `noUnusedLocals` + `noUnusedParameters` + `erasableSyntaxOnly`. Use `verbatimModuleSyntax` — always use `import type` for type-only imports. All shared types live in `frontend/src/lib/types.ts`.

### Code style

- No comments unless explaining complex logic
- Named exports for all components and hooks
- Context hooks (`useAuth`, `useWallet`) throw if used outside their provider

## Backend Architecture

```
main.py → routers/ → services/ → providers/ (LLM)
                   ↘ models/   (SQLModel table=True)
                   ↘ schemas/  (Pydantic BaseModel, request/response only)
```

- All DB access uses `AsyncSession` via `session.exec(select(...))` — never raw SQL
- Standard dependencies: `get_db`, `get_current_user`, `require_admin` in `app/dependencies.py`
- `app/models/__init__.py` **must import every model** — Alembic reads metadata from there; missing imports = missing migrations
- `from __future__ import annotations` required in every Python file
- Types only used in annotations go under `if TYPE_CHECKING:` (enforced by ruff `TC` rules)
- UUID primary keys: `server_default=text("gen_random_uuid()")` with `default=None`; timestamps: `sa.Column(sa.DateTime(timezone=True), server_default=text("NOW()"))` — never Python-side defaults
- Raise errors with: `msg = "..."; raise ValueError(msg)` (EM rule); no `print()`, use `logging.getLogger(__name__)`
