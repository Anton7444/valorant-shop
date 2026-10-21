import asyncio
import logging
import threading
import time

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.config import settings
from app.models.auth import SessionData
from app.services import riot_auth
from app.session_store import store

logger = logging.getLogger(__name__)

router = APIRouter()

# --- Rate limiting: 5 requests/minute per IP ---

_rate_lock = threading.Lock()
_rate_log: dict[str, list[float]] = {}
RATE_LIMIT = 5
RATE_WINDOW = 60.0


def _check_rate_limit(ip: str) -> None:
    now = time.monotonic()
    with _rate_lock:
        timestamps = _rate_log.get(ip, [])
        timestamps = [t for t in timestamps if now - t < RATE_WINDOW]
        if len(timestamps) >= RATE_LIMIT:
            raise HTTPException(status_code=429, detail="Too many requests. Try again later.")
        timestamps.append(now)
        _rate_log[ip] = timestamps


def _get_token_from_header(request: Request) -> str | None:
    """Extract session token from Authorization: Bearer <token> header."""
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return None


# --- Request/response models ---

class AuthUrlResponse(BaseModel):
    auth_url: str


class TokenSubmitRequest(BaseModel):
    url: str


class LoginResponse(BaseModel):
    status: str  # "success" | "mfa" | "error"
    session_token: str | None = None
    puuid: str | None = None
    promo: bool = False
    pending_id: str | None = None
    error: str | None = None


# --- Endpoints ---

@router.get("/url")
async def get_login_url() -> AuthUrlResponse:
    """Return the Riot OAuth URL for the user to open in their browser."""
    return AuthUrlResponse(auth_url=riot_auth.get_auth_url())


async def _login_from_url(url: str) -> LoginResponse:
    """Turn a Riot redirect URL (with tokens) into a server session."""
    try:
        tokens = riot_auth.extract_tokens(url)
        access_token = tokens["access_token"]
        id_token = tokens.get("id_token", "")

        # These three calls hit independent Riot endpoints, so run them
        # concurrently instead of paying for three sequential round-trips.
        entitlements, puuid, (region, shard) = await asyncio.gather(
            riot_auth.get_entitlements(access_token),
            riot_auth.get_player_info(access_token),
            riot_auth.get_region(access_token, id_token),
        )

        session_data = SessionData(
            access_token=access_token,
            entitlements_token=entitlements,
            puuid=puuid,
            shard=shard,
            region=region,
        )
        session_token = store.create(session_data)

        return LoginResponse(
            status="success",
            session_token=session_token,
            puuid=puuid,
            promo=settings.is_promo_target(puuid),
        )

    except riot_auth.AuthenticationError as e:
        return LoginResponse(status="error", error=str(e))
    except riot_auth.RateLimitError:
        return LoginResponse(status="error", error="Rate limited by Riot servers. Try again shortly.")
    except httpx.HTTPStatusError as e:
        logger.error("Riot API HTTP error: %s", e.response.status_code)
        return LoginResponse(status="error", error=f"Riot API error ({e.response.status_code})")
    except httpx.RequestError as e:
        logger.error("Network error contacting Riot: %s", e)
        return LoginResponse(status="error", error="Could not reach Riot servers. Try again.")
    except Exception:
        logger.exception("Token submission failed")
        return LoginResponse(status="error", error="Authentication failed unexpectedly")


@router.post("/token", response_model=LoginResponse)
async def submit_token(body: TokenSubmitRequest, request: Request) -> LoginResponse:
    """Accept the pasted redirect URL, extract tokens, and create a session."""
    _check_rate_limit(request.client.host if request.client else "unknown")
    return await _login_from_url(body.url)


class PasswordLoginRequest(BaseModel):
    username: str
    password: str


class MfaRequest(BaseModel):
    pending_id: str
    code: str


async def _password_step(call) -> LoginResponse:
    try:
        status, uri, pending_id = await call()
    except riot_auth.AuthenticationError as e:
        return LoginResponse(status="error", error=str(e))
    except riot_auth.RateLimitError:
        return LoginResponse(status="error", error="Rate limited by Riot servers. Try again shortly.")
    except httpx.RequestError:
        return LoginResponse(status="error", error="Could not reach Riot servers. Try again.")
    except Exception:
        # Deliberately no details: the request body holds the password.
        logger.error("Password sign-in failed unexpectedly")
        return LoginResponse(status="error", error="Sign-in failed unexpectedly")
    if status == "mfa":
        return LoginResponse(status="mfa", pending_id=pending_id)
    return await _login_from_url(uri)


@router.post("/password", response_model=LoginResponse)
async def password_login(body: PasswordLoginRequest, request: Request) -> LoginResponse:
    """Experimental: sign in with Riot username/password from this server."""
    _check_rate_limit(request.client.host if request.client else "unknown")
    return await _password_step(lambda: riot_auth.password_login(body.username, body.password))


@router.post("/password/mfa", response_model=LoginResponse)
async def password_mfa(body: MfaRequest, request: Request) -> LoginResponse:
    _check_rate_limit(request.client.host if request.client else "unknown")

    async def call():
        return "done", await riot_auth.submit_mfa(body.pending_id, body.code), None

    return await _password_step(call)


@router.post("/logout")
async def logout(request: Request) -> dict:
    token = _get_token_from_header(request)
    if token:
        store.delete(token)
    return {"status": "ok"}


@router.get("/session")
async def check_session(request: Request) -> dict:
    token = _get_token_from_header(request)
    if not token:
        return {"valid": False}

    session = store.get_valid(token)
    if not session:
        return {"valid": False}

    return {"valid": True, "puuid": session.puuid}
