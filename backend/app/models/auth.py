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
    # Set for a "viewer" session made from a snapshot code: it only shows the saved data and never
    # calls Riot.
    snapshot_code: str | None = None
    # "Stay signed in": the Riot login cookies (ssid etc.) used to renew the access token silently.
    # Never sent to the browser; stored encrypted.
    id_token: str = ""
    cookies: dict | None = None
    last_used: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
