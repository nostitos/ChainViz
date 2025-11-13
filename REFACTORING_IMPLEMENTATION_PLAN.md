# ChainViz Backend Refactoring - Implementation Plan

## Phase 1: Extract Core Utilities (Week 1)

### Objective
Eliminate code duplication and create reusable utility modules that can be shared across the codebase.

### Step 1.1: Create Core Utilities Directory Structure

```bash
mkdir -p backend/app/core
touch backend/app/core/__init__.py
```

### Step 1.2: Extract Address Utilities

**File**: `backend/app/core/address_utils.py`

**Extract from**:
- `electrum_client.py`: `_address_to_scripthash()`, `_decode_bech32()`
- `blockchain_data.py`: `_extract_pubkey_from_p2pk_script()`, `_extract_address_from_script_sig()`

**Implementation**:
```python
"""
Bitcoin address utility functions for script hash conversion and address parsing.
"""

import hashlib
import base58
import logging
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

# Constants for bech32 decoding
CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
BECH32_CONST = 1
BECH32M_CONST = 0x2BC830A3

def address_to_scripthash(address: str) -> str:
    """
    Convert Bitcoin address to script hash for Electrum protocol.
    
    The Electrum protocol uses script hashes instead of addresses.
    Script hash = sha256(scriptPubKey) reversed as hex.
    
    Args:
        address: Bitcoin address (P2PKH, P2SH, P2WPKH, P2WSH, P2TR)
        
    Returns:
        Script hash as hex string
        
    Raises:
        ValueError: If address format is invalid
    """
    try:
        # Handle bech32 addresses (bc1...)
        if address.startswith('bc1'):
            return _bech32_address_to_scripthash(address)
            
        # Handle P2PKH addresses (1...)
        elif address.startswith('1'):
            return _p2pkh_address_to_scripthash(address)
            
        # Handle P2SH addresses (3...)
        elif address.startswith('3'):
            return _p2sh_address_to_scripthash(address)
            
        else:
            raise ValueError(f"Unsupported address format: {address}")

    except Exception as e:
        logger.error(f"Failed to convert address to scripthash: {address}, error: {e}")
        raise ValueError(f"Invalid address: {address}")

def _bech32_address_to_scripthash(address: str) -> str:
    """Convert bech32 address to script hash."""
    witver, witprog = decode_bech32(address)
    
    if witver == 0:  # Native SegWit (P2WPKH or P2WSH)
        script_pubkey = bytes([witver, len(witprog)]) + witprog
    elif witver == 1:  # Taproot (P2TR)
        script_pubkey = bytes([0x51, 0x20]) + witprog
    else:
        raise ValueError(f"Unsupported witness version: {witver}")
    
    # Hash and reverse
    h = hashlib.sha256(script_pubkey).digest()
    return h[::-1].hex()

def _p2pkh_address_to_scripthash(address: str) -> str:
    """Convert P2PKH address to script hash."""
    decoded = base58.b58decode_check(address)
    pubkey_hash = decoded[1:]  # Skip version byte
    
    # OP_DUP OP_HASH160 <pubKeyHash> OP_EQUALVERIFY OP_CHECKSIG
    script_pubkey = bytes([0x76, 0xa9, 0x14]) + pubkey_hash + bytes([0x88, 0xac])
    
    # Hash and reverse
    h = hashlib.sha256(script_pubkey).digest()
    return h[::-1].hex()

def _p2sh_address_to_scripthash(address: str) -> str:
    """Convert P2SH address to script hash."""
    decoded = base58.b58decode_check(address)
    script_hash = decoded[1:]  # Skip version byte
    
    # OP_HASH160 <scriptHash> OP_EQUAL
    script_pubkey = bytes([0xa9, 0x14]) + script_hash + bytes([0x87])
    
    # Hash and reverse
    h = hashlib.sha256(script_pubkey).digest()
    return h[::-1].hex()

def decode_bech32(address: str) -> Tuple[int, bytes]:
    """
    Decode bech32/bech32m address to witness version and program.
    
    Args:
        address: Bech32 address starting with 'bc1'
        
    Returns:
        Tuple of (witness_version, witness_program)
        
    Raises:
        ValueError: If address is invalid
    """
    if not address or (address.lower() != address and address.upper() != address):
        raise ValueError("Invalid bech32 casing")

    bech = address.lower()
    if "1" not in bech:
        raise ValueError("Invalid bech32 address")

    hrp, data_part = bech.rsplit("1", 1)
    if hrp != "bc":
        raise ValueError(f"Invalid hrp: {hrp}, expected 'bc'")

    if len(data_part) < 7:
        raise ValueError("Invalid bech32 data length")

    data = []
    for char in data_part:
        if char not in CHARSET:
            raise ValueError(f"Invalid character in bech32: {char}")
        data.append(CHARSET.index(char))

    payload, checksum = data[:-6], data[-6:]
    if not payload:
        raise ValueError("Empty bech32 payload")

    witness_version = payload[0]
    if witness_version < 0 or witness_version > 16:
        raise ValueError(f"Invalid witness version: {witness_version}")

    # Verify checksum
    if _verify_checksum(hrp, payload + checksum, BECH32_CONST):
        checksum_const = BECH32_CONST
    elif _verify_checksum(hrp, payload + checksum, BECH32M_CONST):
        checksum_const = BECH32M_CONST
    else:
        raise ValueError("Invalid bech32 checksum")

    if witness_version == 0 and checksum_const != BECH32_CONST:
        raise ValueError("Invalid checksum for witness version 0")
    if witness_version > 0 and checksum_const != BECH32M_CONST:
        raise ValueError("Invalid checksum for witness version >=1 (bech32m expected)")

    program = _convert_bits(payload[1:], 5, 8)
    if len(program) < 2 or len(program) > 40:
        raise ValueError("Invalid witness program length")

    if witness_version == 0 and len(program) not in (20, 32):
        raise ValueError("Invalid witness program length for v0 address")

    return witness_version, bytes(program)

def _verify_checksum(hrp: str, data: list, const: int) -> bool:
    """Verify bech32 checksum."""
    return _polymod(_hrp_expand(hrp) + data) == const

def _polymod(values: list) -> int:
    """Bech32 polymod calculation."""
    generator = [0x3B6A57B2, 0x26508E6D, 0x1EA119FA, 0x3D4233DD, 0x2A1462B3]
    chk = 1
    for value in values:
        top = chk >> 25
        chk = ((chk & 0x1FFFFFF) << 5) ^ value
        for i in range(5):
            if (top >> i) & 1:
                chk ^= generator[i]
    return chk

def _hrp_expand(hrp: str) -> list:
    """Expand HRP for checksum calculation."""
    return [ord(x) >> 5 for x in hrp] + [0] + [ord(x) & 31 for x in hrp]

def _convert_bits(data: list, from_bits: int, to_bits: int) -> list:
    """Convert data from one bit width to another."""
    acc = 0
    bits = 0
    ret = []
    maxv = (1 << to_bits) - 1
    for value in data:
        if value < 0 or value >= (1 << from_bits):
            raise ValueError("Invalid value in bech32 data")
        acc = (acc << from_bits) | value
        bits += from_bits
        while bits >= to_bits:
            bits -= to_bits
            ret.append((acc >> bits) & maxv)
    if bits >= from_bits or (acc << (to_bits - bits)) & maxv:
        raise ValueError("Invalid padding in bech32 data")
    return ret

def extract_pubkey_from_p2pk_script(script_pubkey_hex: str) -> Optional[str]:
    """
    Extract public key from P2PK scriptPubKey.
    
    P2PK format: <pubkey> OP_CHECKSIG
    The pubkey is 33 bytes (compressed) or 65 bytes (uncompressed)
    
    Args:
        script_pubkey_hex: Hex-encoded scriptPubKey
        
    Returns:
        Public key as hex string, or None if not P2PK
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

def extract_address_from_script_sig(script_sig: str) -> Optional[str]:
    """
    Extract Bitcoin address from script_sig for P2PKH transactions.
    
    P2PKH script_sig format: <sig> <pubkey>
    We extract the pubkey (last 33 bytes for compressed, 65 for uncompressed) 
    and derive the address.
    
    Args:
        script_sig: Hex-encoded script signature
        
    Returns:
        Bitcoin address, or None if extraction fails
    """
    if not script_sig:
        return None
    
    try:
        import hashlib
        import base58
        
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
```

