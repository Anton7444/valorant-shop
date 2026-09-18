from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    ENCRYPTION_KEY: str = ""
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000,http://localhost"
    ENVIRONMENT: str = "development"

    @property
    def allowed_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
