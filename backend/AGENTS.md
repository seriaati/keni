# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Stack

- **Python 3.14**, FastAPI, SQLModel (SQLAlchemy async), Alembic, asyncpg (PostgreSQL)
- **Package manager**: `uv` — use `uv run` to execute commands
- **Linter/formatter**: `ruff` — configured in `ruff.toml`
- **Type checker**: `pyright` — configured in `pyproject.toml`

## Commands

> **Always use `uv run` to execute Python tools** — never call `python`, `alembic`, `ruff`, or `uvicorn` directly; they must be prefixed with `uv run`.

```sh
uv run uvicorn main:app --reload          # dev server (port 8000)
uv run alembic upgrade head               # apply migrations
uv run alembic revision --autogenerate -m "<msg>"  # generate migration
uv run ruff check .                       # lint
uv run ruff format .                      # format
uv run pyright                            # type check
```

Full-stack (run from **repo root**):
```sh
docker compose up -d   # starts postgres + backend + frontend
```

**After modifying any Python file**, always run:
```sh
uv run ruff format .
uv run ruff check .
uv run pyright
```

No test suite exists in this project.

## Architecture

```
main.py → routers/ → services/ → providers/ (LLM)
                   ↘ models/ (SQLModel table=True)
                   ↘ schemas/ (Pydantic BaseModel, request/response only)
```

- All DB access uses `AsyncSession` via `session.exec(select(...))` — never raw SQL
- `get_db` / `get_current_user` / `require_admin` are the standard FastAPI dependencies in `app/dependencies.py`
- Router files define `DbDep` and `CurrentUser` as module-level `Annotated` type aliases

## Critical Patterns

- **Models**: `SQLModel, table=True` with `__tablename__` explicitly set; UUIDs use `server_default=text("gen_random_uuid()")` with `default=None`; timestamps use `sa.Column(sa.DateTime(timezone=True), server_default=text("NOW()"))` — never Python-side defaults
- **`app/models/__init__.py` must import every model** — Alembic's `migrations/env.py` imports `app.models` to register all SQLModel metadata; missing imports = missing migrations
- **API key storage**: stored as base64 in `AIProvider.api_key_encrypted` via `_encrypt_key`/`_decrypt_key` in `app/services/ai_expense.py` — not real encryption, just obfuscation
- **Auth**: supports both JWT (`type: "access"`) and hashed API tokens in the same `Authorization: Bearer` header; logic in `app/dependencies.py`
- **Schemas vs models**: schemas (`app/schemas/`) are pure Pydantic `BaseModel` for request/response; models (`app/models/`) are `SQLModel` with `table=True`
- **`from __future__ import annotations`** is required in every file (ruff `future-annotations = true`)
- **TYPE_CHECKING imports**: types only used in annotations go under `if TYPE_CHECKING:` block (enforced by ruff `TC` rules); FastAPI route parameter types are exempt via `runtime-evaluated-decorators` in `ruff.toml`
- **Migrations**: never roll back — forward-only; run automatically via `entrypoint.sh` on container start

## Code Style

- Line length: 100 (but `E501` is ignored — ruff won't error on long lines)
- No trailing commas in collections (`skip-magic-trailing-comma = true`, `split-on-trailing-comma = false`)
- All annotations must be present (`ANN` rules enabled); `ANN401` (Any) and `ANN003` (**kwargs) are ignored
- Raise errors with string variables: `msg = "..."; raise ValueError(msg)` (EM rule)
- No `print()` — use `logging.getLogger(__name__)` (T20 rule)
- `pydocstyle` convention: Google style