### Step 1.3: Create Batch Processing Utilities

**File**: `backend/app/core/batch_utils.py`

```python
"""
Batch processing utilities for efficient data fetching and processing.
"""

from typing import Iterable, List, Tuple, Dict, TypeVar, Callable
from collections import deque

T = TypeVar('T')
K = TypeVar('K')

def deduplicate_preserve_order(items: Iterable[T]) -> Tuple[List[T], List[Tuple[int, int]]]:
    """
    Deduplicate iterable while preserving original ordering and tracking 
    the mapping back to the source indices.
    
    Args:
        items: Iterable of items to deduplicate
        
    Returns:
        Tuple of (unique_items, index_mapping)
        - unique_items: List of unique items in original order
        - index_mapping: List of (original_index, unique_index) tuples
    """
    seen: Dict[T, int] = {}
    unique: List[T] = []
    index_map: List[Tuple[int, int]] = []

    for i, item in enumerate(items):
        if item not in seen:
            seen[item] = len(unique)
            unique.append(item)
        index_map.append((i, seen[item]))

    return unique, index_map

def chunk_list(items: List[T], chunk_size: int) -> List[List[T]]:
    """
    Split list into chunks of specified size.
    
    Args:
        items: List to chunk
        chunk_size: Maximum size of each chunk
        
    Returns:
        List of chunks
    """
    return [items[i:i + chunk_size] for i in range(0, len(items), chunk_size)]

def calculate_optimal_chunk_size(total_items: int, max_chunk_size: int, 
                               min_chunks: int = 2) -> int:
    """
    Calculate optimal chunk size for parallel processing.
    
    Args:
        total_items: Total number of items to process
        max_chunk_size: Maximum allowed chunk size
        min_chunks: Minimum number of chunks desired
        
    Returns:
        Optimal chunk size
    """
    if total_items <= max_chunk_size:
        return total_items
    
    # Aim for at least min_chunks chunks, but don't exceed max_chunk_size
    chunk_size = max(1, total_items // min_chunks)
    return min(chunk_size, max_chunk_size)

class BatchProcessor:
    """
    Helper class for managing batch operations with progress tracking.
    """
    
    def __init__(self, name: str, total_items: int):
        self.name = name
        self.total_items = total_items
        self.processed = 0
        self.successful = 0
        self.failed = 0
    
    def update(self, success: bool = True):
        """Update progress counters."""
        self.processed += 1
        if success:
            self.successful += 1
        else:
            self.failed += 1
    
    @property
    def progress(self) -> float:
        """Get progress as percentage."""
        return (self.processed / self.total_items) * 100 if self.total_items > 0 else 0
    
    @property
    def success_rate(self) -> float:
        """Get success rate as percentage."""
        return (self.successful / self.processed) * 100 if self.processed > 0 else 0
    
    def get_stats(self) -> Dict[str, int]:
        """Get processing statistics."""
        return {
            "total": self.total_items,
            "processed": self.processed,
            "successful": self.successful,
            "failed": self.failed,
            "remaining": self.total_items - self.processed
        }
```

