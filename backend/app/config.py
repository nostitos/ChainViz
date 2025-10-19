"""Application configuration"""

from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Electrum Server (Seth's Fulcrum primary)
    electrum_host: str = "fulcrum.sethforprivacy.com"
    electrum_port: int = 50002
    electrum_use_ssl: bool = True
    electrum_fallback_host: str = "iu1b96e.glddns.com"
    electrum_fallback_port: int = 50002

    # Redis
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_db: int = 0
    redis_password: str = ""

    # Cache TTL (seconds)
    cache_ttl_address_history: int = 300
    cache_ttl_transaction: int = 3600
    cache_ttl_cluster: int = 600

    # API
    api_title: str = "ChainViz API"
    api_version: str = "0.1.0"
    max_trace_depth: int = 50
    max_bulk_addresses: int = 1000
    max_xpub_derivation: int = 10000

    # CORS
    cors_origins: List[str] = ["http://localhost:5173", "http://localhost:3000"]

    # Logging
    log_level: str = "DEBUG"


# Global settings instance
settings = Settings()

