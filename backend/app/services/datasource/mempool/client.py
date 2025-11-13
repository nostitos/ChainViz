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
        self._timeout = settings.electrum_request_timeout

    async def get_client(self, endpoint: MempoolEndpointState) -> httpx.AsyncClient:
        async with self._lock:
            if endpoint.config.base_url not in self._clients:
                self._clients[endpoint.config.base_url] = httpx.AsyncClient(
                    base_url=endpoint.config.base_url,
                    timeout=self._timeout,
                )
            return self._clients[endpoint.config.base_url]

    async def close_all(self) -> None:
        async with self._lock:
            clients = list(self._clients.values())
            self._clients.clear()

        # Close outside lock to avoid await under lock
        await asyncio.gather(*(client.aclose() for client in clients), return_exceptions=True)