### Step 1.4: Update Existing Code to Use Utilities

**Files to update**:
1. `electrum_client.py` - Use address_utils instead of local functions
2. `electrum_multiplexer.py` - Use address_utils 
3. `blockchain_data.py` - Use address_utils and batch_utils
4. `trace.py` - Use address_utils

**Example update for electrum_client.py**:
```python
# Remove these functions:
# - _address_to_scripthash()
# - _decode_bech32()
# - _polymod()
# - _hrp_expand()
# - _convert_bits()

# Add import:
from app.core.address_utils import address_to_scripthash, decode_bech32

# Update calls:
# _address_to_scripthash(address) -> address_to_scripthash(address)
# _decode_bech32(address) -> decode_bech32(address)
```

## Phase 2: Break Down Large Files (Week 2)

### Step 2.1: Refactor trace.py (820 lines → ~150 lines)

**Extract these components**:

1. **Create `app/services/trace_service.py`** (Business logic)
   - UTXO tracing logic
   - Graph building
   - Heuristic application

2. **Create `app/core/graph_builder.py`** (Graph construction)
   - Node creation
   - Edge creation
   - Graph utilities

3. **Create `app/core/heuristic_applier.py`** (Heuristic logic)
   - Change detection application
   - CoinJoin detection
   - Peel chain analysis

