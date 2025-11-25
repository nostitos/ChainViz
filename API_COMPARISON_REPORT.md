# Mempool.space vs Electrum Server API Response Comparison Report

## Executive Summary

This report analyzes the key differences between mempool.space API and Electrum server API responses for transaction and address lookups, based on the ChainViz backend implementation.

## Overview

The ChainViz backend uses a **three-tier data fetching strategy**:
1. **Mempool.space API** (primary) - HTTP REST API with rich transaction data
2. **Electrum Servers** (fallback) - JSON-RPC protocol with basic transaction data
3. **Local Cache** (Redis) - Cached responses for performance

## Transaction Lookup Comparison

### Mempool.space API Response Structure

**Endpoint**: `GET /tx/{txid}`

**Key Characteristics**:
- **Rich input data**: Includes `vin[].prevout` with pre-populated address and value
- **Complete metadata**: Fee, weight, size, status (confirmed/unconfirmed)
- **Consistent format**: Standardized across all transaction types
- **No additional fetching needed**: All input addresses/values are included

**Example Response Structure**:
```json
{
  "txid": "abc123...",
  "version": 1,
  "locktime": 0,
  "vin": [
    {
      "txid": "prev_txid...",
      "vout": 0,
      "prevout": {
        "scriptpubkey_address": "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
        "value": 500000000
      }
    }
  ],
  "vout": [
    {
      "scriptpubkey_address": "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2",
      "value": 400000000
    }
  ],
  "fee": 100000000,
  "status": {
    "confirmed": true,
    "block_height": 700000,
    "block_hash": "000000...",
    "block_time": 1635724800
  }
}
```

**Advantages**:
- ✅ **Single request**: No need to fetch previous transactions
- ✅ **Accurate data**: Pre-computed by mempool.space infrastructure
- ✅ **Consistent format**: Same structure for all transactions
- ✅ **Better performance**: 1 HTTP request vs multiple Electrum calls
- ✅ **Includes prevout data**: Input addresses and values pre-populated

**Disadvantages**:
- ❌ **Rate limiting**: Public API has strict rate limits
- ❌ **Availability**: Depends on external service uptime
- ❌ **Privacy**: Requests go to centralized service

### Electrum Server API Response Structure

**Method**: `blockchain.transaction.get(txid, verbose=true)`

**Key Characteristics**:
- **Basic transaction data**: Raw transaction structure
- **No input metadata**: Missing input addresses and values
- **Inconsistent value format**: Sometimes BTC (float), sometimes satoshis
- **Requires additional fetching**: Must fetch previous transactions for input data

**Example Response Structure**:
```json
{
  "hex": "0200000001...",
  "txid": "abc123...",
  "version": 1,
  "locktime": 0,
  "vin": [
    {
      "txid": "prev_txid...",
      "vout": 0,
      "scriptSig": {
        "asm": "304502...",
        "hex": "4830450221..."
      },
      "sequence": 4294967295
    }
  ],
  "vout": [
    {
      "value": 4.0,  // NOTE: In BTC, not satoshis!
      "n": 0,
      "scriptPubKey": {
        "asm": "OP_DUP OP_HASH160... OP_EQUALVERIFY OP_CHECKSIG",
        "hex": "76a914...88ac",
        "address": "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2"
      }
    }
  ],
  "blockhash": "000000...",
  "confirmations": 100,
  "blocktime": 1635724800
}
```

**Critical Differences**:
1. **Value Format**: Electrum returns BTC (float) for outputs, mempool.space returns satoshis (int)
2. **Missing Input Data**: Electrum doesn't include `prevout` with address/value
3. **No Fee Field**: Must calculate fee manually by fetching previous transactions
4. **Inconsistent Types**: Value can be int or float in Electrum responses

**Advantages**:
- ✅ **Decentralized**: Can use multiple Electrum servers
- ✅ **No rate limiting** (self-hosted): Control your own infrastructure
- ✅ **Privacy**: Direct connection to Bitcoin network
- ✅ **Batch support**: Can batch multiple requests efficiently

**Disadvantages**:
- ❌ **Incomplete data**: Missing critical input information
- ❌ **Multiple requests needed**: Must fetch previous transactions
- ❌ **Inconsistent format**: Different Electrum implementations vary
- ❌ **Complex parsing**: Must handle various edge cases

## Address Lookup Comparison

### Mempool.space API Response Structure

**Endpoint**: `GET /address/{address}/txs`

**Key Characteristics**:
- **Complete transaction list**: All transactions for an address
- **Pagination support**: Can fetch large histories efficiently
- **Rich transaction data**: Full transaction details included
- **Chain vs mempool separation**: Separate stats for confirmed/unconfirmed

**Example Response Structure**:
```json
[
  {
    "txid": "txid1...",
    "status": {"confirmed": true, "block_height": 700000},
    "vin": [...],
    "vout": [...]
  },
  {
    "txid": "txid2...",
    "status": {"confirmed": false},
    "vin": [...],
    "vout": [...]
  }
]
```

