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

### Solution 1: Fix Backend to Respect Hop Levels

**Problem**: Backend fetches ALL input addresses even when `hops_before=0` or `max_hops=0`

**Root Cause**: The backend logic at lines 77-140 ALWAYS fetches input addresses regardless of hop settings.

**Fix**: Wrap input/output address fetching in hop level checks

**Location**: `backend/app/api/trace.py` lines 77-166

```python
# Step 1: Batch fetch all main transactions
main_txids = [n.metadata.get('txid') for n in tx_nodes if n.metadata and n.metadata.get('txid')]
if not main_txids:
    logger.info("No TXs to process")
else:
    logger.info(f"⚡ Batch fetching {len(main_txids)} transactions...")
    main_txs = await blockchain_service.fetch_transactions_batch(main_txids)
    main_tx_map = dict(zip(main_txids, main_txs))
    
    # ADD inputCount/outputCount to transaction metadata
    for tx_node_data in tx_nodes:
        txid = tx_node_data.metadata.get('txid') if tx_node_data.metadata else None
        if txid and txid in main_tx_map:
            tx = main_tx_map[txid]
            if tx and tx_node_data.metadata:
                tx_node_data.metadata["inputCount"] = len(tx.inputs)
                tx_node_data.metadata["outputCount"] = len(tx.outputs)
                logger.info(f"  ✅ TX {txid[:20]} metadata: {len(tx.inputs)} inputs, {len(tx.outputs)} outputs")
    
    # ONLY fetch input/output addresses if hops_before > 0 or hops_after > 0
    # For single transaction view (hops=0), we ONLY need the counts above
    if request.hops_before > 0 or request.hops_after > 0:
        logger.info(f"📥 Fetching addresses for multi-hop trace (hops_before={request.hops_before}, hops_after={request.hops_after})")
        
        # Step 2: Collect all input TXIDs that need to be fetched
        input_txids = set()
        for tx in main_txs:
            if tx:
                for inp in tx.inputs:
                    if inp.txid:
                        input_txids.add(inp.txid)
        
        logger.info(f"⚡ Batch fetching {len(input_txids)} input transactions...")
        input_txs = await blockchain_service.fetch_transactions_batch(list(input_txids))
        input_tx_map = dict(zip(input_txids, input_txs))
        
        # Step 3: Process all transactions with pre-fetched data
        # ... (existing code for adding addresses)
    else:
        logger.info(f"⏭️ Skipping address fetching for single transaction view (hops=0)")
```

**Benefits**:
- **Respects the user's hop setting** - if they want 0 hops, don't fetch anything extra
- Returns in < 1 second for single TX view
- Frontend gets accurate counts for clustering decisions
- No new endpoint needed - fixes existing behavior

### Solution 2: Use Backend Counts in Frontend (Don't Count Edges!)

**Problem**: Frontend currently counts edges to determine input/output counts - this is WRONG!

**Why it's wrong**:
- Edges are UI elements showing what's DISPLAYED, not what EXISTS
- If backend only fetches 60 of 350 inputs, edges will show 60
- Clustering decisions based on edge counts are inaccurate

**Fix**: Frontend must use `metadata.inputCount` and `metadata.outputCount` from backend

**Location**: `frontend/src/utils/graphBuilderBipartite.ts` lines 158-163

**CURRENT (WRONG)**:
```typescript
const inputAddresses = txInputs.get(txNode.id) || [];
const outputAddresses = txOutputs.get(txNode.id) || [];

// If backend provided counts, use those; otherwise use edge counts
const inputCount = txNode.metadata?.inputCount ?? inputAddresses.length;  // ❌ WRONG FALLBACK
const outputCount = txNode.metadata?.outputCount ?? outputAddresses.length; // ❌ WRONG FALLBACK
```

