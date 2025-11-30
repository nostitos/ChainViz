from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from collections import deque
from urllib.parse import urlparse

import logging

from app.config import MempoolEndpointConfig, settings

logger = logging.getLogger(__name__)


@dataclass
class MempoolEndpointState:
    """
    Runtime state for a mempool endpoint. Tracks health information that will be
    updated by the datasource at runtime and adapts concurrency limits.
    """

    config: MempoolEndpointConfig
    semaphore: asyncio.Semaphore
    healthy: bool = True
    last_success: Optional[datetime] = None
    last_failure: Optional[datetime] = None
    success_count: int = 0
    failure_count: int = 0
    consecutive_failures: int = 0

    # Adaptive concurrency + telemetry
    active_slots: int = 0
    concurrency_limit: int = 0
    min_concurrency: int = 1
    max_concurrency: int = 1
    total_latency: float = 0.0
    total_requests: int = 0
    total_successes: int = 0
    total_failures: int = 0
    consecutive_successes: int = 0
    cooldown_until: Optional[datetime] = None
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock, init=False)
    _recent_outcomes: deque = field(init=False)
    _recent_latencies: deque = field(init=False)
    _last_adjustment: Optional[datetime] = None

    def __post_init__(self) -> None:
        adjust_window = settings.mempool_concurrency_adjust_window
        self._recent_outcomes = deque(maxlen=adjust_window)
        self._recent_latencies = deque(maxlen=adjust_window)

        self.min_concurrency = max(
            settings.mempool_endpoint_min_concurrent,
            min(self.config.min_concurrent, self.config.max_concurrent_ceiling),
        )
        ceiling = min(
            settings.mempool_endpoint_max_concurrent,
            self.config.max_concurrent_ceiling,
            self.config.max_concurrent,
        )
        self.max_concurrency = max(self.min_concurrency, ceiling)
        initial = max(self.min_concurrency, min(self.config.initial_concurrent, self.max_concurrency))
        self.concurrency_limit = initial
        self.cooldown_until = None

    @property
    def priority(self) -> int:
        return self.config.priority

    @property
    def name(self) -> str:
        return self.config.name

    def _cooldown_remaining(self) -> float:
        if not self.cooldown_until:
            return 0.0
        delta = (self.cooldown_until - datetime.utcnow()).total_seconds()
        return max(0.0, delta)

    def is_available(self) -> bool:
        if not self.config.enabled:
            return False
        if self.concurrency_limit <= 0:
            return False
        return self._cooldown_remaining() == 0.0

    async def acquire_slot(self) -> None:
        while True:
            wait_for = 0.0
            async with self._lock:
                if not self.config.enabled:
                    raise RuntimeError(f"Mempool endpoint {self.name} is disabled")

                cooldown_remaining = self._cooldown_remaining()
                if cooldown_remaining > 0:
                    wait_for = max(wait_for, cooldown_remaining)
                elif self.concurrency_limit <= 0:
                    raise RuntimeError(f"Mempool endpoint {self.name} disabled")
                elif self.active_slots < self.concurrency_limit:
                    self.active_slots += 1
                    return
                else:
                    wait_for = max(wait_for, 0.05)

            await asyncio.sleep(min(wait_for if wait_for > 0 else 0.05, 0.5))

    async def release_slot(self) -> None:
        async with self._lock:
            self.active_slots = max(0, self.active_slots - 1)

    async def record_success(self, latency: float) -> None:
        async with self._lock:
            self.success_count += 1
            self.total_requests += 1
            self.total_successes += 1
            self.total_latency += latency
            self.healthy = True
            self.last_success = datetime.utcnow()
            self.consecutive_failures = 0
            self.consecutive_successes += 1
            self.cooldown_until = None
            self._recent_outcomes.append(True)
            self._recent_latencies.append(latency)
            self._maybe_adjust_locked()
            if self.total_successes % 10 == 0:
                logger.debug(
                    "✅ %s successes=%d failures=%d avg_latency=%.3fs current_limit=%d",
                    self.name,
                    self.total_successes,
                    self.total_failures,
                    (self.total_latency / self.total_successes) if self.total_successes else 0.0,
                    self.concurrency_limit,
                )

    async def record_failure(self, latency: float) -> None:
        async with self._lock:
            self.failure_count += 1
            self.total_requests += 1
            self.total_failures += 1
            self.total_latency += latency
            self.healthy = False
            self.last_failure = datetime.utcnow()
            self.consecutive_failures += 1
            self.consecutive_successes = 0
            cooldown = settings.mempool_failure_cooldown_seconds
            self.cooldown_until = datetime.utcnow() + timedelta(seconds=cooldown)
            self._recent_outcomes.append(False)
            self._recent_latencies.append(latency)
            disable = False
            if self.consecutive_failures >= settings.mempool_concurrency_failure_threshold:
                self.concurrency_limit = 0
                self.cooldown_until = datetime.utcnow() + timedelta(days=1)
                disable = True
            self._maybe_adjust_locked(decrease_only=True)
            if self.total_failures % 10 == 0 and not disable:
                logger.info(
                    "⚠️ %s successes=%d failures=%d avg_latency=%.3fs current_limit=%d",
                    self.name,
                    self.total_successes,
                    self.total_failures,
                    (self.total_latency / self.total_successes) if self.total_successes else 0.0,
                    self.concurrency_limit,
                )
            if disable:
                # Never disable priority 0 endpoints (local/trusted nodes)
                if self.config.priority == 0:
                    logger.warning(
                        "⚠️ Priority 0 endpoint %s has %d consecutive failures but will NOT be disabled (trusted source)",
                        self.name, self.consecutive_failures
                    )
                    # Reset cooldown to keep it active
                    self.cooldown_until = None
                else:
                    logger.warning(
                        "Disabling %s after %d consecutive failures", self.name, self.consecutive_failures
                    )

    def _maybe_adjust_locked(self, decrease_only: bool = False) -> None:
        if self.concurrency_limit <= 0:
            return
        window = len(self._recent_outcomes)
        if window < settings.mempool_concurrency_adjust_window:
            return

        now = datetime.utcnow()
        if self._last_adjustment and (now - self._last_adjustment).total_seconds() < 1.0:
            return

        success_rate = sum(1 for outcome in self._recent_outcomes if outcome) / window
        avg_latency = (
            sum(self._recent_latencies) / len(self._recent_latencies)
            if self._recent_latencies
            else None
        )

        target_success = settings.mempool_concurrency_success_target
        latency_target = settings.mempool_concurrency_latency_target
        failure_threshold = settings.mempool_concurrency_failure_threshold

        adjust_down = (
            success_rate < target_success
            or (avg_latency is not None and avg_latency > latency_target)
            or self.consecutive_failures >= failure_threshold
        )

        adjusted = False
        if adjust_down and self.concurrency_limit > self.min_concurrency:
            self.concurrency_limit -= 1
            adjusted = True
        elif not decrease_only and success_rate >= target_success and avg_latency is not None and avg_latency <= latency_target and self.concurrency_limit < self.max_concurrency:
            self.concurrency_limit += 1
            adjusted = True

        if adjusted:
            self._last_adjustment = now
            self._recent_outcomes.clear()
            self._recent_latencies.clear()

    def contribution_snapshot(self) -> Dict[str, Any]:
        avg_latency = (self.total_latency / self.total_successes) if self.total_successes else 0.0
        return {
            "name": self.name,
            "base_url": self.config.base_url,
            "requests": self.total_requests,
            "successes": self.total_successes,
            "failures": self.total_failures,
            "avg_latency": avg_latency,
            "concurrency_limit": self.concurrency_limit,
            "active_slots": self.active_slots,
        }


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
        max_ceiling = min(settings.mempool_local_max_concurrent, settings.mempool_endpoint_max_concurrent)
        parsed = urlparse(url)
        display_name = parsed.netloc or parsed.path or "local"
        config = MempoolEndpointConfig(
            name=display_name,
            base_url=url,
            priority=0,  # Highest priority - prefer local node
            max_concurrent=settings.mempool_local_max_concurrent,
            initial_concurrent=min(max_ceiling, settings.mempool_local_initial_concurrent),
            min_concurrent=settings.mempool_endpoint_min_concurrent,
            max_concurrent_ceiling=max_ceiling,
            request_timeout=settings.mempool_request_timeout,
            min_request_timeout=settings.mempool_min_request_timeout,
            request_delay=settings.mempool_local_request_delay,
        )
        endpoints.append(
            MempoolEndpointState(
                config=config,
                semaphore=asyncio.Semaphore(settings.mempool_local_max_concurrent),
            )
        )

    # Additional tier
    for idx, url in enumerate(settings.mempool_additional_urls):
        norm_url = _normalize_url(url)
        max_ceiling = min(settings.mempool_additional_max_concurrent, settings.mempool_endpoint_max_concurrent)
        parsed = urlparse(norm_url)
        display_name = parsed.netloc or parsed.path or f"additional-{idx}"
        config = MempoolEndpointConfig(
            name=display_name,
            base_url=norm_url,
            priority=1,
            max_concurrent=settings.mempool_additional_max_concurrent,
            initial_concurrent=min(max_ceiling, settings.mempool_additional_initial_concurrent),
            min_concurrent=settings.mempool_endpoint_min_concurrent,
            max_concurrent_ceiling=max_ceiling,
            request_timeout=settings.mempool_request_timeout,
            min_request_timeout=settings.mempool_min_request_timeout,
            request_delay=settings.mempool_additional_request_delay,
            enabled=norm_url not in disabled,
        )
        endpoints.append(
            MempoolEndpointState(
                config=config,
                semaphore=asyncio.Semaphore(settings.mempool_additional_max_concurrent),
            )
        )

    # Public tier (allow multiple URLs for redundancy)
    for idx, url in enumerate(settings.mempool_public_urls):
        norm_url = _normalize_url(url)
        max_ceiling = min(settings.mempool_public_max_concurrent, settings.mempool_endpoint_max_concurrent)
        parsed = urlparse(norm_url)
        display_name = parsed.netloc or parsed.path or f"public-{idx}"
        config = MempoolEndpointConfig(
            name=display_name,
            base_url=norm_url,
            priority=2,
            max_concurrent=settings.mempool_public_max_concurrent,
            initial_concurrent=min(max_ceiling, settings.mempool_public_initial_concurrent),
            min_concurrent=settings.mempool_endpoint_min_concurrent,
            max_concurrent_ceiling=max_ceiling,
            request_timeout=settings.mempool_request_timeout,
            min_request_timeout=settings.mempool_min_request_timeout,
            request_delay=settings.mempool_public_request_delay,
            enabled=norm_url not in disabled,
        )
        endpoints.append(
            MempoolEndpointState(
                config=config,
                semaphore=asyncio.Semaphore(settings.mempool_public_max_concurrent),
            )
        )

    # Filter disabled endpoints
    return [ep for ep in endpoints if ep.config.enabled]