**New trace.py structure**:
```python
"""UTXO tracing API endpoints"""

from fastapi import APIRouter, HTTPException, Depends
from app.models.api import TraceUTXORequest, TraceGraphResponse
from app.services.trace_service import TraceService
from app.core.dependencies import get_trace_service

router = APIRouter()

@router.post("/utxo", response_model=TraceGraphResponse)
async def trace_utxo(
    request: TraceUTXORequest,
    trace_service: TraceService = Depends(get_trace_service),
):
    """Trace a UTXO backward and forward through transaction history."""
    try:
        return await trace_service.trace_utxo(
            txid=request.txid,
            vout=request.vout,
            hops_before=request.hops_before,
            hops_after=request.hops_after,
            max_addresses_per_tx=request.max_addresses_per_tx,
            include_coinjoin=request.include_coinjoin,
            confidence_threshold=request.confidence_threshold,
        )
    except Exception as e:
        logger.error(f"Failed to trace UTXO: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to trace UTXO: {str(e)}")
```

### Step 2.2: Refactor blockchain_data.py (653 lines)

**Extract components**:

1. **Create `app/services/transaction_service.py`**
   - Transaction fetching
   - Transaction parsing
   - Cache management

2. **Create `app/services/address_service.py`**
   - Address history
   - Address info
   - Balance fetching

3. **Create `app/dal/parsers/transaction_parser.py`**
   - Mempool transaction parsing
   - Electrum transaction parsing
   - Script type detection

## Phase 3: Implement Dependency Injection (Week 3)

### Step 3.1: Create Dependency Container

**File**: `app/core/dependencies.py`

```python
"""
Dependency injection container for the application.
"""

from functools import lru_cache
from app.core.config import Settings
from app.dal.electrum.multiplexer import ElectrumMultiplexer
from app.dal.mempool.multiplexer import MempoolDataSource
from app.dal.cache.redis_client import RedisClient
from app.services.transaction_service import TransactionService
from app.services.address_service import AddressService
from app.services.trace_service import TraceService

@lru_cache()
def get_settings() -> Settings:
    """Get application settings."""
    return Settings()

@lru_cache()
def get_electrum_client() -> ElectrumMultiplexer:
    """Get Electrum client instance."""
    settings = get_settings()
    return ElectrumMultiplexer(
        pool_size=settings.electrum_pool_size,
        pool_min_size=settings.electrum_pool_min_size,
        health_check_interval=settings.electrum_health_check_interval,
        request_timeout=settings.electrum_request_timeout,
        max_retries=settings.electrum_max_retries,
    )

@lru_cache()
def get_mempool_client() -> MempoolDataSource:
    """Get Mempool client instance."""
    return MempoolDataSource()

@lru_cache()
def get_redis_client() -> RedisClient:
    """Get Redis client instance."""
    settings = get_settings()
    return RedisClient(
        host=settings.redis_host,
        port=settings.redis_port,
        db=settings.redis_db,
        password=settings.redis_password,
    )

@lru_cache()
def get_transaction_service() -> TransactionService:
    """Get transaction service instance."""
    return TransactionService(
        electrum_client=get_electrum_client(),
        mempool_client=get_mempool_client(),
        redis_client=get_redis_client(),
    )

@lru_cache()
def get_address_service() -> AddressService:
    """Get address service instance."""
    return AddressService(
        electrum_client=get_electrum_client(),
        redis_client=get_redis_client(),
    )

@lru_cache()
def get_trace_service() -> TraceService:
    """Get trace service instance."""
    return TraceService(
        transaction_service=get_transaction_service(),
        address_service=get_address_service(),
    )
```

