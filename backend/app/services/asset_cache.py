import asyncio
import logging
import time

import httpx

logger = logging.getLogger(__name__)

BASE_URL = "https://valorant-api.com/v1"

# Don't re-fetch the whole asset catalog more than once per cooldown window,
# even if several unknown skins are looked up in quick succession.
REFRESH_COOLDOWN_SECONDS = 300

CLIENT_PLATFORM = (
    "ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0"
    "Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0"
    "IjogIlVua25vd24iDQp9"
)

# Module-level caches
_skins: dict[str, dict] = {}
_skin_levels_to_skin: dict[str, dict] = {}
_content_tiers: dict[str, dict] = {}
_bundles: dict[str, dict] = {}
_client_version: str = ""
_last_refresh: float = 0.0
_refresh_lock = asyncio.Lock()


async def initialize() -> None:
    """Fetch all asset data from valorant-api.com. Also used to refresh the cache later."""
    global _client_version, _last_refresh

    async with httpx.AsyncClient(timeout=30.0) as client:
        skins_resp, tiers_resp, version_resp, bundles_resp = await _fetch_all(client)

    # Skins: index by skin UUID and build level -> skin reverse map
    for skin in skins_resp:
        uuid = skin["uuid"].lower()
        skin_entry = {
            "uuid": uuid,
            "displayName": skin.get("displayName", ""),
            "displayIcon": skin.get("displayIcon") or skin.get("chromas", [{}])[0].get("fullRender", ""),
            "contentTierUuid": (skin.get("contentTierUuid") or "").lower(),
            "levels": skin.get("levels", []),
        }
        _skins[uuid] = skin_entry

        # Map each level UUID to the parent skin
        for level in skin.get("levels", []):
            level_uuid = level["uuid"].lower()
            _skin_levels_to_skin[level_uuid] = skin_entry

    # Content tiers
    for tier in tiers_resp:
        uuid = tier["uuid"].lower()
        _content_tiers[uuid] = {
            "name": tier.get("devName", ""),
            "display_icon": tier.get("displayIcon", ""),
            "highlight_color": tier.get("highlightColor", ""),
        }

    # Bundles
    for bundle in bundles_resp:
        uuid = bundle["uuid"].lower()
        _bundles[uuid] = {
            "uuid": uuid,
            "displayName": bundle.get("displayName", ""),
            "displayIcon": bundle.get("displayIcon") or bundle.get("displayIcon2", ""),
            "description": bundle.get("description", ""),
        }

    # Client version
    _client_version = version_resp.get("riotClientVersion", "")
    _last_refresh = time.monotonic()

    logger.info(
        "Asset cache initialized: %d skins, %d levels, %d tiers, %d bundles, version=%s",
        len(_skins),
        len(_skin_levels_to_skin),
        len(_content_tiers),
        len(_bundles),
        _client_version,
    )


async def _fetch_all(client: httpx.AsyncClient) -> tuple[list, list, dict, list]:
    """Fetch all endpoints concurrently."""
    skins_req = client.get(f"{BASE_URL}/weapons/skins")
    tiers_req = client.get(f"{BASE_URL}/contenttiers")
    version_req = client.get(f"{BASE_URL}/version")
    bundles_req = client.get(f"{BASE_URL}/bundles")

    skins_resp, tiers_resp, version_resp, bundles_resp = (
        await skins_req,
        await tiers_req,
        await version_req,
        await bundles_req,
    )

    skins_resp.raise_for_status()
    tiers_resp.raise_for_status()
    version_resp.raise_for_status()
    bundles_resp.raise_for_status()

    return (
        skins_resp.json()["data"],
        tiers_resp.json()["data"],
        version_resp.json()["data"],
        bundles_resp.json()["data"],
    )


def get_skin(uuid: str) -> dict | None:
    """Lookup skin by skin UUID or skin level UUID."""
    key = uuid.lower()
    return _skins.get(key) or _skin_levels_to_skin.get(key)


def get_content_tier(uuid: str) -> dict | None:
    return _content_tiers.get(uuid.lower())


def get_client_version() -> str:
    return _client_version


def get_bundle_info(uuid: str) -> dict | None:
    return _bundles.get(uuid.lower())


async def _refresh_if_due() -> None:
    """Re-fetch the asset catalog, unless it was already refreshed recently."""
    async with _refresh_lock:
        if time.monotonic() - _last_refresh < REFRESH_COOLDOWN_SECONDS:
            return
        try:
            await initialize()
        except httpx.HTTPError:
            logger.exception("Failed to refresh asset cache")


async def get_skin_ensured(uuid: str) -> dict | None:
    """Lookup a skin, refreshing the cache once if it's missing (e.g. a newly added skin)."""
    skin = get_skin(uuid)
    if skin is not None:
        return skin
    await _refresh_if_due()
    return get_skin(uuid)


async def get_bundle_info_ensured(uuid: str) -> dict | None:
    """Lookup bundle info, refreshing the cache once if it's missing (e.g. a newly added bundle)."""
    bundle = get_bundle_info(uuid)
    if bundle is not None:
        return bundle
    await _refresh_if_due()
    return get_bundle_info(uuid)
