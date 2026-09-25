import logging
import threading
import uuid
from datetime import datetime, timedelta, timezone

from app.models.auth import SessionData
from app.services import riot_auth

logger = logging.getLogger(__name__)

ACCESS_TOKEN_TTL = timedelta(hours=3)
COOKIE_TTL = timedelta(weeks=2)


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, SessionData] = {}
        self._lock = threading.Lock()

    def create(self, data: SessionData) -> str:
        token = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        data.created_at = now
        data.expires_at = now + ACCESS_TOKEN_TTL
        with self._lock:
            self._sessions[token] = data
        return token

    def get(self, token: str) -> SessionData | None:
        with self._lock:
            return self._sessions.get(token)

    async def get_or_reauth(self, token: str) -> SessionData | None:
        """Return session data, silently refreshing the access token if needed.

        If the access token has expired but the session's stored Riot
        cookies are still valid, transparently re-authenticates and
        persists the refreshed tokens under the same session token.
        Returns None if there's no session, or reauth fails (cookies
        also expired/revoked).
        """
        with self._lock:
            session = self._sessions.get(token)
        if session is None:
            return None

        now = datetime.now(timezone.utc)
        if now < session.expires_at:
            return session

        try:
            result = await riot_auth.reauth(session.riot_cookies)
            entitlements = await riot_auth.get_entitlements(result["access_token"])
        except riot_auth.RateLimitError:
            raise
        except Exception:
            logger.info("Silent reauth failed for session, deleting")
            self.delete(token)
            return None

        refreshed = SessionData(
            access_token=result["access_token"],
            entitlements_token=entitlements,
            puuid=session.puuid,
            shard=session.shard,
            region=session.region,
            riot_cookies=result["cookies"],
            created_at=session.created_at,
            expires_at=now + ACCESS_TOKEN_TTL,
        )
        with self._lock:
            if token not in self._sessions:
                return None
            self._sessions[token] = refreshed
        return refreshed

    def update(self, token: str, data: SessionData) -> None:
        with self._lock:
            if token in self._sessions:
                self._sessions[token] = data

    def delete(self, token: str) -> None:
        with self._lock:
            self._sessions.pop(token, None)

    def cleanup(self) -> None:
        """Remove sessions whose riot_cookies have also expired (beyond reauth window)."""
        now = datetime.now(timezone.utc)
        with self._lock:
            expired = [
                token
                for token, session in self._sessions.items()
                if now >= session.created_at + COOKIE_TTL
            ]
            for token in expired:
                del self._sessions[token]


store = SessionStore()
