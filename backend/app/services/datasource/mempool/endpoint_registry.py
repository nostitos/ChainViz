from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import List, Optional

from app.config import MempoolEndpointConfig, settings


@dataclass
class MempoolEndpointState:
    """
    Runtime state for a mempool endpoint. Tracks health information that will be
    updated by the datasource at runtime.
    """

    config: MempoolEndpointConfig
    semaphore: asyncio.Semaphore
    healthy: bool = True
    last_success: Optional[datetime] = None
    last_failure: Optional[datetime] = None
    success_count: int = 0
    failure_count: int = 0
    consecutive_failures: int = 0

    def mark_success(self) -> None:
        self.success_count += 1
        self.consecutive_failures = 0
        self.healthy = True
        self.last_success = datetime.utcnow()

    def mark_failure(self) -> None:
        self.failure_count += 1
        self.consecutive_failures += 1
        self.healthy = False
        self.last_failure = datetime.utcnow()

    @property
    def priority(self) -> int:
        return self.config.priority

    @property
    def name(self) -> str:
        return self.config.name

    def is_available(self, cooldown_seconds: int = 30) -> bool:
        if not self.config.enabled:
            return False
        if self.healthy:
            return True
        if self.last_failure is None:
            return False
        return datetime.utcnow() - self.last_failure > timedelta(seconds=cooldown_seconds)


def _normalize_url(url: str) -> str:
    return url.rstrip("/")


def build_mempool_endpoints() -> List[MempoolEndpointState]:
    """
    Create runtime endpoint state objects from configuration.
    """

    disabled = {url.rstrip("/") for url in settings.mempool_endpoint_disabled}
    endpoints: List[MempoolEndpointState] = []

    if settings.mempool_local_enabled:
        url = _normalize_url(settings.mempool_local_url)
        endpoints.append(
            MempoolEndpointState(
                config=MempoolEndpointConfig(
                    name="local",
                    base_url=url,
                    priority=0,
                    max_concurrent=settings.mempool_local_max_concurrent,
                    request_delay=settings.mempool_local_request_delay,
                ),
                semaphore=asyncio.Semaphore(settings.mempool_local_max_concurrent),
            )
        )

    # Additional tier
    for idx, url in enumerate(settings.mempool_additional_urls):
        norm_url = _normalize_url(url)
        endpoints.append(
            MempoolEndpointState(
                config=MempoolEndpointConfig(
                    name=f"additional-{idx}",
                    base_url=norm_url,
                    priority=1,
                    max_concurrent=settings.mempool_additional_max_concurrent,
                    request_delay=settings.mempool_additional_request_delay,
                    enabled=norm_url not in disabled,
                ),
                semaphore=asyncio.Semaphore(settings.mempool_additional_max_concurrent),
            )
        )

    # Public tier (allow multiple URLs for redundancy)
    for idx, url in enumerate(settings.mempool_public_urls):
        norm_url = _normalize_url(url)
        endpoints.append(
            MempoolEndpointState(
                config=MempoolEndpointConfig(
                    name=f"public-{idx}",
                    base_url=norm_url,
                    priority=2,
                    max_concurrent=settings.mempool_public_max_concurrent,
                    request_delay=settings.mempool_public_request_delay,
                    enabled=norm_url not in disabled,
                ),
                semaphore=asyncio.Semaphore(settings.mempool_public_max_concurrent),
            )
        )

    # Filter disabled endpoints
    return [ep for ep in endpoints if ep.config.enabled]

