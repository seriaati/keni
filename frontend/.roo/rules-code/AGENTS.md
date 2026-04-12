# Project Coding Rules (Non-Obvious Only)

- FormData uploads (AI parse, voice) MUST pass `headers: {}` to `request()` — omitting it causes `request()` to force `Content-Type: application/json`, breaking multipart.
- `cn()` in [`src/lib/utils.ts`](../../src/lib/utils.ts) is the project's own className helper — do NOT import from `clsx` directly even though it's a dependency.
- All shared constants (`CURRENCIES`, `FREQUENCIES`, `AI_PROVIDERS`) live in [`src/lib/utils.ts`](../../src/lib/utils.ts), not a separate constants file.
- `expenses.export()` bypasses `request()` and calls `fetch()` directly — it returns a raw `Response` for streaming/blob handling.
- `verbatimModuleSyntax` is enforced: use `import type` for every type-only import or the build will fail.
- `noUnusedLocals` + `noUnusedParameters` are strict — unused variables cause build errors, not just warnings.
- `WalletProvider` only mounts inside `RequireAuth` — never use `useWallet()` on public/login routes.
