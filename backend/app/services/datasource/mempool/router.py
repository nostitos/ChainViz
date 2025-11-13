from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Dict, List, Optional

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

        for endpoint in endpoints:
            self._by_priority[endpoint.priority].append(endpoint)

        # Ensure deterministic ordering
        for priority in self._by_priority:
            self._by_priority[priority].sort(key=lambda ep: ep.config.base_url)

        self._priorities = sorted(self._by_priority.keys())

    @property
    def priorities(self) -> List[int]:
        return self._priorities

    async def choose(self, min_priority: int = 0) -> Optional[MempoolEndpointState]:
        async with self._lock:
            for priority in self._priorities:
                if priority < min_priority:
                    continue

                candidates = [ep for ep in self._by_priority[priority] if ep.is_available()]
                if not candidates:
                    continue

                idx = self._indices[priority] % len(candidates)
                endpoint = candidates[idx]
                self._indices[priority] = (idx + 1) % len(candidates)
                return endpoint

        return None

    async def all_endpoints(self) -> List[MempoolEndpointState]:
        async with self._lock:
            eps: List[MempoolEndpointState] = []
            for priority in self._priorities:
                eps.extend(self._by_priority[priority])
            return list(eps)

