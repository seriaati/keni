## Plan: MCP OAuth 2.1 for Claude Desktop

Claude Desktop requires MCP servers to implement OAuth 2.1 (with PKCE) for remote authentication. The current MCP server passes `token` as a tool argument — non-standard and unsupported by Claude Desktop. This plan implements the full MCP authorization spec: OAuth discovery endpoints, dynamic client registration, authorization code flow with the Zeni frontend as the login UI, and API token reuse for access tokens.

**Decisions**

- Login page: Zeni **frontend** hosts the OAuth consent/login page (new route)
- Access tokens: **Reuse existing API tokens** — MCP OAuth access tokens are Zeni API tokens stored in `api_tokens` table
- OAuth clients, auth codes, refresh tokens: **in-memory** (server restart = Claude Desktop re-authorizes, acceptable for self-hosted)
- Transport: switch from deprecated SSE to **Streamable HTTP** (Claude Desktop auto-detects)

---

### Phase 1: Backend OAuth Provider (blocks Phase 2 & 3)

**Step 1.** Add config settings to `app/config.py`

- `mcp_issuer_url: str = "http://localhost:8000/mcp"` — OAuth authorization server URL (= where MCP is hosted)
- `mcp_frontend_url: str = "http://localhost:5173"` — where to redirect for login UI
- `mcp_resource_url: str = "http://localhost:8000/mcp"` — resource server URL for `AuthSettings.resource_server_url`

**Step 2.** Create `app/services/mcp_oauth.py` — implements `OAuthAuthorizationServerProvider`

The provider class `ZeniOAuthProvider` with in-memory stores:

- `_clients: dict[str, OAuthClientInformationFull]` — registered OAuth clients
- `_auth_codes: dict[str, ZeniAuthorizationCode]` — pending authorization codes
- `_pending_requests: dict[str, PendingAuthRequest]` — pending authorize requests (pre-code)
- `_refresh_tokens: dict[str, ZeniRefreshToken]` — refresh token store

Custom models extending MCP base models:

- `ZeniAuthorizationCode(AuthorizationCode)` with added `user_id: UUID`
- `ZeniAccessToken(AccessToken)` with added `user_id: UUID`
- `ZeniRefreshToken(RefreshToken)` with added `user_id: UUID`
- `PendingAuthRequest` dataclass: `request_id, client_id, redirect_uri, code_challenge, state, scopes, created_at`

Method implementations:

- `get_client(client_id)` → look up in `_clients` dict
- `register_client(client_info)` → store in `_clients` dict with generated `client_id` + optional `client_secret`
- `authorize(client, params)` → create `PendingAuthRequest`, store it, return `{frontend_url}/oauth/authorize?request_id={id}`
- `load_authorization_code(client, code)` → look up in `_auth_codes`, verify not expired
- `exchange_authorization_code(client, auth_code)` → generate API token via `generate_api_token()`, store in DB as `APIToken` (name: "MCP: {client_id}"), return `OAuthToken(access_token=raw_token, token_type="bearer", refresh_token=..., expires_in=...)`
- `load_refresh_token(client, token)` → look up in `_refresh_tokens`
- `exchange_refresh_token(client, refresh_token, scopes)` → generate new API token, revoke old, return new `OAuthToken`
- `load_access_token(token)` → hash with `hash_api_token()`, look up in `api_tokens` table, return `ZeniAccessToken` with `user_id`
- `revoke_token(token)` → delete API token from DB / remove refresh token from memory

Helper method:

- `approve_request(request_id, user_id)` → called by the OAuth router; looks up pending request, generates auth code with 160-bit entropy, stores in `_auth_codes`, returns redirect URL `{redirect_uri}?code={code}&state={state}`

**Step 3.** Create `app/routers/oauth.py` — endpoints for frontend OAuth flow

- `GET /api/oauth/requests/{request_id}` — public (no auth), returns `{client_id, scopes}` for the consent screen
- `POST /api/oauth/approve` — requires JWT auth (`get_current_user`), body: `{request_id: str}`, calls `provider.approve_request(request_id, user.id)`, returns `{redirect_url: str}`

Schemas in `app/schemas/oauth.py`:

- `OAuthRequestInfo` response: `client_id: str, scopes: list[str]`
- `OAuthApproveRequest` body: `request_id: str`
- `OAuthApproveResponse` response: `redirect_url: str`

**Step 4.** Create `app/schemas/oauth.py` — Pydantic schemas for the OAuth router endpoints (see Step 3)

---

### Phase 2: Backend MCP Server Changes (depends on Phase 1)

**Step 5.** Rewrite `app/mcp_server.py`