**FIXED**:
```typescript
// ALWAYS use backend counts - they're the source of truth
const inputCount = txNode.metadata?.inputCount ?? 0;
const outputCount = txNode.metadata?.outputCount ?? 0;

// Log warning if counts are missing from backend
if (!txNode.metadata?.inputCount || !txNode.metadata?.outputCount) {
  console.warn(`⚠️ TX ${txNode.id} missing inputCount/outputCount from backend!`);
}

// inputAddresses/outputAddresses are just what we're DISPLAYING, not the actual count
const inputAddresses = txInputs.get(txNode.id) || [];
const outputAddresses = txOutputs.get(txNode.id) || [];
```

**Apply to**: All clustering logic that checks address counts

**Benefits**:
- Clustering decisions based on ACTUAL transaction data
- "350 inputs" displayed correctly, not "60 inputs"
- Edge counts only used for positioning, not decision-making

### Solution 3: Prompt User Before Clustering (Critical UX)

**Problem**: Auto-clustering without asking can overload rendering even if backend handles it

**Why prompt is needed**:
- 350 inputs might render fine, or might crash the browser
- User should decide based on their machine capabilities
- Rendering performance != backend performance

**Approach A**: Simple threshold check with confirmation dialog

**Location**: `frontend/src/utils/graphBuilderBipartite.ts` lines 168-182

```typescript
// Check backend-provided counts for clustering decision
const actualInputCount = txNode.metadata?.inputCount ?? 0;
const actualOutputCount = txNode.metadata?.outputCount ?? 0;

// If large number of addresses, need user decision
if (actualInputCount >= 50 || actualOutputCount >= 50) {
  // Create a "needs confirmation" marker
  // This will be checked in App.tsx before rendering
  txNode.metadata.needsClusteringConfirmation = true;
  txNode.metadata.suggestedAction = {
    inputCount: actualInputCount,
    outputCount: actualOutputCount,
    message: `This transaction has ${actualInputCount} inputs and ${actualOutputCount} outputs. How would you like to display them?`,
    options: ['Show as clusters', 'Show first 20', 'Show all (may be slow)']
  };
}
```

**Approach B**: Callback-based (more flexible)

```typescript
export function buildGraphFromTraceDataBipartite(
  data: TraceData,
  options: {
    edgeScaleMax?: number;
    maxTransactions?: number;
    maxOutputs?: number;
    startTxid?: string;
    onClusterDecision?: (info: {
      type: 'inputs' | 'outputs';
      txid: string;
      count: number;
      maxOutputs: number;
    }) => 'cluster' | 'limit' | 'all';
  }
)
```

**Benefits**:
- User maintains control over rendering performance
- Can choose based on their machine/browser
- Prevents unexpected browser crashes

### Solution 4: Respect Max Outputs Setting Everywhere

**Problem**: `maxOutputs` setting ignored when creating clusters or for starting TX

**Fix**: Apply maxOutputs limit BEFORE making clustering decisions

**Location**: `frontend/src/utils/graphBuilderBipartite.ts`

```typescript
// Use backend counts for clustering decision
const actualInputCount = txNode.metadata?.inputCount ?? 0;
const actualOutputCount = txNode.metadata?.outputCount ?? 0;

// But respect user's maxOutputs setting for what we actually fetch/display
const inputAddrsToShow = inputAddrs.slice(0, maxOutputs);
const outputAddrsToShow = outputAddrs.slice(0, maxOutputs);

// Show clustering only if ACTUAL count exceeds threshold
// But display only up to maxOutputs
if (actualInputCount >= 10 && inputAddrsToShow.length > 0) {
  console.log(`TX has ${actualInputCount} inputs, showing first ${inputAddrsToShow.length}`);
  // Create cluster node showing: "350 inputs (20 shown)"
}
```

### Solution 5: Lazy Address Loading with User Control

**Problem**: Need to load addresses progressively without overwhelming user

**Approach**: 
1. Backend returns TX with counts only (Solution 1 ensures this when hops=0)
2. Frontend displays: "TX with 350 inputs and 375 outputs"
3. User prompted: "How to display?"
   - **Option A**: "Show as clusters" → Create cluster nodes, no addresses loaded yet
   - **Option B**: "Show first N" → Backend fetches N addresses, rest in cluster
   - **Option C**: "Show all" → Warning: "This may take 30+ seconds and affect browser performance. Continue?"
