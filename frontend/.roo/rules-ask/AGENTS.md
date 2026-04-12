# Project Documentation Rules (Non-Obvious Only)

- All types are centralized in [`src/lib/types.ts`](../../src/lib/types.ts) — no per-feature type files exist.
- All shared utilities and constants (`CURRENCIES`, `FREQUENCIES`, `AI_PROVIDERS`, `cn`, `fmt*`, date helpers) are in [`src/lib/utils.ts`](../../src/lib/utils.ts) — not split across files.
- The `request()` function in [`src/lib/api.ts`](../../src/lib/api.ts) is the sole HTTP layer; all API modules are exported objects from that file (not separate files per resource).
- `expenses.export()` is the only API call that bypasses `request()` — it returns a raw `Response` for blob/streaming use.
- `WalletProvider` depends on `AuthContext` internally (calls `useAuth`) — it must always be nested inside `AuthProvider`.