### Step 3.2: Update API Endpoints to Use Dependencies

**Example for transaction.py**:
```python
from fastapi import APIRouter, HTTPException, Depends
from app.models.api import TransactionResponse
from app.services.transaction_service import TransactionService
from app.core.dependencies import get_transaction_service

router = APIRouter()

@router.get("/{txid}", response_model=TransactionResponse)
async def get_transaction(
    txid: str,
    transaction_service: TransactionService = Depends(get_transaction_service),
):
    """Get transaction details with heuristic analysis."""
    try:
        transaction = await transaction_service.get_transaction(txid)
        return TransactionResponse(
            transaction=transaction,
            change_output=transaction.change_output,
            change_confidence=transaction.change_confidence,
            coinjoin_info=transaction.coinjoin_info,
            fee_rate=transaction.fee_rate,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

## Phase 4: Standardize Error Handling (Week 3-4)

### Step 4.1: Create Custom Exceptions

**File**: `app/core/exceptions.py`

```python
"""
Custom exceptions for the ChainViz application.
"""

class ChainVizException(Exception):
    """Base exception for all ChainViz errors."""
    pass

class ElectrumError(ChainVizException):
    """Electrum server related errors."""
    pass

class MempoolError(ChainVizException):
    """Mempool.space API related errors."""
    pass

class CacheError(ChainVizException):
    """Redis cache related errors."""
    pass

class TransactionNotFoundError(ChainVizException):
    """Transaction not found error."""
    pass

class AddressNotFoundError(ChainVizException):
    """Address not found error."""
    pass

class InvalidAddressError(ChainVizException):
    """Invalid Bitcoin address error."""
    pass

class RateLimitError(ChainVizException):
    """Rate limit exceeded error."""
    pass
```

### Step 4.2: Create Error Handling Middleware

**File**: `app/core/error_handlers.py`

```python
"""
Global error handlers for the FastAPI application.
"""

from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from app.core.exceptions import (
    ChainVizException,
    TransactionNotFoundError,
    AddressNotFoundError,
    InvalidAddressError,
    RateLimitError,
)

async def chainviz_exception_handler(request: Request, exc: ChainVizException):
    """Handle ChainViz-specific exceptions."""
    if isinstance(exc, TransactionNotFoundError):
        return JSONResponse(
            status_code=404,
            content={"detail": f"Transaction not found: {str(exc)}"}
        )
    elif isinstance(exc, AddressNotFoundError):
        return JSONResponse(
            status_code=404,
            content={"detail": f"Address not found: {str(exc)}"}
        )
    elif isinstance(exc, InvalidAddressError):
        return JSONResponse(
            status_code=400,
            content={"detail": f"Invalid address: {str(exc)}"}
        )
    elif isinstance(exc, RateLimitError):
        return JSONResponse(
            status_code=429,
            content={"detail": "Rate limit exceeded", "retry_after": 60}
        )
    else:
        return JSONResponse(
            status_code=500,
            content={"detail": f"Internal error: {str(exc)}"}
        )

async def general_exception_handler(request: Request, exc: Exception):
    """Handle unexpected exceptions."""
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected error occurred"}
    )
```

## Phase 5: Testing Infrastructure (Week 4)

### Step 5.1: Create Test Directory Structure

```bash
mkdir -p backend/tests/unit/core
mkdir -p backend/tests/unit/dal
mkdir -p backend/tests/unit/services
mkdir -p backend/tests/integration/api
mkdir -p backend/tests/fixtures
```

### Step 5.2: Create Test Fixtures

**File**: `tests/fixtures/transactions.py`

```python
"""
Test fixtures for transactions.
"""

