from dataclasses import dataclass, field
from datetime import datetime, timezone


@dataclass
class SessionData:
    access_token: str
    entitlements_token: str
    puuid: str
    shard: str
    region: str
    riot_cookies: dict = field(default_factory=dict)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
