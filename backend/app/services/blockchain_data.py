"""High-level blockchain data service with caching"""

import logging
import json
import asyncio
from typing import Iterable, List, Optional, Dict, Any, Tuple, Set
from datetime import datetime, timedelta
import redis.asyncio as aioredis

from app.models.blockchain import (
    Transaction,
    TransactionInput,
    TransactionOutput,
    UTXO,
    Address,
    ScriptType,
)
from app.services.mempool_client import get_mempool_client
from app.config import settings

logger = logging.getLogger(__name__)


def _dedupe_preserve_order(items: Iterable[str]) -> Tuple[List[str], List[Tuple[int, int]]]:
    """
    Deduplicate iterable while preserving original ordering and tracking the mapping
    back to the source indices.
    """

    seen: Dict[str, int] = {}
    unique: List[str] = []
    index_map: List[Tuple[int, int]] = []

    for i, item in enumerate(items):
        if item not in seen:
            seen[item] = len(unique)
            unique.append(item)
        index_map.append((i, seen[item]))

    return unique, index_map


class BlockchainDataService:
    """
    High-level service for fetching and caching blockchain data
    
    Uses Electrum server for data and Redis for caching to improve performance.
    """

    def __init__(self):
        # Don't store client - create fresh for each call to avoid state issues
        self.redis: Optional[aioredis.Redis] = None

    async def init_redis(self) -> None:
        """Initialize Redis connection"""
        try:
            self.redis = await aioredis.from_url(
                f"redis://{settings.redis_host}:{settings.redis_port}/{settings.redis_db}",
                password=settings.redis_password if settings.redis_password else None,
                decode_responses=True,
            )
            logger.info("Redis connection initialized")
        except Exception as e:
            logger.warning(f"Redis connection failed: {e}. Running without cache.")
            self.redis = None

    async def close_redis(self) -> None:
        """Close Redis connection"""
        if self.redis:
            await self.redis.close()

    async def _get_cache(self, key: str) -> Optional[str]:
        """Get value from cache"""
        if not self.redis:
            return None
        try:
            return await self.redis.get(key)
        except Exception as e:
            logger.warning(f"Cache get failed: {e}")
            return None

    async def _set_cache(self, key: str, value: str, ttl: int) -> None:
        """Set value in cache with TTL"""
        if not self.redis:
            return
        try:
            await self.redis.setex(key, ttl, value)
        except Exception as e:
            logger.warning(f"Cache set failed: {e}")

    async def fetch_address_history(self, address: str, max_results: Optional[int] = None) -> List[str]:
        """
        Fetch transaction IDs for an address
        
        Args:
            address: Bitcoin address
            max_results: Optional limit on number of transaction IDs to fetch
            
        Returns:
            List of transaction IDs (limited to max_results if provided)
        """
        cache_key = f"addr_history:{address}"
        
        # IMPORTANT: Skip cache when max_results is specified!
        # This ensures changing the frontend limit fetches fresh data
        # Cache is only used for unlimited queries (max_results=None)
        if max_results is None:
            cached = await self._get_cache(cache_key)
            if cached:
                cached_txids = json.loads(cached)
                return cached_txids

        # Try mempool endpoints (local/additional/public routing handled by datasource)
        mempool = get_mempool_client()
        expected_count = None
        summary_priorities = (0, 1, 2)
        for priority in summary_priorities:
            try:
                summary = await mempool.get_address_summary(address, min_priority=priority)
                if summary:
                    expected_count = (
                        summary.get("chain_stats", {}).get("tx_count")
                        + summary.get("mempool_stats", {}).get("tx_count", 0)
                    )
                    logger.debug(
                        "Address %s summary indicates %s total txs (priority %s)",
                        address[:12],
                        expected_count,
                        priority,
                    )
                    break
            except Exception as exc:
                logger.debug(
                    "Address summary fetch failed for %s via priority %s: %s",
                    address[:12],
                    priority,
                    exc,
                )

        # Use max_results if provided, otherwise use expected_count or 500
        fetch_limit = max_results if max_results is not None else (expected_count or 500)
        
        best_txids: List[str] = []
        try:
            for priority in (0, 1, 2):
                txids = await mempool.get_address_txids(
                    address,
                    min_priority=priority,
                    max_results=fetch_limit,
                    expected_total=expected_count,
                )
                if not txids:
                    logger.debug(
                        "Mempool priority %s returned no txs for %s",
                        priority,
                        address[:12],
                    )
                    continue

                if len(txids) > len(best_txids):
                    best_txids = txids

                if expected_count and len(txids) >= expected_count:
                    logger.debug(
                        "Address %s resolved via mempool priority %s (%s txs)",
                        address[:10],
                        priority,
                        len(txids),
                    )
                    # Only cache if we fetched all transactions (no limit)
                    if max_results is None:
                        await self._set_cache(
                            cache_key, json.dumps(txids), settings.cache_ttl_address_history
                        )
                    return txids

            if best_txids:
                if expected_count and len(best_txids) < expected_count:
                    logger.warning(
                        "Address %s returned %s/%s txs from mempool API (partial data)",
                        address[:12],
                        len(best_txids),
                        expected_count,
                    )
                # Only cache if we fetched all transactions (no limit)
                if max_results is None:
                    await self._set_cache(
                        cache_key, json.dumps(best_txids), settings.cache_ttl_address_history
                    )
                return best_txids
        except Exception as exc:
            logger.error(f"Mempool address lookup failed for {address[:12]}*: {exc}", exc_info=True)
            raise RuntimeError(f"Mempool lookup failed for {address}") from exc

        # Don't cache empty results - they might be temporary failures
        # Only cache if we actually got some transactions
        if best_txids:
            logger.debug("Address %s resolved via mempool (%s txs)", address[:10], len(best_txids))
            # Only cache if we fetched all transactions (no limit)
            if max_results is None:
                await self._set_cache(cache_key, json.dumps(best_txids), settings.cache_ttl_address_history)
            return best_txids
        
        logger.warning("Address %s returned 0 txs from all mempool endpoints - not caching empty result", address[:10])
        return []

    async def fetch_address_histories_batch(self, addresses: List[str]) -> Dict[str, List[str]]:
        """
        Fetch transaction histories for multiple addresses (uses batching for speed)
        
        Args:
            addresses: List of Bitcoin addresses
            
        Returns:
            Dict mapping address to list of transaction IDs
        """
        # Check cache first
        result = {}
        uncached_addresses = []

        for address in addresses:
            cache_key = f"addr_history:{address}"
            cached = await self._get_cache(cache_key)
            if cached:
                result[address] = json.loads(cached)
            else:
                uncached_addresses.append(address)

        if uncached_addresses:
            histories = await asyncio.gather(
                *[self.fetch_address_history(address) for address in uncached_addresses],
                return_exceptions=True,
            )

            for address, history in zip(uncached_addresses, histories):
                if isinstance(history, Exception):
                    logger.warning("Failed to fetch history for %s: %s", address[:12], history)
                    result[address] = []
                else:
                    result[address] = history

        return result

    async def fetch_transaction(self, txid: str) -> Transaction:
        """
        Fetch transaction from mempool endpoints (local/additional/public routing handled by datasource).
        
        Args:
            txid: Transaction ID
            
        Returns:
            Transaction object
        """
        cache_key = f"tx:{txid}"
        cached = await self._get_cache(cache_key)

        if cached:
            data = json.loads(cached)
            # Check if cached data has block info - if not, re-fetch
            if data.get("block_height") is None:
                logger.debug(f"TX {txid[:20]}: Cached data missing block_height, re-fetching...")
            else:
                return Transaction(**data)

        # Try mempool endpoints (handles local/additional/public routing internally)
        mempool = get_mempool_client()
        data = await mempool.get_transaction(txid)
        
        if data:
            transaction = self._parse_mempool_transaction(txid, data)
            await self._set_cache(cache_key, transaction.model_dump_json(), settings.cache_ttl_transaction)
            logger.debug(f"Fetched TX {txid[:20]} from mempool endpoint")
            return transaction
        
        raise ValueError(f"Failed to fetch transaction {txid}")

    async def fetch_transactions_batch(self, txids: List[str]) -> List[Transaction]:
        """
        Fetch multiple transactions (uses batching for speed + deduplication)
        
        Args:
            txids: List of transaction IDs
            
        Returns:
            List of Transaction objects (in same order as input, with duplicates preserved)
        """
        # OPTIMIZATION: Deduplicate input while preserving order
        unique_txids, txid_positions = _dedupe_preserve_order(txids)
        
        if len(unique_txids) < len(txids):
            logger.debug(f"Deduplicated {len(txids)} → {len(unique_txids)} unique transactions (saved {len(txids) - len(unique_txids)} fetches)")
        
        # Check cache first (for unique txids)
        result_map = {}
        uncached_txids = []
        cached_indices = {}

        for i, txid in enumerate(unique_txids):
            cache_key = f"tx:{txid}"
            cached = await self._get_cache(cache_key)
            if cached:
                data = json.loads(cached)
                # Check if cached data has block info - if not, re-fetch
                if data.get("block_height") is None:
                    logger.debug(f"TX {txid[:20]}: Cached data missing block_height, will re-fetch...")
                    uncached_txids.append((i, txid))
                else:
                    result_map[txid] = Transaction(**data)
            else:
                uncached_txids.append((i, txid))

        if uncached_txids:
            txids_to_fetch = [txid for _, txid in uncached_txids]
            mempool = get_mempool_client()

            try:
                mempool_results = await mempool.get_transactions_batch(txids_to_fetch)
            except (asyncio.TimeoutError, Exception) as e:
                logger.error(
                    "Failed to fetch %s transactions: %s",
                    len(txids_to_fetch),
                    e,
                )
                mempool_results = [None] * len(txids_to_fetch)

            # Count successes and failures
            successful = sum(1 for data in mempool_results if data is not None)
            failed = len(mempool_results) - successful
            
            # Process successful fetches
            failed_txids = []
            for txid, data in zip(txids_to_fetch, mempool_results):
                if data:
                    tx = self._parse_mempool_transaction(txid, data)
                    result_map[txid] = tx
                    await self._set_cache(
                        f"tx:{txid}", tx.model_dump_json(), settings.cache_ttl_transaction
                    )
                else:
                    failed_txids.append(txid)
            
            # Report failures: if many fail, it's a systemic problem
            if failed > 0:
                if failed > len(txids_to_fetch) * 0.5:  # More than 50% failed
                    logger.error(
                        "SYSTEMIC FAILURE: %s of %s transactions failed to fetch (%.1f%%) - check server availability",
                        failed,
                        len(txids_to_fetch),
                        (failed / len(txids_to_fetch)) * 100,
                    )
                    # Log first 5 failed TXs as examples
                    for txid in failed_txids[:5]:
                        logger.error("  Example failed TX: %s", txid)
                    if len(failed_txids) > 5:
                        logger.error("  ... and %s more", len(failed_txids) - 5)
                elif failed > 10:  # More than 10 failed, but less than 50%
                    logger.warning(
                        "Many failures: %s of %s transactions failed to fetch (%.1f%%)",
                        failed,
                        len(txids_to_fetch),
                        (failed / len(txids_to_fetch)) * 100,
                    )
                    # Log first 3 failed TXs as examples
                    for txid in failed_txids[:3]:
                        logger.warning("  Failed TX: %s", txid)
                    if len(failed_txids) > 3:
                        logger.warning("  ... and %s more", len(failed_txids) - 3)
                else:
                    # Few failures, log individually
                    for txid in failed_txids:
                        logger.warning("Failed to fetch TX %s", txid[:20])
        
        # Map back to original order (with duplicates restored)
        result = []
        for original_idx, unique_idx in txid_positions:
            txid = unique_txids[unique_idx]
            if txid in result_map:
                result.append(result_map[txid])
            else:
                result.append(None)  # Failed to fetch

        return result

    async def fetch_address_info(self, address: str, max_transactions: Optional[int] = None) -> Address:
        """
        Fetch comprehensive address information
        
        Args:
            address: Bitcoin address
            max_transactions: Optional limit on number of transactions to analyze for counting.
                            If provided, respects this limit (capped at 500). If None, defaults to 500.
            
        Returns:
            Address object with balance, transaction history, etc.
        """
        mempool = get_mempool_client()
        summary = await mempool.get_address_summary(address)

        if not summary:
            raise ValueError(f"No summary returned for address {address}")

        chain_stats = summary.get("chain_stats", {}) or {}
        mempool_stats = summary.get("mempool_stats", {}) or {}

        confirmed_received = chain_stats.get("funded_txo_sum", 0)
        confirmed_spent = chain_stats.get("spent_txo_sum", 0)
        mempool_received = mempool_stats.get("funded_txo_sum", 0)
        mempool_spent = mempool_stats.get("spent_txo_sum", 0)

        confirmed_balance = confirmed_received - confirmed_spent
        mempool_delta = mempool_received - mempool_spent
        balance = confirmed_balance + mempool_delta

        tx_count = chain_stats.get("tx_count", 0) + mempool_stats.get("tx_count", 0)

        # UTXO listing skipped for performance (address summary already provides counts we need)
        utxos: List[UTXO] = []

        # Receiving/spending counts: use mempool summary when available
        receiving_count: Optional[int] = chain_stats.get("funded_txo_count")
        spending_count: Optional[int] = chain_stats.get("spent_txo_count")

        count_cap = min(max_transactions or 500, 500)
        needs_backfill = (
            tx_count > 0
            and count_cap > 0
            and (
                (receiving_count is None or receiving_count == 0)
                or (spending_count is None or spending_count == 0 and confirmed_spent == 0)
                or (confirmed_received == 0 and confirmed_spent == 0)
            )
        )

        if needs_backfill:
            logger.debug(
                "Address %s summary missing stats (txs=%s rcv=%s spd=%s) – backfilling up to %s txs",
                address[:12],
                tx_count,
                receiving_count,
                spending_count,
                count_cap,
            )
            backfill = await self._estimate_address_stats_from_txs(address, cap=count_cap)
            if backfill:
                receiving_count = backfill.get("receiving_count", receiving_count)
                spending_count = backfill.get("spending_count", spending_count)
            else:
                logger.warning(
                    "Address %s backfill failed; counts may remain zero (tx_count=%s)",
                    address[:12],
                    tx_count,
                )

        logger.debug(
            "Address %s stats: txs=%s received=%s sent=%s recv_count=%s spend_count=%s",
            address[:12],
            tx_count,
            confirmed_received,
            confirmed_spent,
            receiving_count,
            spending_count,
        )

        return Address(
            address=address,
            balance=balance,
            total_received=confirmed_received,
            total_sent=confirmed_spent,
            tx_count=tx_count,
            utxos=utxos,
            first_seen=None,
            last_seen=None,
            receiving_count=receiving_count,
            spending_count=spending_count,
        )

    async def _estimate_address_stats_from_txs(self, address: str, cap: int) -> Optional[Dict[str, int]]:
        """
        Fallback to derive receiving/spending stats directly from /address/{addr}/txs
        when summary endpoints are in compact-mode (missing funded/spent counts).
        """
        if cap <= 0:
            return None

        mempool = get_mempool_client()
        receiving_txids: Set[str] = set()
        spending_txids: Set[str] = set()
        total_received = 0
        total_sent = 0
        processed = 0

        attempts = 0
        while attempts < 3 and processed == 0:
            attempts += 1
            async for entry in mempool.iterate_address_txs(address, cap=cap):
                if not isinstance(entry, dict):
                    continue
                txid = entry.get("txid")
                processed += 1

                for vout in entry.get("vout", []):
                    if not isinstance(vout, dict):
                        continue
                    if vout.get("scriptpubkey_address") == address:
                        if txid:
                            receiving_txids.add(txid)
                        value = vout.get("value")
                        if isinstance(value, int):
                            total_received += value

                for vin in entry.get("vin", []):
                    if not isinstance(vin, dict):
                        continue
                    prevout = vin.get("prevout") or {}
                    if not isinstance(prevout, dict):
                        continue
                    if prevout.get("scriptpubkey_address") == address:
                        if txid:
                            spending_txids.add(txid)
                        value = prevout.get("value")
                        if isinstance(value, int):
                            total_sent += value

        if processed == 0:
            return None

        return {
            "receiving_count": len(receiving_txids) or None,
            "spending_count": len(spending_txids) or None,
            "total_received": total_received,
            "total_sent": total_sent,
        }

    def _map_mempool_script_type(self, mempool_type: Optional[str]) -> Optional[str]:
        """
        Map mempool API script types to our model's script types
        
        Mempool API uses: v0_p2wpkh, v1_p2tr, p2pkh, p2sh, etc.
        Our model uses: p2wpkh, p2tr, p2pkh, p2sh, etc.
        """
        if not mempool_type:
            return "unknown"
        
        # Strip version prefixes
        if mempool_type.startswith("v0_"):
            return mempool_type[3:]  # v0_p2wpkh -> p2wpkh
        elif mempool_type.startswith("v1_"):
            return mempool_type[3:]  # v1_p2tr -> p2tr
        elif mempool_type in ["p2pk", "p2pkh", "p2sh", "p2wpkh", "p2wsh", "p2tr"]:
            return mempool_type
        else:
            return "unknown"
    
    def _parse_mempool_transaction(self, txid: str, data: Dict[str, Any]) -> Transaction:
        """
        Parse transaction from mempool API format (includes prevout with addresses/values!)
        
        Key difference: vin[].prevout already contains address and value!
        No need to fetch previous transactions.
        
        Args:
            txid: Transaction ID
            data: Raw transaction data from mempool API
            
        Returns:
            Transaction object
        """
        if not data or not isinstance(data, dict):
            raise ValueError(f"Invalid transaction data for {txid}: expected dict, got {type(data)}")
        
        # Parse inputs (prevout already has address and value!)
        inputs = []
        for vin in data.get("vin", []):
            if not vin or not isinstance(vin, dict):
                logger.warning(f"Skipping invalid vin entry in TX {txid}: {type(vin)}")
                continue
            prevout = vin.get("prevout", {}) or {}
            inputs.append(TransactionInput(
                txid=vin.get("txid"),
                vout=vin.get("vout"),
                sequence=vin.get("sequence"),
                address=prevout.get("scriptpubkey_address"),  # Already included!
                value=prevout.get("value"),  # Already included!
                script_sig=vin.get("scriptsig", ""),
                witness=vin.get("witness", []),
            ))
        
        # Parse outputs
        outputs = []
        for i, vout in enumerate(data.get("vout", [])):
            if not vout or not isinstance(vout, dict):
                logger.warning(f"Skipping invalid vout entry {i} in TX {txid}: {type(vout)}")
                continue
            outputs.append(TransactionOutput(
                n=i,
                value=vout.get("value"),  # Already in satoshis
                address=vout.get("scriptpubkey_address"),
                script_pubkey=vout.get("scriptpubkey", ""),
                script_type=self._map_mempool_script_type(vout.get("scriptpubkey_type")),
            ))
        
        # Parse block info
        status = data.get("status", {}) or {}
        
        # Calculate fee
        total_in = sum(inp.value for inp in inputs if inp.value)
        total_out = sum(out.value for out in outputs)
        fee = data.get("fee") or (total_in - total_out if total_in > 0 else None)
        
        # Calculate vsize from weight (vsize = ceil(weight / 4))
        weight = data.get("weight", 0)
        size = data.get("size", 0)
        vsize = (weight + 3) // 4 if weight > 0 else size  # Round up division
        
        return Transaction(
            txid=txid,
            version=data.get("version", 1),
            locktime=data.get("locktime", 0),
            size=size,
            vsize=vsize,
            weight=weight,
            fee=fee,
            inputs=inputs,
            outputs=outputs,
            block_height=status.get("block_height"),
            block_hash=status.get("block_hash"),
            timestamp=status.get("block_time"),
            confirmations=0,  # Not provided by mempool API, set to 0
        )

# Global service instance
_service: Optional[BlockchainDataService] = None


async def get_blockchain_service() -> BlockchainDataService:
    """Get or create global BlockchainDataService instance"""
    global _service
    if _service is None:
        _service = BlockchainDataService()
        await _service.init_redis()
    return _service

