# Transaction Loading Performance Issues

## Problem Analysis: TX ae24e3ba533427883809b267e5b55064827b29b43d9f2e38b8423dcdcc22ab9a

### Symptoms
1. **Backend takes 2+ minutes** to load a single transaction with 350 inputs and 375 outputs
2. **Only 60 inputs** displayed in cluster (should be 350)
3. **375 outputs** displayed (correct, but why not 376?)
4. **Max outputs set to 16** but ignored - 375 outputs still shown
5. **No user confirmation** before creating clusters
6. **Backend making hundreds of fetch calls** for what should be a simple operation

---

## Root Causes Identified

### 1. Backend: Redundant Input Transaction Fetching

**Location**: `backend/app/api/trace.py` lines 86-96

**Problem**: 
- For a TX with 350 inputs, backend fetches ALL 350 previous transactions
- Each input requires fetching the previous TX to get the address
- This is done even when just displaying a single transaction
- For TX `ae24e3...`, this means fetching 350 additional transactions just to get input addresses

**Why it's slow**:
```python
# Step 2: Collect all input TXIDs that need to be fetched
input_txids = set()
for tx in main_txs:
    if tx:
        for inp in tx.inputs:  # For ae24e3ba: 350 inputs!
            if inp.txid:
                input_txids.add(inp.txid)

logger.info(f"⚡ Batch fetching {len(input_txids)} input transactions...")
input_txs = await blockchain_service.fetch_transactions_batch(list(input_txids))
```

**Impact**: 
- 350 input TXs to fetch from Electrum
- Even with batching, this is slow (Electrum batch size limit = 100)
- Takes ~2 minutes for 350 transactions

### 2. Backend: Missing Input/Output Count Metadata

**Location**: `backend/app/api/trace.py` line 72

**Problem**:
- Transaction node metadata doesn't include `inputCount` and `outputCount`
- Frontend has to count from edges, which is inaccurate
- Backend KNOWS the actual counts from the fetched transaction

**Current code**:
```python
metadata={"txid": request.txid, "timestamp": start_tx.timestamp, "is_starting_point": True}
# Missing: "inputCount": len(start_tx.inputs), "outputCount": len(start_tx.outputs)
```

**Impact**:
- Frontend clustering logic uses edge counts, not actual TX counts
- Only 60 inputs shown because only 60 were fetched before timeout/limit
- 375 outputs might be accurate but coincidental

### 3. Frontend: No Clustering Confirmation

**Location**: `frontend/src/utils/graphBuilderBipartite.ts` lines 168-182

**Problem**:
- When 10+ addresses detected, cluster is created automatically
- No user prompt asking "Display all or create cluster?"
- User setting "max outputs: 16" is completely ignored

**Current code**:
```typescript
if (inputAddrs.length >= 10 && !isStartTx && !hasOriginAddress) {
  const clusterId = `cluster-inputs-${txNode.id}`;
  // ... creates cluster WITHOUT asking user
}
```

**Impact**:
- User has no control over clustering
- Settings like "max outputs: 16" don't affect anything
- Unexpected cluster creation

### 4. Frontend: Max Outputs Setting Not Applied to Clusters

**Location**: `frontend/src/utils/graphBuilderBipartite.ts` cluster creation

**Problem**:
- When creating clusters, ALL addresses are included
- The `maxOutputs` parameter is only checked for non-clustered addresses
- For starting TX, should respect the max outputs limit

**Impact**:
- 375 outputs shown in cluster (all of them)
- User's "max outputs: 16" setting ignored
- Inconsistent behavior

### 5. Backend: No Fast Path for Single Transaction View

**Problem**:
- No dedicated endpoint for viewing a single transaction
- Uses full tracing logic (designed for multi-hop graphs)
- Fetches all input sources even when just displaying the TX

**Current flow**:
1. Frontend calls `/api/trace/utxo` with hops_before=0
2. Backend still tries to resolve ALL input addresses
3. Makes 350+ additional Electrum calls
4. Takes 2+ minutes

