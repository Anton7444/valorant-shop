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
import re
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


# Matches the cookie header however devtools formatted it when copied:
#   -H 'cookie: a=b; c=d'          (Copy as cURL, bash, header form)
#   -H "cookie: a=b; c=d"          (Copy as cURL, cmd/PowerShell, header form)
#   "cookie": "a=b; c=d"           (Copy as fetch)
#   Cookie: a=b; c=d               (Copy request headers / raw headers)
_COOKIE_HEADER_RE = re.compile(r"cookie[\"']?\s*[:=]\s*[\"']?([^\"'\n\r]+)", re.IGNORECASE)

# Chrome's Windows "Copy as cURL (cmd)" sends cookies via curl's -b/--cookie
# flag instead of a -H header, and caret-escapes every special character
# (^" ^% ^& ^$ ...) for cmd.exe. Neither form contains the word "cookie".
_CURL_B_FLAG_RE = re.compile(r"(?:-b|--cookie)\s+\^?[\"']([^\"']+)\^?[\"']", re.IGNORECASE)


def parse_cookie_header(raw: str) -> dict[str, str]:
    """Parse a pasted cookie string into a dict.

    Accepts a full "Copy as ..." command/headers block from devtools
    (cURL bash/cmd — including the -b/--cookie flag form, fetch,
    raw/request headers — whichever the browser offers) and pulls the
    cookies out of it, or a bare `name=value; name2=value2` string.
    """
    raw = raw.strip()
    # cmd.exe caret-escaping: strip bare carets, they never appear inside
    # real cookie values (base64/JWT alphabets don't include '^').
    raw = raw.replace("^", "")

    flag_match = _CURL_B_FLAG_RE.search(raw)
    header_match = _COOKIE_HEADER_RE.search(raw)
    if flag_match:
        raw = flag_match.group(1).strip()
    elif header_match:
        raw = header_match.group(1).strip()

    cookies: dict[str, str] = {}
    for part in raw.split(";"):
        part = part.strip()
        if not part or "=" not in part:
            continue
        name, value = part.split("=", 1)
        name = name.strip()
        value = value.strip()
        if name:
            cookies[name] = value
    return cookies


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


async def reauth(cookies: dict[str, str]) -> dict:
    """Silently refresh tokens using stored Riot session cookies.

    Mirrors what Riot's own client does for silent reauth: hitting
    /authorize with a valid session cookie jar redirects straight to
    redirect_uri with fresh tokens instead of showing a login page.
    """
    if not cookies:
        raise AuthenticationError("No stored Riot cookies available for reauth")

    async with httpx.AsyncClient(timeout=30.0, follow_redirects=False) as client:
        resp = await client.get(AUTH_URL, cookies=cookies)
        _check_rate_limit(resp)

        location = resp.headers.get("location", "")
        if resp.status_code not in (301, 302, 303, 307, 308) or "access_token" not in location:
            raise AuthenticationError("Stored Riot session has expired; please log in again")

        tokens = extract_tokens(location)

        # Riot may rotate cookies on each reauth; merge any refreshed ones in.
        refreshed_cookies = dict(cookies)
        refreshed_cookies.update(dict(resp.cookies))
        tokens["cookies"] = refreshed_cookies
        return tokens


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