- Import `ZeniOAuthProvider` and create a singleton instance
- Configure `FastMCP` with OAuth:

  ```
  auth_server_provider=provider
  auth=AuthSettings(
      issuer_url=settings.mcp_issuer_url,
      resource_server_url=settings.mcp_resource_url,
      client_registration_options=ClientRegistrationOptions(enabled=True),
      revocation_options=RevocationOptions(enabled=True),
  )
  streamable_http_path="/"
  ```

- Remove `token: str` parameter from ALL tool functions and dataclass inputs
- Remove `_resolve_user()` helper
- Add `_get_current_user()` helper that calls `get_access_token()` (from `mcp.server.auth.middleware.auth_context`), then looks up user from `access_token.user_id` (our custom `ZeniAccessToken` field)
- Update all tool functions to use `_get_current_user()` instead of `_resolve_user(token)`
- Update `ListTransactionsInput`, `GetSummaryInput`, `CreateTransactionInput` dataclasses — remove `token` field

**Step 6.** Update `main.py`

- Switch `app.mount("/mcp", mcp.sse_app())` → `app.mount("/mcp", mcp.streamable_http_app())`
- Add `app.include_router(oauth.router)` for the new OAuth router
- Add `mcp_allowed_origins` update if needed for Claude Desktop's origin

---

### Phase 3: Frontend OAuth Page (parallel with Phase 2)

**Step 7.** Create `src/pages/OAuthAuthorizePage.tsx`

A standalone page (not wrapped in `Layout` or `RequireAuth`), similar to `LoginPage.tsx` in structure.

Flow:

1. Read `request_id` from URL search params
2. Fetch request info: `GET /api/oauth/requests/{request_id}` (using `fetch` directly, not the `request()` helper since this may be unauthenticated)
3. Check if user has valid JWT in `localStorage`:
   - **Not logged in**: Show login form (username/password), on submit call `POST /api/auth/login`, store tokens
   - **Logged in**: Show consent screen: "Authorize **Claude** to access your Zeni data?" with Approve/Deny buttons
4. On approve: `POST /api/oauth/approve` with `Authorization: Bearer {jwt}` and `{request_id}` body
5. Get `redirect_url` from response → `window.location.href = redirect_url`
6. On deny: show "Authorization denied" message (no redirect)

UI design: reuse LoginPage's visual style (cream background, forest accent, same input/button classes). Two-step flow if not logged in: login → consent.

**Step 8.** Update `src/App.tsx`

- Add route: `<Route path="/oauth/authorize" element={<OAuthAuthorizePage />} />` — outside of `RequireAuth` wrapper, alongside `/login`

---

### Phase 4: Configuration & Integration

**Step 9.** Update `app/config.py` `mcp_allowed_origins` default to include Claude Desktop origins

Claude Desktop may connect from various origins. Add `"https://claude.ai"` and `"app://claude"` (or similar) to the defaults. The exact origin depends on Claude Desktop's implementation — may need to be permissive or user-configurable.

**Step 10.** Update `app/models/__init__.py` — no changes needed (already imports `APIToken`)

---

**Relevant files**

- `backend/app/config.py` — add `mcp_issuer_url`, `mcp_frontend_url`, `mcp_resource_url` settings
- `backend/app/services/mcp_oauth.py` (new) — `ZeniOAuthProvider` implementing full OAuth provider protocol
- `backend/app/routers/oauth.py` (new) — `/api/oauth/requests/{id}` and `/api/oauth/approve` endpoints
- `backend/app/schemas/oauth.py` (new) — request/response schemas for OAuth endpoints
- `backend/app/mcp_server.py` — remove `token` from tools, add auth config, use `get_access_token()` + custom `ZeniAccessToken.user_id`
- `backend/main.py` — switch to `streamable_http_app()`, include oauth router
- `frontend/src/pages/OAuthAuthorizePage.tsx` (new) — login + consent page for OAuth flow
- `frontend/src/App.tsx` — add `/oauth/authorize` route

**Verification**

1. Run `uv run ruff format . && uv run ruff check . && uv run pyright` after all backend changes
2. Run `npm run build` (or `bun run build`) in frontend after frontend changes
3. Manual test: Add Zeni as remote MCP connector in Claude Desktop → should open browser to Zeni login → log in → approve → Claude gets authenticated → test a tool like "list my wallets"
4. Verify token appears in Settings > API Tokens page (named "MCP: {client_id}")
5. Verify `GET /mcp/.well-known/oauth-authorization-server` returns valid metadata JSON
6. Verify `POST /mcp/` without auth returns 401 with `WWW-Authenticate` header
7. Test token refresh: wait for access token to expire, verify Claude Desktop can refresh

**Scope boundaries**

- Included: Full OAuth 2.1 flow, PKCE, dynamic client registration, token revocation, streamable HTTP transport
- Excluded: Persistent OAuth client/code storage (in-memory only), scopes enforcement (all tokens get full access), HTTPS requirement (dev uses HTTP), multi-AS support
