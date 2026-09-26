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

# Riot's storefront ItemTypeID values, used to tell bundle/offer items apart.
ITEM_TYPE_SKIN = "e7c63390-eda7-46e0-bb7a-a6abdacd2433"
ITEM_TYPE_SKIN_VARIANT = "3ad1b2b2-acdb-4524-852f-954a76ddae0a"  # chromas
ITEM_TYPE_BUDDY = "dd3bf334-87f3-40bd-b043-682a57a8dc3a"
ITEM_TYPE_SPRAY = "d5f120f8-ff8c-4aac-92ea-f2b5acbe9475"
ITEM_TYPE_PLAYER_CARD = "3f296c07-64c3-494c-923b-fe692a4fa1bd"
ITEM_TYPE_TITLE = "de7caa6b-adf7-4588-bbd1-143831e786c6"
ITEM_TYPE_AGENT = "01bb38e1-da47-4e6a-9b3d-945fe4655707"

# Module-level caches
_skins: dict[str, dict] = {}
_skin_levels_to_skin: dict[str, dict] = {}
_skin_chromas_to_skin: dict[str, dict] = {}
_skin_video_by_uuid: dict[str, str] = {}
_content_tiers: dict[str, dict] = {}
_bundles: dict[str, dict] = {}
_buddies: dict[str, dict] = {}
_buddy_levels_to_buddy: dict[str, dict] = {}
_sprays: dict[str, dict] = {}
_spray_levels_to_spray: dict[str, dict] = {}
_player_cards: dict[str, dict] = {}
_titles: dict[str, dict] = {}
_agents: dict[str, dict] = {}
_client_version: str = ""
_last_refresh: float = 0.0
_refresh_lock = asyncio.Lock()


def _index_with_levels(
    entries: list[dict],
    store: dict[str, dict],
    levels_store: dict[str, dict],
    icon_field: str = "displayIcon",
) -> None:
    """Index cosmetic entries by UUID, and their nested levels (if any) to the parent entry."""
    for entry in entries:
        uuid = entry["uuid"].lower()
        parsed = {
            "uuid": uuid,
            "displayName": entry.get("displayName", ""),
            "displayIcon": entry.get(icon_field, "") or "",
        }
        store[uuid] = parsed
        for level in entry.get("levels", []):
            levels_store[level["uuid"].lower()] = parsed


async def initialize() -> None:
    """Fetch all asset data from valorant-api.com. Also used to refresh the cache later."""
    global _client_version, _last_refresh

    async with httpx.AsyncClient(timeout=30.0) as client:
        (
            skins_resp,
            tiers_resp,
            version_resp,
            bundles_resp,
            buddies_resp,
            sprays_resp,
            player_cards_resp,
            titles_resp,
            agents_resp,
        ) = await _fetch_all(client)

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

        # Map each level UUID to the parent skin, and each level's own demo
        # video (if Riot has one for that level) by its exact UUID.
        for level in skin.get("levels", []):
            level_uuid = level["uuid"].lower()
            _skin_levels_to_skin[level_uuid] = skin_entry
            if level.get("streamedVideo"):
                _skin_video_by_uuid[level_uuid] = level["streamedVideo"]
                # First level with a video also becomes the skin's default video,
                # for when an offer references the parent skin UUID directly.
                _skin_video_by_uuid.setdefault(uuid, level["streamedVideo"])

        # Map each chroma (color variant) UUID to the parent skin. Bundles very
        # commonly reference a specific chroma rather than the base skin level,
        # and chroma UUIDs are distinct from both the skin and its level UUIDs.
        for chroma in skin.get("chromas", []):
            chroma_uuid = chroma["uuid"].lower()
            _skin_chromas_to_skin[chroma_uuid] = {
                "uuid": chroma_uuid,
                "displayName": skin.get("displayName", ""),
                "displayIcon": chroma.get("fullRender") or chroma.get("displayIcon") or skin_entry["displayIcon"],
                "contentTierUuid": skin_entry["contentTierUuid"],
            }
            if chroma.get("streamedVideo"):
                _skin_video_by_uuid[chroma_uuid] = chroma["streamedVideo"]

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

    # Other cosmetics that can appear as bundle items alongside skins
    _index_with_levels(buddies_resp, _buddies, _buddy_levels_to_buddy)
    _index_with_levels(sprays_resp, _sprays, _spray_levels_to_spray)

    for card in player_cards_resp:
        uuid = card["uuid"].lower()
        _player_cards[uuid] = {
            "uuid": uuid,
            "displayName": card.get("displayName", ""),
            "displayIcon": card.get("displayIcon") or card.get("largeArt", "") or "",
        }

    for title in titles_resp:
        uuid = title["uuid"].lower()
        _titles[uuid] = {
            "uuid": uuid,
            # Titles are text-only cosmetics: no displayIcon exists for them.
            "displayName": title.get("displayName") or title.get("titleText", ""),
            "displayIcon": "",
        }

    for agent in agents_resp:
        uuid = agent["uuid"].lower()
        _agents[uuid] = {
            "uuid": uuid,
            "displayName": agent.get("displayName", ""),
            "displayIcon": agent.get("displayIcon") or agent.get("fullPortrait", "") or "",
        }

    # Client version
    _client_version = version_resp.get("riotClientVersion", "")
    _last_refresh = time.monotonic()

    logger.info(
        "Asset cache initialized: %d skins, %d levels, %d chromas, %d tiers, %d bundles, "
        "%d buddies, %d sprays, %d cards, %d titles, %d agents, version=%s",
        len(_skins),
        len(_skin_levels_to_skin),
        len(_skin_chromas_to_skin),
        len(_content_tiers),
        len(_bundles),
        len(_buddies),
        len(_sprays),
        len(_player_cards),
        len(_titles),
        len(_agents),
        _client_version,
    )


