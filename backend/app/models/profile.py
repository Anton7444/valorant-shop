from pydantic import BaseModel

from app.models.store import Wallet


class AgentInfo(BaseModel):
    uuid: str
    name: str
    icon: str
    owned: bool


class MatchSummary(BaseModel):
    match_id: str
    map_uuid: str | None = None
    map_name: str
    queue: str
    started_at: int  # epoch milliseconds
    length_secs: int
    agent_uuid: str | None = None
    agent_name: str
    agent_icon: str
    kills: int
    deaths: int
    assists: int
    score: int
    won: bool | None = None  # None for draws / modes without teams
    rounds_won: int | None = None
    rounds_lost: int | None = None


class ProfileResponse(BaseModel):
    puuid: str
    game_name: str | None = None
    tag_line: str | None = None
    level: int | None = None
    wallet: Wallet | None = None
    agents: list[AgentInfo] = []
    matches: list[MatchSummary] = []
    # Sections Riot did not return (shown as unavailable instead of failing the page).
    unavailable: list[str] = []
