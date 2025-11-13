# Electrum Batching Optimization Plan

## Current State Analysis

### ✅ Already Implemented
1. **Transaction batching**: `fetch_transactions_batch()` used extensively
2. **Address history batching**: `fetch_address_histories_batch()` 
3. **Balance batching**: `get_balances_batch()` exists
4. **Parallel batch execution**: Pool splits large batches (>50 requests) across multiple servers

### 🎯 Optimization Opportunities

## 1. Optimize Parallel Batch Threshold

**Current**: Batches split across servers only when >50 requests
**Issue**: Smaller batches (10-49 requests) still go to single server
**Solution**: Lower threshold to 10 requests for better parallelization

**Impact**: 5x faster for medium-sized batches (10-50 items)

### Implementation
```python
# electrum_pool.py
async def execute_batch(self, requests: List[Tuple[str, List[Any]]], parallel: bool = False):
    # Current: if parallel and len(requests) > 50:
    # Optimized: if parallel and len(requests) > 10:
    if parallel and len(requests) > 10:  # NEW THRESHOLD
        return await self._execute_batch_parallel(requests)
    else:
        return await self._execute_batch_single(requests)
```

## 2. Optimize Batch Splitting Algorithm

**Current**: Splits batches evenly across all healthy servers
**Issue**: Can create tiny batches if many servers available
**Solution**: Use optimal batch size (20-30 requests per server)

### Implementation
```python
# electrum_pool.py
async def _execute_batch_parallel(self, requests: List[Tuple[str, List[Any]]]):
    healthy = [c for c in self.connections if c.state == ConnectionState.CONNECTED]
    
    # Current: chunk_size = (len(requests) + len(healthy) - 1) // len(healthy)
    # Optimized: Use optimal batch size (20-30 per server)
    OPTIMAL_BATCH_SIZE = 25
    num_servers_needed = (len(requests) + OPTIMAL_BATCH_SIZE - 1) // OPTIMAL_BATCH_SIZE
    servers_to_use = healthy[:num_servers_needed]
    
    chunk_size = (len(requests) + len(servers_to_use) - 1) // len(servers_to_use)
```

## 3. Always Use Parallel for Large Batches

**Current**: `parallel` parameter must be explicitly set to True
**Issue**: Some callers forget to set parallel=True
**Solution**: Auto-enable parallel for large batches

### Implementation
```python
# electrum_multiplexer.py
async def _batch_call(self, requests: List[tuple]) -> List[Any]:
    # Auto-enable parallel for large batches
    parallel = len(requests) > 10
    return await self.pool.execute_batch(requests, parallel=parallel)
```

## 4. Add Missing Batch Methods

### 4.1 Batch Balance Lookup
**Status**: Method exists but not used everywhere

**Locations to update**:
- `fetch_address_info()` could batch balance lookups
- Bulk address endpoint could use `get_balances_batch()`

### 4.2 Batch UTXO Lookup
**Status**: Not implemented

**Add new method**:
```python
async def get_utxos_batch(self, addresses: List[str]) -> List[List[Dict]]:
    """Get UTXOs for multiple addresses in batch"""
    from app.services.electrum_client import ElectrumClient
    requests = [
        ("blockchain.scripthash.listunspent", [ElectrumClient._address_to_scripthash(addr)])
        for addr in addresses
    ]
    return await self._batch_call(requests)
```

## 5. Batch Cache Warming

**Current**: Cache checks are sequential
**Issue**: Miss large batching opportunity
**Solution**: Batch fetch all uncached items at once

### Implementation
```python
# blockchain_data.py
async def fetch_transactions_batch(self, txids: List[str]) -> List[Transaction]:
    # Group cache checks
    cached_results = {}
    uncached_txids = []
    
    for txid in txids:
        cache_key = f"tx:{txid}"
        cached = await self._get_cache(cache_key)
        if cached:
            cached_results[txid] = Transaction(**json.loads(cached))
        else:
            uncached_txids.append(txid)
    
    # Batch fetch ALL uncached at once (already doing this)
    if uncached_txids:
        tx_data_list = await electrum.get_transactions_batch(uncached_txids, verbose=True)
        # ...
```

## 6. Preemptive Batching in Trace Endpoint

**Current**: Fetches input TXs as needed
**Opportunity**: Collect ALL needed TXIDs first, then batch fetch

### Example from trace.py
```python
# CURRENT (already good):
input_txids = [inp.txid for inp in start_tx.inputs if inp.txid]
input_txs = await blockchain_service.fetch_transactions_batch(input_txids)

# Already optimal! ✅
```

## 7. Smart Batch Grouping by Type

