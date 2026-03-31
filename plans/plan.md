# Zeni — Personal AI Expense Tracker: Master Plan

## Project Overview

Zeni is a self-hosted, open-source personal expense tracker with AI-powered features. It runs as a cross-platform web app distributed via Docker Compose. It supports multi-user households with full authentication and emphasizes frictionless expense recording through AI.

**Tech Stack:**
- Backend: FastAPI + uvicorn + SQLModel + PostgreSQL (asyncpg) + Alembic
- Frontend: React + Vite + TypeScript
- AI: BYOK (Bring Your Own Key) — Anthropic Claude (initial provider)
- Voice: `faster-whisper` (local, default) with optional BYOK external STT
- Deployment: Docker Compose (backend + frontend + postgres)

---

## User Flow Overview

### Core User Journey
1. **Sign Up / Log In** → Create account (no email verification). Admin can disable signups.
2. **Create Wallet** → Set name and currency (e.g., "Main Wallet — USD").
3. **Record Expense** → Via text, image, or voice. AI extracts amount, category, description, and date.
4. **Review & Edit** → AI-created records can be reviewed and adjusted.
5. **Browse & Filter** → List view with sorting, filtering by category/date/amount/wallet.
6. **Visualize** → Charts (bar, pie, trends) for spending insights.
7. **Chat with Data** → Ask natural language questions about spending history.
8. **Manage Budgets** → Set budgets per category; visual warnings on overruns.

### AI Expense Creation Flow
```
User Input (text / image / voice)
        │
        ▼
  [Voice?] ──yes──► faster-whisper / BYOK STT ──► transcript text
        │ no                                            │
        ▼                                               ▼
  [Image?] ──yes──► Send image + optional prompt to LLM
        │ no                │
        ▼                   ▼
  Text prompt ──────► Send text to LLM (Anthropic)
                            │
                            ▼
                  LLM returns structured JSON:
                  {amount, currency, category, description, date, ai_context}
                            │
                            ▼
                  Create expense record in selected wallet
                  (user can review/edit before or after saving)
```

### Chat with Data Flow
```
User question (natural language)
        │
        ▼
  Backend queries relevant expense data from DB
  (time ranges, categories, aggregations)
        │
        ▼
  Constructs LLM prompt with user question + data context
        │
        ▼
  LLM returns natural language answer
  (optionally with structured data for charts)
        │
        ▼
  Frontend displays response (text + optional chart)
```

---

## Data Model (High-Level)

### Entities
- **User** — id, username, password_hash, display_name, is_admin, created_at
- **Settings** — App-level settings (signups enabled, etc.)
- **AIProvider** — User's BYOK AI config (provider, api_key, model, per user)
- **Wallet** — id, user_id, name, currency, is_default, created_at
- **Category** — id, user_id, name, icon, color, type (expense/income), is_system (true for the permanent "Others" category)
- **Tag** — id, user_id, name, color
- **Expense** — id, wallet_id, category_id, amount, description, date, ai_context, created_at, updated_at
- **ExpenseTag** — expense_id, tag_id (many-to-many)
- **RecurringExpense** — id, wallet_id, category_id, amount, description, frequency, next_due, is_active
- **Budget** — id, user_id, wallet_id (nullable for all), category_id (nullable for overall), amount, period (monthly/weekly), start_date
- **APIToken** — id, user_id, name, token_hash, last_used, created_at, expires_at

---

## Phase Breakdown

### Phase 1: Requirements & Architecture Setup
**Goal:** Establish project structure, configuration, and development tooling.

- Define the backend project structure (app package, routers, models, services, etc.)
- Set up configuration management (pydantic-settings for env vars)
- Set up database connection with async SQLModel + asyncpg
- Configure Alembic for async migrations
- Set up CORS middleware
- Add health check endpoint
- Create `.env.example` with all configuration variables
- Set up Docker Compose (postgres + backend + frontend)

