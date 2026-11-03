import hashlib
import json
import logging
import os
import sqlite3
import threading
import uuid
from dataclasses import asdict
from datetime import datetime, timedelta, timezone

from cryptography.fernet import Fernet

from app.config import settings
from app.models.auth import SessionData

logger = logging.getLogger(__name__)

ACCESS_TOKEN_TTL = timedelta(hours=3)


def _key(token: str) -> str:
    """Sessions are indexed by a hash of the token, so the stored database never holds a usable token."""
    return hashlib.sha256(token.encode()).hexdigest()


def _load_fernet() -> Fernet:
    if settings.SESSION_KEY:
        return Fernet(settings.SESSION_KEY.encode())
    path = settings.SESSION_DB + ".key"
    if os.path.exists(path):
        return Fernet(open(path, "rb").read().strip())
    key = Fernet.generate_key()
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(key)
    return Fernet(key)


def _dump(data: SessionData) -> dict:
    d = asdict(data)
    for f in ("created_at", "expires_at", "last_used"):
        d[f] = d[f].isoformat()
    return d


def _undump(d: dict) -> SessionData:
    for f in ("created_at", "expires_at", "last_used"):
        d[f] = datetime.fromisoformat(d[f])
    return SessionData(**d)


class SessionStore:
    """Sessions live in memory. Those made from Riot cookies ("stay signed in") are also kept, encrypted,
    in a small SQLite file so they survive a restart and can be renewed in the background."""

    def __init__(self) -> None:
        self._sessions: dict[str, SessionData] = {}
        self._lock = threading.Lock()
        self._db: sqlite3.Connection | None = None
        self._fernet: Fernet | None = None
        try:
            self._fernet = _load_fernet()
            self._db = sqlite3.connect(settings.SESSION_DB, check_same_thread=False)
            self._db.execute("CREATE TABLE IF NOT EXISTS sessions (k TEXT PRIMARY KEY, blob BLOB NOT NULL)")
            self._db.commit()
            os.chmod(settings.SESSION_DB, 0o600)
            for k, blob in self._db.execute("SELECT k, blob FROM sessions").fetchall():
                try:
                    self._sessions[k] = _undump(json.loads(self._fernet.decrypt(blob)))
                except Exception:  # noqa: BLE001
                    logger.warning("dropping an unreadable stored session")
                    self._db.execute("DELETE FROM sessions WHERE k = ?", (k,))
            self._db.commit()
        except Exception:  # noqa: BLE001
            logger.exception("persistent sessions disabled")
            self._db = None

    @property
    def persistent(self) -> bool:
        return self._db is not None

    # -- persistence -------------------------------------------------------------------------

    def _save_locked(self, k: str) -> None:
        data = self._sessions.get(k)
        if self._db is None or self._fernet is None or data is None or not data.cookies:
            return
        blob = self._fernet.encrypt(json.dumps(_dump(data)).encode())
        self._db.execute("INSERT OR REPLACE INTO sessions (k, blob) VALUES (?, ?)", (k, blob))
        self._db.commit()

    # -- API ---------------------------------------------------------------------------------

    def create(self, data: SessionData, ttl: timedelta | None = None) -> str:
        token = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        data.created_at = now
        data.last_used = now
        data.expires_at = now + (ttl or ACCESS_TOKEN_TTL)
        k = _key(token)
        with self._lock:
            self._sessions[k] = data
            self._save_locked(k)
        return token

    def get(self, token: str) -> SessionData | None:
        with self._lock:
            return self._sessions.get(_key(token))

    def get_valid(self, token: str) -> SessionData | None:
        """Return session data if the access token is still valid, None otherwise."""
        with self._lock:
            session = self._sessions.get(_key(token))
            if session is None:
                return None
            if datetime.now(timezone.utc) >= session.expires_at:
                return None
            return session

    def update_key(self, k: str, data: SessionData) -> None:
        with self._lock:
            if k in self._sessions:
                self._sessions[k] = data
                self._save_locked(k)

    def update(self, token: str, data: SessionData) -> None:
        self.update_key(_key(token), data)

    def delete(self, token: str) -> None:
        self.delete_key(_key(token))

    def delete_key(self, k: str) -> None:
        with self._lock:
            self._sessions.pop(k, None)
            if self._db is not None:
                self._db.execute("DELETE FROM sessions WHERE k = ?", (k,))
                self._db.commit()

    # -- stay-signed-in helpers --------------------------------------------------------------

    def key_of(self, token: str) -> str:
        return _key(token)

    def get_key(self, k: str) -> SessionData | None:
        with self._lock:
            return self._sessions.get(k)

    def persistent_keys(self) -> list[str]:
        with self._lock:
            return [k for k, s in self._sessions.items() if s.cookies]

    def drop_persistent_for_puuid(self, puuid: str) -> None:
        """One stay-signed-in session per account, so two copies never fight over the rotating ssid."""
        for k in self.persistent_keys():
            s = self.get_key(k)
            if s and s.puuid == puuid:
                self.delete_key(k)


store = SessionStore()
