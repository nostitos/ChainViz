# Electrum vs Mempool.space Data Source Analysis

## Test Results (Oct 30, 2025)

### Test Setup
- **Electrum**: Local Fulcrum at 192.168.8.234:50002
- **Mempool.space**: Local instance at http://192.168.8.234:3006/api
- **Test Transaction**: `ae24e3ba...` (348 inputs, 376 outputs)
- **Problematic TX**: `fcc303fb...` (344 inputs, 367 outputs)

---

## Performance Comparison

| Operation | Electrum (Backend) | Mempool.space | Winner |
|-----------|-------------------|---------------|---------|
| Single TX fetch | 105ms | 7,852ms | ⚡ **Electrum** (75x faster) |
| Large TX fetch | 66ms | 5,717ms | ⚡ **Electrum** (87x faster) |
| Address lookup | 193ms | 7,919ms | ⚡ **Electrum** (41x faster) |

**Electrum is MUCH faster for individual requests.**

---

## Data Accuracy

| Data Point | Electrum | Mempool.space | Issue |
|------------|----------|---------------|-------|
| TX outputs (individual) | 367 ✅ | 367 ✅ | Both correct |
| TX outputs (batch) | **0-390** ❌ | 367 ✅ | **Electrum batch corrupted!** |
| TX inputs | 348 ✅ | 348 ✅ | Both correct |
| Prevout data | ❌ NO | ✅ YES | Mempool includes it |
| Block height | ❌ NO | ✅ YES | Mempool more complete |
| Fee | ❌ NO | ✅ YES | Mempool calculates it |

**Critical Issue**: Electrum batch responses are **corrupted/truncated** for large transactions:
- Individual fetch of `fcc303fb...`: 367 outputs ✅
- Batch fetch of `fcc303fb...`: 0-390 outputs ❌ (varies!)
- Result: **30/348 inputs have invalid vout** indices (can't find the output they claim to spend)

---

## Feature Comparison

### Electrum Pros
✅ **Very fast** (10-100ms per request)
✅ **Scriptash-based queries** (efficient for address lookups)
✅ **Low bandwidth** (smaller response sizes)
✅ **Minimal dependencies** (just TCP + JSON-RPC)
✅ **Works for basic operations**

### Electrum Cons
❌ **Batch responses corrupted** for large transactions
❌ **No prevout data** in TX responses (requires 348 additional fetches for 348 inputs!)
❌ **Missing block info** in some responses
❌ **Rate limiting** issues (cost limits)
❌ **Data inconsistencies** (vout indices don't match, outputs truncated)

### Mempool.space Pros
✅ **100% accurate data** (matches blockchain exactly)
✅ **Complete prevout data** (one request gives everything!)
✅ **Rich metadata** (fees, block heights, confirmations)
✅ **No batch corruption**
✅ **REST API** (simpler than JSON-RPC)

### Mempool.space Cons
❌ **Very slow** (7-8 seconds per request)
❌ **Large response sizes** (2-3x bigger than Electrum)
❌ **Address TX list limited** (only returns 10 TXs in test, not all 30)

---

## Current Issue Analysis

### Problem: Only 318/348 Edges Created

**Root Cause**: Electrum batch fetching returns corrupted data
- Requests 348 input transactions
- Gets 118 unique TXs back
- **But some have truncated outputs!**
- Example: `fcc303fb...` returns with 0-2 outputs instead of 367
- When we try to access `outputs[182]`, it fails
- Result: 30 inputs skipped due to "invalid vout"

**The vout indices ARE correct** (verified against mempool.space)
**The Electrum data is WRONG** (truncated outputs in batch responses)

---

## Recommendations

### Option A: Hybrid Model (RECOMMENDED)
Use **Electrum for speed**, **Mempool.space for accuracy**:

1. **Address history**: Electrum (fast, works well)
2. **Transaction basic fetch**: Electrum (fast initial load)
3. **Transaction input resolution** (prevout data): **Mempool.space**
   - One request gets ALL 348 input addresses + values
   - No batch corruption issues
   - Eliminates 348 separate Electrum fetches
4. **Transaction details panel**: Mempool.space (already implemented)

### Option B: Full Mempool.space
Switch entirely to mempool.space:
- ✅ 100% accurate data
- ✅ No corruption issues
- ❌ 40-80x slower
- ❌ May timeout on large operations

### Option C: Fix Electrum (Not Recommended)
- Investigate Fulcrum batch response truncation
- May be unfixable (server-side issue)
- Time-consuming troubleshooting

---

## Proposed Hybrid Implementation

### For Transaction Tracing (trace.py):

```python
# Current (broken):
input_txs = await blockchain_service.fetch_transactions_batch(input_txids)
# Problem: Returns truncated data, 30 inputs fail

# New (hybrid):
if len(input_txids) > 50:  # Large transaction
    # Use mempool.space for the main TX (has all prevout data)
    mempool_tx = await fetch_from_mempool(request.txid)
    # Extract all input addresses directly from prevout
    for inp in mempool_tx["vin"]:
        address = inp["prevout"]["scriptpubkey_address"]
        value = inp["prevout"]["value"]
        # Create node and edge - ALWAYS works!
else:
    # Small transaction: use Electrum (faster)
    # Current logic works fine for <50 inputs
```

### Benefits:
- ⚡ Fast for small/medium transactions (Electrum)
- ✅ Accurate for large transactions (Mempool)
- 🚀 One mempool request vs 348 Electrum batch requests
- 💯 No data corruption

---

## Test Data: Address Reuse Detection

Ran test on `ae24e3ba...` via mempool.space:
- **348 inputs**
- **348 UNIQUE addresses**
- **0 address reuse**

This confirms: Each input comes from a different address!

---

## Critical Bug Found: Address Hop Logic

**Issue**: Frontend sends `hopsBefore` as `max_hops`, completely ignoring `hopsAfter`!

```typescript
// frontend/src/App.tsx line 462
const data = await traceFromAddress(address, hopsBefore, txLimit);
//                                            ^^^^^^^^^^
//                                  Should be: Math.max(hopsBefore, hopsAfter)
```

**Result**:
- Setting "0 back, 2 forward" sends `max_hops=0` → shows nothing ❌
- Setting "1 back, 0 forward" sends `max_hops=1` → shows TXs ✅
- Setting "2 back, 2 forward" sends `max_hops=2` → shows TXs + addresses ✅

**The backend `/api/trace/address` endpoint doesn't support directional hops!**

It only has one `max_hops` parameter, which controls overall depth, not direction.

**This needs fixing**: Either:
1. Change frontend to pass `Math.max(hopsBefore, hopsAfter)`
2. OR change backend to accept `hops_before` and `hops_after` separately
3. OR use the UTXO endpoint instead (which does support directional hops)

---

## Next Steps

1. ✅ Flush Redis cache (done - had corrupted data)
2. ⏳ Fix address hop logic (hopsBefore vs hopsAfter issue)
3. ⏳ Implement hybrid model for input fetching
4. ⏳ Add mempool.space fallback for failed Electrum batches
5. ⏳ Monitor and compare performance in production

