from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    ENCRYPTION_KEY: str = ""
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000,http://localhost"
    ENVIRONMENT: str = "development"
    # Comma-separated PUUIDs (or leading prefixes) that get the promo takeover screen
    PROMO_PUUIDS: str = ""

    # Google sign-in + accounts (a Google account can carry one linked Riot login across devices)
    GOOGLE_CLIENT_ID: str = ""  # OAuth "Web application" client id; empty = Google sign-in is off
    ALLOWED_EMAILS: str = ""  # optional comma-separated allow-list; empty = any verified Google account
    ACCOUNT_DB: str = "/tmp/valshop_accounts.db"
    ACCOUNT_KEY: str = ""  # Fernet key for the stored Riot cookies; if empty one is created next to ACCOUNT_DB
    OCI_KMS_KEY_ID: str = ""  # when set, the Fernet key is wrapped by this Oracle Vault key instead of sitting on disk
    OCI_KMS_ENDPOINT: str = ""  # the vault's cryptographic endpoint
    MAX_ACCOUNTS: int = 200
    DEVICE_IDLE_DAYS: int = 90  # a signed-in device nobody uses for this long is signed out
    RIOT_IDLE_DAYS: int = 30  # a linked Riot login on an account that is not used for this long is deleted
    KEEPALIVE_HOURS: float = 6.0

    @property
    def allowed_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]

    def is_promo_target(self, puuid: str) -> bool:
        wanted = [p.strip().lower() for p in self.PROMO_PUUIDS.split(",") if p.strip()]
        return any(puuid.lower().startswith(prefix) for prefix in wanted)

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
