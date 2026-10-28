"""Snapshots: everything the site shows, saved at one moment from a signed-in session.

A snapshot lets another computer, one that never talks to Riot, look at the same data by typing a
code. Nothing here renews or reuses Riot tokens; the saved data is simply served back.
"""

import asyncio
import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import tempfile
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone

import httpx
from fastapi import HTTPException

from app.config import settings
from app.models.auth import SessionData
from app.models.battlepass import BattlePassResponse
from app.models.profile import ProfileResponse
from app.models.store import (
    AccessoryStoreResponse,
    BundleResponse,
    DailyStoreResponse,
    InventoryResponse,
    Wallet,
)
from app.services import battlepass, profile, storefront

logger = logging.getLogger(__name__)

FOREVER = 4102444800.0  # year 2100
SNAPSHOT_TTL = settings.SNAPSHOT_DAYS * 24 * 3600.0  # 0 = never
TOKEN_PREFIX = "snap_"  # viewer sessions are stateless: the token is this prefix plus the code
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

MODELS = {
    "daily": DailyStoreResponse,
    "bundle": BundleResponse,
    "accessories": AccessoryStoreResponse,
    "wallet": Wallet,
    "inventory": InventoryResponse,
    "profile": ProfileResponse,
    "battlepass": BattlePassResponse,
}


@dataclass
class Snapshot:
    puuid: str
    shard: str
    region: str
    taken_at: float  # epoch seconds
    expires_at: float  # epoch seconds
    data: dict = field(default_factory=dict)  # key -> model
    # The signed-in session that took it, kept in memory only (never written to disk). While its Riot
    # tokens are still valid the data is fetched live on each request; after that, the saved data is served.
    source: SessionData | None = field(default=None, repr=False)
    live_cache: dict = field(default_factory=dict, repr=False)
    last_saved: float = 0.0
    refresh_requested: bool = False  # a viewer asked the home computer to sign in again
    last_request: float = 0.0


_lock = threading.Lock()
_snapshots: dict[str, Snapshot] = {}
_code_of_session: dict[str, str] = {}  # source session token -> its live code


def normalise(code: str) -> str:
    return "".join(ch for ch in code.upper() if ch in CODE_ALPHABET)


async def build(session: SessionData) -> Snapshot:
    """Fetch everything from Riot once, with the session's tokens."""
    args = (session.access_token, session.entitlements_token, session.puuid, session.shard)
    raw, owned, wallet, prof, pass_ = await asyncio.gather(
        storefront.fetch_storefront(*args),
        storefront.fetch_owned_skin_level_ids(*args),
        storefront.get_wallet(*args),
        profile.get_profile(session),
        battlepass.get_battlepass(session),
        return_exceptions=True,
    )
    if isinstance(raw, Exception):
        raise raw  # without the store there is nothing worth saving
    if isinstance(owned, Exception):
        logger.warning("Snapshot: could not fetch entitlements")
        owned = frozenset()

    data: dict = {}
    data["daily"] = await storefront.get_daily_store(raw, owned)
    data["bundle"] = await storefront.get_featured_bundle(raw)
    data["accessories"] = await storefront.get_accessory_store(raw)
    data["inventory"] = await storefront.get_inventory(owned)
    for key, value in (("wallet", wallet), ("profile", prof), ("battlepass", pass_)):
        if isinstance(value, Exception):
            logger.warning("Snapshot: %s unavailable (%s)", key, type(value).__name__)
        elif value is not None:
            data[key] = value
    return Snapshot(
        puuid=session.puuid,
        shard=session.shard,
        region=session.region,
        taken_at=time.time(),
        expires_at=time.time() + SNAPSHOT_TTL if SNAPSHOT_TTL else FOREVER,
        source=session,
        data=data,
    )