**Current**: All requests in a batch must be same type
**Opportunity**: Allow mixed-type batches

**Note**: Electrum protocol supports mixed requests in single batch!

### Implementation
```python
# Example: Batch different request types together
requests = [
    ("blockchain.transaction.get", [txid1, True]),
    ("blockchain.transaction.get", [txid2, True]),
    ("blockchain.scripthash.get_balance", [script_hash1]),
    ("blockchain.scripthash.get_history", [script_hash2]),
]
results = await electrum._batch_call(requests)
```

## 8. Batch Size Optimization

**Current**: No limit on batch size
**Issue**: Very large batches (>100) may timeout
**Solution**: Automatic batch chunking

### Implementation
```python
# electrum_multiplexer.py
async def get_transactions_batch(self, txids: List[str], verbose: bool = True):
    MAX_BATCH_SIZE = 100
    
    if len(txids) <= MAX_BATCH_SIZE:
        # Normal batch
        requests = [("blockchain.transaction.get", [txid, verbose]) for txid in txids]
        return await self._batch_call(requests)
    else:
        # Auto-chunk large batches
        chunks = [txids[i:i + MAX_BATCH_SIZE] for i in range(0, len(txids), MAX_BATCH_SIZE)]
        tasks = [self.get_transactions_batch(chunk, verbose) for chunk in chunks]
        chunk_results = await asyncio.gather(*tasks)
        return [item for chunk in chunk_results for item in chunk]
```

## 9. Batch Request Deduplication

**Current**: May fetch same TX/address multiple times
**Opportunity**: Deduplicate before fetching

### Implementation
```python
async def fetch_transactions_batch(self, txids: List[str]) -> List[Transaction]:
    # Deduplicate input
    unique_txids = list(dict.fromkeys(txids))  # Preserve order
    
    # Fetch unique items
    unique_results = await self._fetch_unique(unique_txids)
    
    # Map back to original order (with duplicates)
    result_map = {tx.txid: tx for tx in unique_results}
    return [result_map.get(txid) for txid in txids]
```

## 10. Connection Pool Batch Distribution

**Current**: Round-robin selection per request
**Opportunity**: Batch-aware server selection

### Implementation
```python
# electrum_pool.py
async def _execute_batch_parallel(self, requests: List[Tuple[str, List[Any]]]):
    healthy = [c for c in self.connections if c.state == ConnectionState.CONNECTED]
    
    # Sort servers by current load (in-flight requests)
    servers_by_load = sorted(healthy, key=lambda c: c.metrics.in_flight_requests)
    
    # Assign chunks to least-loaded servers first
    # ... distribute batches based on server load ...
```

## Implementation Priority

### Phase 1: Quick Wins (30 minutes)
1. ✅ Lower parallel threshold (50 → 10)
2. ✅ Auto-enable parallel for large batches
3. ✅ Add batch size limit (100 requests max)

### Phase 2: Optimization (1 hour)
4. ✅ Optimize batch splitting algorithm
5. ✅ Add missing batch methods (UTXOs)
6. ✅ Smart batch grouping by type

### Phase 3: Advanced (2 hours)
7. ✅ Batch request deduplication
8. ✅ Load-aware batch distribution
9. ✅ Batch cache warming optimization

## Expected Performance Improvements

### Before Optimization
```
10 transactions:  Sequential → 1,000ms (10 x 100ms)
50 transactions:  Single batch → 500ms
100 transactions: Single batch → 1,000ms (timeout risk)
```

### After Optimization
```
10 transactions:  Parallel batch (2 servers) → 100ms (10x faster)
50 transactions:  Parallel batch (5 servers) → 100ms (5x faster)
100 transactions: Auto-chunked parallel → 200ms (5x faster + reliable)
```

## Metrics to Track

1. **Average batch size**: Should increase as more calls use batching
2. **Parallel batch ratio**: % of batches using parallel execution
3. **Batch latency**: Average time per batch (target: <200ms)
4. **Cache hit rate**: Should improve with better batch warming
5. **Server load distribution**: Should be even across pool

## Testing Plan

1. **Unit tests**: Test batch methods with 1, 10, 50, 100, 500 requests
2. **Integration tests**: Trace heavy TX (348 inputs) with batching
3. **Load tests**: 1000 concurrent requests using batched APIs
4. **Benchmark**: Compare before/after for common operations

## Success Criteria

✅ All batches >10 requests use parallel execution
✅ No single server handles >30 requests in a batch
✅ Batch operations 5-10x faster than sequential
✅ No timeouts on large batches (auto-chunking works)
✅ Cache hit rate >80% for repeated requests

