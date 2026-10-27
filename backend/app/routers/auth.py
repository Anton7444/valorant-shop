import asyncio
import secrets
from datetime import timedelta
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
    ssid: str | None = None  # Riot's session cookie, sent by the login helper extension


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


async def _login_from_url(url: str, ssid: str | None = None) -> LoginResponse:
    """Turn a Riot redirect URL (with tokens in its fragment) into a server session."""
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
        if ssid:
            # Backed by an ssid cookie, so the server can renew the tokens: keep it for a day.
            session_data.ssid = ssid
            session_data.expires_at = session_data.created_at + timedelta(hours=24)

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
    ssid = None
    if body.ssid:
        try:
            ssid = riot_auth.clean_ssid(body.ssid)
        except riot_auth.AuthenticationError:
            ssid = None  # a bad cookie just means no auto-renewal; the sign-in itself still works
    return await _login_from_url(body.url, ssid=ssid)


class SsidRequest(BaseModel):
    ssid: str


@router.post("/ssid", response_model=LoginResponse)
async def sign_in_with_ssid(body: SsidRequest, request: Request) -> LoginResponse:
    """Sign in with Riot's `ssid` cookie (copied from a browser where you are signed in).

    Lets a computer that cannot open Riot's login page use the site. The cookie is kept only in
    server memory, to renew the tokens while the session lasts.
    """
    _check_rate_limit(request.client.host if request.client else "unknown")
    try:
        ssid = riot_auth.clean_ssid(body.ssid)
        tokens, next_ssid = await riot_auth.reauthenticate(ssid)
    except riot_auth.AuthenticationError as e:
        return LoginResponse(status="error", error=str(e))
    except riot_auth.RateLimitError:
        return LoginResponse(status="error", error="Rate limited by Riot servers. Try again shortly.")
    except httpx.RequestError:
        return LoginResponse(status="error", error="Could not reach Riot servers. Try again.")
    fragment = f"access_token={tokens['access_token']}&id_token={tokens.get('id_token', '')}"
    return await _login_from_url(f"http://localhost/redirect#{fragment}", ssid=next_ssid)


# --- School/other-computer codes: a short code that signs another browser in as this account ---

CODE_TTL = 24 * 3600.0
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_codes_lock = threading.Lock()
_codes: dict[str, tuple[str, float]] = {}  # code -> (session token it came from, expiry)


class CodeRedeemRequest(BaseModel):
    code: str


def _normalise_code(code: str) -> str:
    return "".join(ch for ch in code.upper() if ch in CODE_ALPHABET)


@router.post("/code")
async def create_login_code(request: Request) -> dict:
    """Make a code (valid 24h) that signs another browser in as this account.

    Needs a session that has Riot's ssid cookie (signed in through the login helper extension or
    the ssid box), because that cookie is what lets the server renew the tokens later.
    """
    token = _get_token_from_header(request)
    session = store.get_valid(token) if token else None
    if not session:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not session.ssid:
        raise HTTPException(
            status_code=409,
            detail="This sign-in has no Riot session cookie. Sign in with the login helper extension (or the ssid box) first.",
        )
    now = time.monotonic()
    code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(10))
    with _codes_lock:
        for key in [k for k, (_, exp) in _codes.items() if exp <= now]:
            del _codes[key]
        for key in [k for k, (t, _) in _codes.items() if t == token]:
            del _codes[key]  # one live code per session
        _codes[code] = (token, now + CODE_TTL)
    return {"code": f"{code[:5]}-{code[5:]}", "expires_in": int(CODE_TTL)}


@router.post("/code/redeem", response_model=LoginResponse)
async def redeem_login_code(body: CodeRedeemRequest, request: Request) -> LoginResponse:
    _check_rate_limit(request.client.host if request.client else "unknown")
    code = _normalise_code(body.code)
    with _codes_lock:
        entry = _codes.get(code)
        if entry and entry[1] <= time.monotonic():
            del _codes[code]
            entry = None
    source = store.get_valid(entry[0]) if entry else None
    if not source or not source.ssid:
        return LoginResponse(status="error", error="That code is invalid or has expired.")
    try:
        tokens, next_ssid = await riot_auth.reauthenticate(source.ssid)
    except riot_auth.AuthenticationError as e:
        return LoginResponse(status="error", error=str(e))
    except riot_auth.RateLimitError:
        return LoginResponse(status="error", error="Rate limited by Riot servers. Try again shortly.")
    except httpx.RequestError:
        return LoginResponse(status="error", error="Could not reach Riot servers. Try again.")
    source.ssid = next_ssid  # Riot may have rotated the cookie
    fragment = f"access_token={tokens['access_token']}&id_token={tokens.get('id_token', '')}"
    return await _login_from_url(f"http://localhost/redirect#{fragment}", ssid=next_ssid)


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
