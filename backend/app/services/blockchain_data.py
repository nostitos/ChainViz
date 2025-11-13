"""High-level blockchain data service with caching"""

import logging
import json
from typing import Iterable, List, Optional, Dict, Any, Tuple
from datetime import datetime, timedelta
import redis.asyncio as aioredis
import hashlib
import base58

from app.models.blockchain import (
    Transaction,
    TransactionInput,
    TransactionOutput,
    UTXO,
    Address,
    ScriptType,
)
from app.services.electrum_multiplexer import get_electrum_client
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


def _extract_pubkey_from_p2pk_script(script_pubkey_hex: str) -> Optional[str]:
    """
    Extract public key from P2PK scriptPubKey
    
    P2PK format: <pubkey> OP_CHECKSIG
    The pubkey is 33 bytes (compressed) or 65 bytes (uncompressed)
    """
    if not script_pubkey_hex:
        return None
    
    try:
        script_bytes = bytes.fromhex(script_pubkey_hex)
        
        # P2PK script: <length> <pubkey> OP_CHECKSIG (0xac)
        # Compressed: 21 <33 bytes> ac (total 35 bytes)
        # Uncompressed: 41 <65 bytes> ac (total 67 bytes)
        
        if len(script_bytes) == 35 and script_bytes[0] == 0x21 and script_bytes[-1] == 0xac:
            # Compressed pubkey
            pubkey = script_bytes[1:34]
            if pubkey[0] in (0x02, 0x03):
                return pubkey.hex()
        elif len(script_bytes) == 67 and script_bytes[0] == 0x41 and script_bytes[-1] == 0xac:
            # Uncompressed pubkey
            pubkey = script_bytes[1:66]
            if pubkey[0] == 0x04:
                return pubkey.hex()
        
        return None
    except Exception as e:
        logger.debug(f"Failed to extract pubkey from P2PK script: {e}")
        return None


