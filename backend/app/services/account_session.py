"""Turns an account's linked Riot login into a working session, renewing the access token from the stored
ssid cookie whenever it is about to run out."""

import asyncio
import logging
import time
from datetime import datetime, timezone

import httpx
from fastapi import HTTPException

from app.accounts import accounts
from app.config import settings
from app.models.auth import SessionData
from app.services import riot_auth, riot_refresh

logger = logging.getLogger(__name__)

RENEW_BEFORE = 600  # seconds
_locks: dict[str, asyncio.Lock] = {}


async def link(sub: str, cookies: dict[str, str]) -> dict:
    """First login with the pasted cookies. Returns the stored riot dict. Raises riot_auth errors."""
    access, id_token, expires_in, cookies = await riot_refresh.reauth(cookies)
    entitlements, puuid, (region, shard) = await asyncio.gather(
        riot_auth.get_entitlements(access),
        riot_auth.get_player_info(access),
        riot_auth.get_region(access, id_token),
    )
    riot = {
        "cookies": cookies, "access_token": access, "id_token": id_token, "entitlements": entitlements,
        "puuid": puuid, "shard": shard, "region": region,
        "expires_at": time.time() + max(expires_in - 120, 60),
    }
    return riot


async def _renew(sub: str) -> dict | None:
    """Renew one account's Riot login. A dead login is marked expired; a temporary failure keeps it."""
    riot = accounts.get_riot(sub)
    if not riot:
        return None
    try:
        access, id_token, expires_in, cookies = await riot_refresh.reauth(riot["cookies"])
        entitlements = await riot_auth.get_entitlements(access)
    except riot_auth.AuthenticationError:
        logger.info("a linked Riot login has expired")
        accounts.clear_riot(sub, expired=True)
        return None
    except (riot_auth.RateLimitError, httpx.HTTPError):
        logger.warning("could not renew a Riot login right now; will retry")
        return riot
    riot.update(
        cookies=cookies, access_token=access, id_token=id_token, entitlements=entitlements,
        expires_at=time.time() + max(expires_in - 120, 60),
    )
    accounts.set_riot(sub, riot)
    return riot


async def session_for(sub: str) -> SessionData:
    """A SessionData for the shop endpoints. 409 when no Riot login is linked / it expired, 503 when Riot is unreachable."""
    riot = accounts.get_riot(sub)
    if not riot:
        acct = accounts.get(sub)
        state = acct["riot_state"] if acct else "none"
        raise HTTPException(status_code=409, detail="riot_expired" if state == "expired" else "riot_not_linked")
    if riot["expires_at"] - time.time() <= RENEW_BEFORE:
        async with _locks.setdefault(sub, asyncio.Lock()):
            current = accounts.get_riot(sub)
            if current and current["expires_at"] - time.time() <= RENEW_BEFORE:
                riot = await _renew(sub)
            else:
                riot = current
        if riot is None:
            raise HTTPException(status_code=409, detail="riot_expired")
    if riot["expires_at"] <= time.time():
        raise HTTPException(status_code=503, detail="Could not refresh the Riot login right now. Try again shortly.")
    return SessionData(
        access_token=riot["access_token"], entitlements_token=riot["entitlements"], puuid=riot["puuid"],
        shard=riot["shard"], region=riot["region"],
        expires_at=datetime.fromtimestamp(riot["expires_at"], timezone.utc),
    )


async def keepalive_loop() -> None:
    """Renew every linked login every few hours so its ssid keeps rotating, and clear idle devices and logins."""
    await asyncio.sleep(300)
    while True:
        accounts.purge()
        for sub in accounts.linked_subs():
            async with _locks.setdefault(sub, asyncio.Lock()):
                await _renew(sub)
            await asyncio.sleep(3)
        await asyncio.sleep(settings.KEEPALIVE_HOURS * 3600)