def store(source_token: str, snap: Snapshot, reuse_code: str | None = None) -> str:
    """Keep a snapshot and return its code. `reuse_code` replaces that account's earlier snapshot
    under the same code, so a computer that already has the code keeps working."""
    now = time.time()
    with _lock:
        for key in [k for k, v in _snapshots.items() if v.expires_at <= now]:
            del _snapshots[key]
        existing = _snapshots.get(normalise(reuse_code)) if reuse_code else None
        if existing is not None and existing.puuid == snap.puuid:
            code = normalise(reuse_code)
        else:
            code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(10))
            old = _code_of_session.pop(source_token, None)
            if old:
                _snapshots.pop(old, None)  # one live snapshot per session
        _snapshots[code] = snap
        _code_of_session[source_token] = code
        _save()
    return code


def lookup(code: str) -> Snapshot | None:
    with _lock:
        snap = _snapshots.get(normalise(code))
        if snap and snap.expires_at <= time.time():
            return None
        return snap


LIVE_TOKEN_SECONDS = 50 * 60  # Riot's tokens last about an hour
CACHE_SECONDS = {"profile": 120.0}  # everything else: 30s
DEFAULT_CACHE_SECONDS = 30.0


def is_live(snap: Snapshot) -> bool:
    """Can requests still be answered from Riot with the tokens of the computer that took it?"""
    return snap.source is not None and (datetime.now(timezone.utc) - snap.source.created_at).total_seconds() < LIVE_TOKEN_SECONDS


async def _fetch_live(snap: Snapshot, key: str):
    s = snap.source
    args = (s.access_token, s.entitlements_token, s.puuid, s.shard)

    async def cached_raw():
        hit = snap.live_cache.get("raw")
        if hit and time.time() - hit[0] < DEFAULT_CACHE_SECONDS:
            return hit[1]
        raw = await storefront.fetch_storefront(*args)
        snap.live_cache["raw"] = (time.time(), raw)
        return raw

    async def owned_ids():
        try:
            return await storefront.fetch_owned_skin_level_ids(*args)
        except (httpx.HTTPStatusError, httpx.RequestError):
            return frozenset()

    if key == "wallet":
        return await storefront.get_wallet(*args)
    if key == "inventory":
        return await storefront.get_inventory(await owned_ids())
    if key == "daily":
        return await storefront.get_daily_store(await cached_raw(), await owned_ids())
    if key == "bundle":
        return await storefront.get_featured_bundle(await cached_raw())
    if key == "accessories":
        return await storefront.get_accessory_store(await cached_raw())
    if key == "profile":
        return await profile.get_profile(s)
    if key == "battlepass":
        return await battlepass.get_battlepass(s)
    return None


async def serve(session: SessionData, key: str):
    """The model for a viewer: live from Riot while the home computer's tokens are fresh, else the
    saved data (with countdowns brought up to date)."""
    snap = lookup(session.snapshot_code or "")
    if snap is None:
        raise HTTPException(status_code=401, detail="Session expired. Please log in again.")

    fresh = False
    value = None
    if is_live(snap):
        hit = snap.live_cache.get(key)
        ttl = CACHE_SECONDS.get(key, DEFAULT_CACHE_SECONDS)
        if hit and time.time() - hit[0] < ttl:
            value, fresh = hit[1], True
        else:
            try:
                live = await _fetch_live(snap, key)
                if live is not None:
                    value, fresh = live, True
                    snap.live_cache[key] = (time.time(), live)
                    snap.data[key] = live
                    now = time.time()
                    if now - snap.last_saved > 60:
                        snap.last_saved = now
                        with _lock:
                            _save()
            except Exception:
                logger.warning("Live fetch for %s failed; serving the saved data", key, exc_info=True)
    if value is None:
        value = snap.data.get(key)
    if value is None:
        raise HTTPException(status_code=404, detail="That part is not available.")

    value = value.model_copy(deep=True)
    if not fresh:
        elapsed = int(time.time() - snap.taken_at)
        if key in ("daily", "accessories"):
            value.seconds_remaining = max(0, value.seconds_remaining - elapsed)
        elif key == "bundle":
            for bundle in value.bundles:
                bundle.duration_remaining_secs = max(0, bundle.duration_remaining_secs - elapsed)
    if key == "profile":
        value.has_more_matches = False  # older matches cannot be loaded for a viewer
    return value


