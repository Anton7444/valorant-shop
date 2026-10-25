"""Battle pass progress: the player's XP from Riot, level thresholds and rewards from valorant-api.com."""

import logging
import time
from datetime import datetime, timezone

import httpx

from app.models.auth import SessionData
from app.models.battlepass import BattlePassResponse, FreeReward, PassLevel, PassReward
from app.services import asset_cache, storefront
from app.services.asset_cache import (
    ITEM_TYPE_AGENT,
    ITEM_TYPE_BUDDY,
    ITEM_TYPE_PLAYER_CARD,
    ITEM_TYPE_SKIN,
    ITEM_TYPE_SPRAY,
    ITEM_TYPE_TITLE,
)

logger = logging.getLogger(__name__)

API = "https://valorant-api.com/v1"
CACHE_SECONDS = 6 * 3600

CURRENCY_NAMES = {
    "85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741": "Valorant Points",
    "e59aa87c-4cbf-517a-5983-6e81511be9b7": "Radianite Points",
    "85ca954a-41f2-ce94-9b45-8ca3dd39a00d": "Kingdom Credits",
    "f08d4ae3-939c-4576-ab26-09ce1f23bb37": "Agent Tokens",
}

# valorant-api reward type -> (kind shown to the UI, Riot ItemTypeID used to look the item up)
REWARD_TYPES = {
    "EquippableSkinLevel": ("skin", ITEM_TYPE_SKIN),
    "EquippableCharmLevel": ("buddy", ITEM_TYPE_BUDDY),
    "Spray": ("spray", ITEM_TYPE_SPRAY),
    "PlayerCard": ("card", ITEM_TYPE_PLAYER_CARD),
    "Title": ("title", ITEM_TYPE_TITLE),
    "Character": ("agent", ITEM_TYPE_AGENT),
}

_cache: dict[str, tuple[float, list[dict]]] = {}


async def _catalog(client: httpx.AsyncClient, name: str) -> list[dict]:
    cached = _cache.get(name)
    if cached and time.monotonic() - cached[0] < CACHE_SECONDS:
        return cached[1]
    resp = await client.get(f"{API}/{name}")
    resp.raise_for_status()
    data = resp.json().get("data", [])
    _cache[name] = (time.monotonic(), data)
    return data


def _parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


async def _reward(raw: dict | None) -> PassReward | None:
    if not raw or not raw.get("uuid"):
        return None
    uuid = raw["uuid"].lower()
    amount = int(raw.get("amount") or 1)
    rtype = raw.get("type", "")
    if rtype == "Currency":
        return PassReward(
            uuid=uuid,
            kind="currency",
            name=CURRENCY_NAMES.get(uuid, "Currency"),
            icon=f"https://media.valorant-api.com/currencies/{uuid}/displayicon.png",
            amount=amount,
        )
    kind, item_type = REWARD_TYPES.get(rtype, ("other", ""))
    item = await asset_cache.get_item_ensured(item_type, uuid) if item_type else None
    return PassReward(
        uuid=item["uuid"] if item else uuid,
        kind=kind,
        name=item["displayName"] if item else rtype or "Reward",
        icon=(item.get("displayIcon", "") if item else "") or "",
        amount=amount,
    )


async def get_battlepass(session: SessionData) -> BattlePassResponse | None:
    headers = storefront._riot_headers(session.access_token, session.entitlements_token)
    url = f"https://pd.{session.shard}.a.pvp.net/contracts/v1/contracts/{session.puuid}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()
        player_contracts = {c["ContractDefinitionID"].lower(): c for c in resp.json().get("Contracts", [])}
        defs = await _catalog(client, "contracts")
        seasons = {s["uuid"].lower(): s for s in await _catalog(client, "seasons")}

    now = datetime.now(timezone.utc)
    candidates = []
    for d in defs:
        content = d.get("content") or {}
        if content.get("relationType") != "Season" or d["uuid"].lower() not in player_contracts:
            continue
        season = seasons.get((content.get("relationUuid") or "").lower(), {})
        start, end = _parse_time(season.get("startTime")), _parse_time(season.get("endTime"))
        active = bool(start and end and start <= now < end)
        candidates.append((active, start or datetime.min.replace(tzinfo=timezone.utc), d, end))
    if not candidates:
        return None
    # The running season's pass first; failing that, the most recent one.
    candidates.sort(key=lambda c: (c[0], c[1]), reverse=True)
    _, _, definition, ends = candidates[0]
    progress = player_contracts[definition["uuid"].lower()].get("ContractProgression", {})
    total_xp = int(progress.get("TotalProgressionEarned") or 0)

    levels: list[PassLevel] = []
    raw_rewards: dict[int, dict] = {}  # level -> raw reward, to check ownership below
    free_rewards: list[FreeReward] = []
    cumulative = 0
    chapters = (definition.get("content") or {}).get("chapters", [])
    for chapter_index, chapter in enumerate(chapters, start=1):
        for raw_level in chapter.get("levels", []):
            raw_rewards[len(levels) + 1] = raw_level.get("reward") or {}
            cumulative += int(raw_level.get("xp") or 0)
            levels.append(PassLevel(
                level=len(levels) + 1,
                chapter=chapter_index,
                epilogue=bool(chapter.get("isEpilogue")),
                xp=int(raw_level.get("xp") or 0),
                cumulative_xp=cumulative,
                reached=total_xp >= cumulative,
                reward=await _reward(raw_level.get("reward")),
            ))
        # Free-track rewards arrive when the chapter is finished (i.e. its last level is reached).
        for raw_free in chapter.get("freeRewards") or []:
            reward = await _reward(raw_free)
            if reward and levels:
                free_rewards.append(FreeReward(
                    chapter=chapter_index,
                    level_required=len(levels),
                    reached=total_xp >= cumulative,
                    reward=reward,
                ))

    premium_owned = await _premium_owned(session, levels, raw_rewards)
    reached = sum(1 for lv in levels if lv.reached)
    nxt = levels[reached] if reached < len(levels) else None
    previous_total = levels[reached - 1].cumulative_xp if reached else 0
    return BattlePassResponse(
        name=definition.get("displayName", "Battle Pass"),
        icon=definition.get("displayIcon") or "",
        level=reached,
        max_level=len(levels),
        total_xp=total_xp,
        xp_into_level=(total_xp - previous_total) if nxt else 0,
        xp_for_next=nxt.xp if nxt else 0,
        xp_remaining=max(0, (levels[-1].cumulative_xp if levels else 0) - total_xp),
        ends_at=ends.isoformat() if ends else None,
        premium_owned=premium_owned,
        levels=levels,
        free_rewards=free_rewards,
    )


async def _premium_owned(session: SessionData, levels: list[PassLevel], raw_rewards: dict[int, dict]) -> bool | None:
    """Whether the premium pass is bought.

    Riot's contract data does not say, but premium rewards are granted as tiers are reached. If any
    skin among the reached premium tiers is owned, the pass is bought; if skins were reached and none
    is owned, it is not. With no reached skin tier there is nothing to tell, so the answer is unknown.
    """
    skin_rewards = [
        raw_rewards[lv.level]["uuid"].lower()
        for lv in levels
        if lv.reached and raw_rewards.get(lv.level, {}).get("type") == "EquippableSkinLevel"
    ]
    if not skin_rewards:
        return None
    try:
        owned = await storefront.fetch_owned_skin_level_ids(
            session.access_token, session.entitlements_token, session.puuid, session.shard
        )
    except (httpx.HTTPStatusError, httpx.RequestError):
        logger.warning("Could not check owned skins for battle pass ownership")
        return None
    return any(uuid in owned for uuid in skin_rewards)
