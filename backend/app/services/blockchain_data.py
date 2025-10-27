"""High-level blockchain data service with caching"""

import logging
import json
from typing import List, Optional, Dict, Any
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
from app.services.electrum_client import get_electrum_client
from app.config import settings

logger = logging.getLogger(__name__)


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

        # Fetch from Electrum (use fresh client)
        logger.info(f"Creating fresh Electrum client...")
        electrum = get_electrum_client()
        logger.info(f"Calling get_history for address: {address}")
        history = await electrum.get_history(address)
        logger.info(f"Got {len(history)} history items")
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
        Fetch transaction details with input values
        
        Args:
            txid: Transaction ID
            
        Returns:
            Transaction object
        """
        cache_key = f"tx:{txid}"
        cached = await self._get_cache(cache_key)

        if cached:
            data = json.loads(cached)
            return Transaction(**data)

        # Fetch from Electrum (use fresh client)
        electrum = get_electrum_client()
        tx_data = await electrum.get_transaction(txid, verbose=True)
        
        # Fetch input values from previous transactions - DISABLED (too slow, use batching instead)
        # The trace.py endpoint already handles batching for input values
        # for vin in tx_data.get("vin", []):
        #     if "value" not in vin or vin.get("value") is None:
        #         # Need to fetch the previous transaction to get the output value
        #         prev_txid = vin.get("txid")
        #         prev_vout = vin.get("vout")
        #         logger.info(f"Fetching input value for {prev_txid}:{prev_vout}")
        #         if prev_txid and prev_vout is not None:
        #             try:
        #                 prev_tx = await electrum.get_transaction(prev_txid, verbose=True)
        #                 if prev_vout < len(prev_tx.get("vout", [])):
        #                     vin["value"] = int(prev_tx["vout"][prev_vout].get("value", 0) * 100_000_000)
        #                     logger.info(f"✅ Fetched input value: {vin['value']} satoshis")
        #             except Exception as e:
        #                 logger.error(f"Could not fetch input value for {prev_txid}:{prev_vout}: {e}")
        
        transaction = self._parse_transaction(txid, tx_data)

        # Cache result
        await self._set_cache(
            cache_key, transaction.model_dump_json(), settings.cache_ttl_transaction
        )

        return transaction

    async def fetch_transactions_batch(self, txids: List[str]) -> List[Transaction]:
        """
        Fetch multiple transactions (uses batching for speed)
        
        Args:
            txids: List of transaction IDs
            
        Returns:
            List of Transaction objects
        """
        # Check cache first
        result = []
        uncached_txids = []
        cached_indices = {}

        for i, txid in enumerate(txids):
            cache_key = f"tx:{txid}"
            cached = await self._get_cache(cache_key)
            if cached:
                data = json.loads(cached)
                result.append(Transaction(**data))
                cached_indices[i] = len(result) - 1
            else:
                uncached_txids.append((i, txid))

        # Batch fetch uncached transactions
        if uncached_txids:
            txids_to_fetch = [txid for _, txid in uncached_txids]
            electrum = get_electrum_client()
            tx_data_list = await electrum.get_transactions_batch(txids_to_fetch)

            for (original_idx, txid), tx_data in zip(uncached_txids, tx_data_list):
                if tx_data:
                    # Fetch input values from previous transactions
                    for vin in tx_data.get("vin", []):
                        if "value" not in vin or vin.get("value") is None:
                            prev_txid = vin.get("txid")
                            prev_vout = vin.get("vout")
                            if prev_txid and prev_vout is not None:
                                try:
                                    prev_tx = await electrum.get_transaction(prev_txid, verbose=True)
                                    if prev_vout < len(prev_tx.get("vout", [])):
                                        vin["value"] = int(prev_tx["vout"][prev_vout].get("value", 0) * 100_000_000)
                                except Exception as e:
                                    logger.debug(f"Could not fetch input value for {prev_txid}:{prev_vout}: {e}")
                    
                    transaction = self._parse_transaction(txid, tx_data)
                    result.insert(original_idx, transaction)

                    # Cache result
                    cache_key = f"tx:{txid}"
                    await self._set_cache(
                        cache_key,
                        transaction.model_dump_json(),
                        settings.cache_ttl_transaction,
                    )

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
        
        # For total_received and total_sent, we need to fetch transactions
        # For now, use a simplified calculation based on balance
        # If balance is 0 but has transactions, it means it received and spent everything
        if balance == 0 and len(txids) > 0:
            # Address has no balance but has transactions - received and spent everything
            # We can't calculate exact amounts without fetching all transactions
            # Set to 0 for now (could be improved by fetching TXs)
            total_received = 0
            total_sent = 0
        else:
            # Address has balance - use balance as total_received
            total_received = balance
            total_sent = 0

        return Address(
            address=address,
            balance=balance,
            total_received=total_received,
            total_sent=total_sent,
            tx_count=len(txids),
            first_seen=None,  # Would need to fetch earliest TX
            last_seen=None,  # Would need to fetch latest TX
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
        for vin in tx_data.get("vin", []):
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

        return Transaction(
            txid=txid,
            version=tx_data.get("version", 1),
            locktime=tx_data.get("locktime", 0),
            size=tx_data.get("size", 0),
            vsize=tx_data.get("vsize", tx_data.get("size", 0)),
            weight=tx_data.get("weight", tx_data.get("size", 0) * 4),
            inputs=inputs,
            outputs=outputs,
            block_height=tx_data.get("blockheight"),
            block_hash=tx_data.get("blockhash"),
            timestamp=tx_data.get("blocktime"),
            confirmations=tx_data.get("confirmations", 0),
            fee=fee,
        )

    def _detect_script_type(self, script_pubkey: Dict[str, Any]) -> ScriptType:
        """Detect script type from scriptPubKey"""
        script_type = script_pubkey.get("type", "")

        if script_type == "pubkeyhash":
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

