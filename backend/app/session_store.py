import threading
import uuid
from datetime import datetime, timedelta, timezone

from app.models.auth import SessionData

ACCESS_TOKEN_TTL = timedelta(hours=3)


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

    def get_valid(self, token: str) -> SessionData | None:
        """Return session data if the access token is still valid, None otherwise."""
        with self._lock:
            session = self._sessions.get(token)
            if session is None:
                return None
            if datetime.now(timezone.utc) >= session.expires_at:
                return None
            return session

    def update(self, token: str, data: SessionData) -> None:
        with self._lock:
            if token in self._sessions:
                self._sessions[token] = data

    def delete(self, token: str) -> None:
        with self._lock:
            self._sessions.pop(token, None)


store = SessionStore()
