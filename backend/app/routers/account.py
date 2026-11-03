import logging

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.accounts import AccountsFull, accounts
from app.config import settings
from app.routers.auth import _check_rate_limit, _get_token_from_header
from app.services import account_session, google_auth, riot_auth, riot_refresh

logger = logging.getLogger(__name__)

router = APIRouter()


class GoogleLogin(BaseModel):
    credential: str


class CookiesBody(BaseModel):
    cookies: str


class SettingsBody(BaseModel):
    video_via_server: bool | None = None
    metal_cards: bool | None = None


def summary(sub: str) -> dict:
    a = accounts.get(sub)
    if a is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {
        "email": a["email"],
        "name": a["name"],
        "riot": {"state": a["riot_state"], "puuid": a["puuid"]},  # state: none | linked | expired
        "settings": a["settings"],
    }


def _current(request: Request) -> tuple[str, str]:
    token = _get_token_from_header(request)
    sub = accounts.sub_for_token(token) if token else None
    if not token or not sub:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return token, sub


@router.get("/auth/config")
async def auth_config() -> dict:
    return {"google_client_id": settings.GOOGLE_CLIENT_ID or None}


@router.post("/auth/google")
async def google_login(body: GoogleLogin, request: Request) -> dict:
    _check_rate_limit(request.client.host if request.client else "unknown")
    try:
        claims = await google_auth.verify(body.credential)
    except google_auth.GoogleAuthError as e:
        return {"status": "error", "error": str(e)}
    except httpx.HTTPError:
        return {"status": "error", "error": "Could not reach Google. Try again."}
    try:
        accounts.upsert(claims["sub"], claims["email"], claims.get("name", ""))
    except AccountsFull:
        return {"status": "error", "error": "This server has reached its account limit."}
    token = accounts.new_device(claims["sub"])
    return {"status": "success", "session_token": token, "account": summary(claims["sub"])}


@router.get("/account")
async def get_account(request: Request) -> dict:
    _, sub = _current(request)
    return summary(sub)


@router.post("/account/riot")
async def link_riot(body: CookiesBody, request: Request) -> dict:
    """Link (or replace) the Riot login of this Google account from exported cookies."""
    _, sub = _current(request)
    _check_rate_limit(request.client.host if request.client else "unknown")
    cookies = riot_refresh.parse_cookies(body.cookies)
    if "ssid" not in cookies:
        return {"status": "error", "error": "No Riot login cookie (ssid) found. Export the cookies of auth.riotgames.com right after logging in."}
    try:
        riot = await account_session.link(sub, cookies)
    except riot_auth.AuthenticationError as e:
        return {"status": "error", "error": str(e)}
    except riot_auth.RateLimitError:
        return {"status": "error", "error": "Rate limited by Riot servers. Try again shortly."}
    except httpx.HTTPStatusError as e:
        logger.error("Riot API HTTP error: %s", e.response.status_code)
        return {"status": "error", "error": f"Riot API error ({e.response.status_code})"}
    except httpx.RequestError:
        return {"status": "error", "error": "Could not reach Riot servers. Try again."}
    except Exception:
        logger.exception("Riot link failed")
        return {"status": "error", "error": "Linking failed unexpectedly"}
    other = accounts.sub_linked_to_puuid(riot["puuid"])
    if other and other != sub:
        return {"status": "error", "error": "This Riot account is already linked to another Google account."}
    accounts.set_riot(sub, riot)
    return {"status": "success", "account": summary(sub)}


@router.post("/account/riot/unlink")
async def unlink_riot(request: Request) -> dict:
    _, sub = _current(request)
    accounts.clear_riot(sub)
    return {"status": "success", "account": summary(sub)}


@router.put("/account/settings")
async def put_settings(body: SettingsBody, request: Request) -> dict:
    _, sub = _current(request)
    accounts.set_settings(sub, body.model_dump(exclude_none=True))
    return summary(sub)


@router.post("/account/delete")
async def delete_account(request: Request) -> dict:
    """Deletes the account, every signed-in device and the stored Riot login."""
    _, sub = _current(request)
    accounts.delete_account(sub)
    return {"status": "ok"}
