from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple

from .endpoint_registry import MempoolEndpointState


class MempoolEndpointRouter:
    """
    Round-robin router that selects the next available endpoint with the lowest
    priority value. Priority 0 is preferred, then 1, then 2.
    """

    def __init__(self, endpoints: List[MempoolEndpointState]) -> None:
        self._lock = asyncio.Lock()
        self._by_priority: Dict[int, List[MempoolEndpointState]] = defaultdict(list)
        self._indices: Dict[int, int] = defaultdict(int)
        # Round-robin index for the dynamic top-N pool
        self._active_rr_index: int = 0

        for endpoint in endpoints:
            self._by_priority[endpoint.priority].append(endpoint)

        # Ensure deterministic ordering
        for priority in self._by_priority:
            self._by_priority[priority].sort(key=lambda ep: ep.config.base_url)

        self._priorities = sorted(self._by_priority.keys())

    @property
    def priorities(self) -> List[int]:
        return self._priorities

    def _score_endpoint(self, ep: MempoolEndpointState) -> Tuple[float, float, int, int]:
        """
        Compute a ranking score tuple for an endpoint:
        - Higher recent/global success rate first
        - Lower average latency first
        - Higher concurrency limit first
        - Lower total failures first
        """
        # Global stats (avoid using private internals)
        total_req = ep.total_requests
        total_succ = ep.total_successes
        total_fail = ep.total_failures
        avg_latency = (ep.total_latency / total_succ) if total_succ else float("inf")
        success_rate = (total_succ / total_req) if total_req else 0.0
        # Sort key: (-success_rate, avg_latency, -concurrency_limit, total_fail)
        return (-success_rate, avg_latency, -ep.concurrency_limit, total_fail)

    async def _top_n_available(self, n: int, min_priority: int = 0) -> List[MempoolEndpointState]:
        """
        Build a ranked list of up to N available endpoints across all priorities >= min_priority.
        """
        candidates: List[MempoolEndpointState] = []
        for priority in self._priorities:
            if priority < min_priority:
                continue
            for ep in self._by_priority[priority]:
                if ep.is_available():
                    candidates.append(ep)
        # Rank by score; stable by base_url via original sort if equal
        candidates.sort(key=self._score_endpoint)
        return candidates[: max(1, n)]

    async def choose(self, min_priority: int = 0) -> Optional[MempoolEndpointState]:
        async with self._lock:
            # Always prefer the dynamic top-5 pool across all priorities
            pool = await self._top_n_available(n=5, min_priority=min_priority)
            if not pool:
                return None
            idx = self._active_rr_index % len(pool)
            endpoint = pool[idx]
            self._active_rr_index = (idx + 1) % len(pool)
            return endpoint

    async def all_endpoints(self) -> List[MempoolEndpointState]:
        async with self._lock:
            eps: List[MempoolEndpointState] = []
            for priority in self._priorities:
                eps.extend(self._by_priority[priority])
            return list(eps)

    async def availability_snapshot(self, min_priority: int = 0) -> List[Dict[str, Any]]:
        async with self._lock:
            snapshot: List[Dict[str, Any]] = []
            for priority in self._priorities:
                if priority < min_priority:
                    continue
                for endpoint in self._by_priority[priority]:
                    snapshot.append(
                        {
                            "name": endpoint.name,
                            "priority": priority,
                            "available": endpoint.is_available(),
                            "active": endpoint.active_slots,
                            "limit": endpoint.concurrency_limit,
                            "cooldown": endpoint._cooldown_remaining(),
                        }
                    )
            return snapshot