import pytest
from app.models.blockchain import Transaction, TransactionInput, TransactionOutput

@pytest.fixture
def sample_transaction():
    """Sample transaction for testing."""
    return Transaction(
        txid="sample_txid_123",
        version=1,
        locktime=0,
        size=250,
        vsize=250,
        weight=1000,
        fee=1000,
        inputs=[
            TransactionInput(
                txid="prev_txid_1",
                vout=0,
                script_sig="",
                sequence=0xFFFFFFFF,
                witness=[],
                address="1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
                value=50000
            )
        ],
        outputs=[
            TransactionOutput(
                n=0,
                value=40000,
                script_pubkey="",
                address="1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2",
                script_type="p2pkh"
            ),
            TransactionOutput(
                n=1,
                value=9000,
                script_pubkey="",
                address="1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
                script_type="p2pkh"
            )
        ],
        block_height=700000,
        block_hash="0000000000000000000abc123",
        timestamp=1635724800,
        confirmations=100
    )
```

### Step 5.3: Create Unit Tests for Core Utilities

**File**: `tests/unit/core/test_address_utils.py`

```python
"""
Unit tests for address utilities.
"""

import pytest
from app.core.address_utils import (
    address_to_scripthash,
    decode_bech32,
    extract_pubkey_from_p2pk_script,
    extract_address_from_script_sig,
)
from app.core.exceptions import InvalidAddressError

class TestAddressToScripthash:
    """Test address to script hash conversion."""
    
    def test_p2pkh_address(self):
        """Test P2PKH address conversion."""
        address = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"
        scripthash = address_to_scripthash(address)
        assert len(scripthash) == 64
        assert scripthash == "6191c3b590bfcfa5475c9df739d907888e2ea6a7b8f1f8c5857b8c734d103286"
    
    def test_p2sh_address(self):
        """Test P2SH address conversion."""
        address = "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy"
        scripthash = address_to_scripthash(address)
        assert len(scripthash) == 64
    
    def test_p2wpkh_address(self):
        """Test P2WPKH address conversion."""
        address = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"
        scripthash = address_to_scripthash(address)
        assert len(scripthash) == 64
    
    def test_invalid_address(self):
        """Test invalid address raises exception."""
        with pytest.raises(InvalidAddressError):
            address_to_scripthash("invalid_address")
```

## Migration Strategy

### Step-by-Step Migration

1. **Week 1**: Create core utilities, update imports gradually
2. **Week 2**: Break down large files, create service layer
3. **Week 3**: Implement dependency injection, standardize error handling
4. **Week 4**: Add tests, documentation, and perform integration testing

### Backward Compatibility

- Maintain existing API contracts
- Use compatibility imports in old locations
- Gradual migration with feature flags if needed
- Comprehensive testing before deployment

### Rollback Plan

- Keep git tags for each phase
- Maintain backward-compatible imports
- Test thoroughly in staging environment
- Monitor performance metrics during rollout

## Success Metrics

- **Code Quality**: 50% reduction in code duplication (measured with tools like `radon`)
- **Test Coverage**: 80%+ coverage on new code
- **Performance**: No performance regression (benchmark before/after)
- **Maintainability**: 30% reduction in average file size
- **Developer Experience**: Faster onboarding, easier debugging

## Timeline Summary

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| Phase 1: Core Utilities | 1 week | address_utils.py, batch_utils.py, crypto_utils.py |
| Phase 2: File Breakdown | 1 week | trace_service.py, transaction_service.py, address_service.py |
| Phase 3: Dependency Injection | 1 week | dependencies.py, updated API endpoints |
| Phase 4: Error Handling | 3-4 days | exceptions.py, error_handlers.py |
| Phase 5: Testing | 3-4 days | Test suite, fixtures, CI integration |
| **Total** | **3-4 weeks** | **Clean, maintainable codebase** |

This implementation plan provides a clear roadmap for refactoring the ChainViz backend while maintaining functionality and improving code quality.