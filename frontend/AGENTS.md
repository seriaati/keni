# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Stack
React 19 + TypeScript + Vite, React Router v7, Recharts, date-fns, lucide-react, clsx.
No test framework configured.

## Commands

**Package manager: `bun`** — `bun.lock` is present; do not use npm or yarn.

```
bun dev          # Vite dev server on :5173
bun run build    # tsc -b && vite build
bun run lint     # eslint .
bun run preview  # vite preview
```

## Key Architecture
- All API calls go through the `request()` function in [`src/lib/api.ts`](src/lib/api.ts) — it handles JWT auth, auto-refresh on 401, and redirects to `/login` on auth failure.
- Auth tokens stored in `localStorage` as `access_token` / `refresh_token`.
- `WalletProvider` wraps all authenticated routes; active wallet is global state via [`useWallet()`](src/contexts/WalletContext.tsx).
- Expenses are always scoped to a wallet: `/wallets/:walletId/expenses/...`
- FormData requests (file/audio uploads) must pass `headers: {}` to prevent `request()` from setting `Content-Type: application/json`.

## Dev Proxy
Vite proxies `/api` → `http://localhost:8000` in dev. Set `VITE_API_URL` env var to override the base URL in other environments.

## Utilities (`src/lib/utils.ts`)
- `fmt(amount, currency)` — currency formatting via `Intl.NumberFormat`
- `fmtDate` / `fmtDateShort` / `fmtRelative` — date display helpers
- `startOfMonth()` / `endOfMonth()` / `startOfWeek()` — return ISO strings
- `cn(...classes)` — className helper (project's own, not `clsx` directly)
- `CURRENCIES`, `FREQUENCIES`, `AI_PROVIDERS` — shared constant arrays

## TypeScript
Strict mode + `noUnusedLocals` + `noUnusedParameters` + `erasableSyntaxOnly`. All types live in [`src/lib/types.ts`](src/lib/types.ts). Use `import type` for type-only imports (`verbatimModuleSyntax` enforced).

## Code Style
- No comments unless explaining complex logic.
- Named exports for all components and hooks.
- Context hooks (`useAuth`, `useWallet`) throw if used outside their provider.
