from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, Iterable, List, Optional

import time

import httpx

from app.config import settings
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
        self._global_semaphore = asyncio.Semaphore(settings.mempool_global_max_inflight)
        self._compact_summary_penalty: Dict[str, int] = {}

    async def close(self) -> None:
        await self._client_factory.close_all()

    async def _perform_request(
        self,
        endpoint: MempoolEndpointState,
        path: str,
        attempt_timeout: float,
    ) -> Optional[Dict[str, Any]]:
        await self._global_semaphore.acquire()
        slot_acquired = False
        try:
            try:
                await endpoint.acquire_slot()
                slot_acquired = True
            except RuntimeError as exc:
                logger.warning("Mempool endpoint %s unavailable: %s", endpoint.name, exc)
                await endpoint.record_failure(0.0)
                return None

            if endpoint.config.request_delay > 0:
                await asyncio.sleep(endpoint.config.request_delay)

            client = await self._client_factory.get_client(endpoint)
            started = time.perf_counter()

            hard_timeout = max(0.0, attempt_timeout)

            try:
                response = await asyncio.wait_for(client.get(path), timeout=hard_timeout)
                response.raise_for_status()
                latency = time.perf_counter() - started
                if response.status_code == 204:
                    await endpoint.record_success(latency)
                    return None
                data = response.json()
                await endpoint.record_success(latency)
                logger.debug("✅ %s %s", endpoint.name, path)
                return data
            except asyncio.TimeoutError:
                latency = time.perf_counter() - started
                await endpoint.record_failure(latency)
                logger.warning(
                    "Mempool endpoint %s timed out after %.2fs for %s",
                    endpoint.name,
                    hard_timeout,
                    path,
                )
            except httpx.HTTPStatusError as exc:
                latency = time.perf_counter() - started
                if exc.response.status_code == 404:
                    await endpoint.record_success(latency)
                    logger.debug("⚠️ %s returned 404 for %s", endpoint.name, path)
                    return None
                await endpoint.record_failure(latency)
                logger.warning(
                    "Mempool endpoint %s returned HTTP %s for %s",
                    endpoint.name,
                    exc.response.status_code,
                    path,
                )
            except Exception as exc:
                latency = time.perf_counter() - started
                await endpoint.record_failure(latency)
                logger.warning("Mempool endpoint %s failed for %s: %s", endpoint.name, path, exc)
        finally:
            if slot_acquired:
                await endpoint.release_slot()
            self._global_semaphore.release()
        return None

    async def _request_with_failover(
        self,
        path: str,
        min_priority: int = 0,
    ) -> Optional[Dict[str, Any]]:
        attempts = 0
        max_attempts = 10

        request_started = time.perf_counter()
        deadline = request_started + settings.mempool_request_total_timeout
        while attempts < max_attempts:
            time_remaining = deadline - time.perf_counter()
            if time_remaining <= 0:
                availability = await self._router.availability_snapshot(min_priority=min_priority)
                failed_servers = [
                    ep["name"] for ep in availability 
                    if not ep["available"] or ep.get("cooldown", 0) > 0
                ]
                available_count = sum(1 for ep in availability if ep["available"])
                logger.warning(
                    "Timeout aborting %s after %.2fs (%d attempts, %s/%s servers available)",
                    path,
                    time.perf_counter() - request_started,
                    attempts,
                    available_count,
                    len(availability),
                )
                if failed_servers:
                    logger.warning("  Failed servers: %s", ", ".join(failed_servers[:5]))
                break

            attempt_timeout = min(settings.mempool_hard_request_timeout, time_remaining)
            if attempt_timeout <= 0:
                logger.error(
                    "No time remaining for further attempts on %s (timeout %.2fs)",
                    path,
                    settings.mempool_request_total_timeout,
                )
                break

            endpoint = await self._router.choose(min_priority=min_priority)
            if not endpoint:
                availability = await self._router.availability_snapshot(min_priority=min_priority)
                unavailable_servers = [ep["name"] for ep in availability if not ep["available"]]
                logger.error(
                    "No servers available for %s after %.2fs (unavailable: %s)",
                    path,
                    time.perf_counter() - request_started,
                    ", ".join(unavailable_servers[:5]) + ("..." if len(unavailable_servers) > 5 else ""),
                )
                break

            attempts += 1

            if not endpoint.is_available():
                continue

            attempt_start = time.perf_counter()
            cooldown_remaining = endpoint._cooldown_remaining()
            logger.debug(
                "Attempt %d for %s via %s active=%d/%d cooldown=%.2fs",
                attempts,
                path,
                endpoint.name,
                endpoint.active_slots,
                endpoint.concurrency_limit,
                cooldown_remaining,
            )

            result = await self._perform_request(endpoint, path, attempt_timeout)
            if result is not None:
                duration = time.perf_counter() - attempt_start
                if attempts > 1 or duration > 2.0:
                    logger.debug(
                        "Completed %s via %s in %.2fs after %d attempts",
                        path,
                        endpoint.name,
                        duration,
                        attempts,
                    )
                return result

            duration = time.perf_counter() - attempt_start
            logger.warning(
                "Server %s failed for %s (attempt %d, %.2fs) - trying next server",
                endpoint.name,
                path,
                attempts,
                duration,
            )
            availability = await self._router.availability_snapshot(min_priority=min_priority)
            logger.debug("Router availability after failure for %s: %s", path, availability)

            # If this endpoint failed, try again with same priority (router will skip unhealthy)

        # Get list of servers that were tried
        endpoints = await self._router.all_endpoints()
        tried_servers = [ep.name for ep in endpoints if ep.priority >= min_priority]
        logger.error(
            "All servers failed for %s (tried: %s)",
            path,
            ", ".join(tried_servers[:5]) + ("..." if len(tried_servers) > 5 else ""),
        )
        return None

    async def _request_with_total_timeout(
        self,
        path: str,
        min_priority: int = 0,
    ) -> Optional[Any]:
        timeout = settings.mempool_request_total_timeout
        try:
            return await asyncio.wait_for(
                self._request_with_failover(path, min_priority=min_priority),
                timeout=timeout,
            )
        except asyncio.TimeoutError:
            availability = await self._router.availability_snapshot(min_priority=min_priority)
            # Extract only failed/unavailable servers for clarity
            failed_servers = [
                ep["name"] for ep in availability 
                if not ep["available"] or ep.get("cooldown", 0) > 0
            ]
            available_count = sum(1 for ep in availability if ep["available"])
            total_count = len(availability)
            
            if failed_servers:
                logger.error(
                    "Timeout after %.2fs for %s - %s/%s servers available (failed: %s)",
                    timeout,
                    path,
                    available_count,
                    total_count,
                    ", ".join(failed_servers[:3]) + ("..." if len(failed_servers) > 3 else ""),
                )
            else:
                logger.error(
                    "Timeout after %.2fs for %s - all %s servers timed out",
                    timeout,
                    path,
                    total_count,
                )
            raise asyncio.TimeoutError(f"Total timeout waiting for {path}") from None

    async def get_transaction(self, txid: str, min_priority: int = 0) -> Optional[Dict[str, Any]]:
        path = f"/tx/{txid}"
        return await self._request_with_total_timeout(path, min_priority=min_priority)

    async def get_transactions_batch(
        self,
        txids: Iterable[str],
        min_priority: int = 0,
    ) -> List[Optional[Dict[str, Any]]]:
        txid_list = list(dict.fromkeys(txids))  # preserve order, dedupe
        tasks = [self.get_transaction(txid, min_priority=min_priority) for txid in txid_list]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        # Map back to original order in case duplicates were removed
        tx_map = {}
        for txid, result in zip(txid_list, results):
            if isinstance(result, Exception):
                logger.debug(f"Failed to fetch {txid}: {result}")
                tx_map[txid] = None
            else:
                tx_map[txid] = result
        return [tx_map.get(txid) for txid in txids]

    async def get_address_txids(
        self,
        address: str,
        min_priority: int = 0,
        max_results: int = 500,
        expected_total: Optional[int] = None,
    ) -> List[str]:
        """
        Fetch complete transaction list for an address by paginating with
        limit/offset parameters until we collect max_results, expected_total,
        or the endpoint runs out of data.
        
        Args:
            address: Bitcoin address
            min_priority: Minimum endpoint priority to use
            max_results: Maximum number of transaction IDs to collect
            expected_total: Optional expected total transaction count from address summary.
                          If provided, pagination stops once this many unique txids are collected.
        """

        collected: List[str] = []
        seen: set[str] = set()
        offset = 0
        page = 0
        failed_servers_at_offset: set[str] = set()  # Track which servers returned empty at this offset
        last_txid_for_after: Optional[str] = None  # For after_txid pagination when supported

        default_page_size = max(1, min(settings.mempool_default_page_size, max_results))
        
        # Use expected_total as the effective cap if provided
        effective_max = min(max_results, expected_total) if expected_total is not None else max_results

        while len(collected) < effective_max:
            remaining = effective_max - len(collected)
            limit = min(remaining, default_page_size)
            # Prefer after_txid if we have a cursor (some servers honor it to paginate confirmed txs)
            if last_txid_for_after:
                path = f"/address/{address}/txs?limit={limit}&after_txid={last_txid_for_after}"
            else:
                # First page: request by limit only; many servers ignore unknown params and return newest first
                path = f"/address/{address}/txs?limit={limit}"

            # Try multiple servers if we get empty data - some servers have pagination limits
            data = None
            servers_tried = 0
            failed_servers_at_offset.clear()  # Reset for this offset
            
            # Get all endpoints once to determine max attempts
            all_endpoints_list = await self._router.all_endpoints()
            max_server_attempts = len(all_endpoints_list)

            while servers_tried < max_server_attempts:
                try:
                    # Get all available endpoints to manually try them
                    # Note: We re-fetch or filter this each time because failed_servers_at_offset grows
                    all_endpoints = await self._router.all_endpoints()
                    available_endpoints = [ep for ep in all_endpoints if ep.is_available() and ep.name not in failed_servers_at_offset]
                    
                    if not available_endpoints:
                        logger.debug(f"get_address_txids: No more available servers to try at offset {offset}")
                        break
                    
                    # Try the first available endpoint (since we filter out failed ones, this rotates through them)
                    endpoint = available_endpoints[0]
                    logger.debug(f"get_address_txids: Trying {endpoint.name} for offset {offset} (attempt {servers_tried + 1}/{max_server_attempts})")
                    
                    result = await self._perform_request(endpoint, path, settings.mempool_hard_request_timeout)
                    
                    
                    if result is not None:
                        if isinstance(result, list):
                            if len(result) > 0:
                                # Got valid data with transactions - accept immediately
                                data = result
                                logger.debug(f"get_address_txids: Got {len(result)} transactions from {endpoint.name} at offset {offset}")
                                break
                            else:
                                # Empty list - could mean no transactions OR temporary issue
                                # Only accept empty if we've tried all servers or max attempts
                                all_endpoints_count = len(await self._router.all_endpoints())
                                if servers_tried + 1 >= max_server_attempts or servers_tried + 1 >= all_endpoints_count:
                                    # Tried enough servers, accept empty as final answer
                                    data = result
                                    logger.debug(f"get_address_txids: {endpoint.name} returned empty list at offset {offset} after trying {servers_tried + 1} servers (accepting as final)")
                                    break
                                else:
                                    # Try next server - this might be temporary rate limiting or cache miss
                                    logger.debug(f"get_address_txids: {endpoint.name} returned empty list at offset {offset}, trying next server ({servers_tried + 1}/{all_endpoints_count})...")
                                    failed_servers_at_offset.add(endpoint.name)
                                    servers_tried += 1
                                    continue
                        else:
                            logger.warning(f"get_address_txids: {endpoint.name} returned non-list: {type(result)}, trying next server...")
                            servers_tried += 1
                            continue
                    else:
                        # Request failed, try next server
                        logger.debug(f"get_address_txids: {endpoint.name} failed for offset {offset}, trying next server...")
                        servers_tried += 1
                        continue
                        
                except asyncio.TimeoutError:
                    logger.debug(f"get_address_txids: Timeout fetching {path} via server attempt {servers_tried + 1}, trying next server...")
                    servers_tried += 1
                    continue
                except Exception as e:
                    logger.debug(f"get_address_txids: Error fetching {path} via server attempt {servers_tried + 1}: {e}, trying next server...")
                    servers_tried += 1
                    continue

            # If we exhausted all servers and still got no data, stop pagination
            if not data or not isinstance(data, list) or len(data) == 0:
                all_endpoints_count = len(await self._router.all_endpoints())
                if servers_tried >= max_server_attempts or len(failed_servers_at_offset) >= all_endpoints_count:
                    logger.warning(
                        f"get_address_txids: All server attempts returned empty/no data at offset {offset}, "
                        f"stopping pagination (collected {len(collected)}/{effective_max} unique txids, "
                        f"expected_total={expected_total}, requested={max_results}, "
                        f"tried {len(failed_servers_at_offset)}/{all_endpoints_count} servers)"
                    )
                    break
                else:
                    logger.warning(
                        f"get_address_txids: Failed to get data after {servers_tried} attempts at offset {offset}, "
                        f"but not all servers exhausted (collected {len(collected)}/{effective_max})"
                    )
                break

            new_txids = 0
            for entry in data:
                if not entry or not isinstance(entry, dict):
                    logger.warning("Skipping invalid entry in address txids: %s", type(entry))
                    continue
                txid = entry.get("txid")
                if not txid or txid in seen:
                    continue
                collected.append(txid)
                seen.add(txid)
                new_txids += 1
                # Verbose trace: log each unique txid as we collect it with its running index
                try:
                    logger.info(
                        "get_address_txids: [%s] offset=%d page=%d collected_index=%d txid=%s",
                        endpoint.name if 'endpoint' in locals() and endpoint else "unknown",
                        offset,
                        page,
                        len(collected),
                        txid,
                    )
                except Exception:
                    # Best-effort logging; never break pagination due to logging issues
                    logger.debug("get_address_txids: collected txid=%s (index=%d)", txid, len(collected))

            page_size = len(data)
            # Update after_txid cursor if we got any items
            if page_size > 0:
                last_entry = data[-1]
                if isinstance(last_entry, dict):
                    last_tx = last_entry.get("txid")
                    if isinstance(last_tx, str) and last_tx:
                        last_txid_for_after = last_tx

            # Log if we got duplicates but continue paginating
            if new_txids == 0 and page_size > 0:
                logger.debug(f"get_address_txids: Page {page} returned {page_size} duplicates, continuing to next page...")

            # Stop early if we've reached the expected total AND it's within our requested limit
            # (If expected_total > max_results, we'll stop at max_results via the loop condition)
            if expected_total is not None and expected_total <= max_results and len(collected) >= expected_total:
                logger.info(
                    f"get_address_txids: Reached expected_total={expected_total} (collected {len(collected)} unique txids, requested {max_results})"
                )
                break

            # Increment offset by the number of items returned (not new_txids, as duplicates still consume offset)
            offset += page_size
            page += 1

            # Stop if we've collected enough unique txids (primary check)
            # This should be handled by the loop condition, but add explicit check for safety
            if len(collected) >= effective_max:
                logger.debug(f"get_address_txids: Collected {len(collected)}/{effective_max} unique txids, stopping")
                break
            
            # Safety limits: stop if we've hit page limit
            if page >= 200:
                logger.warning(f"get_address_txids: Reached page limit (page={page}), stopping (collected {len(collected)}/{effective_max})")
                break

            # Stop if offset significantly exceeds max_results (indicates excessive duplicates/empty pages)
            # Allow some leeway (2x) for duplicates, but stop if way beyond
            if offset > max_results * 2:
                logger.warning(
                    f"get_address_txids: Offset {offset} >> max_results {max_results} (2x threshold), "
                    f"stopping due to excessive duplicates/empty pages (collected {len(collected)}/{effective_max})"
                )
                break

        logger.debug(
            f"get_address_txids: Collected {len(collected)}/{effective_max} txids for {address[:12]}* "
            f"(expected_total={expected_total}, requested={max_results}, effective_max={effective_max})"
        )
        # Return all collected txids even if they exceed max_results
        # (Some servers ignore limit=N and return more; user wants to see them)
        return collected

    async def get_address_txs_page(
        self,
        address: str,
        limit: int = 50,
        after_txid: Optional[str] = None,
        min_priority: int = 0,
    ) -> Optional[List[Dict[str, Any]]]:
        """
        Fetch a single page of address transactions. Uses after_txid when provided,
        otherwise fetches the newest page.
        """
        limit = max(1, min(limit, 50))
        if after_txid:
            path = f"/address/{address}/txs?limit={limit}&after_txid={after_txid}"
        else:
            path = f"/address/{address}/txs?limit={limit}"
        data = await self._request_with_total_timeout(path, min_priority=min_priority)
        if data is None:
            return None
        if not isinstance(data, list):
            logger.warning("get_address_txs_page: expected list, got %s", type(data))
            return None
        return data

    async def iterate_address_txs(
        self,
        address: str,
        cap: int = 100,
        min_priority: int = 0,
    ):
        """
        Iterate address transactions across pages using after_txid up to 'cap' entries.
        Yields raw tx entries (dicts) as returned by the mempool API.
        """
        remaining = max(0, cap)
        after_txid: Optional[str] = None
        page = 0
        while remaining > 0:
            limit = min(50, remaining)
            page_data = await self.get_address_txs_page(
                address, limit=limit, after_txid=after_txid, min_priority=min_priority
            )
            if not page_data:
                logger.debug("iterate_address_txs: empty page at page %d (remaining=%d)", page, remaining)
                break
            new_count = 0
            for entry in page_data:
                if remaining <= 0:
                    break
                if not isinstance(entry, dict):
                    continue
                txid = entry.get("txid")
                if not txid:
                    continue
                yield entry
                new_count += 1
                remaining -= 1
            # advance after_txid cursor
            last_tx = page_data[-1] if page_data else None
            after_txid = last_tx.get("txid") if isinstance(last_tx, dict) else None
            page += 1
            if new_count == 0:
                logger.debug("iterate_address_txs: no new entries at page %d, stopping", page)
                break
    async def get_address_utxos(
        self,
        address: str,
        min_priority: int = 0,
    ) -> List[Dict[str, Any]]:
        """
        Fetch UTXOs for an address.
        """
        path = f"/address/{address}/utxo"
        data = await self._request_with_total_timeout(path, min_priority=min_priority)
        if not data:
            return []
        return data

    async def get_endpoints(self) -> List[MempoolEndpointState]:
        return await self._router.all_endpoints()

    def _summary_is_compact_mode(self, data: Any) -> bool:
        if not isinstance(data, dict):
            return False
        chain = data.get("chain_stats") or {}
        if not isinstance(chain, dict):
            return False
        tx_count = chain.get("tx_count") or 0
        funded = chain.get("funded_txo_count")
        spent = chain.get("spent_txo_count")
        if tx_count <= 0:
            return False
        # Missing or zero funded/spent for non-zero tx_count indicates compact mode
        funded_zero = funded is None or funded == 0
        spent_zero = spent is None or spent == 0
        return funded_zero and spent_zero

    def _increase_compact_penalty(self, endpoint_name: str) -> int:
        current = self._compact_summary_penalty.get(endpoint_name, 0)
        current = min(current + 1, 10)
        self._compact_summary_penalty[endpoint_name] = current
        return current

    def _clear_compact_penalty(self, endpoint_name: str) -> None:
        if endpoint_name in self._compact_summary_penalty:
            # decay quickly once the endpoint proves it has full data again
            self._compact_summary_penalty[endpoint_name] = max(
                0, self._compact_summary_penalty[endpoint_name] - 2
            )
            if self._compact_summary_penalty[endpoint_name] == 0:
                self._compact_summary_penalty.pop(endpoint_name, None)


    async def get_address_summary(self, address: str, min_priority: int = 0) -> Optional[Dict[str, Any]]:
        path = f"/address/{address}"

        history_hint: Optional[bool] = None

        async def has_history() -> bool:
            nonlocal history_hint
            if history_hint is None:
                txids = await self.get_address_txids(
                    address, min_priority=min_priority, max_results=1
                )
                history_hint = bool(txids)
            return history_hint

        async def _try_endpoints(endpoints: List[MempoolEndpointState]) -> Optional[Dict[str, Any]]:
            for endpoint in endpoints:
                if not endpoint.is_available():
                    continue
                data = await self._perform_request(endpoint, path, settings.mempool_hard_request_timeout)
                if data is None:
                    continue
                if self._summary_is_compact_mode(data):
                    penalty = self._increase_compact_penalty(endpoint.name)
                    logger.warning(
                        "Endpoint %s returned compact summary for %s (tx_count=%s). "
                        "Moving to back of rotation (penalty=%s).",
                        endpoint.name,
                        address[:12],
                        (data.get("chain_stats") or {}).get("tx_count"),
                        penalty,
                    )
                    continue
                chain = data.get("chain_stats") or {}
                tx_count = (chain.get("tx_count") or 0) if isinstance(chain, dict) else 0
                if tx_count == 0:
                    if await has_history():
                        penalty = self._increase_compact_penalty(endpoint.name)
                        logger.warning(
                            "Endpoint %s reports tx_count=0 for %s but history exists elsewhere. "
                            "Moving to back of rotation (penalty=%s).",
                            endpoint.name,
                            address[:12],
                            penalty,
                        )
                        continue
                self._clear_compact_penalty(endpoint.name)
                return data
            return None

        endpoints = await self._router.all_endpoints()
        eligible = [ep for ep in endpoints if ep.priority >= min_priority]
        eligible.sort(
            key=lambda ep: (
                self._compact_summary_penalty.get(ep.name, 0),
                ep.priority,
                ep.name,
            )
        )

        result = await _try_endpoints(eligible)
        if result is None:
            logger.warning(f"get_address_summary: Failed to get summary for {address} from any endpoint (tried {len(eligible)})")
        return result

    async def get_endpoint_metrics(self) -> List[Dict[str, Any]]:
        endpoints = await self._router.all_endpoints()
        return [endpoint.contribution_snapshot() for endpoint in endpoints]


_datasource: Optional[MempoolDataSource] = None


def get_mempool_datasource() -> MempoolDataSource:
    global _datasource
    if _datasource is None:
        _datasource = MempoolDataSource()
    return _datasource

