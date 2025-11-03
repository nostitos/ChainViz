# Fast Path Implementation for Transaction Tracing

## Current Status

### ✅ Working (Hops = 0)
- Returns in 0.09 seconds
- Shows TX node with accurate counts: 348 inputs, 376 outputs
- No address fetching

### ❌ Broken (Hops = 1)
- Times out after 20+ seconds
- Fast path returns EMPTY result
- Falls through to address fetching code which has nothing to process
- **Root Cause**: Fast path not implemented, just returns empty TraceGraphResponse

---

## Required Implementation: Fast Path for Hops <= 1

**Location**: `backend/app/api/trace.py` line 46-48

**Current (WRONG)**:
```python
if request.hops_before <= 1 and request.hops_after <= 1:
    logger.info(f"🚀 Using FAST PATH for simple trace (hops <= 1)")
    result = TraceGraphResponse(nodes=[], edges=[], clusters=[], coinjoins=[], peel_chains=[], start_txid=request.txid, start_vout=request.vout, total_nodes=0, total_edges=0)
```

**Required (CORRECT)**:
```python
if request.hops_before <= 1 and request.hops_after <= 1:
    logger.info(f"🚀 Using FAST PATH for simple trace (hops <= 1)")
    
    # Fetch the starting transaction
    start_tx = await blockchain_service.fetch_transaction(request.txid)
    
    # Create TX node with counts
    tx_node = NodeData(
        id=f"tx_{request.txid}",
        label=f"{request.txid[:16]}...",
        type="transaction",
        value=None,
        metadata={
            "txid": request.txid,
            "timestamp": start_tx.timestamp,
            "is_starting_point": True,
            "inputCount": len(start_tx.inputs),
            "outputCount": len(start_tx.outputs),
        }
    )
    
    nodes = [tx_node]
    edges = []
    
    # If hops > 0, add LIMITED input/output addresses
    if request.hops_before > 0 or request.hops_after > 0:
        # Fetch limited input addresses
        if request.hops_before > 0:
            input_txids = [inp.txid for inp in start_tx.inputs[:request.max_addresses_per_tx] if inp.txid]
            logger.info(f"  Fetching {len(input_txids)} of {len(start_tx.inputs)} input addresses")
            input_txs = await blockchain_service.fetch_transactions_batch(input_txids)
            input_tx_map = {tx.txid: tx for tx in input_txs if tx}
            
            for inp in start_tx.inputs[:request.max_addresses_per_tx]:
                if inp.txid and inp.txid in input_tx_map:
                    prev_tx = input_tx_map[inp.txid]
                    if inp.vout < len(prev_tx.outputs):
                        prev_output = prev_tx.outputs[inp.vout]
                        if prev_output.address:
                            addr_id = f"addr_{prev_output.address}"
                            if not any(n.id == addr_id for n in nodes):
                                nodes.append(NodeData(
                                    id=addr_id,
                                    label=prev_output.address,
                                    type="address",
                                    value=None,
                                    metadata={"address": prev_output.address}
                                ))
                            edges.append(EdgeData(
                                source=addr_id,
                                target=f"tx_{request.txid}",
                                amount=prev_output.value,
                                confidence=1.0,
                                metadata={"vout": inp.vout}
                            ))
        
        # Add limited output addresses
        if request.hops_after > 0:
            for idx, out in enumerate(start_tx.outputs[:request.max_addresses_per_tx]):
                if out.address:
                    addr_id = f"addr_{out.address}"
                    if not any(n.id == addr_id for n in nodes):
                        nodes.append(NodeData(
                            id=addr_id,
                            label=out.address,
                            type="address",
                            value=None,
                            metadata={"address": out.address}
                        ))
                    edges.append(EdgeData(
                        source=f"tx_{request.txid}",
                        target=addr_id,
                        amount=out.value,
                        confidence=1.0,
                        metadata={"vout": idx}
                    ))
    
    logger.info(f"✅ Fast path complete: {len(nodes)} nodes, {len(edges)} edges")
    
    result = TraceGraphResponse(
        nodes=nodes,
        edges=edges,
        clusters=[],
        coinjoins=[],
        peel_chains=[],
        start_txid=request.txid,
        start_vout=request.vout,
        total_nodes=len(nodes),
        total_edges=len(edges),
    )
    
    # Early return - skip the slow orchestrator-based processing
    return result
```

---

## Performance Expectations

### Hops = 0:
- Current: 0.09s ✅
- After fix: 0.09s ✅ (no change needed)

### Hops = 1 with max_addresses_per_tx = 20:
- Current: 20s timeout ❌
- After fix: < 2s ✅
- Fetches: 1 TX + 20 input TXs + 20 output addresses = ~21 Electrum calls
- At ~50ms per call with batching = ~1 second total

### Hops = 1 with max_addresses_per_tx = 100:
- After fix: < 5s ✅
- Fetches: 1 TX + 100 input TXs + 100 output addresses = ~101 Electrum calls
- With batching (100 per batch) = ~2-3 seconds total

---

## Testing Plan

```bash
# Test 1: Hops = 0 (already works)
curl -X POST "http://localhost:8000/api/trace/utxo" -H "Content-Type: application/json" \
  -d '{"txid": "ae24e3ba...", "vout": 0, "hops_before": 0, "hops_after": 0}' \
  --max-time 5
# Expected: < 1s, 1 node (TX), inputCount=348, outputCount=376

# Test 2: Hops = 1, max_addresses = 20
curl -X POST "http://localhost:8000/api/trace/utxo" -H "Content-Type: application/json" \
  -d '{"txid": "ae24e3ba...", "vout": 0, "hops_before": 1, "hops_after": 0, "max_addresses_per_tx": 20}' \
  --max-time 10
# Expected: < 2s, 21 nodes (1 TX + 20 addresses), ~20 edges, cluster label shows "348 Inputs (20 shown)"

# Test 3: Hops = 1, max_addresses = 100  
curl -X POST "http://localhost:8000/api/trace/utxo" -H "Content-Type: application/json" \
  -d '{"txid": "ae24e3ba...", "vout": 0, "hops_before": 1, "hops_after": 0, "max_addresses_per_tx": 100}' \
  --max-time 15
# Expected: < 5s, 101 nodes (1 TX + 100 addresses), ~100 edges

# Test 4: Hops = 2+ (uses orchestrator)
curl -X POST "http://localhost:8000/api/trace/utxo" -H "Content-Type: application/json" \
  -d '{"txid": "61d163...", "vout": 0, "hops_before": 2, "hops_after": 0}' \
  --max-time 30
# Expected: Uses slow recursive path, may take longer
```

---

## Why This Matters

The orchestrator was designed for DEEP recursive tracing (5-20 hops) with heuristics. For simple "show me this transaction and its immediate connections", it's massive overkill:

### Orchestrator (Current, Slow):
- Recursively fetches all 348 input transactions
- For each, applies clustering, change detection, CoinJoin detection
- Builds NetworkX graph with all heuristics
- Analyzes peel chains and patterns
- **Time**: 60+ seconds, often timeouts

### Fast Path (Proposed, Fast):
- Fetches starting TX (1 call)
- Fetches first N input TXs (1-2 batch calls)
- Adds addresses directly, no heuristics
- Returns immediately
- **Time**: < 2 seconds

For a single transaction view with limited addresses, the fast path is 30x+ faster.

