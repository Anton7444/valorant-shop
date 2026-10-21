"""Riot authentication service.

Uses OAuth implicit-grant flow — the user logs in via their real browser
on Riot's login page. After login, Riot redirects to localhost with tokens
in the URL fragment. Since the app is deployed remotely, the user copies
the redirect URL and pastes it into the frontend, which extracts the
tokens and sends them to the backend.

Downstream API calls (entitlements, userinfo, geo, storefront) use the
access_token obtained from the redirect.
"""

import logging
from urllib.parse import parse_qs, urlparse

import httpx

logger = logging.getLogger(__name__)

AUTH_URL = (
    "https://auth.riotgames.com/authorize"
    "?redirect_uri=http%3A%2F%2Flocalhost%2Fredirect"
    "&client_id=riot-client"
    "&response_type=token%20id_token"
    "&nonce=1"
    "&scope=openid%20link%20ban%20lol_region%20account"
    "&prompt=login"
)

ENTITLEMENTS_URL = "https://entitlements.auth.riotgames.com/api/token/v1"
USERINFO_URL = "https://auth.riotgames.com/userinfo"
GEO_URL = "https://riot-geo.pas.si.riotgames.com/pas/v1/product/valorant"

REGION_TO_SHARD = {
    "na": "na",
    "eu": "eu",
    "ap": "ap",
    "kr": "kr",
    "latam": "na",
    "br": "na",
}


class AuthenticationError(Exception):
    """Raised when authentication fails."""


class RateLimitError(Exception):
    """Raised when Riot rate-limits the request."""


def _check_rate_limit(response: httpx.Response) -> None:
    if response.status_code == 429:
        raise RateLimitError("Rate limited by Riot auth servers")


def get_auth_url() -> str:
    """Return the Riot OAuth URL for the user to open in their browser."""
    return AUTH_URL


def extract_tokens(url: str) -> dict[str, str]:
    """Extract access_token and id_token from a pasted redirect URL.

    The URL looks like: http://localhost/redirect#access_token=...&id_token=...
    """
    parsed = urlparse(url)
    fragment = parsed.fragment

    # Also handle cases where user pastes just the fragment or query
    if not fragment and parsed.query:
        fragment = parsed.query
    if not fragment:
        raise AuthenticationError(
            "Could not find tokens in the URL. Make sure you copied the "
            "full URL from the address bar after logging in."
        )

    params = parse_qs(fragment)
    access_token = params.get("access_token", [None])[0]
    id_token = params.get("id_token", [""])[0]

    if not access_token:
        raise AuthenticationError(
            "No access token found in the URL. Make sure you copied the "
            "full URL including everything after the # symbol."
        )

    return {"access_token": access_token, "id_token": id_token}


# --- Downstream API calls ---

async def get_entitlements(access_token: str) -> str:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            ENTITLEMENTS_URL,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json={},
        )
        _check_rate_limit(resp)
        resp.raise_for_status()
        return resp.json()["entitlements_token"]


async def get_player_info(access_token: str) -> str:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        _check_rate_limit(resp)
        resp.raise_for_status()
        return resp.json()["sub"]


async def get_region(access_token: str, id_token: str) -> tuple[str, str]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.put(
            GEO_URL,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json={"id_token": id_token},
        )
        _check_rate_limit(resp)
        resp.raise_for_status()
        data = resp.json()
        region = data.get("affinities", {}).get("live", "na")
        shard = REGION_TO_SHARD.get(region, "na")
        return region, shard


# --- Experimental: sign in with username/password from this server ---
#
# Mirrors what the Riot client does against auth.riotgames.com. Riot may refuse
# it (Cloudflare / captcha); in that case AuthenticationError explains why.
# Credentials are only forwarded to Riot and are never logged or stored.

import ssl
import time
import uuid

RSO_URL = "https://auth.riotgames.com/api/v1/authorization"
RSO_HEADERS = {
    "User-Agent": "RiotClient/63.0.9.4909983.4789131 rso-auth (Windows;10;;Professional, x64)",
    "Content-Type": "application/json",
    "Accept": "application/json",
}
PENDING_TTL = 300.0
_pending: dict[str, tuple[httpx.AsyncClient, float]] = {}


