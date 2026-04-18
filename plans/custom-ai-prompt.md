## Plan: Custom AI Prompt for Expense Parsing

Users can set a persistent custom prompt that is appended to the system prompt every time they create expenses with AI. Configurable in the Settings page under a new section in the AI Provider tab.

**Steps**

### Phase 1: Backend — Model & Schema (sequential)

1. Add `custom_ai_prompt` field to the `User` model in `app/models/user.py` — `str | None`, `Field(default=None, max_length=500)`. This lives on the User, not on AIProvider, because it's a user preference independent of which provider is configured.
2. Generate an Alembic migration: `uv run alembic revision --autogenerate -m "add_user_custom_ai_prompt"` — adds a nullable `VARCHAR(500)` column to the `users` table.
3. Add `custom_ai_prompt` to `UpdateProfileRequest` in `app/schemas/auth.py` — `custom_ai_prompt: str | None = Field(default=None, max_length=500)`.
4. Add `custom_ai_prompt` to `UserResponse` in `app/schemas/auth.py` — `custom_ai_prompt: str | None = None`.
5. Handle the new field in the `PATCH /api/users/me` handler in `app/routers/users.py` — same pattern as `timezone`: `if body.custom_ai_prompt is not None: current_user.custom_ai_prompt = body.custom_ai_prompt`.

### Phase 2: Backend — Inject into AI Prompt (depends on Phase 1)

1. Update `parse_transactions_with_ai()` in `app/services/ai_transaction.py` to read the user's `custom_ai_prompt` from the User record and pass it to `provider.parse_transactions()` as a new `custom_prompt: str | None` kwarg.
2. Update the `LLMProvider.parse_transactions()` abstract method signature in `app/providers/base.py` to accept `custom_prompt: str | None = None`.
3. In each provider implementation (`anthropic.py`, `gemini.py`, `openai_compat.py`), append the custom prompt to `prompt_text` if provided. Insert it right before the user input line, e.g.:

   ```
   Today's date: ...
   Available categories: ...
   Available tags: ...
   Custom instructions: {custom_prompt}
   
   User input: ...
   ```

### Phase 3: Frontend — Types & API (parallel with Phase 2)

1. Add `custom_ai_prompt: string | null` to `UserResponse` in `frontend/src/lib/types.ts`.
2. Update the `users.update()` call signature in `frontend/src/lib/api.ts` to accept `custom_ai_prompt?: string | null`.

### Phase 4: Frontend — Settings UI (depends on Phase 3)

1. In `SettingsPage.tsx`, add a "Custom AI Prompt" section inside the existing `AIProviderTab` component (or as a new card below the provider card). It should:
    - Show a `<textarea>` for the custom prompt (max 500 chars, with character counter)
    - Include a hint like "Instructions applied to every AI expense parsing (e.g. 'Always use USD', 'Categorize Uber as Transport')"
    - Save via `users.update({ custom_ai_prompt: ... })` on button click
    - Load initial value from `useAuth().user.custom_ai_prompt`
    - Be independent of whether an AI provider is configured (it's a user-level preference)

**Relevant files**

- `backend/app/models/user.py` — add `custom_ai_prompt` field
- `backend/app/schemas/auth.py` — add to `UpdateProfileRequest` and `UserResponse`
- `backend/app/routers/users.py` — handle field in PATCH handler
- `backend/app/services/ai_transaction.py` — read from User, pass to provider in `parse_transactions_with_ai()`
- `backend/app/providers/base.py` — update `LLMProvider.parse_transactions()` signature
- `backend/app/providers/anthropic.py` — append custom prompt to `prompt_text`
- `backend/app/providers/gemini.py` — append custom prompt to `prompt_text`
- `backend/app/providers/openai_compat.py` — append custom prompt to `prompt_text`
- `frontend/src/lib/types.ts` — add field to `UserResponse`
- `frontend/src/lib/api.ts` — update `users.update()` parameter type
- `frontend/src/pages/SettingsPage.tsx` — add textarea UI in AI Provider tab

**Verification**

1. Run `uv run alembic upgrade head` — migration applies cleanly
2. Run `uv run ruff format . && uv run ruff check . && uv run pyright` — no lint/type errors
3. Run `npm run build` (or `bun run build`) in frontend — no TS errors
4. Manual test: Set a custom prompt like "Always use JPY as currency" in Settings → AI Provider tab → save → create an expense via AI → confirm the prompt influenced the result
5. Manual test: Clear the custom prompt → create an expense → confirm default behavior

**Decisions**

- Field lives on `User` model (not `AIProvider`) — it's a user preference, not provider-specific. This also means the textarea can be shown even if no provider is configured yet.
- Max length 500 chars — enough for meaningful instructions without allowing abuse
- Custom prompt is injected into the user message (not system prompt) as "Custom instructions:" — keeps the system prompt clean and consistent across all users
- Only affects `parse_transactions` (expense creation), not `chat_with_data` (chat/insights) — scope limited to what was requested
