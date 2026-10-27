import asyncio
import logging

import httpx

from app.models.auth import SessionData
from app.models.profile import (
    AgentInfo,
    MatchesResponse,
    MatchSummary,
    PlayerRow,
    ProfileResponse,
    TeamSummary,
)
from app.services import asset_cache, storefront
from app.services.riot_http import riot_client
from app.services.asset_cache import ITEM_TYPE_AGENT, get_agent, get_map

logger = logging.getLogger(__name__)

MATCH_COUNT = 20  # matches in the first profile load
MATCH_PAGE = 10  # matches per "load more"


def _pd(session: SessionData) -> str:
    return f"https://pd.{session.shard}.a.pvp.net"


def _headers(session: SessionData) -> dict[str, str]:
    return storefront._riot_headers(session.access_token, session.entitlements_token)


async def _get_json(client: httpx.AsyncClient, session: SessionData, url: str) -> dict:
    resp = await client.get(url, headers=_headers(session))
    resp.raise_for_status()
    return resp.json()


async def _lookup_names(
    client: httpx.AsyncClient, session: SessionData, puuids: list[str]
) -> dict[str, tuple[str | None, str | None]]:
    """Riot ID (name, tag) per player id via the name service."""
    names: dict[str, tuple[str | None, str | None]] = {}
    unique = list(dict.fromkeys(puuids))
    for i in range(0, len(unique), 50):
        resp = await client.put(
            f"{_pd(session)}/name-service/v2/players",
            headers=_headers(session),
            json=unique[i : i + 50],
        )
        resp.raise_for_status()
        for player in resp.json():
            names[player.get("Subject", "")] = (player.get("GameName") or None, player.get("TagLine") or None)
    return names


async def _fetch_identity(session: SessionData) -> tuple[str | None, str | None]:
    async with riot_client() as client:
        names = await _lookup_names(client, session, [session.puuid])
    return names.get(session.puuid, (None, None))


async def _fetch_level(session: SessionData) -> int | None:
    async with riot_client() as client:
        data = await _get_json(client, session, f"{_pd(session)}/account-xp/v1/players/{session.puuid}")
    level = data.get("Progress", {}).get("Level")
    return int(level) if level is not None else None


async def _fetch_agents(session: SessionData) -> list[AgentInfo]:
    url = f"{_pd(session)}/store/v1/entitlements/{session.puuid}/{ITEM_TYPE_AGENT}"
    async with riot_client() as client:
        data = await _get_json(client, session, url)
    owned_ids = {e.get("ItemID", "").lower() for e in data.get("Entitlements", [])}
    agents = [
        AgentInfo(
            uuid=a["uuid"],
            name=a["displayName"],
            icon=a["displayIcon"],
            # The starter agents are free for everyone and not always listed.
            owned=a["uuid"] in owned_ids or a.get("isBaseContent", False),
            role=a.get("role", ""),
        )
        for a in asset_cache.all_agents()
    ]
    return sorted(agents, key=lambda a: (not a.owned, a.name.lower()))


_RANK_NAMES = ["Iron", "Bronze", "Silver", "Gold", "Platinum", "Diamond", "Ascendant", "Immortal"]


def _rank_name(tier: int) -> str:
    """Competitive tier number -> label (3..26 are Iron 1..Immortal 3, 27 Radiant)."""
    if tier >= 27:
        return "Radiant"
    if tier < 3:
        return "Unranked"
    return f"{_RANK_NAMES[(tier - 3) // 3]} {(tier - 3) % 3 + 1}"


def _round_stats(details: dict) -> dict[str, dict[str, int]]:
    """Per-player damage, headshot, first-kill numbers computed from the round results."""
    stats: dict[str, dict[str, int]] = {}

    def row(puuid: str) -> dict[str, int]:
        return stats.setdefault(
            puuid,
            {"dealt": 0, "received": 0, "head": 0, "shots": 0, "fk": 0, "fd": 0},
        )

    for rnd in details.get("roundResults") or []:
        kills: list[dict] = []
        for player in rnd.get("playerStats") or []:
            subject = player.get("subject", "")
            kills.extend(player.get("kills") or [])
            for hit in player.get("damage") or []:
                dmg = hit.get("damage", 0)
                row(subject)["dealt"] += dmg
                row(hit.get("receiver", ""))["received"] += dmg
                head = hit.get("headshots", 0)
                row(subject)["head"] += head
                row(subject)["shots"] += head + hit.get("bodyshots", 0) + hit.get("legshots", 0)
        if kills:
            first = min(kills, key=lambda k: k.get("timeSinceRoundStartMillis", 0))
            row(first.get("killer", ""))["fk"] += 1
            row(first.get("victim", ""))["fd"] += 1
    return stats