**Advantages**:
- ✅ **Single endpoint**: Get all transactions in one call
- ✅ **Pagination**: Efficient for addresses with thousands of transactions
- ✅ **Complete data**: Full transaction details included
- ✅ **Performance**: Optimized for address lookups

### Electrum Server API Response Structure

**Method**: `blockchain.scripthash.get_history(scripthash)`

**Key Characteristics**:
- **Basic history**: Only transaction IDs and heights
- **No transaction details**: Must fetch each transaction separately
- **Script hash based**: Requires address-to-scripthash conversion
- **Limited metadata**: Only tx_hash, height, and fee

**Example Response Structure**:
```json
[
  {
    "tx_hash": "txid1...",
    "height": 700000,
    "fee": 1000
  },
  {
    "tx_hash": "txid2...",
    "height": 0,  // 0 = unconfirmed, -1 = in mempool
    "fee": 500
  }
]
```

**Critical Differences**:
1. **Data Richness**: Mempool.space returns full transactions, Electrum returns only metadata
2. **Address Format**: Electrum uses script hashes, requires conversion
3. **Fetching Strategy**: Electrum requires N+1 queries (1 for history + N for transactions)
4. **Efficiency**: Mempool.space is O(1) vs Electrum O(N) for address lookups

## Implementation Differences in ChainViz

### Transaction Parsing Logic

The codebase contains **two separate parsing functions**:

1. **`_parse_mempool_transaction()`** (lines 547-613 in blockchain_data.py)
   - Handles mempool.space format with `prevout` data
   - Direct access to input addresses and values
   - Simpler logic, fewer edge cases

2. **`_parse_transaction()`** (lines 615-712 in blockchain_data.py)
   - Handles Electrum format without `prevout`
   - Must extract addresses from scriptSig (complex)
   - Handles inconsistent value formats (BTC vs satoshis)
   - More error-prone due to missing data

### Data Fetching Strategy

**Mempool.space Path** (preferred):
```python
# Single request, complete data
mempool = get_mempool_client()
data = await mempool.get_transaction(txid)
transaction = self._parse_mempool_transaction(txid, data)
```

**Electrum Path** (fallback):
```python
# Multiple requests required for complete data
electrum = get_electrum_client()
tx_data = await electrum.get_transaction(txid, verbose=True)
# Must fetch previous transactions separately to get input addresses/values
transaction = self._parse_transaction(txid, tx_data)
```

## Performance Implications

### Mempool.space API
- **Transaction fetch**: 1 HTTP request
- **Address history**: 1 HTTP request (with pagination)
- **Batch transactions**: 1 HTTP request per transaction (parallelizable)
- **Total for 100 transactions**: ~100 HTTP requests (parallel)

### Electrum Server API
- **Transaction fetch**: 1 JSON-RPC request + N requests for input transactions
- **Address history**: 1 JSON-RPC request + N requests for transaction details
- **Batch transactions**: 1 JSON-RPC batch request + M requests for input transactions
- **Total for 100 transactions**: 1 batch request + ~100-500 additional requests

## Data Quality Differences

### Accuracy
- **Mempool.space**: 100% accurate (pre-computed by infrastructure)
- **Electrum**: Potentially incomplete (missing input data, parsing errors)

### Completeness
- **Mempool.space**: Complete transaction graph in one response
- **Electrum**: Incomplete without additional fetching

### Consistency
- **Mempool.space**: Standardized format across all transactions
- **Electrum**: Format varies by server implementation and transaction type

## Error Handling Differences

### Mempool.space Errors
- **404 Not Found**: Transaction not found
- **429 Rate Limited**: Too many requests
- **5xx Server Errors**: Infrastructure issues
- **Timeout**: Request timeout

### Electrum Errors
- **Null response**: Transaction not found
- **Batch errors**: Partial batch failures
- **Connection errors**: Network issues
- **Parsing errors**: Invalid data format

## Conclusion

### When to Use Each API

**Use Mempool.space API when**:
- You need complete transaction data including input addresses/values
- You're tracing transaction graphs (avoids N+1 query problem)
- You need consistent, reliable data format
- Performance is critical (fewer API calls)

**Use Electrum Servers when**:
- Mempool.space is unavailable or rate-limited
- You need decentralized infrastructure
- You're running your own Electrum server
- You need batch request capabilities

### ChainViz Strategy

The ChainViz implementation correctly prioritizes:
1. **Mempool.space API** as primary (best data quality and performance)
2. **Electrum servers** as fallback (decentralization and reliability)
3. **Redis caching** to reduce API calls and improve performance

This hybrid approach provides the best of both worlds: rich data from mempool.space with the reliability and decentralization of Electrum servers.

### Recommendations

1. **Increase mempool.space usage**: Leverage the rich `prevout` data for better analysis
2. **Optimize Electrum fallback**: Improve input transaction fetching strategy
3. **Cache aggressively**: Reduce API calls for frequently accessed data
4. **Monitor rate limits**: Implement intelligent request routing based on rate limit status
5. **Error handling**: Improve handling of incomplete Electrum data

The key insight is that **mempool.space provides superior data quality and performance** for blockchain analysis, while Electrum servers provide essential fallback capabilities for decentralization and reliability.