**Backend project structure:**
```
backend/
├── main.py                  # FastAPI app entry point
├── pyproject.toml
├── ruff.toml
├── alembic.ini
├── migrations/              # Alembic migrations
│   ├── env.py
│   └── versions/
├── app/
│   ├── __init__.py
│   ├── config.py            # Settings (pydantic-settings)
│   ├── database.py          # Async engine, session factory
│   ├── dependencies.py      # FastAPI dependencies (get_db, get_current_user, etc.)
│   ├── models/              # SQLModel table models
│   │   ├── __init__.py
│   │   ├── user.py
│   │   ├── wallet.py
│   │   ├── category.py
│   │   ├── tag.py
│   │   ├── expense.py
│   │   ├── recurring.py
│   │   ├── budget.py
│   │   └── api_token.py
│   ├── schemas/             # Pydantic request/response schemas
│   │   ├── __init__.py
│   │   ├── auth.py
│   │   ├── wallet.py
│   │   ├── category.py
│   │   ├── expense.py
│   │   └── ...
│   ├── routers/             # API route handlers
│   │   ├── __init__.py
│   │   ├── auth.py
│   │   ├── users.py
│   │   ├── wallets.py
│   │   ├── categories.py
│   │   ├── expenses.py
│   │   ├── tags.py
│   │   ├── budgets.py
│   │   ├── recurring.py
│   │   ├── ai.py
│   │   ├── chat.py
│   │   └── export.py
│   ├── services/            # Business logic
│   │   ├── __init__.py
│   │   ├── auth.py
│   │   ├── ai_expense.py    # AI-powered expense creation
│   │   ├── ai_chat.py       # Chat with data
│   │   ├── voice.py         # Voice transcription
│   │   ├── recurring.py     # Recurring expense scheduler
│   │   └── export.py
│   └── providers/           # External integrations
│       ├── __init__.py
│       ├── base.py          # Abstract LLM provider interface
│       ├── anthropic.py     # Anthropic Claude implementation
│       └── stt/
│           ├── base.py      # Abstract STT provider interface
│           ├── local.py     # faster-whisper
│           └── external.py  # BYOK STT APIs
```

### Phase 2: Database Schema & Migrations
**Goal:** Implement all SQLModel table models and create initial Alembic migration.

- Implement User model with password hashing (passlib + bcrypt)
- Implement Wallet model (linked to user, with currency)
- Implement Category model (user-defined categories + system "Others" category with `is_system` flag)
- Implement Tag model and ExpenseTag junction table
- Implement Expense model (with ai_context field for storing AI-extracted text from images)
- Implement RecurringExpense model
- Implement Budget model
- Implement APIToken model
- Implement AIProvider model (stores BYOK keys per user)
- Create initial Alembic migration
- Create seed logic for the system "Others" category (non-removable, auto-created per user on signup)
- Note: Users create their own categories freely — there is no pre-defined list beyond "Others"

### Phase 3: Authentication & User Management API
**Goal:** JWT-based auth with signup toggle.

- Add dependencies: `pyjwt`, `passlib[bcrypt]`, `pydantic-settings`
- Implement password hashing service
- Implement JWT token creation/validation (access + refresh tokens)
- `POST /api/auth/signup` — Create user (respects signup toggle)
- `POST /api/auth/login` — Returns JWT pair
- `POST /api/auth/refresh` — Refresh access token
- `GET /api/users/me` — Get current user profile
- `PATCH /api/users/me` — Update profile
- `PATCH /api/admin/settings` — Toggle signups (admin only)
- FastAPI dependency for `get_current_user` from JWT

### Phase 4: Core CRUD API — Wallets, Categories, Expenses, Tags
**Goal:** Full REST API for all core resources.

**Wallets:**
- `POST /api/wallets` — Create wallet (name, currency)
- `GET /api/wallets` — List user's wallets
- `GET /api/wallets/{id}` — Get wallet details + summary
- `PATCH /api/wallets/{id}` — Update wallet
- `DELETE /api/wallets/{id}` — Delete wallet (soft delete or cascade)

**Categories:**
- `GET /api/categories` — List user's categories (includes system "Others")
- `POST /api/categories` — Create new category
- `PATCH /api/categories/{id}` — Update category (cannot modify system "Others")
- `DELETE /api/categories/{id}` — Delete category (cannot delete system "Others"; reassigns expenses to "Others")

**Tags:**
- `GET /api/tags` — List user's tags
- `POST /api/tags` — Create tag
- `PATCH /api/tags/{id}` — Update tag
- `DELETE /api/tags/{id}` — Delete tag

**Expenses:**
- `POST /api/wallets/{wallet_id}/expenses` — Create expense manually
- `GET /api/wallets/{wallet_id}/expenses` — List expenses with filtering, sorting, pagination
  - Filters: date range, category, tags, amount range, search text
  - Sort: date, amount, category
