from pydantic import BaseModel

from app.models.store import Wallet


class AgentInfo(BaseModel):
    uuid: str
    name: str
    icon: str
    owned: bool
    role: str = ""


class PlayerRow(BaseModel):
    puuid: str
    game_name: str | None = None
    tag_line: str | None = None
    team_id: str = ""
    agent_uuid: str | None = None
    agent_name: str = ""
    agent_icon: str = ""
    level: int | None = None
    rank: str = ""
    score: int = 0
    acs: int = 0
    kills: int = 0
    deaths: int = 0
    assists: int = 0
    plus_minus: int = 0
    kd: float = 0.0
    dda: int = 0  # average damage dealt minus received per round
    adr: float = 0.0
    hs_pct: int = 0
    first_kills: int = 0
    first_deaths: int = 0
    is_me: bool = False


class TeamSummary(BaseModel):
    team_id: str
    won: bool | None = None
    rounds_won: int | None = None


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
    teams: list[TeamSummary] = []
    players: list[PlayerRow] = []


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
