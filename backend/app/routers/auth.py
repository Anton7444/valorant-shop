import asyncio
import dataclasses
import logging
import secrets
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
    status: str  # "success" | "error"
    session_token: str | None = None
    puuid: str | None = None
    promo: bool = False
    error: str | None = None


# --- Endpoints ---

@router.get("/url")
async def get_login_url() -> AuthUrlResponse:
    """Return the Riot OAuth URL for the user to open in their browser."""
    return AuthUrlResponse(auth_url=riot_auth.get_auth_url())


@router.post("/token", response_model=LoginResponse)
async def submit_token(body: TokenSubmitRequest, request: Request) -> LoginResponse:
    """Accept the pasted redirect URL, extract tokens, and create a session."""
    _check_rate_limit(request.client.host if request.client else "unknown")

    try:
        tokens = riot_auth.extract_tokens(body.url)
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


# --- Login codes: carry a signed-in session to another browser ---

CODE_TTL = 600.0
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_codes_lock = threading.Lock()
_codes: dict[str, tuple[str, float]] = {}


class CodeRedeemRequest(BaseModel):
    code: str


@router.post("/code")
async def create_login_code(request: Request) -> dict:
    """Make a one-time code (10 minutes) that signs another browser in as this session."""
    token = _get_token_from_header(request)
    if not token or not store.get_valid(token):
        raise HTTPException(status_code=401, detail="Not authenticated")

    now = time.monotonic()
    code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))
    with _codes_lock:
        for key in [k for k, (_, exp) in _codes.items() if exp <= now]:
            del _codes[key]
        _codes[code] = (token, now + CODE_TTL)
    return {"code": code, "expires_in": int(CODE_TTL)}


@router.post("/code/redeem", response_model=LoginResponse)
async def redeem_login_code(body: CodeRedeemRequest, request: Request) -> LoginResponse:
    _check_rate_limit(request.client.host if request.client else "unknown")

    code = body.code.strip().upper()
    with _codes_lock:
        entry = _codes.pop(code, None)
    if not entry or entry[1] <= time.monotonic():
        return LoginResponse(status="error", error="That code is invalid or has expired.")

    source = store.get_valid(entry[0])
    if not source:
        return LoginResponse(status="error", error="The signed-in session has expired. Sign in again.")

    session_data = dataclasses.replace(source)
    new_token = store.create(session_data)
    # Same Riot tokens, so keep the original expiry rather than granting a fresh 3 hours.
    session_data.expires_at = source.expires_at
    return LoginResponse(
        status="success",
        session_token=new_token,
        puuid=source.puuid,
        promo=settings.is_promo_target(source.puuid),
    )
