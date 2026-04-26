# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Keni** — personal finance tracker with AI input parsing (text, image, PDF, voice), multi-wallet support, budgets, recurring transactions, and MCP/API integrations.

## Commands

### Website (`website/`)

Marketing/landing site. Built with Astro + Tailwind CSS. Package manager: **bun only**.

```bash
bun dev          # dev server
bun run build    # build site
```

### Frontend (`frontend/`)

Package manager: **bun only** — never npm/yarn.

```bash
bun dev          # dev server :5173
bun run build    # tsc -b && vite build
bun run lint     # eslint
bun run preview  # vite preview
```

### Backend (`backend/`)

Always prefix with **`uv run`** — never call `python`, `alembic`, `ruff`, or `uvicorn` directly.

```bash
uv run uvicorn main:app --reload                        # dev server :8000
uv run alembic upgrade head                             # apply migrations
uv run alembic revision --autogenerate -m "<msg>"       # generate migration
uv run ruff format . && uv run ruff check .             # format + lint (run after every Python edit)
uv run pyright                                          # type check
```

### Full stack

```bash
docker compose up -d   # postgres + backend + frontend (from repo root)
```

## Architecture

### Backend

```
main.py → routers/ → services/ → providers/ (LLM)
                   ↘ models/   (SQLModel table=True)
                   ↘ schemas/  (Pydantic BaseModel, request/response only)
```

- DB: `AsyncSession` via `session.exec(select(...))` — no raw SQL
- Standard deps: `get_db`, `get_current_user`, `require_admin` in `app/dependencies.py`
- Auth: JWT (`type: "access"`) and hashed API tokens both accepted in `Authorization: Bearer`
- LLM providers: Anthropic, Gemini, OpenAI-compat, OpenRouter — factory in `app/providers/_factory.py`
- STT: local Whisper or external, singleton via `app/services/voice.py`
- MCP server: `app/mcp_server.py` — OAuth-authenticated, mounted at `/mcp` and well-known paths
- Background jobs: APScheduler (recurring transactions, data retention) started in lifespan

### Frontend

- React 19 + TypeScript + Vite, React Router v7, Recharts, lucide-react
- All API calls via `request<T>()` in `src/lib/api.ts` — handles JWT, auto-refresh on 401, redirect on second 401
- `WalletProvider` wraps all authenticated routes; `useWallet()` is global active-wallet state
- Expenses always scoped to a wallet: `/wallets/:walletId/expenses/...`
- FormData uploads (AI/voice): pass `headers: {}` to skip `Content-Type: application/json`
- Vite proxies `/api/*` → `http://localhost:8000` in dev
- PWA: `vite-plugin-pwa` with `devOptions.enabled: false`; `ReloadPrompt` handles SW update prompts
- Route guards in `App.tsx`: `RequireAuth` (redirect to `/login`), `RequireAdmin` (checks `user.is_admin`)
- No third-party UI lib — use primitives in `src/components/ui/` (Button, Modal, Toast, DatePicker, Select, SearchableSelect, ColorPicker) before creating new ones
- Build uses rolldown with vendor code-splitting groups defined in `vite.config.ts`

### Key utilities (`frontend/src/lib/utils.ts`)

- `fmt(amount, currency)` — currency formatting; prefer over manual `Intl.NumberFormat`
- `fmtDate` / `fmtDateShort` / `fmtRelative` — date helpers
- `startOfMonth()` / `endOfMonth()` / `startOfWeek()` — return ISO strings
- `cn(...classes)` — className helper
- `CURRENCIES`, `FREQUENCIES`, `AI_PROVIDERS` — shared constants
- `src/lib/categoryIcons.tsx` — maps category names → lucide icons
- `src/lib/colors.ts` — `COLOR_GROUPS` palette used by category/tag color pickers

### Design tokens (`frontend/src/index.css`)

- Colors: `--cream`, `--forest`, `--ink`, `--amber`, `--rose`, `--sky` (oklch)
- Fonts: `--font-display` (Instrument Serif), `--font-body` (DM Sans)
- Layout: `--nav-width: 240px`, `--header-height: 56px`
- All shared types in `frontend/src/lib/types.ts`

## Critical Patterns

### Backend

- `app/models/__init__.py` **must import every model** — Alembic reads metadata from there; missing import = missing migration
- UUID PKs: `server_default=text("gen_random_uuid()")` with `default=None`
- Timestamps: `sa.Column(sa.DateTime(timezone=True), server_default=text("NOW()"))` — never Python-side defaults
- `from __future__ import annotations` required in every Python file
- Types only in annotations → under `if TYPE_CHECKING:` (ruff `TC` rules)
- Raise errors: `msg = "..."; raise ValueError(msg)` (EM rule)
- No `print()` — use `logging.getLogger(__name__)`
- Migrations: forward-only; run automatically via `entrypoint.sh` on container start
- AI key storage: base64 obfuscation via `_encrypt_key`/`_decrypt_key` in `app/services/ai_transaction.py`

### Frontend

- Strict TS: `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`, `verbatimModuleSyntax`
- Always `import type` for type-only imports
- Named exports for all components and hooks
- Context hooks (`useAuth`, `useWallet`) throw if used outside provider

## No Tests

No test suite in either package.