- `GET /api/wallets/{wallet_id}/expenses/{id}` — Get expense details
- `PATCH /api/wallets/{wallet_id}/expenses/{id}` — Update expense
- `DELETE /api/wallets/{wallet_id}/expenses/{id}` — Delete expense
- `GET /api/wallets/{wallet_id}/expenses/summary` — Aggregated stats (totals by category, by time period)

### Phase 5: AI-Powered Expense Creation (BYOK — Anthropic)
**Goal:** Users configure their API keys; AI parses text and images into structured expense data.

- Implement abstract LLM provider interface
- Implement Anthropic Claude provider (using `anthropic` SDK)
- `POST /api/users/me/ai-provider` — Save/update BYOK config (provider, api_key, model)
- `GET /api/users/me/ai-provider` — Get current AI config (key masked)
- `DELETE /api/users/me/ai-provider` — Remove AI config
- Design the AI expense parsing prompt:
  - System prompt defines the output JSON schema (amount, currency, category, description, date)
  - Handle text-only input
  - Handle image input (sends image as base64 to Claude's vision)
  - Handle image + text combined input
  - AI receives the user's full category list and picks the best match
  - If no category matches, the expense is assigned to the system "Others" category
- `POST /api/wallets/{wallet_id}/expenses/ai` — AI-powered expense creation
  - Accepts: `{text?: string, image?: base64}` (multipart form)
  - Returns: parsed expense data for review + auto-saved record
  - Stores `ai_context` field with original input summary and AI reasoning
- Handle errors gracefully (no API key configured, invalid key, rate limits, unclear input)

### Phase 6: Voice Input
**Goal:** Accept audio input, transcribe it, then feed into the AI expense pipeline.

- Add `faster-whisper` as an optional dependency (for local transcription)
- Implement abstract STT provider interface
- Implement local STT provider (faster-whisper, configurable model size: tiny/base/small)
- Implement BYOK external STT provider (placeholder for future providers)
- `POST /api/wallets/{wallet_id}/expenses/voice` — Voice expense creation
  - Accepts audio file (webm/wav/mp3)
  - Transcribes audio → text
  - Feeds transcript into AI expense pipeline (reuses Phase 5 logic)
  - Returns parsed expense + transcript for review
- Configuration: choose between local and external STT in settings
- Frontend: browser MediaRecorder API for audio capture (planned for frontend phase)

### Phase 7: AI Chat with Data
**Goal:** Let users ask natural language questions about their spending.

- Implement chat service that:
  1. Analyzes the user's question to determine what data is needed
  2. Queries expense data (aggregations, filtered lists, trends)
  3. Constructs a prompt with the question + relevant data context
  4. Returns AI response (text, optionally structured data for charts)
- `POST /api/chat` — Send a message
  - Accepts: `{message: string, wallet_id?: uuid}` (optional wallet scope)
  - Returns: `{response: string, data?: object}` (data for optional chart rendering)
- Design the chat system prompt:
  - Give AI access to: expense summaries, category breakdowns, time-series data
  - Instruct AI to be helpful about spending insights and tips
  - Limit data sent to LLM (aggregate/summarize, don't send every row)

### Phase 8: Recurring Expenses, Budgets & Data Export
**Goal:** Implement scheduled expenses, budget tracking, and data export.

**Recurring Expenses:**
- `POST /api/wallets/{wallet_id}/recurring` — Create recurring expense
- `GET /api/wallets/{wallet_id}/recurring` — List recurring expenses
- `PATCH /api/wallets/{wallet_id}/recurring/{id}` — Update
- `DELETE /api/wallets/{wallet_id}/recurring/{id}` — Delete
- Background task (or startup check): on each app start / periodically, check for due recurring expenses and auto-create them
- Frequency options: daily, weekly, bi-weekly, monthly, yearly

**Budgets:**
- `POST /api/budgets` — Create budget (per category or overall, per wallet or all)
- `GET /api/budgets` — List budgets with current spending vs limit
- `PATCH /api/budgets/{id}` — Update budget
- `DELETE /api/budgets/{id}` — Delete budget
- Budget status calculation: query current period expenses, compare to limit
- Return percentage used and over/under status

**Data Export:**
- `GET /api/wallets/{wallet_id}/export?format=csv` — Export expenses as CSV
- `GET /api/wallets/{wallet_id}/export?format=json` — Export expenses as JSON
- Support date range filtering in export
- Include all expense fields + category name + tags

### Phase 9: API Tokens & MCP Server
**Goal:** External API access for integrations and an MCP server for AI assistants.

**API Tokens:**
- `POST /api/tokens` — Create API token (returns token once, stores hash)
- `GET /api/tokens` — List tokens (metadata only, no secrets)
- `DELETE /api/tokens/{id}` — Revoke token
- FastAPI dependency to authenticate via `Authorization: Bearer <token>` (check API token table)
- API tokens have same permissions as the user who created them

**MCP Server:**
- Implement an MCP (Model Context Protocol) server as a separate endpoint/process
- Expose Zeni tools via MCP:
  - `create_expense` — Create an expense record
  - `list_expenses` — Query expenses with filters
  - `get_summary` — Get spending summary
  - `list_wallets` — List wallets
  - `list_categories` — List categories
- Authentication via API token
- MCP transport: SSE (Server-Sent Events) or stdio-based (decide during implementation)

### Phase 10: Frontend
**Goal:** Build a responsive, clean web UI.

> This phase will be planned in detail when we reach it. High-level scope:

**Core Pages:**
- Login / Signup
- Dashboard (summary cards, recent expenses, quick-add input, charts)
- Wallet detail page (expense list with filters/sort, charts)
- Expense detail / edit modal
- AI expense creation (text input, image upload, voice record button)
- Chat interface (conversational UI for data questions)
- Settings (profile, AI provider config, API tokens, admin settings)
- Budgets page (budget cards with progress bars)
- Recurring expenses page

**Frontend Libraries (tentative):**
- Routing: React Router
- State management: TanStack Query (server state) + Zustand (client state)
- UI components: shadcn/ui (Tailwind-based)
- Charts: Recharts or Chart.js
- Forms: React Hook Form + Zod validation
- HTTP: fetch/axios with typed API client

### Phase 11: Docker Compose & Deployment
**Goal:** Production-ready containerized deployment.

- `Dockerfile` for backend (Python, uvicorn)
- `Dockerfile` for frontend (build stage → nginx for static serving)
- `docker-compose.yml` with:
  - `postgres` service (with volume for persistence)
  - `backend` service (depends on postgres, runs migrations on startup)
  - `frontend` service (nginx serving built React app, proxies `/api` to backend)
- `.env.example` with all required variables
- `README.md` with setup instructions
- Optional: health checks, restart policies, log configuration

---

## Feature Additions Summary

| Feature | Phase | Notes |
|---|---|---|
| Auth (JWT, signup toggle) | 3 | Multi-user, admin controls |
| Wallets (multi-currency) | 4 | Independent tracking per currency |
| Categories | 4 | User-defined + system "Others" |
| Tags | 4 | Free-form, many-to-many |
| Expense CRUD | 4 | Full filtering, sorting, pagination |
| AI Expense Parsing | 5 | Text + Image, BYOK Anthropic |
| Voice Input | 6 | Local faster-whisper + BYOK STT |
| AI Chat | 7 | Natural language data queries |
| Recurring Expenses | 8 | Scheduled auto-creation |
| Budgets | 8 | Per-category/overall limits |
| Data Export | 8 | CSV + JSON |
| API Tokens | 9 | For external integrations |
| MCP Server | 9 | For AI assistant integration |
| Frontend | 10 | Full web UI |
| Docker Deploy | 11 | Docker Compose distribution |

---

## Design Decisions

1. **BYOK only** — No bundled AI keys. Users must bring their own API keys. This keeps the project free to host and avoids billing complexity.

2. **No image storage** — Images sent for AI parsing are processed and discarded. Only the AI-extracted context text is stored in the `ai_context` field. This saves disk space significantly.

3. **Wallet-scoped expenses** — Expenses belong to a wallet, not directly to a user. This cleanly separates multi-currency tracking.

4. **JWT + API Token dual auth** — JWT for browser sessions, API tokens for programmatic access and MCP. Both resolve to a user.

5. **Local-first voice** — `faster-whisper` runs on the server for privacy. External STT is opt-in via BYOK.

6. **User-defined categories** — Users create their own categories freely. There are no pre-defined defaults beyond a permanent, non-removable "Others" category (auto-created per user on signup). When AI parses an expense, it receives the user's full category list and picks the best match. Anything unmatched goes to "Others". Deleting a category reassigns its expenses to "Others".