**What should happen**:
1. Frontend requests single TX view
2. Backend returns TX with input/output COUNT metadata
3. Frontend shows cluster summaries
4. User clicks to expand specific addresses as needed
5. < 1 second total time

---

## Solutions

### Solution 1: Add Fast Single-Transaction Endpoint

**New endpoint**: `GET /api/transaction/{txid}/graph`

```python
@router.get("/{txid}/graph", response_model=TraceGraphResponse)
async def get_transaction_graph(
    txid: str,
    fetch_addresses: bool = False,  # Only fetch if explicitly requested
    max_addresses_per_side: int = 100,
    blockchain_service: BlockchainDataService = Depends(get_blockchain_service),
):
    """
    Get a single transaction as a graph node with optional address expansion
    
    - fetch_addresses=False: Returns TX node with input/output COUNTS only (fast)
    - fetch_addresses=True: Fetches addresses up to max_addresses_per_side (slower)
    
    This is optimized for viewing large transactions (100+ inputs/outputs)
    """
    tx = await blockchain_service.fetch_transaction(txid)
    
    # Create TX node with COUNTS
    nodes = [NodeData(
        id=f"tx_{txid}",
        label=f"{txid[:16]}...",
        type="transaction",
        value=None,
        metadata={
            "txid": txid,
            "timestamp": tx.timestamp,
            "is_starting_point": True,
            "inputCount": len(tx.inputs),   # ACTUAL count
            "outputCount": len(tx.outputs),  # ACTUAL count
        }
    )]
    
    edges = []
    
    # Only fetch addresses if requested
    if fetch_addresses:
        # Fetch limited number of input addresses
        input_txids = [inp.txid for inp in tx.inputs[:max_addresses_per_side] if inp.txid]
        input_txs = await blockchain_service.fetch_transactions_batch(input_txids)
        # ... add input address nodes and edges
        
        # Add output addresses (no additional fetches needed)
        for out in tx.outputs[:max_addresses_per_side]:
            # ... add output address nodes and edges
    
    return TraceGraphResponse(
        nodes=nodes,
        edges=edges,
        clusters=[],
        coinjoins=[],
        peel_chains=[],
        start_txid=txid,
        start_vout=0,
        total_nodes=len(nodes),
        total_edges=len(edges),
    )
```

**Benefits**:
- Returns in < 1 second (no address fetching)
- Frontend gets accurate input/output counts
- Can request address expansion later if needed

### Solution 2: Add Input/Output Counts to All TX Nodes

**Change**: `backend/app/api/trace.py` line 67-73

```python
result.nodes.append(NodeData(
    id=f"tx_{request.txid}",
    label=f"{request.txid[:16]}...",
    type="transaction",
    value=None,
    metadata={
        "txid": request.txid,
        "timestamp": start_tx.timestamp,
        "is_starting_point": True,
        "inputCount": len(start_tx.inputs),    # ADD THIS
        "outputCount": len(start_tx.outputs),  # ADD THIS
    }
))
```

**Apply to**: All locations where transaction nodes are created

**Benefits**:
- Frontend gets accurate counts
- Clustering logic works correctly
- No need to count edges

### Solution 3: Add User Confirmation for Clustering

**Change**: `frontend/src/utils/graphBuilderBipartite.ts`

```typescript
// Before creating cluster, check if user wants confirmation
if (inputAddrs.length >= 10 && !isStartTx && !hasOriginAddress) {
  // Return a special flag indicating clustering decision needed
  // OR: Create cluster but mark it as "needs confirmation"
  // Frontend can show dialog: "This transaction has 350 inputs. Display all or show as cluster?"
  
  // For now, respect maxOutputs setting
  const addrsToShow = inputAddrs.slice(0, maxOutputs);
  if (inputAddrs.length > maxOutputs) {
    console.warn(`⚠️ Limiting inputs from ${inputAddrs.length} to ${maxOutputs}`);
  }
  // ... create individual nodes for addrsToShow
}
```

