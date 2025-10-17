"""Async Electrum protocol client with batching support"""

import asyncio
import json
import ssl
import logging
from typing import Any, Dict, List, Optional, Tuple
from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)


class ElectrumClient:
    """
    Async Electrum protocol client with support for batching requests.
    
    Connects to fulcrum.sethforprivacy.com:50002 by default.
    Supports batch requests for improved performance when fetching multiple items.
    """

    def __init__(
        self,
        host: str = "fulcrum.sethforprivacy.com",
        port: int = 50002,
        use_ssl: bool = True,
        max_retries: int = 3,
        timeout: int = 30,
    ):
        self.host = host
        self.port = port
        self.use_ssl = use_ssl
        self.max_retries = max_retries
        self.timeout = timeout
        self.reader: Optional[asyncio.StreamReader] = None
        self.writer: Optional[asyncio.StreamWriter] = None
        self.request_id = 0
        self.connected = False
        self._lock = asyncio.Lock()

    async def connect(self) -> None:
        """Establish connection to Electrum server with fallback"""
        if self.connected:
            return

        # Try primary server first
        try:
            # Increase stream buffer limit to handle very large JSON lines
            stream_limit = 50 * 1024 * 1024  # 50MB
            if self.use_ssl:
                ssl_context = ssl.create_default_context()
                ssl_context.check_hostname = False
                ssl_context.verify_mode = ssl.CERT_NONE
                self.reader, self.writer = await asyncio.open_connection(
                    self.host,
                    self.port,
                    ssl=ssl_context,
                    limit=stream_limit,
                )
            else:
                self.reader, self.writer = await asyncio.open_connection(
                    self.host,
                    self.port,
                    limit=stream_limit,
                )

            self.connected = True
            logger.info(f"✅ Connected to Electrum server at {self.host}:{self.port}")

            # Note: Skip server.version check to avoid deadlock with _lock

        except Exception as e:
            logger.error(f"❌ Failed to connect to primary Electrum server {self.host}:{self.port}: {e}")
            
            # Try fallback server if configured
            from app.config import settings
            if hasattr(settings, 'electrum_fallback_host') and self.host != settings.electrum_fallback_host:
                logger.info(f"🔄 Trying fallback server: {settings.electrum_fallback_host}:{settings.electrum_fallback_port}")
                self.host = settings.electrum_fallback_host
                self.port = settings.electrum_fallback_port
                # Retry connection with fallback
                await self.connect()
            else:
                raise

    async def disconnect(self) -> None:
        """Close connection to Electrum server"""
        if self.writer:
            self.writer.close()
            await self.writer.wait_closed()
            self.connected = False
            logger.info("Disconnected from Electrum server")

    async def _call(self, method: str, params: List[Any]) -> Any:
        """
        Make a single RPC call to Electrum server
        
        Args:
            method: Electrum protocol method name
            params: Method parameters
            
        Returns:
            Method result
        """
        async with self._lock:
            if not self.connected:
                await self.connect()

            self.request_id += 1
            request = {
                "jsonrpc": "2.0",
                "id": self.request_id,
                "method": method,
                "params": params,
            }

            # Send request
            logger.info(f"Electrum call: {method}")
            request_str = json.dumps(request) + "\n"
            self.writer.write(request_str.encode())
            await self.writer.drain()
            logger.info("Request sent, waiting for response...")

            # Read response - try reading until we get a newline
            try:
                response_bytes = await asyncio.wait_for(
                    self.reader.readuntil(b'\n'), timeout=self.timeout
                )
                logger.info(f"Got response: {len(response_bytes)} bytes")
            except asyncio.IncompleteReadError as e:
                # If we got partial data, use it
                logger.warning(f"Incomplete read, using partial: {len(e.partial)} bytes")
                response_bytes = e.partial
            except asyncio.LimitOverrunError as e:
                # Buffer overflow - response is too large
                logger.error(f"Response too large: {e}, reading in chunks")
                # Read in chunks until newline
                chunks = []
                while True:
                    chunk = await asyncio.wait_for(self.reader.read(1024 * 1024), timeout=self.timeout)  # 1MB chunks
                    if not chunk:
                        break
                    chunks.append(chunk)
                    if b'\n' in chunk:
                        break
                response_bytes = b''.join(chunks)
            
            response = json.loads(response_bytes.decode())

            if "error" in response:
                raise Exception(f"Electrum error: {response['error']}")

            return response.get("result")

    async def _batch_call(self, requests: List[Tuple[str, List[Any]]]) -> List[Any]:
        """
        Make multiple RPC calls in a single batch request.
        This is significantly faster than individual calls.
        For large batches (100+), splits into chunks to avoid timeout/memory issues.
        
        Args:
            requests: List of (method, params) tuples
            
        Returns:
            List of results in same order as requests
        """
        if not requests:
            return []
        
        # For large batches, chunk them to avoid timeout/memory issues
        CHUNK_SIZE = 100
        if len(requests) > CHUNK_SIZE:
            logger.info(f"📦 Chunking {len(requests)} requests into batches of {CHUNK_SIZE}")
            all_results = []
            for i in range(0, len(requests), CHUNK_SIZE):
                chunk = requests[i:i + CHUNK_SIZE]
                chunk_results = await self._batch_call_single(chunk)
                all_results.extend(chunk_results)
            return all_results
        else:
            return await self._batch_call_single(requests)
    
    async def _batch_call_single(self, requests: List[Tuple[str, List[Any]]]) -> List[Any]:
        """
        Make a single batch request (internal helper)
        """
        if not requests:
            return []

        async with self._lock:
            if not self.connected:
                await self.connect()

            # Build batch request
            batch_request = []
            for method, params in requests:
                self.request_id += 1
                batch_request.append({
                    "jsonrpc": "2.0",
                    "id": self.request_id,
                    "method": method,
                    "params": params,
                })

            # Send batch request
            request_str = json.dumps(batch_request) + "\n"
            self.writer.write(request_str.encode())
            await self.writer.drain()

            # Read batch response
            response_str = await asyncio.wait_for(
                self.reader.readline(), timeout=self.timeout
            )
            responses = json.loads(response_str.decode())

            # Extract results in order
            results = []
            for response in responses:
                if isinstance(response, dict) and "error" in response:
                    logger.warning(f"Batch item error: {response['error']}")
                    results.append(None)
                elif isinstance(response, dict):
                    results.append(response.get("result"))
                else:
                    logger.warning(f"Unexpected response type: {type(response)}")
                    results.append(None)

            return results

    async def get_balance(self, address: str) -> Dict[str, int]:
        """
        Get address balance
        
        Returns:
            {"confirmed": int, "unconfirmed": int}
        """
        script_hash = self._address_to_scripthash(address)
        return await self._call("blockchain.scripthash.get_balance", [script_hash])

    async def get_history(self, address: str) -> List[Dict[str, Any]]:
        """
        Get address transaction history
        
        Returns:
            List of {"tx_hash": str, "height": int, "fee": int}
        """
        logger.info(f"get_history called for address: {address}")
        script_hash = self._address_to_scripthash(address)
        logger.info(f"Converted to scripthash: {script_hash}")
        result = await self._call("blockchain.scripthash.get_history", [script_hash])
        logger.info(f"get_history returning {len(result) if result else 0} items")
        return result

    async def get_transaction(self, txid: str, verbose: bool = True) -> Dict[str, Any]:
        """
        Get transaction details
        
        Args:
            txid: Transaction ID
            verbose: If True, returns decoded transaction; if False, returns raw hex
            
        Returns:
            Transaction data
        """
        return await self._call("blockchain.transaction.get", [txid, verbose])

    async def get_transactions_batch(self, txids: List[str], verbose: bool = True) -> List[Dict[str, Any]]:
        """
        Get multiple transactions in a single batch request (faster!)
        
        Args:
            txids: List of transaction IDs
            verbose: If True, returns decoded transactions
            
        Returns:
            List of transaction data in same order as txids
        """
        requests = [("blockchain.transaction.get", [txid, verbose]) for txid in txids]
        return await self._batch_call(requests)

    async def get_histories_batch(self, addresses: List[str]) -> List[List[Dict[str, Any]]]:
        """
        Get transaction histories for multiple addresses in batch (faster!)
        
        Args:
            addresses: List of Bitcoin addresses
            
        Returns:
            List of histories in same order as addresses
        """
        requests = [
            ("blockchain.scripthash.get_history", [self._address_to_scripthash(addr)])
            for addr in addresses
        ]
        return await self._batch_call(requests)

    async def get_balances_batch(self, addresses: List[str]) -> List[Dict[str, int]]:
        """
        Get balances for multiple addresses in batch (faster!)
        
        Args:
            addresses: List of Bitcoin addresses
            
        Returns:
            List of balance dicts in same order as addresses
        """
        requests = [
            ("blockchain.scripthash.get_balance", [self._address_to_scripthash(addr)])
            for addr in addresses
        ]
        return await self._batch_call(requests)

    async def subscribe_headers(self, callback) -> None:
        """
        Subscribe to new block headers
        
        Args:
            callback: Async function to call with new headers
        """
        # Initial subscription
        header = await self._call("blockchain.headers.subscribe", [])
        await callback(header)

        # Listen for updates (this would need a separate connection/task in practice)
        logger.info("Subscribed to block headers")

    async def get_merkle(self, txid: str, height: int) -> Dict[str, Any]:
        """Get merkle proof for transaction"""
        return await self._call("blockchain.transaction.get_merkle", [txid, height])

    async def broadcast(self, raw_tx: str) -> str:
        """Broadcast raw transaction"""
        return await self._call("blockchain.transaction.broadcast", [raw_tx])

    @staticmethod
    def _address_to_scripthash(address: str) -> str:
        """
        Convert Bitcoin address to script hash for Electrum protocol
        
        The Electrum protocol uses script hashes instead of addresses.
        Script hash = sha256(scriptPubKey) reversed as hex
        """
        import hashlib
        import base58

        try:
            # Handle bech32 addresses (bc1...)
            if address.startswith('bc1'):
                # Decode bech32 address
                witver, witprog = ElectrumClient._decode_bech32(address)
                
                if witver == 0:  # Native SegWit
                    # P2WPKH or P2WSH
                    script_pubkey = bytes([witver, len(witprog)]) + witprog
                else:
                    raise ValueError(f"Unsupported witness version: {witver}")
            
            # Handle P2PKH addresses (1...)
            elif address.startswith('1'):
                decoded = base58.b58decode_check(address)
                pubkey_hash = decoded[1:]  # Skip version byte
                # OP_DUP OP_HASH160 <pubKeyHash> OP_EQUALVERIFY OP_CHECKSIG
                script_pubkey = bytes([0x76, 0xa9, 0x14]) + pubkey_hash + bytes([0x88, 0xac])
            
            # Handle P2SH addresses (3...)
            elif address.startswith('3'):
                decoded = base58.b58decode_check(address)
                script_hash = decoded[1:]  # Skip version byte
                # OP_HASH160 <scriptHash> OP_EQUAL
                script_pubkey = bytes([0xa9, 0x14]) + script_hash + bytes([0x87])
            
            else:
                raise ValueError(f"Unsupported address format: {address}")

            # Hash and reverse
            h = hashlib.sha256(script_pubkey).digest()
            script_hash = h[::-1].hex()

            return script_hash
        except Exception as e:
            logger.error(f"Failed to convert address to scripthash: {address}, error: {e}")
            raise ValueError(f"Invalid address: {address}")

    @staticmethod
    def _decode_bech32(address: str) -> tuple:
        """
        Decode bech32 address to witness version and program
        
        Returns: (witness_version, witness_program)
        """
        # Bech32 character set
        CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
        
        # Split HRP and data
        if '1' not in address:
            raise ValueError("Invalid bech32 address")
        
        hrp, data = address.rsplit('1', 1)
        
        # Decode data part
        decoded = []
        for c in data[:-6]:  # Exclude checksum
            if c not in CHARSET:
                raise ValueError(f"Invalid character in bech32: {c}")
            decoded.append(CHARSET.index(c))
        
        # Convert from 5-bit to 8-bit
        witness_version = decoded[0]
        
        # Convert rest to bytes
        bits = 0
        value = 0
        witness_program = []
        
        for d in decoded[1:]:
            value = (value << 5) | d
            bits += 5
            
            if bits >= 8:
                bits -= 8
                witness_program.append((value >> bits) & 0xff)
                value &= (1 << bits) - 1
        
        return witness_version, bytes(witness_program)

    @asynccontextmanager
    async def connection(self):
        """Context manager for automatic connection/disconnection"""
        try:
            await self.connect()
            yield self
        finally:
            await self.disconnect()


# Global client instance
_client: Optional[ElectrumClient] = None


def get_electrum_client() -> ElectrumClient:
    """Get or create global Electrum client instance"""
    # Don't use global client - create fresh for each request to avoid state issues
    from app.config import settings

    return ElectrumClient(
        host=settings.electrum_host,
        port=settings.electrum_port,
        use_ssl=settings.electrum_use_ssl,
    )

