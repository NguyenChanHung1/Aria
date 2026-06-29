from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://aria:aria@localhost:5432/aria"
    redis_url: str = "redis://localhost:6379"
    lyrics_service_url: str = "http://localhost:8001"
    composition_service_url: str = "http://localhost:8002"
    mixing_service_url: str = "http://localhost:8003"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    output_dir: str = "outputs"
    web_origin: str = "http://localhost:3000"


settings = Settings()
