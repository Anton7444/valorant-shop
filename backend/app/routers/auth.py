import asyncio
import ipaddress
import logging
import threading
import time

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.config import settings
from app.models.auth import SessionData
from app.services import riot_auth
from app.accounts import accounts
from app.session_store import store

logger = logging.getLogger(__name__)

router = APIRouter()

# --- Rate limiting: 5 requests/minute per IP ---

_rate_lock = threading.Lock()
_rate_log: dict[str, list[float]] = {}
RATE_LIMIT = 5
RATE_WINDOW = 60.0


_RATE_MAX_KEYS = 10_000
_rate_last_sweep = 0.0


def _check_rate_limit(ip: str) -> None:
    global _rate_last_sweep
    now = time.monotonic()
    with _rate_lock:
        # Forget idle clients now and then so the table cannot grow without bound.
        if len(_rate_log) > _RATE_MAX_KEYS or now - _rate_last_sweep > 300:
            _rate_last_sweep = now
            for key in [k for k, v in _rate_log.items() if not v or now - v[-1] >= RATE_WINDOW]:
                del _rate_log[key]
        timestamps = _rate_log.get(ip, [])
        timestamps = [t for t in timestamps if now - t < RATE_WINDOW]
        if len(timestamps) >= RATE_LIMIT:
            raise HTTPException(status_code=429, detail="Too many requests. Try again later.")
        timestamps.append(now)
        _rate_log[ip] = timestamps


def _client_ip(request: Request) -> str:
    """The real client IP, not the reverse proxy's loopback address.

    Assumes exactly one trusted proxy (Caddy) in front of this service. It appends the address it saw
    as the LAST entry of X-Forwarded-For, so the right-most value cannot be forged by the client;
    anything earlier in the header can be, so it is ignored. Without this, request.client.host is
    always the proxy's own address and the per-IP rate limit collapses into one bucket shared by every
    visitor, which lets a single attacker lock everybody out of login and account linking.

    IPv6 clients are counted per /64 (the block an ISP hands to one subscriber), not per address.
    """
    xff = request.headers.get("x-forwarded-for", "")
    parts = [p.strip() for p in xff.split(",") if p.strip()]
    raw = parts[-1] if parts else (request.client.host if request.client else "unknown")
    try:
        addr = ipaddress.ip_address(raw)
    except ValueError:
        return raw
    if addr.version == 6:
        if addr.ipv4_mapped:
            return str(addr.ipv4_mapped)
        return str(ipaddress.ip_network(f"{addr}/64", strict=False))
    return str(addr)


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
    url: str = Field(max_length=16_384)  # a pasted Riot redirect URL is a few KB at most


class LoginResponse(BaseModel):
    status: str  # "success" | "error"
    session_token: str | None = None
    puuid: str | None = None
    promo: bool = False
    error: str | None = None


# --- Endpoints ---

@router.get("/url")
async def get_login_url(silent: bool = False) -> AuthUrlResponse:
    """Return the Riot OAuth URL for the user to open in their browser."""
    return AuthUrlResponse(auth_url=riot_auth.get_auth_url(silent))


@router.post("/token", response_model=LoginResponse)
async def submit_token(body: TokenSubmitRequest, request: Request) -> LoginResponse:
    """Accept the pasted redirect URL, extract tokens, and create a session."""
    _check_rate_limit(_client_ip(request))

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
        accounts.drop_device(token)
    return {"status": "ok"}


@router.get("/session")
async def check_session(request: Request) -> dict:
    token = _get_token_from_header(request)
    if not token:
        return {"valid": False}

    sub = accounts.sub_for_token(token)
    if sub:
        from app.routers.account import summary  # local import: account.py imports this module

        info = summary(sub)
        return {"valid": True, "puuid": info["riot"]["puuid"], "account": info}

    session = store.get_valid(token)
    if not session:
        return {"valid": False}

    return {"valid": True, "puuid": session.puuid}
