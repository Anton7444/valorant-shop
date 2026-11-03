"""Silent Riot re-authentication with a stored `ssid` cookie.

The implicit-grant login only yields a 1-hour access token and no refresh token. Riot's login session
(the `ssid` cookie on auth.riotgames.com) lives much longer, and asking /authorize again with it returns a
fresh access token without any prompt (Riot also hands back a rotated `ssid`). Keeping the newest cookies
around is what makes "log in once" possible.
"""

import json
import re
from urllib.parse import parse_qs, urlparse

import httpx

from app.services.riot_auth import AuthenticationError, RateLimitError

AUTH_URL = (
    "https://auth.riotgames.com/authorize"
    "?redirect_uri=http%3A%2F%2Flocalhost%2Fredirect"
    "&client_id=riot-client"
    "&response_type=token%20id_token"
    "&nonce=1"
    "&scope=openid%20link%20ban%20lol_region%20account"
)
UA = "RiotClient/63.0.9.4909983.4789131 rso-auth (Windows;10;;Professional, x64)"
KEEP = {"ssid", "asid", "csid", "clid", "ccid", "tdid"}


def parse_cookies(text: str) -> dict[str, str]:
    """Cookie header string, JSON export or Netscape cookies.txt -> {name: value} (Riot cookie names only)."""
    text = (text or "").strip()
    out: dict[str, str] = {}

    def add(name: str, value: str, domain: str = "") -> None:
        if name in KEEP and value and (not domain or "riotgames" in domain):
            out[name] = value

    try:
        data = json.loads(text)
        if isinstance(data, list):
            items = data
        else:
            inner = data.get("cookies", data) if isinstance(data, dict) else {}
            items = [{"name": k, "value": v} for k, v in inner.items()] if isinstance(inner, dict) else []
        for item in items:
            if isinstance(item, dict) and "name" in item and "value" in item:
                add(str(item["name"]), str(item["value"]), str(item.get("domain", "")))
        return out
    except Exception:  # noqa: BLE001
        pass

    netscape = [
        line for line in text.splitlines()
        if re.match(r"^\S+\s+(TRUE|FALSE)\s+\S+\s+(TRUE|FALSE)\s+-?\d+\s+\S+\s+\S", line.strip(), re.I)
        and not line.lstrip().startswith("#")
    ]
    if netscape:
        for line in netscape:
            parts = line.strip().split(None, 6)
            if len(parts) >= 7:
                add(parts[5], parts[6].strip(), parts[0])
        return out

    for part in re.split(r";\s*|\n", text):
        if "=" in part:
            key, value = part.split("=", 1)
            add(key.strip(), value.strip().strip('"'))
    if not out and re.fullmatch(r"[A-Za-z0-9_\-\.]{40,}", text):
        out["ssid"] = text  # a bare ssid value
    return out


async def reauth(cookies: dict[str, str]) -> tuple[str, str, int, dict[str, str]]:
    """Returns (access_token, id_token, expires_in_seconds, rotated_cookies).

    Raises AuthenticationError when the cookies no longer give a token, RateLimitError on HTTP 429,
    httpx.RequestError when Riot cannot be reached (the caller keeps the stored cookies in that case).
    """
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=False) as client:
        for name, value in cookies.items():
            client.cookies.set(name, value, domain="auth.riotgames.com")
        resp = await client.get(AUTH_URL, headers={"User-Agent": UA})
        if resp.status_code == 429:
            raise RateLimitError("Rate limited by Riot auth servers")
        frag = parse_qs(urlparse(resp.headers.get("location", "")).fragment)
        if "access_token" not in frag:
            raise AuthenticationError("The Riot login cookies are no longer valid.")
        rotated = dict(cookies)
        for cookie in client.cookies.jar:
            if cookie.name in KEEP:
                rotated[cookie.name] = cookie.value
        try:
            expires_in = int(frag.get("expires_in", ["3600"])[0])
        except ValueError:
            expires_in = 3600
        return frag["access_token"][0], frag.get("id_token", [""])[0], expires_in, rotated
