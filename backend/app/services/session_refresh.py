"""Keeps "stay signed in" sessions alive: renews the Riot access token from the stored cookies."""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

import httpx

from app.config import settings
from app.services import riot_auth, riot_refresh
from app.session_store import store

logger = logging.getLogger(__name__)

RENEW_BEFORE = timedelta(minutes=10)
_locks: dict[str, asyncio.Lock] = {}


async def _renew(k: str) -> bool:
    """Renew one session. True = renewed. A dead login deletes the session; a temporary failure keeps it."""
    session = store.get_key(k)
    if session is None or not session.cookies:
        return False
    try:
        access, id_token, expires_in, cookies = await riot_refresh.reauth(session.cookies)
        entitlements = await riot_auth.get_entitlements(access)
    except riot_auth.AuthenticationError:
        logger.info("stay-signed-in session ended (Riot login no longer valid)")
        store.delete_key(k)
        return False
    except (riot_auth.RateLimitError, httpx.HTTPError):
        logger.warning("could not renew a session right now; will retry")
        return False
    now = datetime.now(timezone.utc)
    session.access_token = access
    session.id_token = id_token
    session.entitlements_token = entitlements
    session.cookies = cookies
    session.expires_at = now + timedelta(seconds=max(expires_in - 120, 60))
    store.update_key(k, session)
    return True


async def ensure_fresh(token: str) -> None:
    """Called on every request: renew the access token when it is about to run out."""
    k = store.key_of(token)
    session = store.get_key(k)
    if session is None or not session.cookies:
        return
    session.last_used = datetime.now(timezone.utc)
    if session.expires_at - session.last_used > RENEW_BEFORE:
        return
    lock = _locks.setdefault(k, asyncio.Lock())
    async with lock:
        session = store.get_key(k)
        if session and session.expires_at - datetime.now(timezone.utc) <= RENEW_BEFORE:
            await _renew(k)


async def keepalive_loop() -> None:
    """Renew every stay-signed-in session every few hours so its ssid keeps rotating, and clear idle ones."""
    await asyncio.sleep(300)
    while True:
        now = datetime.now(timezone.utc)
        for k in store.persistent_keys():
            session = store.get_key(k)
            if session is None:
                continue
            if now - session.last_used > timedelta(days=settings.SESSION_IDLE_DAYS):
                store.delete_key(k)
                continue
            async with _locks.setdefault(k, asyncio.Lock()):
                await _renew(k)
            await asyncio.sleep(3)
        await asyncio.sleep(settings.KEEPALIVE_HOURS * 3600)
