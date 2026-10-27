"""Keeps sessions that were created from an ssid cookie supplied with fresh Riot tokens."""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from app.models.auth import SessionData
from app.services import riot_auth

logger = logging.getLogger(__name__)

REFRESH_AFTER = timedelta(minutes=45)  # Riot's tokens last an hour
_locks: dict[int, asyncio.Lock] = {}


async def ensure_fresh(session: SessionData) -> bool:
    """Renew the session's tokens if they are getting old. False means the cookie no longer works."""
    if not session.ssid:
        return True
    if datetime.now(timezone.utc) - session.refreshed_at < REFRESH_AFTER:
        return True
    lock = _locks.setdefault(id(session), asyncio.Lock())
    async with lock:
        if datetime.now(timezone.utc) - session.refreshed_at < REFRESH_AFTER:
            return True
        try:
            tokens, next_ssid = await riot_auth.reauthenticate(session.ssid)
            session.access_token = tokens["access_token"]
            session.entitlements_token = await riot_auth.get_entitlements(session.access_token)
            session.ssid = next_ssid
            session.refreshed_at = datetime.now(timezone.utc)
            return True
        except Exception:
            logger.warning("Could not renew a session from its ssid cookie", exc_info=True)
            return False
