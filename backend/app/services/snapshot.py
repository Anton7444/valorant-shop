"""Snapshots: everything the site shows, saved at one moment from a signed-in session.

A snapshot lets another computer, one that never talks to Riot, look at the same data by typing a
code. Nothing here renews or reuses Riot tokens; the saved data is simply served back.
"""

import asyncio
import logging
import secrets
import threading
import time
from dataclasses import dataclass, field

from fastapi import HTTPException

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

SNAPSHOT_TTL = 24 * 3600.0
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
    expires_at: float  # monotonic
    data: dict = field(default_factory=dict)  # key -> model


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
        expires_at=time.monotonic() + SNAPSHOT_TTL,
        data=data,
    )


def store(source_token: str, snap: Snapshot) -> str:
    code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(10))
    now = time.monotonic()
    with _lock:
        for key in [k for k, v in _snapshots.items() if v.expires_at <= now]:
            del _snapshots[key]
        old = _code_of_session.pop(source_token, None)
        if old:
            _snapshots.pop(old, None)  # one live snapshot per session
        _snapshots[code] = snap
        _code_of_session[source_token] = code
    return code


def lookup(code: str) -> Snapshot | None:
    with _lock:
        snap = _snapshots.get(normalise(code))
        if snap and snap.expires_at <= time.monotonic():
            return None
        return snap


def serve(session: SessionData, key: str):
    """The saved model for a viewer session, with countdowns brought up to date."""
    snap = lookup(session.snapshot_code or "")
    if snap is None:
        raise HTTPException(status_code=401, detail="Session expired. Please log in again.")
    value = snap.data.get(key)
    if value is None:
        raise HTTPException(status_code=404, detail="That part was not included in the snapshot.")
    value = value.model_copy(deep=True)
    elapsed = int(time.time() - snap.taken_at)
    if key in ("daily", "accessories"):
        value.seconds_remaining = max(0, value.seconds_remaining - elapsed)
    elif key == "bundle":
        for bundle in value.bundles:
            bundle.duration_remaining_secs = max(0, bundle.duration_remaining_secs - elapsed)
    elif key == "profile":
        value.has_more_matches = False  # older matches cannot be loaded without Riot
    return value