def request_refresh(code: str) -> dict:
    """A viewer pressed Refresh: drop the short caches so the next requests go to Riot; if the home
    computer's sign-in has run out, ask it (it polls `pending`) to sign in again."""
    snap = lookup(code)
    if snap is None:
        raise HTTPException(status_code=401, detail="Session expired. Please log in again.")
    now = time.time()
    if now - snap.last_request < 5:
        return {"live": is_live(snap), "requested": snap.refresh_requested}
    snap.last_request = now
    snap.live_cache.clear()
    if is_live(snap):
        return {"live": True, "requested": False}
    snap.refresh_requested = True
    return {"live": False, "requested": True}


def take_pending(puuid: str) -> bool:
    """For the home computer: was a refresh asked for? (Asking clears it.)"""
    with _lock:
        pending = [sn for sn in _snapshots.values() if sn.puuid == puuid and sn.refresh_requested]
        for sn in pending:
            sn.refresh_requested = False
    return bool(pending)


def revoke(code: str, puuid: str) -> bool:
    """Delete a snapshot (only its own account may)."""
    code = normalise(code)
    with _lock:
        snap = _snapshots.get(code)
        if snap is None or snap.puuid != puuid:
            return False
        del _snapshots[code]
        for token, owned in list(_code_of_session.items()):
            if owned == code:
                del _code_of_session[token]
        _save()
    return True


def session_from_token(token: str) -> SessionData | None:
    """The read-only viewer session for a token made from a snapshot code, if that snapshot is alive."""
    if not token.startswith(TOKEN_PREFIX):
        return None
    code = normalise(token[len(TOKEN_PREFIX):])
    snap = lookup(code)
    if snap is None:
        return None
    return SessionData(
        access_token="",
        entitlements_token="",
        puuid=snap.puuid,
        shard=snap.shard,
        region=snap.region,
        snapshot_code=code,
    )


# --- Keeping snapshots across restarts ---

def _save() -> None:
    """Write all live snapshots to disk (caller holds the lock). Best effort."""
    try:
        payload = {
            code: {
                "puuid": snap.puuid,
                "shard": snap.shard,
                "region": snap.region,
                "taken_at": snap.taken_at,
                "expires_at": snap.expires_at,
                "data": {key: value.model_dump(mode="json") for key, value in snap.data.items()},
            }
            for code, snap in _snapshots.items()
        }
        directory = os.path.dirname(settings.SNAPSHOT_FILE) or "."
        fd, tmp = tempfile.mkstemp(dir=directory)
        with os.fdopen(fd, "w") as handle:
            json.dump(payload, handle)
        os.chmod(tmp, 0o600)  # holds your account's data
        os.replace(tmp, settings.SNAPSHOT_FILE)
    except Exception:
        logger.warning("Could not save snapshots to disk", exc_info=True)


def _load() -> None:
    try:
        with open(settings.SNAPSHOT_FILE) as handle:
            payload = json.load(handle)
    except FileNotFoundError:
        return
    except Exception:
        logger.warning("Could not read the saved snapshots", exc_info=True)
        return
    now = time.time()
    for code, raw in payload.items():
        try:
            if raw["expires_at"] <= now:
                continue
            _snapshots[code] = Snapshot(
                puuid=raw["puuid"],
                shard=raw["shard"],
                region=raw["region"],
                taken_at=raw["taken_at"],
                expires_at=raw["expires_at"],
                data={key: MODELS[key].model_validate(value) for key, value in raw["data"].items() if key in MODELS},
            )
        except Exception:
            logger.warning("Skipping an unreadable snapshot", exc_info=True)


_load()


# --- Accounts: a username and password that open an account's snapshot from another computer ---

