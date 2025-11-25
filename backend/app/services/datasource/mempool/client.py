from __future__ import annotations

import asyncio
from typing import Dict

import httpx

from app.config import settings

from .endpoint_registry import MempoolEndpointState


class MempoolHttpClientFactory:
    """
    Lazily creates and caches httpx AsyncClient instances for each mempool
    endpoint. All clients share the same timeout configuration to keep things
    predictable.
    """

    def __init__(self) -> None:
        self._clients: Dict[str, httpx.AsyncClient] = {}
        self._lock = asyncio.Lock()
        self._timeout = settings.mempool_request_timeout
        self._min_timeout = settings.mempool_min_request_timeout

    async def get_client(self, endpoint: MempoolEndpointState) -> httpx.AsyncClient:
        async with self._lock:
            if endpoint.config.base_url not in self._clients:
                timeout = max(self._min_timeout, endpoint.config.request_timeout or self._timeout)
                self._clients[endpoint.config.base_url] = httpx.AsyncClient(
                    base_url=endpoint.config.base_url,
                    timeout=timeout,
                    headers={
                        "User-Agent": settings.mempool_http_user_agent,
                        "Accept": "application/json",
                        "Accept-Language": settings.mempool_http_accept_language,
                    },
                )
            return self._clients[endpoint.config.base_url]

    async def close_all(self) -> None:
        async with self._lock:
            clients = list(self._clients.values())
            self._clients.clear()

        # Close outside lock to avoid await under lock
        await asyncio.gather(*(client.aclose() for client in clients), return_exceptions=True)

