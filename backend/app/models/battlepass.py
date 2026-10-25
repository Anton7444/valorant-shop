from pydantic import BaseModel


class PassReward(BaseModel):
    uuid: str
    kind: str  # "skin" | "buddy" | "spray" | "card" | "title" | "currency" | "agent" | "other"
    name: str
    icon: str = ""
    amount: int = 1


class PassLevel(BaseModel):
    level: int  # 1-based across the whole pass
    chapter: int  # 1-based
    epilogue: bool = False
    xp: int  # XP needed to go from the previous level to this one
    cumulative_xp: int
    reached: bool
    reward: PassReward | None = None


class FreeReward(BaseModel):
    chapter: int
    level_required: int  # the chapter's last level: the reward comes with finishing the chapter
    reached: bool
    reward: PassReward


class BattlePassResponse(BaseModel):
    name: str
    icon: str = ""
    level: int  # levels reached
    max_level: int
    total_xp: int
    xp_into_level: int
    xp_for_next: int  # 0 when every level is done
    xp_remaining: int  # XP left to finish the whole pass
    ends_at: str | None = None  # ISO timestamp of the season end
    premium_owned: bool | None = None  # None when it could not be worked out
    levels: list[PassLevel]
    free_rewards: list[FreeReward] = []