_ACCOUNTS_FILE = settings.SNAPSHOT_FILE + ".accounts"
_accounts: dict[str, dict] = {}  # lowercase username -> {"username", "puuid", "salt", "hash"}
_failures: dict[str, list[float]] = {}  # key (username or "*") -> times of wrong attempts
USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9._-]{3,32}$")
MAX_FAILURES = 6
FAILURE_WINDOW = 15 * 60.0
_DUMMY_SALT = bytes(16)


def _scrypt(password: str, salt: bytes) -> bytes:
    return hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)


def _write_accounts() -> None:
    """Persist the accounts (caller holds the lock). Only salted hashes are stored."""
    try:
        directory = os.path.dirname(_ACCOUNTS_FILE) or "."
        fd, tmp = tempfile.mkstemp(dir=directory)
        with os.fdopen(fd, "w") as handle:
            json.dump(_accounts, handle)
        os.chmod(tmp, 0o600)
        os.replace(tmp, _ACCOUNTS_FILE)
    except Exception:
        logger.warning("Could not save the accounts", exc_info=True)


def register(puuid: str, username: str, password: str) -> None:
    """Create (or update) the site account bound to a Riot account. One account per Riot account."""
    if not USERNAME_PATTERN.match(username):
        raise ValueError("Use 3 to 32 letters, numbers, dots, dashes or underscores for the username.")
    key = username.lower()
    with _lock:
        taken = _accounts.get(key)
        if taken is not None and taken["puuid"] != puuid:
            raise PermissionError("That username is taken.")
        for other in [k for k, v in _accounts.items() if v["puuid"] == puuid and k != key]:
            del _accounts[other]  # renaming: the old username goes away
        salt = secrets.token_bytes(16)
        _accounts[key] = {"username": username, "puuid": puuid, "salt": salt.hex(), "hash": _scrypt(password, salt).hex()}
        _write_accounts()


def account_of(puuid: str) -> str | None:
    with _lock:
        return next((v["username"] for v in _accounts.values() if v["puuid"] == puuid), None)


def delete_account(puuid: str) -> None:
    with _lock:
        for key in [k for k, v in _accounts.items() if v["puuid"] == puuid]:
            del _accounts[key]
        _write_accounts()


def _recent_failures(key: str) -> int:
    now = time.time()
    recent = [t for t in _failures.get(key, []) if now - t < FAILURE_WINDOW]
    _failures[key] = recent
    return len(recent)


def login_locked(username: str) -> bool:
    """Too many wrong passwords for this username, or for everyone together."""
    return _recent_failures(username.lower()) >= MAX_FAILURES or _recent_failures("*") >= MAX_FAILURES * 4


def code_for_login(username: str, password: str) -> str | None:
    """The code of the newest snapshot of the account if the username and password are right."""
    key = username.lower()
    with _lock:
        account = _accounts.get(key)
    salt = bytes.fromhex(account["salt"]) if account else _DUMMY_SALT
    candidate = _scrypt(password, salt)  # same work whether or not the username exists
    ok = bool(account) and hmac.compare_digest(candidate, bytes.fromhex(account["hash"]))
    if not ok:
        now = time.time()
        _failures.setdefault(key, []).append(now)
        _failures.setdefault("*", []).append(now)
        return None
    with _lock:
        mine = [(c, sn) for c, sn in _snapshots.items() if sn.puuid == account["puuid"] and sn.expires_at > time.time()]
    if not mine:
        return None
    return max(mine, key=lambda item: item[1].taken_at)[0]


def _load_accounts() -> None:
    try:
        with open(_ACCOUNTS_FILE) as handle:
            raw = json.load(handle)
        for key, value in raw.items():
            if {"username", "puuid", "salt", "hash"} <= set(value):
                _accounts[key] = value
    except FileNotFoundError:
        return
    except Exception:
        logger.warning("Could not read the accounts file", exc_info=True)


_load_accounts()