def _placeholder_icon() -> str:
    """Icon shown when a mode has no agent (e.g. Ability Draft Arena): KAY/O."""
    for agent in asset_cache.all_agents():
        if agent["displayName"].lower() == "kay/o":
            return agent["displayIcon"]
    return ""


def _parse_match(details: dict, puuid: str) -> MatchSummary | None:
    info = details.get("matchInfo", {})
    raw_players = details.get("players", [])
    placeholder = _placeholder_icon()
    me = next((p for p in raw_players if p.get("subject") == puuid), None)
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

    round_stats = _round_stats(details)
    total_rounds = len(details.get("roundResults") or [])
    rows: list[PlayerRow] = []
    for p in raw_players:
        st = p.get("stats") or {}
        rs = round_stats.get(p.get("subject", ""), {})
        rounds = st.get("roundsPlayed") or total_rounds or 1
        ag = get_agent(p.get("characterId", "")) if p.get("characterId") else None
        kills, deaths = st.get("kills", 0), st.get("deaths", 0)
        shots = rs.get("shots", 0)
        rows.append(
            PlayerRow(
                puuid=p.get("subject", ""),
                game_name=p.get("gameName") or None,
                tag_line=p.get("tagLine") or None,
                team_id=p.get("teamId", ""),
                agent_uuid=ag["uuid"] if ag else None,
                agent_name=ag["displayName"] if ag else "",
                agent_icon=ag["displayIcon"] if ag else placeholder,
                level=p.get("accountLevel"),
                rank=_rank_name(p.get("competitiveTier", 0)),
                score=st.get("score", 0),
                acs=round(st.get("score", 0) / rounds),
                kills=kills,
                deaths=deaths,
                assists=st.get("assists", 0),
                plus_minus=kills - deaths,
                kd=round(kills / deaths, 2) if deaths else float(kills),
                dda=round((rs.get("dealt", 0) - rs.get("received", 0)) / rounds),
                adr=round(rs.get("dealt", 0) / rounds, 1),
                hs_pct=round(100 * rs.get("head", 0) / shots) if shots else 0,
                first_kills=rs.get("fk", 0),
                first_deaths=rs.get("fd", 0),
                is_me=p.get("subject") == puuid,
            )
        )
    rows.sort(key=lambda r: r.acs, reverse=True)

    return MatchSummary(
        match_id=info.get("matchId", ""),
        map_uuid=game_map["uuid"] if game_map else None,
        map_name=game_map["displayName"] if game_map else "Unknown map",
        queue=info.get("queueID", ""),
        started_at=int(info.get("gameStartMillis", 0)),
        length_secs=int(info.get("gameLengthMillis", 0) // 1000),
        agent_uuid=agent["uuid"] if agent else None,
        agent_name=agent["displayName"] if agent else "Unknown",
        agent_icon=agent["displayIcon"] if agent else placeholder,
        kills=stats.get("kills", 0),
        deaths=stats.get("deaths", 0),
        assists=stats.get("assists", 0),
        score=stats.get("score", 0),
        won=won,
        rounds_won=rounds_won,
        rounds_lost=rounds_lost,
        teams=[
            TeamSummary(team_id=t.get("teamId", ""), won=t.get("won"), rounds_won=t.get("roundsWon"))
            for t in teams
        ],
        players=rows,
    )


async def _fetch_matches(
    session: SessionData, start: int = 0, count: int = MATCH_COUNT
) -> tuple[list[MatchSummary], bool]:
    """Matches [start, start+count) of the player's history, and whether more may exist."""
    async with riot_client() as client:
        history = await _get_json(
            client,
            session,
            f"{_pd(session)}/match-history/v1/history/{session.puuid}?startIndex={start}&endIndex={start + count}",
        )
        match_ids = [m["MatchID"] for m in history.get("History", [])][:count]
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

        # Match details only carry names for some players (privacy settings), so
        # fill the gaps from the name service. If that fails, rows stay "Hidden".
        missing = [p.puuid for m in matches for p in m.players if not p.game_name]
        if missing:
            try:
                names = await _lookup_names(client, session, missing)
            except (httpx.HTTPStatusError, httpx.RequestError) as exc:
                logger.warning("Name lookup failed: %s", exc)
                names = {}
            for m in matches:
                for p in m.players:
                    if not p.game_name and p.puuid in names:
                        p.game_name, p.tag_line = names[p.puuid]
    has_more = len(match_ids) >= count
    return sorted(matches, key=lambda m: m.started_at, reverse=True), has_more


async def get_matches(session: SessionData, start: int) -> MatchesResponse:
    matches, has_more = await _fetch_matches(session, start, MATCH_PAGE)
    return MatchesResponse(matches=matches, has_more=has_more)


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
        matches=(ok("matches") or ([], False))[0],
        has_more_matches=(ok("matches") or ([], False))[1],
        unavailable=[k for k in ("level", "wallet", "agents", "matches") if k in failures],
    )