**Alternative**: Add callback parameter to graph builder
```typescript
export function buildGraphFromTraceDataBipartite(
  data: TraceData,
  edgeScaleMax: number = 10,
  maxTransactions: number = 20,
  maxOutputs: number = 20,
  startTxid?: string,
  onClusterNeeded?: (type: 'inputs' | 'outputs', count: number) => Promise<'show-all' | 'cluster'>
)
```

### Solution 4: Respect Max Outputs Setting

**Change**: `frontend/src/utils/graphBuilderBipartite.ts`

```typescript
// ALWAYS respect maxOutputs, even for starting TX
const inputAddrsToShow = inputAddrs.slice(0, maxOutputs);
const outputAddrsToShow = outputAddrs.slice(0, maxOutputs);

if (inputAddrs.length > maxOutputs) {
  console.log(`⚠️ Limiting ${inputAddrs.length} inputs to ${maxOutputs}`);
}
if (outputAddrs.length > maxOutputs) {
  console.log(`⚠️ Limiting ${outputAddrs.length} outputs to ${maxOutputs}`);
}
```

### Solution 5: Lazy Address Loading

**Approach**: 
1. Frontend requests TX with counts only (fast)
2. User sees: "350 inputs (60 shown), 375 outputs (16 shown)"
3. User can click "Load more" to fetch additional batches
4. Or "Load all" to fetch everything (with warning)

**Benefits**:
- Initial load is instant
- User controls data fetching
- Progressive disclosure of complexity

---

## Implementation Priority

### Phase 1: Quick Fixes (30 minutes)
1. ✅ Add inputCount/outputCount to all TX node metadata
2. ✅ Respect maxOutputs setting everywhere
3. ✅ Add warning logs when limiting addresses

### Phase 2: Performance (1 hour)
4. ✅ Add fast single-transaction endpoint
5. ✅ Update frontend to use fast endpoint for initial load
6. ✅ Add "load more addresses" button functionality

### Phase 3: UX Improvements (1 hour)
7. ✅ Add clustering confirmation dialog
8. ✅ Show accurate counts in clusters ("350 inputs" not "60 inputs")
9. ✅ Add progressive loading UI

### Phase 4: Testing
10. ✅ Test with TX ae24e3ba... (350 inputs, 375 outputs)
11. ✅ Verify < 1 second initial load
12. ✅ Verify correct counts displayed
13. ✅ Verify user can expand addresses progressively

---

## Expected Results After Fixes

### Before:
- ❌ 2+ minute load time
- ❌ Only 60 inputs shown (incomplete)
- ❌ 375 outputs shown (ignoring max setting)
- ❌ No user control over clustering
- ❌ Backend makes 350+ Electrum calls

### After:
- ✅ < 1 second initial load (TX node only)
- ✅ Shows "350 inputs, 375 outputs" (accurate)
- ✅ Respects "max outputs: 16" setting
- ✅ User prompted: "Load 16 / Load all / Show as cluster"
- ✅ Backend makes 1-2 Electrum calls initially
- ✅ Additional addresses loaded on demand

---

## Testing Commands

```bash
# Test the problematic transaction
curl -X POST "http://localhost:8000/api/trace/utxo" \
  -H "Content-Type: application/json" \
  -d '{
    "txid": "ae24e3ba533427883809b267e5b55064827b29b43d9f2e38b8423dcdcc22ab9a",
    "vout": 0,
    "hops_before": 0,
    "hops_after": 0
  }' | jq '.nodes[] | select(.type=="transaction") | .metadata'
```

Expected output:
```json
{
  "txid": "ae24e3ba533427883809b267e5b55064827b29b43d9f2e38b8423dcdcc22ab9a",
  "timestamp": 1234567890,
  "is_starting_point": true,
  "inputCount": 350,
  "outputCount": 375
}
```

