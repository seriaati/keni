# Project Architecture Rules (Non-Obvious Only)

- `WalletProvider` depends on `AuthContext` — it calls `useAuth()` internally, so it must always be nested inside `AuthProvider`. Reversing or flattening this breaks silently.
- All authenticated routes share a single `WalletProvider` instance mounted in `App.tsx` inside `RequireAuth` — wallet state is not per-page.
- Expenses are always wallet-scoped at the API level (`/wallets/:walletId/expenses/...`) — there is no global expense endpoint.
- The `request()` function is the only place JWT injection and token refresh happen — any direct `fetch()` call (like `expenses.export()`) must handle auth manually.
- Vite build uses `rolldownOptions` with manual code-splitting groups for react, recharts, and utils — changes to major deps may require updating these groups in [`vite.config.ts`](../../vite.config.ts).
- No test framework is configured — there are no unit or integration tests.
