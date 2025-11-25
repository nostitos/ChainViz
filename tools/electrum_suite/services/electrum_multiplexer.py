"""High-level Electrum multiplexer API - compatible with ElectrumClient interface"""

import asyncio
import logging
from typing import Any, Dict, List, Optional

from tools.electrum_suite.services.electrum_client import ElectrumClient
from tools.electrum_suite.services.electrum_pool import get_connection_pool
from tools.electrum_suite.settings import settings

logger = logging.getLogger(__name__)


class ElectrumMultiplexer:
    """
    High-level Electrum API that routes requests through connection pool
    
    Provides same interface as ElectrumClient for backward compatibility
    """
    
    def __init__(self):
        self.pool = get_connection_pool()
    
    async def connect(self) -> None:
        """
        Connect to Electrum servers
        
        This starts the connection pool if not already started
        """
        if not self.pool._running:
            await self.pool.start()
    
    async def disconnect(self) -> None:
        """Disconnect from Electrum servers"""
        await self.pool.stop()
    
    @property
    def connected(self) -> bool:
        """Check if multiplexer is connected (has any healthy connections)"""
        if not self.pool._running:
            return False
        
        healthy = [c for c in self.pool.connections if c.state.value == "connected"]
        return len(healthy) > 0
    
    async def _call(self, method: str, params: List[Any]) -> Any:
        """
        Make a single RPC call through the pool
        
        Args:
            method: Electrum protocol method name
            params: Method parameters
            
        Returns:
            Method result
        """
        return await self.pool.execute_request(method, params)
    
    async def _batch_call(self, requests: List[tuple]) -> List[Any]:
        """
        Make multiple RPC calls in a batch through the pool
        
        Args:
            requests: List of (method, params) tuples
            
        Returns:
            List of results in same order as requests
        """
        # Use parallel execution for large batches
        parallel = len(requests) > 100
        return await self.pool.execute_batch(requests, parallel=parallel)
    
    # Standard Electrum API methods
    
    async def get_balance(self, address: str) -> Dict[str, int]:
        """Get address balance"""
        script_hash = ElectrumClient._address_to_scripthash(address)
        return await self._call("blockchain.scripthash.get_balance", [script_hash])
    
    async def get_history(self, address: str) -> List[Dict[str, Any]]:
        """Get address transaction history"""
        script_hash = ElectrumClient._address_to_scripthash(address)
        return await self._call("blockchain.scripthash.get_history", [script_hash])
    
    async def get_transaction(self, txid: str, verbose: bool = True) -> Dict[str, Any]:
        """Get transaction details"""
        return await self._call("blockchain.transaction.get", [txid, verbose])
    
    async def get_transactions_batch(self, txids: List[str], verbose: bool = True) -> List[Dict[str, Any]]:
        """
        Get multiple transactions in a batch (OPTIMIZED with auto-chunking)
        
        Automatically chunks large batches to prevent timeouts and rate limiting
        """
        MAX_BATCH_SIZE = 50  # Tested: 50 is optimal (25 causes MORE failures due to per-second limits)
        
        if len(txids) <= MAX_BATCH_SIZE:
            # Normal batch
            requests = [("blockchain.transaction.get", [txid, verbose]) for txid in txids]
            return await self._batch_call(requests)
        else:
            # Auto-chunk large batches
            logger.info(f"📦 Auto-chunking {len(txids)} transactions into batches of {MAX_BATCH_SIZE}")
            chunks = [txids[i:i + MAX_BATCH_SIZE] for i in range(0, len(txids), MAX_BATCH_SIZE)]
            tasks = [self.get_transactions_batch(chunk, verbose) for chunk in chunks]
            chunk_results = await asyncio.gather(*tasks)
            return [item for chunk in chunk_results for item in chunk]
    
    async def get_histories_batch(self, addresses: List[str]) -> List[List[Dict[str, Any]]]:
        """
        Get transaction histories for multiple addresses (OPTIMIZED with auto-chunking)
        
        Automatically chunks large batches to prevent timeouts and rate limiting
        """
        MAX_BATCH_SIZE = 50  # Tested: 50 is optimal (25 causes MORE failures due to per-second limits)
        
        if len(addresses) <= MAX_BATCH_SIZE:
            # Normal batch
            requests = [
                ("blockchain.scripthash.get_history", [ElectrumClient._address_to_scripthash(addr)])
                for addr in addresses
            ]
            return await self._batch_call(requests)
        else:
            # Auto-chunk large batches
            logger.info(f"📦 Auto-chunking {len(addresses)} address histories into batches of {MAX_BATCH_SIZE}")
            chunks = [addresses[i:i + MAX_BATCH_SIZE] for i in range(0, len(addresses), MAX_BATCH_SIZE)]
            tasks = [self.get_histories_batch(chunk) for chunk in chunks]
            chunk_results = await asyncio.gather(*tasks)
            return [item for chunk in chunk_results for item in chunk]
    
    async def get_balances_batch(self, addresses: List[str]) -> List[Dict[str, int]]:
        """
        Get balances for multiple addresses (OPTIMIZED with auto-chunking)
        
        Automatically chunks large batches to prevent timeouts and rate limiting
        """
        MAX_BATCH_SIZE = 50  # Tested: 50 is optimal (25 causes MORE failures due to per-second limits)
        
        if len(addresses) <= MAX_BATCH_SIZE:
            # Normal batch
            requests = [
                ("blockchain.scripthash.get_balance", [ElectrumClient._address_to_scripthash(addr)])
                for addr in addresses
            ]
            return await self._batch_call(requests)
        else:
            # Auto-chunk large batches
            logger.info(f"📦 Auto-chunking {len(addresses)} balance lookups into batches of {MAX_BATCH_SIZE}")
            chunks = [addresses[i:i + MAX_BATCH_SIZE] for i in range(0, len(addresses), MAX_BATCH_SIZE)]
            tasks = [self.get_balances_batch(chunk) for chunk in chunks]
            chunk_results = await asyncio.gather(*tasks)
            return [item for chunk in chunk_results for item in chunk]
    
    async def get_utxos_batch(self, addresses: List[str]) -> List[List[Dict[str, Any]]]:
        """
        Get UTXOs for multiple addresses (NEW BATCH METHOD)
        
        Returns list of UTXO lists in same order as addresses
        """
        MAX_BATCH_SIZE = 50  # Tested: 50 is optimal (25 causes MORE failures due to per-second limits)
        
        if len(addresses) <= MAX_BATCH_SIZE:
            # Normal batch
            requests = [
                ("blockchain.scripthash.listunspent", [ElectrumClient._address_to_scripthash(addr)])
                for addr in addresses
            ]
            return await self._batch_call(requests)
        else:
            # Auto-chunk large batches
            logger.info(f"📦 Auto-chunking {len(addresses)} UTXO lookups into batches of {MAX_BATCH_SIZE}")
            chunks = [addresses[i:i + MAX_BATCH_SIZE] for i in range(0, len(addresses), MAX_BATCH_SIZE)]
            tasks = [self.get_utxos_batch(chunk) for chunk in chunks]
            chunk_results = await asyncio.gather(*tasks)
            return [item for chunk in chunk_results for item in chunk]
    
    async def subscribe_headers(self, callback) -> None:
        """Subscribe to new block headers"""
        header = await self._call("blockchain.headers.subscribe", [])
        await callback(header)
        logger.info("Subscribed to block headers")
    
    async def get_merkle(self, txid: str, height: int) -> Dict[str, Any]:
        """Get merkle proof for transaction"""
        return await self._call("blockchain.transaction.get_merkle", [txid, height])
    
    async def broadcast(self, raw_tx: str) -> str:
        """Broadcast raw transaction"""
        return await self._call("blockchain.transaction.broadcast", [raw_tx])
    
    # Utility methods for address conversion (static, no network call)
    
    @staticmethod
    def _address_to_scripthash(address: str) -> str:
        """Convert Bitcoin address to script hash"""
        return ElectrumClient._address_to_scripthash(address)
    
    # Pool management methods
    
    def get_pool_stats(self) -> dict:
        """Get connection pool statistics"""
        return self.pool.get_stats()
    
    def get_connections(self) -> List[dict]:
        """Get detailed info about all pool connections"""
        return self.pool.get_connections_info()
    
    def get_recent_requests(self, limit: int = 100) -> List[dict]:
        """Get recent request log"""
        requests = list(self.pool.recent_requests)
        return requests[-limit:]


# Global multiplexer instance
_multiplexer: Optional[ElectrumMultiplexer] = None
_use_multiplexer: bool = True  # Feature flag


def get_electrum_client():
    """
    Get Electrum client instance
    
    Returns multiplexer if enabled, otherwise creates single-server client
    """
    global _multiplexer, _use_multiplexer
    
    if _use_multiplexer:
        if _multiplexer is None:
            _multiplexer = ElectrumMultiplexer()
        return _multiplexer
    else:
        # Fallback to single-server client
        return ElectrumClient(
            host=settings.electrum_host,
            port=settings.electrum_port,
            use_ssl=getattr(settings, "electrum_use_ssl", True),
        )


def set_multiplexer_enabled(enabled: bool) -> None:
    """Enable or disable multiplexer (for testing/debugging)"""
    global _use_multiplexer
    _use_multiplexer = enabled
    logger.info(f"Multiplexer {'enabled' if enabled else 'disabled'}")

