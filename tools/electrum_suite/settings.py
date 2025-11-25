"""Settings shim for the Electrum suite.

Tries to re-use the main application's configuration if available, otherwise falls
back to environment variables so the suite can run standalone.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


try:
    from app.config import settings as app_settings  # type: ignore
except Exception:  # pragma: no cover - fallback for standalone usage
    @dataclass
    class ElectrumSuiteSettings:
        electrum_host: str = os.getenv("ELECTRUM_HOST", "fulcrum.sethforprivacy.com")
        electrum_port: int = int(os.getenv("ELECTRUM_PORT", "50002"))
        electrum_use_ssl: bool = os.getenv("ELECTRUM_USE_SSL", "1") not in {"0", "false", "False"}
        electrum_fallback_host: str = os.getenv("ELECTRUM_FALLBACK_HOST", "")
        electrum_fallback_port: int = int(os.getenv("ELECTRUM_FALLBACK_PORT", "50002"))
        electrum_pool_size: int = int(os.getenv("ELECTRUM_POOL_SIZE", "10"))
        electrum_pool_min_size: int = int(os.getenv("ELECTRUM_POOL_MIN_SIZE", "6"))
        electrum_health_check_interval: int = int(os.getenv("ELECTRUM_HEALTH_CHECK_INTERVAL", "300"))
        electrum_request_timeout: int = int(os.getenv("ELECTRUM_REQUEST_TIMEOUT", "10"))
        electrum_max_retries: int = int(os.getenv("ELECTRUM_MAX_RETRIES", "3"))
        electrum_warmup_connections: int = int(os.getenv("ELECTRUM_WARMUP_CONNECTIONS", "3"))
        electrum_no_connection_backoff: float = float(os.getenv("ELECTRUM_NO_CONNECTION_BACKOFF", "0.75"))

    settings = ElectrumSuiteSettings()
else:
    settings = app_settings

