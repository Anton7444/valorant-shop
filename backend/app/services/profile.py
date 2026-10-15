import asyncio
import logging

import httpx

from app.models.auth import SessionData
from app.models.profile import AgentInfo, MatchSummary, ProfileResponse
from app.services import asset_cache, storefront
from app.services.asset_cache import ITEM_TYPE_AGENT, get_agent, get_map

logger = logging.getLogger(__name__)

MATCH_COUNT = 10


def _pd(session: SessionData) -> str:
    return f"https://pd.{session.shard}.a.pvp.net"


def _headers(session: SessionData) -> dict[str, str]:
    return storefront._riot_headers(session.access_token, session.entitlements_token)


async def _get_json(client: httpx.AsyncClient, session: SessionData, url: str) -> dict:
    resp = await client.get(url, headers=_headers(session))
    resp.raise_for_status()
    return resp.json()


async def _fetch_identity(session: SessionData) -> tuple[str | None, str | None]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.put(
            f"{_pd(session)}/name-service/v2/players",
            headers=_headers(session),
            json=[session.puuid],
        )
        resp.raise_for_status()
        players = resp.json()
    if not players:
        return None, None
    return players[0].get("GameName"), players[0].get("TagLine")


async def _fetch_level(session: SessionData) -> int | None:
    async with httpx.AsyncClient(timeout=30.0) as client:
        data = await _get_json(client, session, f"{_pd(session)}/account-xp/v1/players/{session.puuid}")
    level = data.get("Progress", {}).get("Level")
    return int(level) if level is not None else None


async def _fetch_agents(session: SessionData) -> list[AgentInfo]:
    url = f"{_pd(session)}/store/v1/entitlements/{session.puuid}/{ITEM_TYPE_AGENT}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        data = await _get_json(client, session, url)
    owned_ids = {e.get("ItemID", "").lower() for e in data.get("Entitlements", [])}
    agents = [
        AgentInfo(
            uuid=a["uuid"],
            name=a["displayName"],
            icon=a["displayIcon"],
            # The starter agents are free for everyone and not always listed.
            owned=a["uuid"] in owned_ids or a.get("isBaseContent", False),
        )
        for a in asset_cache.all_agents()
    ]
    return sorted(agents, key=lambda a: (not a.owned, a.name.lower()))


def _parse_match(details: dict, puuid: str) -> MatchSummary | None:
    info = details.get("matchInfo", {})
    me = next((p for p in details.get("players", []) if p.get("subject") == puuid), None)
    if not me:
        return None
    stats = me.get("stats") or {}
    agent = get_agent(me.get("characterId", "")) if me.get("characterId") else None
    game_map = get_map(info.get("mapId", ""))

    won = rounds_won = rounds_lost = None
    teams = details.get("teams") or []
    mine = next((t for t in teams if t.get("teamId") == me.get("teamId")), None)
    other = next((t for t in teams if t.get("teamId") != me.get("teamId")), None)
    if mine is not None:
        won = mine.get("won")
        rounds_won = mine.get("roundsWon")
        if other is not None:
            rounds_lost = other.get("roundsWon")
            if rounds_won == rounds_lost:
                won = None  # draw

    return MatchSummary(
        match_id=info.get("matchId", ""),
        map_uuid=game_map["uuid"] if game_map else None,
        map_name=game_map["displayName"] if game_map else "Unknown map",
        queue=info.get("queueID", ""),
        started_at=int(info.get("gameStartMillis", 0)),
        length_secs=int(info.get("gameLengthMillis", 0) // 1000),
        agent_uuid=agent["uuid"] if agent else None,
        agent_name=agent["displayName"] if agent else "Unknown",
        agent_icon=agent["displayIcon"] if agent else "",
        kills=stats.get("kills", 0),
        deaths=stats.get("deaths", 0),
        assists=stats.get("assists", 0),
        score=stats.get("score", 0),
        won=won,
        rounds_won=rounds_won,
        rounds_lost=rounds_lost,
    )


async def _fetch_matches(session: SessionData) -> list[MatchSummary]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        history = await _get_json(
            client,
            session,
            f"{_pd(session)}/match-history/v1/history/{session.puuid}?startIndex=0&endIndex={MATCH_COUNT}",
        )
        match_ids = [m["MatchID"] for m in history.get("History", [])][:MATCH_COUNT]
        results = await asyncio.gather(
            *(_get_json(client, session, f"{_pd(session)}/match-details/v1/matches/{mid}") for mid in match_ids),
            return_exceptions=True,
        )
    matches: list[MatchSummary] = []
    for result in results:
        if isinstance(result, Exception):
            logger.warning("Match details failed: %s", result)
            continue
        match = _parse_match(result, session.puuid)
        if match:
            matches.append(match)
    return sorted(matches, key=lambda m: m.started_at, reverse=True)


async def get_profile(session: SessionData) -> ProfileResponse:
    sections = {
        "identity": _fetch_identity(session),
        "level": _fetch_level(session),
        "wallet": storefront.get_wallet(
            session.access_token, session.entitlements_token, session.puuid, session.shard
        ),
        "agents": _fetch_agents(session),
        "matches": _fetch_matches(session),
    }
    results = dict(zip(sections, await asyncio.gather(*sections.values(), return_exceptions=True)))

    failures = {k: v for k, v in results.items() if isinstance(v, Exception)}
    if len(failures) == len(results):
        # Nothing worked (e.g. Riot maintenance): let the router map the error.
        raise next(iter(failures.values()))
    for name, exc in failures.items():
        logger.warning("Profile section %s failed: %s", name, exc)

    def ok(name: str):
        return None if name in failures else results[name]

    identity = ok("identity") or (None, None)
    return ProfileResponse(
        puuid=session.puuid,
        game_name=identity[0],
        tag_line=identity[1],
        level=ok("level"),
        wallet=ok("wallet"),
        agents=ok("agents") or [],
        matches=ok("matches") or [],
        unavailable=[k for k in ("level", "wallet", "agents", "matches") if k in failures],
    )
