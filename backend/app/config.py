from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Jasylqala API"
    database_url: str = "sqlite:///./jasylqala.db"
    upload_dir: str = "./uploads"
    max_upload_size_mb: int = 25
    cors_origins: str = "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173"

    # Supabase Storage for persistent photos on Render
    supabase_url: str = ""
    supabase_key: str = ""
    supabase_secret_key: str = ""
    supabase_bucket: str = "tree-photos"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def effective_supabase_key(self) -> str:
        return self.supabase_key or self.supabase_secret_key

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
