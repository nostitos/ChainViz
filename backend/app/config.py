"""Application configuration"""

from dataclasses import dataclass
from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


@dataclass
class MempoolEndpointConfig:
    """
    Lightweight description of a mempool.space-compatible endpoint.
    Used by the mempool datasource to build HTTP clients and semaphores.
    """

    name: str
    base_url: str
    priority: int  # 0 = local, 1 = additional, 2 = public
    max_concurrent: int
    request_delay: float = 0.0
    enabled: bool = True
    api_key_env: Optional[str] = None


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Electrum Server (Local server primary - fallback for single-server mode)
    electrum_host: str = "192.168.8.234"
    electrum_port: int = 50002
    electrum_use_ssl: bool = False
    electrum_fallback_host: str = "iu1b96e.glddns.com"
    electrum_fallback_port: int = 50002
    
    # Electrum Multiplexer Settings
    electrum_pool_size: int = 10  # Max pool size (curated reliable servers)
    electrum_pool_min_size: int = 6   # Target pool size to keep warm under normal load
    electrum_pool_refresh_hours: int = 6  # Server list refresh interval
    electrum_health_check_interval: int = 300  # Health check frequency (seconds) - 5 minutes
    electrum_request_timeout: int = 10  # Per-request timeout
    electrum_max_retries: int = 3  # Max retry attempts across different servers
    electrum_multiplexer_enabled: bool = True  # Enabled with lazy initialization
    electrum_warmup_connections: int = 3  # Number of connections to pre-establish on startup
    electrum_no_connection_backoff: float = 0.75  # Seconds multiplier for backoff when pool is empty

    # Mempool.space Configuration (Primary data source for TX fetching)
    mempool_local_enabled: bool = True
    mempool_local_url: str = "http://192.168.8.234:3006/api"
    mempool_additional_urls: List[str] = [
        "https://mempool.jaonoctus.dev/api",
        "https://mempool.emzy.de/api",
        "https://iu1b96e.glddns.com:3006/api",
    ]
    mempool_public_url: str = "https://mempool.space/api"  # Backwards compatibility
    mempool_public_urls: List[str] = ["https://mempool.space/api"]
    mempool_endpoint_disabled: List[str] = []  # Allow disabling via config/env
    
    # Rate limiting for public API
    mempool_public_max_concurrent: int = 10  # Max parallel requests to public API
    mempool_public_request_delay: float = 0.1  # 100ms between requests
    mempool_additional_max_concurrent: int = 6
    mempool_additional_request_delay: float = 0.1
    mempool_local_max_concurrent: int = 50
    mempool_local_request_delay: float = 0.0
    
    # Large TX threshold (when to use public instead of local)
    mempool_large_tx_input_threshold: int = 100  # TXs with 100+ inputs go to public
    mempool_large_tx_size_threshold: int = 50000  # Or TXs larger than 50KB
    
    # Local Electrum (fallback)
    local_electrum_enabled: bool = True
    local_electrum_host: str = "localhost"
    local_electrum_port: int = 50002
    local_electrum_use_ssl: bool = True

    # Redis
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_db: int = 0
    redis_password: str = ""

    # Cache TTL (seconds)
    cache_ttl_address_history: int = 86400  # 1 day (address can get new TXs)
    cache_ttl_transaction: int = 2592000  # 30 days (transactions are immutable)
    cache_ttl_cluster: int = 86400  # 1 day

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

    # Address data fetching
    address_auto_fetch_balance: bool = False


# Global settings instance
settings = Settings()