async def _fetch_all(client: httpx.AsyncClient) -> tuple[list, list, dict, list, list, list, list, list, list]:
    """Fetch all endpoints concurrently."""
    requests = {
        "skins": client.get(f"{BASE_URL}/weapons/skins"),
        "tiers": client.get(f"{BASE_URL}/contenttiers"),
        "version": client.get(f"{BASE_URL}/version"),
        "bundles": client.get(f"{BASE_URL}/bundles"),
        "buddies": client.get(f"{BASE_URL}/buddies"),
        "sprays": client.get(f"{BASE_URL}/sprays"),
        "player_cards": client.get(f"{BASE_URL}/playercards"),
        "titles": client.get(f"{BASE_URL}/playertitles"),
        "agents": client.get(f"{BASE_URL}/agents", params={"isPlayableCharacter": "true"}),
    }
    responses = dict(zip(requests.keys(), await asyncio.gather(*requests.values())))

    for resp in responses.values():
        resp.raise_for_status()

    return (
        responses["skins"].json()["data"],
        responses["tiers"].json()["data"],
        responses["version"].json()["data"],
        responses["bundles"].json()["data"],
        responses["buddies"].json()["data"],
        responses["sprays"].json()["data"],
        responses["player_cards"].json()["data"],
        responses["titles"].json()["data"],
        responses["agents"].json()["data"],
    )


def get_skin(uuid: str) -> dict | None:
    """Lookup skin by skin UUID, skin level UUID, or chroma (variant) UUID."""
    key = uuid.lower()
    return _skins.get(key) or _skin_levels_to_skin.get(key) or _skin_chromas_to_skin.get(key)


def get_skin_video(*uuids: str) -> str | None:
    """Lookup a skin demo video by the first matching UUID (level, chroma, or skin)."""
    for uuid in uuids:
        video = _skin_video_by_uuid.get(uuid.lower())
        if video:
            return video
    return None


def get_agent(uuid: str) -> dict | None:
    return _agents.get(uuid.lower())


def get_content_tier(uuid: str) -> dict | None:
    return _content_tiers.get(uuid.lower())


def get_client_version() -> str:
    return _client_version


def get_bundle_info(uuid: str) -> dict | None:
    return _bundles.get(uuid.lower())


def get_buddy(uuid: str) -> dict | None:
    key = uuid.lower()
    return _buddies.get(key) or _buddy_levels_to_buddy.get(key)


def get_spray(uuid: str) -> dict | None:
    key = uuid.lower()
    return _sprays.get(key) or _spray_levels_to_spray.get(key)


def get_player_card(uuid: str) -> dict | None:
    return _player_cards.get(uuid.lower())


def get_title(uuid: str) -> dict | None:
    return _titles.get(uuid.lower())


# Item type -> plain (non-refreshing) lookup, used to resolve bundle/offer items generically.
_LOOKUP_BY_ITEM_TYPE = {
    ITEM_TYPE_SKIN: get_skin,
    ITEM_TYPE_SKIN_VARIANT: get_skin,
    ITEM_TYPE_BUDDY: get_buddy,
    ITEM_TYPE_SPRAY: get_spray,
    ITEM_TYPE_PLAYER_CARD: get_player_card,
    ITEM_TYPE_TITLE: get_title,
    ITEM_TYPE_AGENT: get_agent,
}


async def _refresh_if_due() -> None:
    """Re-fetch the asset catalog, unless it was already refreshed recently."""
    async with _refresh_lock:
        if time.monotonic() - _last_refresh < REFRESH_COOLDOWN_SECONDS:
            return
        try:
            await initialize()
        except Exception:
            # A bad refresh (network hiccup or an unexpected response shape)
            # must never crash the caller -- just keep serving the old cache.
            logger.exception("Failed to refresh asset cache")


async def _ensure(getter, uuid: str) -> dict | None:
    """Look up via `getter`, refreshing the cache once if the entry is missing."""
    entry = getter(uuid)
    if entry is not None:
        return entry
    await _refresh_if_due()
    return getter(uuid)


async def get_skin_ensured(uuid: str) -> dict | None:
    """Lookup a skin, refreshing the cache once if it's missing (e.g. a newly added skin)."""
    return await _ensure(get_skin, uuid)


async def get_bundle_info_ensured(uuid: str) -> dict | None:
    """Lookup bundle info, refreshing the cache once if it's missing (e.g. a newly added bundle)."""
    return await _ensure(get_bundle_info, uuid)


async def get_item_ensured(item_type_id: str, uuid: str) -> dict | None:
    """Lookup a bundle/offer item of any cosmetic type by its Riot ItemTypeID.

    Falls back to treating it as a skin for unrecognized types, since skins are
    by far the most common bundle/offer item.
    """
    getter = _LOOKUP_BY_ITEM_TYPE.get(item_type_id.lower(), get_skin)
    return await _ensure(getter, uuid)
