from dataclasses import dataclass, field
from datetime import datetime, timezone


@dataclass
class SessionData:
    access_token: str
    entitlements_token: str
    puuid: str
    shard: str
    region: str
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    # Set when the session came from a Riot `ssid` cookie: the cookie lets the server fetch fresh
    # tokens by itself, so such a session stays usable for a long time.
    ssid: str | None = None
    refreshed_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
