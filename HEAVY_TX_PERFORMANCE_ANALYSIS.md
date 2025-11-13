# Heavy Transaction Performance Analysis

## Transaction Details
- **TXID**: `71f6598704c4e36487fbff004354bc30edf916c187d3ee354f9bdff8ca4c4320`
- **Inputs**: 245 (actual count - discovered via testing)
- **Outputs**: 309
- **Result**: 310 nodes, 309 edges loaded

## Current Performance

### Load Time: ~20-25 seconds
- **Too slow!** Should be under 5 seconds

### Success Rate: 74.2%
- **Total requests**: 1,405
- **Successes**: 1,043
- **Failures**: 362 (25.8%)
- **Problem**: High failure rate causes retries and slowness

### Batch Size Testing Results
```
10 TXs:  ✅ 100% success (0.73s)
50 TXs:  ✅ 100% success (1.15s)  
100 TXs: ❌ 0-25% success - RATE LIMITED
```

## Root Causes

### 1. Electrum Server Rate Limiting
- Servers from 1209k.com have low rate limits
- Batch requests >50 items fail completely
- Current batch size (50) still causes some failures

### 2. Server Quality Issues
- Pool has 30 servers but only 26 connected (87%)
- Many servers in fallback list (247) are slow or unreliable
- 25.8% failure rate indicates poor server quality

### 3. Retry Overhead
- Each failed request triggers up to 3 retries
- 362 failures × 3 retries = 1,086 wasted requests
- Adds 10-15 seconds to load time

## Solutions

### Option 1: Use ONLY Top Quality Servers ⭐
**Best approach for reliability**

```python
# Use only the fastest, most reliable servers
TOP_SERVERS = [
    ElectrumServer("fulcrum.sethforprivacy.com", 50002, True),  # Your trusted server
    ElectrumServer("electrum.bitaroo.net", 50002, True),        # Known reliable
    ElectrumServer("electrum.blockstream.info", 50002, True),   # Blockstream
    ElectrumServer("electrum.hodlister.co", 50002, True),       # Tested reliable
]
```

**Expected improvement**:
- Success rate: 95-99%
- Load time: 3-5 seconds
- Fewer retries, more predictable

### Option 2: Reduce Batch Size Further
**Quick fix, but not optimal**

```python
MAX_BATCH_SIZE = 25  # From 50
```

**Expected improvement**:
- Success rate: 85-90%
- Load time: 8-12 seconds
- Still has failures, but fewer

### Option 3: Implement Smart Caching
**Best for repeated loads**

```python
# Cache transaction batches for 1 hour
# Heavy TXs are rarely modified
cache_key = f"tx_batch:{','.join(sorted(txids))}"
```

**Expected improvement**:
- First load: Same as current
- Subsequent loads: <1 second
- Huge win for repeated access

### Option 4: Use Local Fulcrum Server
**Ultimate performance**

- Run Fulcrum locally
- No rate limiting
- Sub-second response times
- 100% reliability

**Expected improvement**:
- Load time: 1-2 seconds
- Success rate: 100%
- Best performance possible

## Recommended Approach

### Phase 1: Quick Win (5 minutes)
1. ✅ Use only top 5-10 known-good servers
2. ✅ Reduce batch size to 25
3. ✅ Expected: 5-8 second load time

### Phase 2: Optimization (30 minutes)
1. Implement smart batch caching
2. Add server health scoring
3. Auto-blacklist consistently failing servers
4. Expected: 3-5 second first load, <1s cached

### Phase 3: Ultimate (optional)
1. Document local Fulcrum setup
2. Provide docker-compose for easy deployment
3. Expected: 1-2 second load time

## Current Bottleneck Breakdown

For 245 inputs (limited to 100 by max_addresses_per_tx):

```
Main TX fetch:           0.3s (✅ Fast)
100 input TXs (2 batches):
  - Batch 1 (50 TXs):    1.2s + retries (3-4s)
  - Batch 2 (50 TXs):    1.2s + retries (3-4s)
  
Retry overhead:          10-15s (❌ MAJOR BOTTLENECK)
Network/parsing:         2-3s

TOTAL:                   ~20-25s
```

With high-quality servers:
```
Main TX fetch:           0.3s
100 input TXs (2 batches):
  - Batch 1 (50 TXs):    1.0s (no retries)
  - Batch 2 (50 TXs):    1.0s (no retries)
  
Network/parsing:         1-2s

TOTAL:                   ~3-4s (6x faster!)
```

## Action Items

1. ⚡ **IMMEDIATE**: Switch to curated list of top servers
2. 📊 **TODAY**: Implement server health scoring
3. 💾 **THIS WEEK**: Add batch result caching
4. 📚 **DOCUMENTATION**: Guide for local Fulcrum setup

## Success Criteria

- ✅ Load time < 5 seconds for heavy TXs
- ✅ Success rate > 95%
- ✅ Cached loads < 1 second
- ✅ No user-visible errors


