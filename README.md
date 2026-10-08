![Keni: Money tracked without the friction](./frontend/public/og-image.png)

# Keni

[Official website](https://keni.seria.moe) | [Hosted instance](https://app.keni.seria.moe)

Keni is a personal finance tracker built for people who want to record detailed transaction logs without spending much effort.
It uses AI to take various kind of input (text, image, PDF, voice, etc.) and extract context about the transaction, then categorizes them for easier lookup in the future.

Keni is built with privacy in mind. You can self-host with Docker Compose for full data control, or try it out for free with the hosted instance.
For AI, Keni uses BYOK (bring your own key) and does not come with any cloud AI models. However, you can easily get free API keys from [Google Gemini](https://aistudio.google.com/) or [OpenRouter](https://openrouter.ai/).

## Demo

<https://github.com/user-attachments/assets/28d2920a-3d04-40c7-b652-16b8c19a7fdb>

## Features

- **⌘ K to log anything**: Use the command bar to record income, spending, recurring bills, grouped expenses, or multiple transactions at once. Using AI, Keni infers context, categorizes with high detail, and fills in the blanks.
- **Receipt & invoice scanning**: Upload a photo of a paper receipt or a PDF e-invoice. The AI reads the total, line items, merchant, and date, then records it for you.
- **Chat with your data**: Ask anything in plain language, like chatting with a personal finance advisor. Get real answers from your actual numbers.
- **Model agnostic**: Bring your own API key. Keni works with OpenAI, OpenRouter, Anthropic, and Google Gemini.
- **Voice input**: Tap the mic and speak your expense. Audio is processed locally, nothing leaves your server.
- **Multiple wallets**: Separate personal, business, travel, or shared expenses across wallets. Each wallet has its own currency, history, and analytics - perfect for people living across borders.
- **Categories & tags**: Organize expenses with categories and tags. The AI suggests both automatically based on context, reducing your input to near zero. Filter by either when reviewing your history.
- **MCP & API**: Connect Keni to your favorite AI agents via MCP, or integrate with third-party tools using your personal API key.
- **Budgets**: Set budgets by period, category, or wallet. Get a visual warning right on the dashboard when you are close to or exceeding your limit.
- **Dashboard analytics**: Monthly total, weekly pace, daily average, recent transactions, and a category breakdown chart.

## Self-Hosting

Requirements: [Docker](https://docs.docker.com/get-docker/).

1. Create a new folder and copy the [`docker-compose.yml`](docker-compose.yml) file into it.
2. Run `docker compose up -d`.
3. Open `http://localhost` and create your account, enjoy tracking your money with Keni!

### Configuration

Edit the `backend` service environment variables in [`docker-compose.yml`](docker-compose.yml):

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
| `STT_PROVIDER` | `local` | Speech-to-text provider: `local` (Whisper, runs on your server) or `external`. |
| `WHISPER_MODEL_SIZE` | `base` | Whisper model size: `tiny`, `base`, `small`, `medium`, `large`. |
| `MCP_ALLOWED_HOSTS` | `["127.0.0.1:*","localhost:*","[::1]:*"]` | JSON array of allowed `Host` header values for the MCP endpoint. Add your domain (e.g. `"api.example.com"`) when hosting behind a reverse proxy. |
| `MCP_ALLOWED_ORIGINS` | `["http://127.0.0.1:*","http://localhost:*","http://[::1]:*"]` | JSON array of allowed `Origin` header values for the MCP endpoint. Add your frontend origin when hosting on a custom domain. |

### Custom domain

Update `CORS_ORIGINS` to include your domain and expose port `443` via a reverse proxy (e.g. Caddy, Traefik, or nginx) in front of the `frontend` container.