def _rso_client() -> httpx.AsyncClient:
    ctx = ssl.create_default_context()
    try:
        ctx.set_ciphers("ECDHE+AESGCM:ECDHE+CHACHA20:DHE+AESGCM:DHE+CHACHA20")
    except ssl.SSLError:
        pass
    return httpx.AsyncClient(verify=ctx, headers=RSO_HEADERS, timeout=20.0)


async def _drop_expired() -> None:
    now = time.monotonic()
    for key in [k for k, (_, exp) in _pending.items() if exp <= now]:
        client, _ = _pending.pop(key)
        await client.aclose()


def _interpret(data: dict) -> tuple[str, str | None]:
    """Return ("done", redirect_uri) or ("mfa", None); raise on failure."""
    kind = data.get("type")
    if kind == "response":
        uri = data.get("response", {}).get("parameters", {}).get("uri")
        if not uri:
            raise AuthenticationError("Riot's reply had no login result.")
        return "done", uri
    if kind == "multifactor":
        return "mfa", None
    if data.get("error") == "rate_limited":
        raise RateLimitError("Rate limited by Riot auth servers")
    if data.get("error") == "auth_failure":
        raise AuthenticationError("Wrong username or password.")
    if data.get("error") == "multifactor_attempt_failed":
        raise AuthenticationError("Wrong verification code.")
    raise AuthenticationError(f"Riot refused the sign-in ({data.get('error') or kind or 'unknown'}).")


async def _rso_put(client: httpx.AsyncClient, payload: dict) -> dict:
    resp = await client.put(RSO_URL, json=payload)
    _check_rate_limit(resp)
    if resp.status_code in (403, 503) or "text/html" in resp.headers.get("content-type", ""):
        raise AuthenticationError(
            "Riot blocked the sign-in from this server (Cloudflare/captcha). "
            "Use the browser sign-in instead."
        )
    try:
        return resp.json()
    except ValueError:
        raise AuthenticationError("Unexpected reply from Riot.")


async def password_login(username: str, password: str) -> tuple[str, str | None, str | None]:
    """Start a sign-in. Returns (status, redirect_uri, pending_id): status is "done" or "mfa"."""
    await _drop_expired()
    client = _rso_client()
    try:
        init = await client.post(
            RSO_URL,
            json={
                # The web client id is the one Riot's auth API accepts for
                # password sign-ins; "riot-client" is only valid in the browser flow.
                "client_id": "play-valorant-web-prod",
                "nonce": "1",
                "redirect_uri": "https://playvalorant.com/opt_in",
                "response_type": "token id_token",
                "scope": "account openid",
            },
        )
        _check_rate_limit(init)
        if init.status_code in (403, 503) or "text/html" in init.headers.get("content-type", ""):
            raise AuthenticationError(
                "Riot blocked the sign-in from this server (Cloudflare/captcha). "
                "Use the browser sign-in instead."
            )
        init_error = init.json().get("error") if init.headers.get("content-type", "").startswith("application/json") else None
        if init_error:
            raise AuthenticationError(f"Riot refused to start the sign-in ({init_error}).")
        data = await _rso_put(
            client,
            {"type": "auth", "username": username, "password": password, "remember": False, "language": "en_US"},
        )
        status, uri = _interpret(data)
    except BaseException:
        await client.aclose()
        raise
    if status == "mfa":
        pending_id = str(uuid.uuid4())
        _pending[pending_id] = (client, time.monotonic() + PENDING_TTL)
        return "mfa", None, pending_id
    await client.aclose()
    return "done", uri, None


async def submit_mfa(pending_id: str, code: str) -> str:
    """Finish a sign-in that needs a verification code. Returns the redirect URI."""
    await _drop_expired()
    entry = _pending.pop(pending_id, None)
    if not entry:
        raise AuthenticationError("That sign-in expired. Start again.")
    client = entry[0]
    try:
        data = await _rso_put(client, {"type": "multifactor", "code": code.strip(), "rememberDevice": False})
        status, uri = _interpret(data)
        if status != "done" or not uri:
            raise AuthenticationError("Verification failed.")
        return uri
    finally:
        await client.aclose()
