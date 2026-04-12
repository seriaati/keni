# Project Debug Rules (Non-Obvious Only)

- `request()` auto-redirects to `/login` on 401 after a failed token refresh — auth errors won't surface as thrown exceptions in components.
- `expenses.export()` uses raw `fetch()`, not `request()` — it won't auto-refresh tokens or throw structured errors; check `Response.ok` manually.
- Vite proxies `/api` → `http://localhost:8000` in dev only; `VITE_API_URL` env var overrides the base in other environments.
- `WalletProvider` silently swallows wallet-fetch errors (empty catch) — wallet loading failures won't propagate to the UI.
- Context hooks (`useAuth`, `useWallet`) throw synchronously if used outside their provider — check component tree placement first.
