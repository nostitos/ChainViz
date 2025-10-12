# ChainViz Performance Optimization Plan

## Executive Summary
Current expansion with 5+ hops is slow due to sequential API calls and redundant processing. This plan provides actionable steps to achieve **10-50x speedup** through backend batching, caching, and parallel processing.

---

## Phase 1: Backend Batching (Highest Impact: 10-20x)

### Problem
- Currently fetching transactions one-by-one via Electrum
- 100 transactions = 100 individual network requests
- Each request has ~50-100ms latency overhead

### Solution: Batch Transaction Fetching
**File: `backend/app/services/electrum_client.py`**

```python
async def get_transactions_batch(self, txids: List[str]) -> Dict[str, dict]:
    """
    Fetch multiple transactions in parallel using Electrum batch requests.
    Electrum supports 50-100 TXs per batch.
    """
    results = {}
    batch_size = 50
    
    for i in range(0, len(txids), batch_size):
        batch = txids[i:i+batch_size]
        # Use asyncio.gather for parallel requests
        batch_results = await asyncio.gather(
            *[self.get_transaction(txid) for txid in batch],
            return_exceptions=True
        )
        for txid, result in zip(batch, batch_results):
            if not isinstance(result, Exception):
                results[txid] = result
    
    return results
```

**Impact:** 100 requests → 2-3 batched requests = **~20x faster**

---

## Phase 2: Redis Caching (High Impact: 5-10x for repeated data)

### Problem
- Re-fetching same transaction data across sessions
- No persistence of blockchain data (which rarely changes)

### Solution: Multi-tier Caching Strategy
**File: `backend/app/services/cache.py`**

```python
from redis import asyncio as aioredis
import json

class BlockchainCache:
    def __init__(self, redis_url: str = "redis://localhost:6379"):
        self.redis = aioredis.from_url(redis_url)
    
    async def get_transaction(self, txid: str) -> Optional[dict]:
        """Get cached transaction data"""
        data = await self.redis.get(f"tx:{txid}")
        return json.loads(data) if data else None
    
    async def set_transaction(self, txid: str, data: dict, ttl: int = 86400):
        """Cache transaction with TTL based on confirmations"""
        # Longer TTL for old transactions (unlikely to change)
        if data.get('confirmations', 0) > 100:
            ttl = 7 * 86400  # 7 days
        await self.redis.setex(f"tx:{txid}", ttl, json.dumps(data))
    
    async def get_address_txs(self, address: str) -> Optional[List[str]]:
        """Get cached address transaction list"""
        data = await self.redis.get(f"addr:{address}")
        return json.loads(data) if data else None
    
    async def set_address_txs(self, address: str, txids: List[str], ttl: int = 600):
        """Cache address TXs with short TTL (new TXs may arrive)"""
        await self.redis.setex(f"addr:{address}", ttl, json.dumps(txids))
```

**Integration:** Wrap all Electrum calls with cache checks
```python
async def get_transaction_cached(self, txid: str) -> dict:
    cached = await self.cache.get_transaction(txid)
    if cached:
        return cached
    
    tx = await self.electrum.get_transaction(txid)
    await self.cache.set_transaction(txid, tx)
    return tx
```

**Impact:** 
- First query: Same speed
- Subsequent queries: **~10x faster** (no network calls)
- Memory usage: ~1KB per transaction in Redis

---

## Phase 3: Parallel Processing (Medium Impact: 2-4x)

### Problem
- Processing addresses sequentially in each hop
- Independent addresses could be processed in parallel

### Solution: Parallel Address Expansion
**File: `backend/app/api/trace.py`**

```python
async def trace_from_address_parallel(address: str, max_depth: int):
    """Process multiple addresses in parallel using asyncio.gather"""
    
    async def process_address(addr: str, depth: int):
        if depth > max_depth:
            return
        
        # Fetch all TXs for this address
        tx_history = await electrum.get_history(addr)
        
        # Process all transactions in parallel
        tx_details = await asyncio.gather(
            *[electrum.get_transaction_cached(tx['txid']) 
              for tx in tx_history],
            return_exceptions=True
        )
        
        # Extract next-hop addresses
        next_addrs = extract_output_addresses(tx_details)
        
        # Recurse in parallel for next hop
        await asyncio.gather(
            *[process_address(next_addr, depth + 1) 
              for next_addr in next_addrs[:50]],  # Limit fanout
            return_exceptions=True
        )
    
    await process_address(address, 0)
```

