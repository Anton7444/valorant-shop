"""Google-backed accounts. An account owns at most one linked Riot login (the ssid cookie and the tokens it
renews), kept encrypted, so every device signed in to the same Google account sees the same shop."""

import hashlib
import json
import logging
import os
import secrets
import sqlite3
import threading
import time

from cryptography.fernet import Fernet

from app.config import settings

logger = logging.getLogger(__name__)

DEFAULT_SETTINGS = {"video_via_server": False, "metal_cards": True}
_TOUCH_EVERY = 600.0  # seconds between "last used" writes


class AccountsFull(Exception):
    pass


def _h(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _fernet() -> Fernet:
    if settings.ACCOUNT_KEY:
        return Fernet(settings.ACCOUNT_KEY.encode())
    path = settings.ACCOUNT_DB + ".key"
    if os.path.exists(path):
        return Fernet(open(path, "rb").read().strip())
    key = Fernet.generate_key()
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(key)
    return Fernet(key)


class AccountStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._f = _fernet()
        self._db = sqlite3.connect(settings.ACCOUNT_DB, check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._db.executescript(
            """
            CREATE TABLE IF NOT EXISTS accounts (
              sub TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT DEFAULT '',
              created REAL NOT NULL, last_seen REAL NOT NULL,
              settings TEXT NOT NULL DEFAULT '{}',
              riot_state TEXT NOT NULL DEFAULT 'none',   -- none | linked | expired
              riot_puuid TEXT, riot BLOB
            );
            CREATE TABLE IF NOT EXISTS devices (
              k TEXT PRIMARY KEY, sub TEXT NOT NULL, created REAL NOT NULL, last_used REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS devices_sub ON devices(sub);
            """
        )
        self._db.commit()
        try:
            os.chmod(settings.ACCOUNT_DB, 0o600)
        except OSError:
            pass
        self._touched: dict[str, float] = {}

    # -- accounts ----------------------------------------------------------------------------

    def upsert(self, sub: str, email: str, name: str) -> None:
        now = time.time()
        with self._lock:
            row = self._db.execute("SELECT 1 FROM accounts WHERE sub=?", (sub,)).fetchone()
            if row:
                self._db.execute("UPDATE accounts SET email=?, name=?, last_seen=? WHERE sub=?", (email, name, now, sub))
            else:
                n = self._db.execute("SELECT COUNT(*) FROM accounts").fetchone()[0]
                if n >= settings.MAX_ACCOUNTS:
                    raise AccountsFull()
                self._db.execute(
                    "INSERT INTO accounts (sub,email,name,created,last_seen,settings) VALUES (?,?,?,?,?,?)",
                    (sub, email, name, now, now, json.dumps(DEFAULT_SETTINGS)),
                )
            self._db.commit()

    def get(self, sub: str) -> dict | None:
        with self._lock:
            r = self._db.execute(
                "SELECT sub,email,name,created,settings,riot_state,riot_puuid FROM accounts WHERE sub=?", (sub,)
            ).fetchone()
        if not r:
            return None
        s = {**DEFAULT_SETTINGS, **json.loads(r["settings"] or "{}")}
        return {
            "sub": r["sub"], "email": r["email"], "name": r["name"], "created": r["created"],
            "settings": s, "riot_state": r["riot_state"], "puuid": r["riot_puuid"],
        }

    def delete_account(self, sub: str) -> None:
        with self._lock:
            self._db.execute("DELETE FROM devices WHERE sub=?", (sub,))
            self._db.execute("DELETE FROM accounts WHERE sub=?", (sub,))
            self._db.commit()

    def set_settings(self, sub: str, patch: dict) -> dict:
        cur = (self.get(sub) or {}).get("settings", dict(DEFAULT_SETTINGS))
        for k in DEFAULT_SETTINGS:
            if k in patch and isinstance(patch[k], bool):
                cur[k] = patch[k]
        with self._lock:
            self._db.execute("UPDATE accounts SET settings=? WHERE sub=?", (json.dumps(cur), sub))
            self._db.commit()
        return cur

    # -- devices (one token per browser) ------------------------------------------------------

    def new_device(self, sub: str) -> str:
        token = secrets.token_urlsafe(32)
        now = time.time()
        with self._lock:
            self._db.execute("INSERT INTO devices (k,sub,created,last_used) VALUES (?,?,?,?)", (_h(token), sub, now, now))
            self._db.commit()
        return token

    def sub_for_token(self, token: str) -> str | None:
        k = _h(token)
        with self._lock:
            r = self._db.execute("SELECT sub,last_used FROM devices WHERE k=?", (k,)).fetchone()
            if not r:
                return None
            now = time.time()
            if now - self._touched.get(k, r["last_used"]) > _TOUCH_EVERY:
                self._db.execute("UPDATE devices SET last_used=? WHERE k=?", (now, k))
                self._db.execute("UPDATE accounts SET last_seen=? WHERE sub=?", (now, r["sub"]))
                self._db.commit()
                self._touched[k] = now
            return r["sub"]

    def drop_device(self, token: str) -> None:
        with self._lock:
            self._db.execute("DELETE FROM devices WHERE k=?", (_h(token),))
            self._db.commit()

    # -- linked Riot login -------------------------------------------------------------------

    def get_riot(self, sub: str) -> dict | None:
        with self._lock:
            r = self._db.execute("SELECT riot FROM accounts WHERE sub=? AND riot_state='linked'", (sub,)).fetchone()
        if not r or not r["riot"]:
            return None
        try:
            return json.loads(self._f.decrypt(r["riot"]))
        except Exception:  # noqa: BLE001
            logger.warning("unreadable stored Riot login")
            return None

    def set_riot(self, sub: str, riot: dict) -> None:
        blob = self._f.encrypt(json.dumps(riot).encode())
        with self._lock:
            self._db.execute(
                "UPDATE accounts SET riot=?, riot_state='linked', riot_puuid=? WHERE sub=?", (blob, riot.get("puuid"), sub)
            )
            self._db.commit()

    def clear_riot(self, sub: str, expired: bool = False) -> None:
        with self._lock:
            self._db.execute(
                "UPDATE accounts SET riot=NULL, riot_state=? WHERE sub=?", ("expired" if expired else "none", sub)
            )
            if not expired:
                self._db.execute("UPDATE accounts SET riot_puuid=NULL WHERE sub=?", (sub,))
            self._db.commit()

    def sub_linked_to_puuid(self, puuid: str) -> str | None:
        with self._lock:
            r = self._db.execute("SELECT sub FROM accounts WHERE riot_puuid=? AND riot_state='linked'", (puuid,)).fetchone()
        return r["sub"] if r else None

    def linked_subs(self) -> list[str]:
        with self._lock:
            return [r["sub"] for r in self._db.execute("SELECT sub FROM accounts WHERE riot_state='linked'")]

    def purge(self) -> None:
        now = time.time()
        with self._lock:
            self._db.execute("DELETE FROM devices WHERE last_used < ?", (now - settings.DEVICE_IDLE_DAYS * 86400,))
            self._db.execute(
                "UPDATE accounts SET riot=NULL, riot_state='none', riot_puuid=NULL "
                "WHERE riot_state!='none' AND last_seen < ?",
                (now - settings.RIOT_IDLE_DAYS * 86400,),
            )
            self._db.commit()


accounts = AccountStore()