4. User can expand clusters later with "Load more" button

**Benefits**:
- Initial load: < 1 second (just the TX node with counts)
- User decides data vs performance tradeoff
- Progressive disclosure of complexity
- No surprise browser hangs

---

## Implementation Priority

### Phase 1: Backend - Respect Hop Levels (15 minutes) ⚡ CRITICAL
**Issue**: Backend ignores hop settings and fetches everything
**Fix**: Solution 1 - Wrap address fetching in hop level check
**Impact**: 2+ minutes → < 1 second for single TX view
**Files**: `backend/app/api/trace.py`

Steps:
1. Add inputCount/outputCount to TX metadata (lines 67-73, 147-154)
2. Wrap input/output address fetching in `if request.hops_before > 0 or request.hops_after > 0` check
3. Log skipping message when hops=0

### Phase 2: Frontend - Use Backend Counts (15 minutes) ⚡ CRITICAL
**Issue**: Frontend counts edges instead of using backend metadata
**Fix**: Solution 2 - Always use metadata.inputCount/outputCount
**Impact**: Accurate counts for clustering decisions
**Files**: `frontend/src/utils/graphBuilderBipartite.ts`

Steps:
1. Change fallback from `inputAddresses.length` to `0`
2. Add warning log if backend counts missing
3. Update ALL clustering logic to use metadata counts, not edge counts
4. Test that "350 inputs" displays correctly, not "60 inputs"

### Phase 3: UX - Clustering Confirmation (30 minutes) 
**Issue**: Auto-clustering can overwhelm rendering
**Fix**: Solution 3 - Prompt user before displaying large TX
**Impact**: User control over performance vs detail
**Files**: `frontend/src/App.tsx`, `frontend/src/utils/graphBuilderBipartite.ts`

**Decision Needed**: Approach A (metadata flag) or Approach B (callback)?
- **Approach A** (Recommended): Simpler, metadata-based
- **Approach B**: More flexible, callback-based

### Phase 4: Respect Settings (15 minutes)
**Issue**: maxOutputs setting ignored
**Fix**: Solution 4 - Apply limit before clustering
**Impact**: User settings actually work
**Files**: `frontend/src/utils/graphBuilderBipartite.ts`

### Phase 5: Lazy Loading (Future Enhancement)
**Issue**: No progressive loading of addresses
**Fix**: Solution 5 - "Load more" functionality
**Impact**: Better UX for very large transactions
**Files**: Multiple - requires expand functionality

---

## Testing Plan

### Test 1: Single Transaction with Counts Only
```bash
curl -X POST "http://localhost:8000/api/trace/utxo" \
  -H "Content-Type: application/json" \
  -d '{
    "txid": "ae24e3ba533427883809b267e5b55064827b29b43d9f2e38b8423dcdcc22ab9a",
    "vout": 0,
    "hops_before": 0,
    "hops_after": 0
  }' --max-time 5
```

**Expected**:
- ✅ Returns in < 1 second
- ✅ TX node with metadata: `"inputCount": 350, "outputCount": 375`
- ✅ No address nodes (hops=0)
- ✅ Backend logs: "Skipping address fetching for single transaction view"

### Test 2: Frontend Displays Accurate Counts
**Action**: Load TX ae24e3ba... in frontend with hops=0

**Expected**:
- ✅ Transaction node shows "350 inputs, 375 outputs"
- ✅ No addresses displayed initially
- ✅ No "60 inputs" or other incorrect count
- ✅ Console logs: Using metadata counts

### Test 3: User Confirmation for Large TX
**Action**: User requests to expand inputs

**Expected**:
- ✅ Dialog appears: "This transaction has 350 inputs. How would you like to display them?"
- ✅ Options: "Show as cluster", "Show first 20", "Show all"
- ✅ User's choice is respected
- ✅ Setting "max outputs: 16" is honored

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

