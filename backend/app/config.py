from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    ENCRYPTION_KEY: str = ""
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000,http://localhost"
    ENVIRONMENT: str = "development"
    # Comma-separated PUUIDs (or leading prefixes) that get the promo takeover screen
    PROMO_PUUIDS: str = ""

    @property
    def allowed_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]

    def is_promo_target(self, puuid: str) -> bool:
        wanted = [p.strip().lower() for p in self.PROMO_PUUIDS.split(",") if p.strip()]
        return any(puuid.lower().startswith(prefix) for prefix in wanted)

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
