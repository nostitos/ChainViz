from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, Iterable, List, Optional

import httpx

from .client import MempoolHttpClientFactory
from .endpoint_registry import MempoolEndpointState, build_mempool_endpoints
from .router import MempoolEndpointRouter

logger = logging.getLogger(__name__)


class MempoolDataSource:
    """
    Handles routing of mempool.space compatible requests across multiple HTTP
    endpoints with per-endpoint throttling and health tracking.
    """

    def __init__(self) -> None:
        endpoints = build_mempool_endpoints()
        if not endpoints:
            raise RuntimeError("No mempool endpoints configured")

        self._router = MempoolEndpointRouter(endpoints)
        self._client_factory = MempoolHttpClientFactory()
        self._lock = asyncio.Lock()

    async def close(self) -> None:
        await self._client_factory.close_all()

    async def _perform_request(
        self,
        endpoint: MempoolEndpointState,
        path: str,
    ) -> Optional[Dict[str, Any]]:
        async with endpoint.semaphore:
            if endpoint.config.request_delay > 0:
                await asyncio.sleep(endpoint.config.request_delay)

            client = await self._client_factory.get_client(endpoint)

            try:
                response = await client.get(path)
                response.raise_for_status()
                endpoint.mark_success()
                logger.debug("✅ %s %s", endpoint.name, path)
                return response.json()
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code == 404:
                    endpoint.mark_success()
                    logger.debug("⚠️ %s returned 404 for %s", endpoint.name, path)
                    return None
                endpoint.mark_failure()
                logger.warning(
                    "Mempool endpoint %s returned HTTP %s for %s",
                    endpoint.name,
                    exc.response.status_code,
                    path,
                )
            except Exception as exc:
                endpoint.mark_failure()
                logger.warning("Mempool endpoint %s failed for %s: %s", endpoint.name, path, exc)

        return None

    async def _request_with_failover(
        self,
        path: str,
        min_priority: int = 0,
    ) -> Optional[Dict[str, Any]]:
        attempts = 0
        max_attempts = 10

        while attempts < max_attempts:
            endpoint = await self._router.choose(min_priority=min_priority)
            if not endpoint:
                break

            attempts += 1

            if not endpoint.is_available():
                continue

            result = await self._perform_request(endpoint, path)
            if result is not None:
                return result

            # If this endpoint failed, try again with same priority (router will skip unhealthy)

        logger.error("All mempool endpoints failed for %s", path)
        return None

    async def get_transaction(self, txid: str, min_priority: int = 0) -> Optional[Dict[str, Any]]:
        path = f"/tx/{txid}"
        return await self._request_with_failover(path, min_priority=min_priority)

    async def get_transactions_batch(
        self,
        txids: Iterable[str],
        min_priority: int = 0,
    ) -> List[Optional[Dict[str, Any]]]:
        txid_list = list(dict.fromkeys(txids))  # preserve order, dedupe
        tasks = [self.get_transaction(txid, min_priority=min_priority) for txid in txid_list]
        results = await asyncio.gather(*tasks, return_exceptions=False)
        # Map back to original order in case duplicates were removed
        tx_map = {txid: result for txid, result in zip(txid_list, results)}
        return [tx_map.get(txid) for txid in txids]

    async def get_address_txids(
        self,
        address: str,
        min_priority: int = 0,
        max_results: int = 500,
    ) -> List[str]:
        """
        Fetch complete transaction list for an address by paginating with
        limit/offset parameters until we collect max_results or the endpoint
        runs out of data.
        """

        collected: List[str] = []
        seen: set[str] = set()
        offset = 0
        page = 0

        while len(collected) < max_results:
            remaining = max_results - len(collected)
            limit = min(remaining, 100)  # mempool.space cap per request
            path = f"/address/{address}/txs?offset={offset}&limit={limit}"

            data = await self._request_with_failover(path, min_priority=min_priority)
            if not data:
                break

            new_txids = 0
            for entry in data:
                txid = entry.get("txid")
                if not txid or txid in seen:
                    continue
                collected.append(txid)
                seen.add(txid)
                new_txids += 1

            page_size = len(data)

            if new_txids == 0 or page_size == 0:
                break

            offset += page_size
            page += 1

            if page >= 200 or offset >= max_results:
                break

        return collected[:max_results]

    async def get_endpoints(self) -> List[MempoolEndpointState]:
        return await self._router.all_endpoints()

    async def get_address_summary(self, address: str, min_priority: int = 0) -> Optional[Dict[str, Any]]:
        path = f"/address/{address}"
        return await self._request_with_failover(path, min_priority=min_priority)


_datasource: Optional[MempoolDataSource] = None


def get_mempool_datasource() -> MempoolDataSource:
    global _datasource
    if _datasource is None:
        _datasource = MempoolDataSource()
    return _datasource

