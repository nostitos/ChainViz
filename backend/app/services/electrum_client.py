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
        timeout: int = 120,  # Increased from 30 to 120 seconds for large batch requests
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
            logger.error(f"❌ Failed to connect to primary Electrum server {self.host}:{self.port} (SSL={self.use_ssl}): {type(e).__name__}: {e}")
            
            # Try fallback server if configured
            from app.config import settings
            if hasattr(settings, 'electrum_fallback_host') and self.host != settings.electrum_fallback_host:
                logger.info(f"🔄 Trying fallback server: {settings.electrum_fallback_host}:{settings.electrum_fallback_port}")
                self.host = settings.electrum_fallback_host
                self.port = settings.electrum_fallback_port
                self.use_ssl = True  # Fallback server uses SSL
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
            request_str = json.dumps(request) + "\n"
            self.writer.write(request_str.encode())
            await self.writer.drain()

            # Read response - try reading until we get a newline
            try:
                response_bytes = await asyncio.wait_for(
                    self.reader.readuntil(b'\n'), timeout=self.timeout
                )
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
        
        # For large batches, chunk them to avoid timeout/memory issues and rate limiting
        CHUNK_SIZE = 50  # Reduced from 100 to lower Electrum server cost per batch
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
        Make a single batch request (internal helper) with retry logic
        """
        if not requests:
            return []

        MAX_RETRIES = 3
        RETRY_DELAYS = [0.5, 1.0, 2.0]  # Exponential backoff: 0.5s, 1s, 2s
        
        # Track results across retries
        results = [None] * len(requests)
        requests_to_retry = list(range(len(requests)))  # Indices of requests that need (re)trying
        
        for attempt in range(MAX_RETRIES):
            if not requests_to_retry:
                break  # All requests succeeded
            
            # Build batch for this attempt
            retry_requests = [requests[i] for i in requests_to_retry]
            
            async with self._lock:
                if not self.connected:
                    await self.connect()

                # Count request types for logging
                method_counts = {}
                for method, params in retry_requests:
                    method_counts[method] = method_counts.get(method, 0) + 1
                
                # Log batch summary
                method_summary = ", ".join([f"{method}({count})" for method, count in sorted(method_counts.items())])
                if attempt == 0:
                    logger.info(f"📡 Batch RPC attempt 1/{MAX_RETRIES}: {len(retry_requests)} requests [{method_summary}]")
                else:
                    logger.info(f"🔄 Retrying {len(retry_requests)} failed requests (attempt {attempt + 1}/{MAX_RETRIES}, delay {RETRY_DELAYS[attempt - 1]}s)")
                    await asyncio.sleep(RETRY_DELAYS[attempt - 1])  # Wait before retry

                # Build batch request - track request ID to index mapping
                batch_request = []
                request_id_to_idx = {}  # Map request ID to original index
                for idx_in_batch, idx_in_original in enumerate(requests_to_retry):
                    method, params = retry_requests[idx_in_batch]
                    self.request_id += 1
                    request_id_to_idx[self.request_id] = idx_in_original
                    batch_request.append({
                        "jsonrpc": "2.0",
                        "id": self.request_id,
                        "method": method,
                        "params": params,
                    })

                try:
                    # Send batch request
                    request_str = json.dumps(batch_request) + "\n"
                    self.writer.write(request_str.encode())
                    await self.writer.drain()

                    # Read batch response
                    response_str = await asyncio.wait_for(
                        self.reader.readline(), timeout=self.timeout
                    )
                    responses = json.loads(response_str.decode())
                    
                    # Handle case where responses are strings (double-encoded JSON)
                    if len(responses) > 0 and isinstance(responses[0], str):
                        try:
                            decoded_responses = []
                            for resp in responses:
                                if isinstance(resp, str):
                                    decoded_responses.extend(json.loads(resp))
                                else:
                                    decoded_responses.append(resp)
                            responses = decoded_responses
                        except Exception as e:
                            logger.error(f"Failed to decode double-encoded responses: {e}")

                    # Process responses - MATCH BY ID, NOT BY ORDER!
                    succeeded_count = 0
                    failed_indices = []
                    processed_ids = set()
                    
                    for response in responses:
                        if not isinstance(response, dict):
                            logger.warning(f"Unexpected response type: {type(response)}")
                            continue
                        
                        # Get the response ID to match it back to the request
                        response_id = response.get("id")
                        if response_id is None:
                            logger.warning(f"Response missing 'id' field: {response}")
                            continue
                        
                        # Find the original index for this request ID
                        if response_id not in request_id_to_idx:
                            logger.warning(f"Received response for unknown request ID {response_id}")
                            continue
                        
                        original_idx = request_id_to_idx[response_id]
                        processed_ids.add(response_id)
                        
                        if "error" in response:
                            error_msg = str(response['error'])
                            # Detect rate limiting errors
                            if 'cost' in error_msg.lower() or 'limit' in error_msg.lower() or 'killing batch' in error_msg.lower():
                                logger.error(f"⚠️ RATE LIMIT DETECTED: {error_msg}")
                                logger.error(f"💡 Suggestion: Your Electrum server is rate limiting requests.")
                                logger.error(f"   - Increase server's cost limit (currently exceeded)")
                                logger.error(f"   - Reduce 'Max Outputs/Transactions' in UI settings")
                                logger.error(f"   - Wait a few seconds before retrying")
                            else:
                                logger.debug(f"Batch item {original_idx} error: {response['error']}")
                            failed_indices.append(original_idx)
                        else:
                            result = response.get("result")
                            # Check if result is None - treat as failure and retry
                            if result is None:
                                logger.debug(f"Batch item {original_idx} returned null result - will retry")
                                failed_indices.append(original_idx)
                            else:
                                results[original_idx] = result
                                succeeded_count += 1
                    
                    # Mark requests that got no response as failed
                    for request_id, original_idx in request_id_to_idx.items():
                        if request_id not in processed_ids:
                            logger.debug(f"Request ID {request_id} (index {original_idx}) got no response")
                            failed_indices.append(original_idx)
                    
                    # Log attempt results
                    logger.info(f"  ✅ Attempt {attempt + 1}: {succeeded_count} succeeded, {len(failed_indices)} failed")
                    
                    # Update requests to retry
                    requests_to_retry = failed_indices
                    
                except Exception as e:
                    logger.error(f"  ❌ Batch RPC attempt {attempt + 1} failed completely: {type(e).__name__}: {e}")
                    # All requests in this batch failed - will retry all of them
                    if attempt == MAX_RETRIES - 1:
                        # Final attempt failed - mark all as None
                        for idx in requests_to_retry:
                            results[idx] = None
        
        # Final summary
        success_count = sum(1 for r in results if r is not None)
        fail_count = len(results) - success_count
        if fail_count > 0:
            logger.warning(f"🔴 After {MAX_RETRIES} attempts: {success_count} succeeded, {fail_count} FAILED")
            
            # Provide helpful guidance based on failure rate
            failure_rate = fail_count / len(results)
            if failure_rate > 0.5:  # More than 50% failed
                logger.error(f"⚠️ HIGH FAILURE RATE ({failure_rate:.0%}):")
                logger.error(f"   This is likely due to Electrum server rate limiting.")
                logger.error(f"   Your server's cost limit may be too low for large batch requests.")
                logger.error(f"   ")
                logger.error(f"   Solutions:")
                logger.error(f"   1. Increase Fulcrum cost limit: max_batch_cost in fulcrum.conf")
                logger.error(f"      (Current recommended value: 50,000,000 or higher)")
                logger.error(f"   2. Reduce batch size in UI: Lower 'Max Outputs' setting to 100-200")
                logger.error(f"   3. Wait 10-30 seconds before retrying the same transaction")
            
            # Log first 5 failed request params for debugging
            failed_params = []
            for i, result in enumerate(results):
                if result is None and len(failed_params) < 5:
                    method, params = requests[i]
                    if method == "blockchain.transaction.get" and params:
                        failed_params.append(f"{params[0][:16]}...")
            if failed_params:
                logger.warning(f"   Failed TXIDs (first 5): {', '.join(failed_params)}")
        else:
            logger.info(f"✅ All {success_count} requests succeeded")

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
                # Decode bech32/bech32m address
                witver, witprog = ElectrumClient._decode_bech32(address)
                
                if witver == 0:  # Native SegWit (P2WPKH or P2WSH)
                    # P2WPKH or P2WSH
                    script_pubkey = bytes([witver, len(witprog)]) + witprog
                elif witver == 1:  # Taproot (P2TR)
                    # P2TR uses OP_1 (0x51) + 32-byte x-only pubkey
                    script_pubkey = bytes([0x51, 0x20]) + witprog
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
        Decode bech32/bech32m address to witness version and program
        
        Returns: (witness_version, witness_program)
        """
        try:
            # Use python-bitcoinlib (already in requirements.txt)
            from bitcoin.segwit_addr import decode
            
            # decode returns (witver, witprog) or (None, None) on failure
            witver, witprog = decode('bc', address)
            if witver is None:
                raise ValueError(f"Failed to decode bech32 address: {address}")
            
            return witver, bytes(witprog)
        except ImportError:
            # Fallback: manual decoding (basic bech32 only)
            logger.warning("python-bitcoinlib not available, using manual bech32 decode")
            CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
            if '1' not in address:
                raise ValueError("Invalid bech32 address")
            
            hrp, data = address.rsplit('1', 1)
            if hrp != 'bc':
                raise ValueError(f"Invalid hrp: {hrp}, expected 'bc'")
            
            # Decode data part (exclude 6-char checksum)
            decoded = []
            for c in data[:-6]:
                if c not in CHARSET:
                    raise ValueError(f"Invalid character in bech32: {c}")
                decoded.append(CHARSET.index(c))
            
            if len(decoded) < 1:
                raise ValueError("Empty data")
            
            witness_version = decoded[0]
            
            # Convert from 5-bit groups to 8-bit bytes
            bits = 0
            value = 0
            witness_program = []
            for d in decoded[1:]:
                value = (value << 5) | d
                bits += 5
                if bits >= 8:
                    bits -= 8
                    witness_program.append((value >> bits) & 0xff)
            
            # Padding check
            if bits >= 5 or value & ((1 << bits) - 1):
                raise ValueError("Invalid padding in bech32 data")
            
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