def _extract_address_from_script_sig(script_sig: str) -> Optional[str]:
    """
    Extract Bitcoin address from script_sig for P2PKH transactions
    
    P2PKH script_sig format: <sig> <pubkey>
    We extract the pubkey (last 33 bytes for compressed, 65 for uncompressed) and derive the address
    """
    if not script_sig:
        return None
    
    try:
        # Decode hex script
        script_bytes = bytes.fromhex(script_sig)
        
        # P2PKH script_sig: <sig> <pubkey>
        # Pubkey is the last 33 bytes (compressed) or 65 bytes (uncompressed)
        if len(script_bytes) < 33:
            return None
        
        # Try compressed pubkey first (33 bytes)
        if len(script_bytes) >= 33:
            pubkey = script_bytes[-33:]
            # Check if it's a valid compressed pubkey (starts with 0x02 or 0x03)
            if pubkey[0] in (0x02, 0x03):
                pass  # Valid compressed pubkey
            elif len(script_bytes) >= 65:
                # Try uncompressed pubkey (65 bytes, starts with 0x04)
                pubkey = script_bytes[-65:]
                if pubkey[0] != 0x04:
                    return None
            else:
                return None
        
        # Hash the pubkey with SHA256
        sha256_hash = hashlib.sha256(pubkey).digest()
        
        # Hash again with RIPEMD160
        ripemd160 = hashlib.new('ripemd160')
        ripemd160.update(sha256_hash)
        hash160 = ripemd160.digest()
        
        # Add version byte (0x00 for mainnet P2PKH)
        versioned_hash = b'\x00' + hash160
        
        # Double SHA256 for checksum
        checksum = hashlib.sha256(hashlib.sha256(versioned_hash).digest()).digest()[:4]
        
        # Base58 encode
        address_bytes = versioned_hash + checksum
        address = base58.b58encode(address_bytes).decode('ascii')
        
        return address
        
    except Exception as e:
        logger.debug(f"Failed to extract address from script_sig: {e}")
        return None


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

    async def fetch_address_history(self, address: str) -> List[str]:
        """
        Fetch transaction IDs for an address
        
        Args:
            address: Bitcoin address
            
        Returns:
            List of transaction IDs
        """
        cache_key = f"addr_history:{address}"
        cached = await self._get_cache(cache_key)

        if cached:
            return json.loads(cached)

        # Try mempool.space tier first
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
                    logger.info(
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

        best_txids: List[str] = []
        try:
            for priority in (0, 1, 2):
                txids = await mempool.get_address_txids(
                    address,
                    min_priority=priority,
                    max_results=expected_count or 500,
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
                    logger.info(
                        "✅ Address %s resolved via mempool priority %s (%s txs)",
                        address[:10],
                        priority,
                        len(txids),
                    )
                    await self._set_cache(
                        cache_key, json.dumps(txids), settings.cache_ttl_address_history
                    )
                    return txids

            if best_txids:
                if expected_count and len(best_txids) < expected_count:
                    logger.warning(
                        "Address %s returned %s/%s txs from mempool API; will top up via Electrum",
                        address[:12],
                        len(best_txids),
                        expected_count,
                    )
                else:
                    logger.info(
                        "✅ Address %s resolved via mempool (%s txs)",
                        address[:10],
                        len(best_txids),
                    )
                    await self._set_cache(
                        cache_key, json.dumps(best_txids), settings.cache_ttl_address_history
                    )
                    return best_txids
        except Exception as exc:
            logger.warning(f"Mempool address lookup failed for {address[:12]}*: {exc}")

        # Fallback to Electrum (use fresh client)
        logger.info(f"Mempool unavailable, creating Electrum client for {address[:12]}* ...")
        electrum = get_electrum_client()
        logger.info(f"Calling get_history for address: {address}")
        history = await electrum.get_history(address)
        logger.info(f"Got {len(history)} history items from Electrum")
        txids = [item["tx_hash"] for item in history]

        # Cache result
        await self._set_cache(cache_key, json.dumps(txids), settings.cache_ttl_address_history)

        return txids

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

        # Batch fetch uncached addresses
        if uncached_addresses:
            electrum = get_electrum_client()
            histories = await electrum.get_histories_batch(uncached_addresses)

            for address, history in zip(uncached_addresses, histories):
                if history:
                    txids = [item["tx_hash"] for item in history]
                    result[address] = txids

                    # Cache result
                    cache_key = f"addr_history:{address}"
                    await self._set_cache(
                        cache_key, json.dumps(txids), settings.cache_ttl_address_history
                    )
                else:
                    result[address] = []

        return result

    async def fetch_transaction(self, txid: str) -> Transaction:
        """
        Fetch transaction with three-tier strategy:
        1. Local mempool.space (fast, handles most TXs)
        2. Public mempool.space (for large TXs)
        3. Electrum multiplexer (if mempool.space fails)
        
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
                logger.info(f"TX {txid[:20]}: Cached data missing block_height, re-fetching...")
            else:
                return Transaction(**data)

        # Try mempool.space first (handles local vs public routing internally)
        mempool = get_mempool_client()
        data = await mempool.get_transaction(txid)
        
        if data:
            transaction = self._parse_mempool_transaction(txid, data)
            await self._set_cache(cache_key, transaction.model_dump_json(), settings.cache_ttl_transaction)
            logger.info(f"✅ Fetched TX {txid[:20]} from mempool.space (1 request)")
            return transaction
        
        # Fallback to Electrum multiplexer
        logger.warning(f"Mempool.space failed for {txid[:20]}, using Electrum")
        electrum = get_electrum_client()
        tx_data = await electrum.get_transaction(txid, verbose=True)
        
        if not tx_data:
            raise ValueError(f"Failed to fetch transaction {txid} from all sources")
        
        transaction = self._parse_transaction(txid, tx_data)
        await self._set_cache(cache_key, transaction.model_dump_json(), settings.cache_ttl_transaction)
        return transaction

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
            logger.info(f"📦 Deduplicated {len(txids)} → {len(unique_txids)} unique transactions (saved {len(txids) - len(unique_txids)} fetches)")
        
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
                    logger.info(f"TX {txid[:20]}: Cached data missing block_height, will re-fetch...")
                    uncached_txids.append((i, txid))
                else:
                    result_map[txid] = Transaction(**data)
            else:
                uncached_txids.append((i, txid))

        # Batch fetch uncached transactions from mempool.space first
        if uncached_txids:
            txids_to_fetch = [txid for _, txid in uncached_txids]
            
            # Try mempool.space first
            mempool = get_mempool_client()
            mempool_results = await mempool.get_transactions_batch(txids_to_fetch)
            
            failed_txids = []
            for txid, data in zip(txids_to_fetch, mempool_results):
                if data:
                    tx = self._parse_mempool_transaction(txid, data)
                    result_map[txid] = tx
                    await self._set_cache(f"tx:{txid}", tx.model_dump_json(), settings.cache_ttl_transaction)
                else:
                    failed_txids.append(txid)
            
            # Fallback to Electrum for failures
            if failed_txids:
                logger.warning(f"Mempool.space failed for {len(failed_txids)} TXs, using Electrum")
                electrum = get_electrum_client()
                electrum_results = await electrum.get_transactions_batch(failed_txids, verbose=True)
                
                for txid, tx_data in zip(failed_txids, electrum_results):
                    if tx_data:
                        tx = self._parse_transaction(txid, tx_data)
                        result_map[txid] = tx
                        await self._set_cache(f"tx:{txid}", tx.model_dump_json(), settings.cache_ttl_transaction)
        
        # Map back to original order (with duplicates restored)
        result = []
        for original_idx, unique_idx in txid_positions:
            txid = unique_txids[unique_idx]
            if txid in result_map:
                result.append(result_map[txid])
            else:
                result.append(None)  # Failed to fetch

        return result

    async def fetch_address_info(self, address: str) -> Address:
        """
        Fetch comprehensive address information
        
        Args:
            address: Bitcoin address
            
        Returns:
            Address object with balance, transaction history, etc.
        """
        # Get balance (use fresh client)
        electrum = get_electrum_client()
        balance_data = await electrum.get_balance(address)

        # Get transaction history
        txids = await self.fetch_address_history(address)

        # Calculate totals from balance data
        balance = balance_data.get("confirmed", 0)
        unconfirmed = balance_data.get("unconfirmed", 0)
        
        # For total_received and total_sent - we cannot calculate these accurately
        # without fetching and analyzing all transactions (which would be very slow)
        # Instead, set these to None/0 to indicate they're not available
        # The UI can still show the balance and transaction count
        total_received = 0  # Unknown - would need to fetch all transactions
        total_sent = 0      # Unknown - would need to fetch all transactions

        # Try to get first_seen and last_seen from transaction history
        first_seen = None
        last_seen = None
        
        if txids and len(txids) > 0:
            try:
                # Fetch the first and last transactions to get timestamps
                first_tx = await electrum.get_transaction(txids[0], verbose=True)
                last_tx = await electrum.get_transaction(txids[-1], verbose=True)
                
                # Get blocktime from transactions (if confirmed)
                if first_tx and "blocktime" in first_tx:
                    first_seen = first_tx["blocktime"]
                if last_tx and "blocktime" in last_tx:
                    last_seen = last_tx["blocktime"]
                    
                logger.debug(f"Address {address}: first_seen={first_seen}, last_seen={last_seen}")
            except Exception as e:
                logger.debug(f"Could not fetch timestamps for address {address}: {e}")
        
        return Address(
            address=address,
            balance=balance,
            total_received=total_received,
            total_sent=total_sent,
            tx_count=len(txids),
            first_seen=first_seen,
            last_seen=last_seen,
        )

    def _map_mempool_script_type(self, mempool_type: Optional[str]) -> Optional[str]:
        """
        Map mempool.space script types to our model's script types
        
        Mempool.space uses: v0_p2wpkh, v1_p2tr, p2pkh, p2sh, etc.
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
        Parse transaction from mempool.space format (includes prevout with addresses/values!)
        
        Key difference: vin[].prevout already contains address and value!
        No need to fetch previous transactions.
        
        Args:
            txid: Transaction ID
            data: Raw transaction data from mempool.space
            
        Returns:
            Transaction object
        """
        # Parse inputs (prevout already has address and value!)
        inputs = []
        for vin in data.get("vin", []):
            prevout = vin.get("prevout", {})
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
            outputs.append(TransactionOutput(
                n=i,
                value=vout.get("value"),  # Already in satoshis
                address=vout.get("scriptpubkey_address"),
                script_pubkey=vout.get("scriptpubkey", ""),
                script_type=self._map_mempool_script_type(vout.get("scriptpubkey_type")),
            ))
        
        # Parse block info
        status = data.get("status", {})
        
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
            confirmations=0,  # Not provided by mempool.space, set to 0
        )

    def _parse_transaction(self, txid: str, tx_data: Dict[str, Any]) -> Transaction:
        """
        Parse raw transaction data from Electrum into Transaction model
        
        Args:
            txid: Transaction ID
            tx_data: Raw transaction data from Electrum
            
        Returns:
            Transaction object
        """
        # Parse inputs
        inputs = []
        raw_inputs = tx_data.get("vin", [])
        logger.debug(f"Parsing TX {txid[:20]}: {len(raw_inputs)} inputs from Electrum")
        
        # DEBUG: For the problematic transaction, log first few inputs
        if txid.startswith("b1b980bb"):
            logger.warning(f"DEBUG: TX b1b980bb has {len(raw_inputs)} inputs in tx_data")
            for i, vin in enumerate(raw_inputs[:3]):
                logger.warning(f"  Input {i}: txid={vin.get('txid', 'N/A')[:12]}... vout={vin.get('vout', 'N/A')}")
        
        for vin in raw_inputs:
            script_sig_hex = vin.get("scriptSig", {}).get("hex", "")
            
            # Try to extract address from script_sig if not provided by Electrum
            address = vin.get("address")
            if not address and script_sig_hex:
                address = _extract_address_from_script_sig(script_sig_hex)
                if address:
                    logger.debug(f"Extracted address {address} from script_sig")
            
            tx_input = TransactionInput(
                txid=vin.get("txid", ""),
                vout=vin.get("vout", 0),
                script_sig=script_sig_hex,
                sequence=vin.get("sequence", 0xFFFFFFFF),
                witness=vin.get("txinwitness", []),
                address=address,
                value=vin.get("value"),
            )
            inputs.append(tx_input)
        
        logger.debug(f"Parsed {len(inputs)} inputs for TX {txid[:20]}")

        # Parse outputs
        outputs = []
        for vout in tx_data.get("vout", []):
            raw_value = vout.get("value", 0)
            # Electrum servers are inconsistent in their response format
            # Most of the time: value is a float in BTC (e.g., 0.5 or 1.23456789)
            # Sometimes (especially for round amounts): value is an int in BTC (e.g., 65 means 65 BTC)
            # NEVER in satoshis directly from Electrum
            if isinstance(raw_value, (int, float)):
                value_sats = int(raw_value * 100_000_000)  # Always BTC → satoshis
            else:
                logger.warning(f"Unexpected value type for vout: {type(raw_value)} = {raw_value}")
                value_sats = 0
            
            logger.debug(f"Parsing output {vout.get('n', 0)}: raw_value={raw_value} ({type(raw_value).__name__}) → {value_sats} sats")
            
            tx_output = TransactionOutput(
                n=vout.get("n", 0),
                value=value_sats,
                script_pubkey=vout.get("scriptPubKey", {}).get("hex", ""),
                address=vout.get("scriptPubKey", {}).get("address"),
                script_type=self._detect_script_type(vout.get("scriptPubKey", {})),
            )
            outputs.append(tx_output)

        # Calculate fee
        total_in = sum(inp.value for inp in inputs if inp.value)
        total_out = sum(out.value for out in outputs)
        fee = total_in - total_out if total_in > 0 else None

        block_height = tx_data.get("blockheight")
        block_hash = tx_data.get("blockhash")
        timestamp = tx_data.get("blocktime")
        confirmations = tx_data.get("confirmations", 0)
        
        # Debug logging for block information
        logger.debug(f"TX {txid[:20]}: blockheight={block_height}, blockhash={block_hash[:20] if block_hash else None}, blocktime={timestamp}, confirmations={confirmations}")
        
        return Transaction(
            txid=txid,
            version=tx_data.get("version", 1),
            locktime=tx_data.get("locktime", 0),
            size=tx_data.get("size", 0),
            vsize=tx_data.get("vsize", tx_data.get("size", 0)),
            weight=tx_data.get("weight", tx_data.get("size", 0) * 4),
            inputs=inputs,
            outputs=outputs,
            block_height=block_height,
            block_hash=block_hash,
            timestamp=timestamp,
            confirmations=confirmations,
            fee=fee,
        )

    def _detect_script_type(self, script_pubkey: Dict[str, Any]) -> ScriptType:
        """Detect script type from scriptPubKey"""
        script_type = script_pubkey.get("type", "")

        if script_type == "pubkey":
            return ScriptType.P2PK
        elif script_type == "pubkeyhash":
            return ScriptType.P2PKH
        elif script_type == "scripthash":
            return ScriptType.P2SH
        elif script_type == "witness_v0_keyhash":
            return ScriptType.P2WPKH
        elif script_type == "witness_v0_scripthash":
            return ScriptType.P2WSH
        elif script_type == "witness_v1_taproot":
            return ScriptType.P2TR
        else:
            return ScriptType.UNKNOWN


# Global service instance
_service: Optional[BlockchainDataService] = None


async def get_blockchain_service() -> BlockchainDataService:
    """Get or create global BlockchainDataService instance"""
    global _service
    if _service is None:
        _service = BlockchainDataService()
        await _service.init_redis()
    return _service