**Impact:** 3-4x speedup on high-fanout addresses (exchanges, pools)

---

## Phase 4: Smart Depth Limiting (Medium Impact: 50-80% request reduction)

### Problem
- Expanding addresses with 1000+ transactions (exchanges, mixers)
- Wasting time on low-value expansions

### Solution: Adaptive Depth Control
**File: `backend/app/api/trace.py`**

```python
def should_expand_address(address: str, tx_count: int, age: int) -> bool:
    """Heuristic to skip expensive expansions"""
    
    # Skip addresses with 100+ transactions (likely exchange/pool)
    if tx_count > 100:
        return False
    
    # Skip very old transactions (configurable cutoff)
    if age > 365 * 86400:  # 1 year
        return False
    
    # Stop at known service addresses (exchanges, mixers)
    if address in KNOWN_SERVICE_ADDRESSES:
        return False
    
    return True
```

**Impact:** Reduce total API calls by 50-80% on typical traces

---

## Phase 5: Incremental Frontend Rendering (Medium Impact: 3-5x perceived speed)

### Problem
- Frontend waits for all data before rendering
- User sees blank screen for 10-30 seconds

### Solution: WebSocket Streaming
**Backend: `backend/app/api/trace.py`**
```python
@app.websocket("/ws/trace")
async def trace_websocket(websocket: WebSocket):
    await websocket.accept()
    
    async def stream_nodes(address: str, max_depth: int):
        """Stream nodes as they're discovered"""
        for hop in range(max_depth):
            nodes, edges = await fetch_hop_data(address, hop)
            await websocket.send_json({
                "type": "hop_complete",
                "hop": hop,
                "nodes": nodes,
                "edges": edges
            })
    
    await stream_nodes(address, max_depth)
    await websocket.close()
```

**Frontend: `frontend/src/services/api.ts`**
```typescript
export function traceFromAddressStreaming(
    address: string, 
    maxDepth: number,
    onHopComplete: (hop: number, nodes: Node[], edges: Edge[]) => void
) {
    const ws = new WebSocket(`ws://localhost:8000/ws/trace`);
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'hop_complete') {
            onHopComplete(data.hop, data.nodes, data.edges);
        }
    };
}
```

**Impact:** User sees first hop in 1-2 seconds instead of 20+ seconds

---

## Implementation Priority

### Week 1: Quick Wins (5-10x)
1. ✅ Add request tracking to frontend (completed)
2. ⚡ Implement batch transaction fetching
3. ⚡ Add Redis caching for transactions

### Week 2: Optimization (2-5x additional)
4. ⚡ Implement parallel address processing
5. ⚡ Add smart depth limiting heuristics
6. ⚡ Cache address transaction histories

### Week 3: UX Improvements (perceived 3-5x)
7. ⚡ WebSocket streaming for incremental rendering
8. ⚡ Frontend batching of graph updates
9. ⚡ Progress tracking and ETAs

---

## Expected Performance

### Current Performance (5 forward hops)
- Time: 30-60 seconds
- Requests: 100-500 individual calls
- Data: 5-20 MB total
- User Experience: ⭐⭐ (long wait, no feedback)

### After Phase 1+2 (Batching + Caching)
- Time: 3-6 seconds (10x faster)
- Requests: 5-20 batched calls
- Data: Same (but cached)
- User Experience: ⭐⭐⭐⭐ (acceptable speed)

### After All Phases
- Time: 1-3 seconds first run, <1s cached
- Requests: 2-10 batched calls
- Data: Cached (minimal network)
- User Experience: ⭐⭐⭐⭐⭐ (instant feel, progressive display)

---

## Dependencies

### Backend
```txt
redis>=4.5.0
aioredis>=2.0.0
```

### Infrastructure
- Redis server (Docker: `docker run -d -p 6379:6379 redis:alpine`)
- No additional Electrum server changes needed

---

## Monitoring

Add these metrics to track optimization impact:
- API call count per hop
- Response time per request type
- Cache hit rate (target: >80%)
- Total trace completion time
- Frontend render time per hop

**Dashboard location:** Performance Monitor (already implemented)

---

## Notes

- **Batching** is the single highest-impact optimization (10-20x)
- **Caching** provides compounding benefits (faster over time)
- **Parallel processing** helps with high-fanout scenarios
- **Streaming** is the best UX improvement (perceived speed)

All optimizations are backward-compatible and can be implemented incrementally.

