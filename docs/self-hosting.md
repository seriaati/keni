# Self-Hosting

Requirements: [Docker](https://docs.docker.com/get-docker/).

1. Create a new folder and copy the [`docker-compose.yml`](../docker-compose.yml) file into it.
2. Run `docker compose up -d`.
3. Open `http://localhost` and create your account, enjoy tracking your money with Keni!

## Configuration

Edit the `backend` service environment variables in [`docker-compose.yml`](../docker-compose.yml):

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | — | **Required.** PostgreSQL connection string. |
| `SECRET_KEY` | — | **Required.** Long random string used to sign JWT tokens. |
| `ALGORITHM` | `HS256` | JWT signing algorithm. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | Access token expiration time in minutes. |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `30` | Refresh token expiration time in days. |
| `CORS_ORIGINS` | `["http://localhost:5173","http://localhost:3000"]` | JSON array of allowed origins. Change if hosting on a custom domain. |
| `SIGNUPS_ENABLED` | `true` | Set to `false` to prevent new registrations after your account is created. |
| `DATA_RETENTION_ENABLED` | `false` | Enable automatic deletion of old data. |
| `DATA_RETENTION_DAYS` | `14` | Number of days to retain data before deletion. |
| `DATA_RETENTION_EXEMPT_USERNAMES` | `[]` | JSON array of usernames exempt from data retention. |
| `RECURRING_INTERVAL_MINUTES` | `60` | Interval in minutes for processing recurring transactions. |
| `DATA_RETENTION_INTERVAL_HOURS` | `24` | Interval in hours for running data retention cleanup. |
| `AI_BASE_URL_ALLOWLIST` | `[]` | JSON array of origins users may point the OpenAI-compatible provider at, e.g. `["http://ollama:11434"]` for a local Ollama. `["*"]` allows any URL. Empty disables the provider. Only widen this on instances where you trust every user, since the server makes requests to these URLs. |
| `STT_PROVIDER` | `local` | Speech-to-text provider: `local` (Whisper, runs on your server) or `external`. |
| `WHISPER_MODEL_SIZE` | `base` | Whisper model size: `tiny`, `base`, `small`, `medium`, `large`. |
| `MCP_ALLOWED_HOSTS` | `["127.0.0.1:*","localhost:*","[::1]:*"]` | JSON array of allowed `Host` header values for the MCP endpoint. Add your domain (e.g. `"api.example.com"`) when hosting behind a reverse proxy. |
| `MCP_ALLOWED_ORIGINS` | `["http://127.0.0.1:*","http://localhost:*","http://[::1]:*"]` | JSON array of allowed `Origin` header values for the MCP endpoint. Add your frontend origin when hosting on a custom domain. |

## Custom domain

Update `CORS_ORIGINS` to include your domain and expose port `443` via a reverse proxy (e.g. Caddy, Traefik, or nginx) in front of the `frontend` container.

## Local and custom AI models

Besides the cloud providers, Keni can use any server with an OpenAI-compatible API, such as [Ollama](https://ollama.com), [LM Studio](https://lmstudio.ai) or [vLLM](https://docs.vllm.ai). This option is off by default because the Keni server sends requests to whatever URL is configured.

1. Add the server's origin to `AI_BASE_URL_ALLOWLIST` on the `backend` service, e.g. `AI_BASE_URL_ALLOWLIST: '["http://ollama:11434"]'` for an `ollama` service in the same Compose file. Use `'["*"]'` to allow any URL, but only when you trust every user on your instance.
2. Restart the stack with `docker compose up -d`.
3. In Keni, go to **Settings → AI**, choose **OpenAI-compatible (self-hosted)** and enter the base URL, usually ending in `/v1` (e.g. `http://ollama:11434/v1`). The API key is optional.

Receipt scanning needs a model with vision support, and chat works best with a model that handles tool calling well.
