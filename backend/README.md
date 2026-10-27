# Backend — Valorant Shop Checker API

FastAPI backend that authenticates with Riot's OAuth flow and fetches store data.

## Running Locally

```bash
python -m venv .venv
source .venv/bin/activate    # Linux/macOS
# .venv\Scripts\activate     # Windows

pip install -e .
cp .env.example .env         # fill in ENCRYPTION_KEY
uvicorn app.main:app --reload
```

The server starts at `http://localhost:8000`.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ENCRYPTION_KEY` | Yes | Fernet key for session encryption. Generate: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `ALLOWED_ORIGINS` | No | Comma-separated CORS origins. Default: `http://localhost:5173,http://localhost:3000,http://localhost` |
| `ENVIRONMENT` | No | `development` or `production`. Default: `development` |

## API Endpoints

### Auth

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/auth/url` | Returns the Riot OAuth URL for the user to open |
| `POST` | `/api/auth/token` | Accepts the pasted redirect URL, extracts tokens, creates a session |
| `GET` | `/api/auth/session` | Check if the current session is valid |
| `POST` | `/api/auth/logout` | Invalidate the current session |

### Store

All store endpoints require `Authorization: Bearer <session_token>` header.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/store/daily` | Daily rotating skin offers (4 skins) |
| `GET` | `/api/store/bundle` | Currently featured bundles |
| `GET` | `/api/store/wallet` | VP and Radianite Point balance |

### Health

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check (`{"status": "ok"}`) |

## Docker

```bash
docker build -t valshop-backend .
docker run -d \
  --name valshop-backend \
  -p 8000:8000 \
  --env-file .env \
  --restart unless-stopped \
  valshop-backend
```

## Project Structure

```
app/
├── main.py              # FastAPI app, middleware, lifespan
├── config.py            # Settings via pydantic-settings
├── session_store.py     # Thread-safe in-memory session store (TTL-based)
├── routers/
│   ├── auth.py          # Auth endpoints + rate limiting
│   └── store.py         # Store endpoints + Riot API error handling
├── services/
│   ├── riot_auth.py     # OAuth URL, token extraction, downstream Riot API calls
│   ├── storefront.py    # Storefront/wallet fetching + UUID resolution
│   └── asset_cache.py   # Startup cache from valorant-api.com (skins, tiers, bundles)
└── models/
    ├── auth.py          # SessionData dataclass
    └── store.py         # Pydantic response models
```
