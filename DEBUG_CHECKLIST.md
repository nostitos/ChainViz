# Debug Checklist for Duplicate Edge Issue

## Issue Summary
When loading address `1nTB9VyK9BEDVkFztjMb5QqJsxYAkAi1Q` with 1,1 hops:
- Transaction `2c302c88f7fa20e8b3cda4da2844e2c3a5369fa3ed75789e86f676ab35929a2e` gets:
  - ✅ **First edge (CORRECT)**: `TX → Address` (16 BTC output, RIGHT side of TX to LEFT side of address)
  - ❌ **Second edge (WRONG)**: Opposite direction edge created later

## Verified Facts
1. **Blockchain Reality** (from mempool.space):
   - TX has **9 inputs, 2 outputs**
   - One output pays 16 BTC to address `1nTB9VyK9BEDVkFztjMb5QqJsxYAkAi1Q`
   - Should ONLY have edge: `TX → Address`

2. **User Observation**:
   - "inputCount on nodebox is taken from another transaction" (but we verified counts are correct)
   - "A bit later another edge get created to it that's opposite and wrong"

## What We've Added

### Frontend Logging (graphBuilderBipartite.ts)
```
🔍 RAW INPUT DATA: {...}
🔍 ALL TX NODES FROM BACKEND:
  0: 2c302c88...929a2e - inputs=9, outputs=2  ← Should show correct counts
  ...
  
📍 LEFT TX 0: 2c302c88...929a2e - inputs=9, outputs=2  ← If on LEFT (receiving)
or
📍 RIGHT TX 0: 2c302c88...929a2e - inputs=9, outputs=2  ← If on RIGHT (sending)
```

### Backend Logging (trace.py)
```
🔍 ALL EDGES CREATED:
  0: tx_2c302c88... → addr_1nTB9... (16.00000000 BTC)  ← CORRECT
  ...
  N: addr_1nTB9... → tx_2c302c88... (???.???????? BTC)  ← WRONG (if exists)
  
⚠️ DUPLICATE EDGES DETECTED:  ← Will show if same edge appears twice
  tx_2c302c88... → addr_1nTB9...: appears 2 times
```

## Steps to Debug

### 1. Restart Backend
```bash
cd /Users/t/Documents/vibbbing/ChainViz/backend
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --log-level info
```

### 2. Clear Browser Cache & Reload
- Hard refresh: Cmd+Shift+R
- Or clear cache completely

### 3. Load Address
- Navigate to: `http://localhost:5173/?q=1nTB9VyK9BEDVkFztjMb5QqJsxYAkAi1Q`
- This should auto-load with 1,1 hops

### 4. Check Backend Logs (Terminal)
Look for these sections in order:

#### A. Transaction Fetching
```
⚡ Batch fetching 30 transactions...
Successfully fetched 30 of 30 transactions
```

#### B. Edge Creation (Critical Section)
For each transaction, look for:
```
TX 2c302c88f7fa20e8b3cd: 1 outputs to addr, 0 inputs from addr
```
- Should say `1 outputs to addr` (correct - 16 BTC output)
- Should say `0 inputs from addr` (correct - address doesn't spend here)

#### C. Directional Filtering
```
✅ Including 30 of 30 TXs based on hop direction
```

#### D. All Edges List
```
🔍 ALL EDGES CREATED:
  0: tx_abc... → addr_1nTB9... (1.23456789 BTC)
  1: tx_def... → addr_1nTB9... (2.34567890 BTC)
  ...
  15: tx_2c302c88f7fa20e8b3cd → addr_1nTB9VyK9BEDVkFztj (16.00000000 BTC)  ← CORRECT
  ...
  [Look for any OPPOSITE edges like:]
  28: addr_1nTB9VyK9BEDVkFztj → tx_2c302c88f7fa20e8b3cd (???.???????? BTC)  ← WRONG
```

#### E. Duplicate Detection
```
⚠️ DUPLICATE EDGES DETECTED:
  [Should be empty if no duplicates]
  
or

  tx_2c302c88... → addr_1nTB9...: appears 2 times  ← Problem!
  addr_1nTB9... → tx_2c302c88...: appears 1 times  ← Wrong direction!
```

### 5. Check Frontend Console (Browser DevTools)
Look for these sections:

#### A. Raw Data
```
🔍 RAW INPUT DATA: {
  totalNodes: 31,
  txNodes: 30,
  addrNodes: 1,
  totalEdges: 30 or 60?,  ← If 60, backend sent duplicates!
  startingPoint: 'addr_1nTB9VyK9BEDVkFztjMb5QqJsxYAkAi1Q'
}
```

#### B. TX Metadata
```
🔍 ALL TX NODES FROM BACKEND:
  0: abc123... - inputs=5, outputs=2
  ...
  15: 2c302c88f7fa20e8b3cd - inputs=9, outputs=2  ← Verify correct
```

#### C. Edge Categorization
```
🔍 EDGE CATEGORIZATION: {
  numTxsWithInputs: 15,  ← TXs with Address→TX edges
  numTxsWithOutputs: 15, ← TXs with TX→Address edges
  numAddrsWithReceiving: 1,  ← Should be 1 (our address)
  numAddrsWithSending: 1,    ← Should be 1 (our address)
  numAddrsWithBidirectional: 0  ← Should be 0
}
```

#### D. Address-Centric Layout
```
📍 Using ADDRESS-CENTRIC layout for starting address: addr_1nTB9VyK9BEDVkFztj
  Receiving TXs (LEFT): 15 - [abc123, def456, ..., 2c302c88f7fa20e8b3cd?, ...]
  Sending TXs (RIGHT): 15 - [ghi789, jkl012, ..., 2c302c88f7fa20e8b3cd?, ...]
  Bidirectional TXs (BELOW): 0 - []
```

**Key Question**: Does `2c302c88f7fa20e8b3cd` appear in LEFT (receiving) or RIGHT (sending)?
- **Should be**: LEFT (receiving) - because TX sends 16 BTC TO address
- **If it's in**: RIGHT (sending) - WRONG! Bug in edge categorization

#### E. Positioning
```
📍 LEFT TX 0: 2c302c88f7fa20e8b3cd - inputs=9, outputs=2
```
or
```
📍 RIGHT TX 0: 2c302c88f7fa20e8b3cd - inputs=9, outputs=2
```

**Which side is it on?** Should be LEFT.

## Expected vs Actual

### ✅ Expected Behavior
1. **Backend creates**:
   - 1 edge: `tx_2c302c88... → addr_1nTB9...` (16 BTC)
   - Total edges: 30 (15 receiving + 15 sending)

2. **Frontend categorizes**:
   - `addrReceiving` contains `tx_2c302c88...` (because edge is TX→Addr)
   - TX positioned on LEFT of address

3. **Graph shows**:
   - TX on LEFT side of address
   - One edge connecting RIGHT handle of TX to LEFT handle of address
   - Edge labeled "16.00000000 BTC"

### ❌ Actual Behavior (Reported)
1. First: Correct edge appears
2. Later: Opposite edge appears (same TX, wrong direction)

## Possible Root Causes

### Hypothesis 1: Backend Creates Duplicate Edges
**Evidence needed**: Backend logs show 2 edges for same TX
**Cause**: Fallback logic at line 669-696 triggering incorrectly
**Fix**: Add condition to prevent fallback when edge already exists

### Hypothesis 2: Backend Creates Opposite Edges
**Evidence needed**: Backend logs show both `TX→Addr` AND `Addr→TX` for same TX
**Cause**: Bug in input detection logic (line 549: `has_input_from_addr = not has_output_to_addr`)
**Fix**: Properly verify inputs before creating `Addr→TX` edge

### Hypothesis 3: Frontend Duplicates Edges
**Evidence needed**: Frontend receives 30 edges but creates 60
**Cause**: Edge creation loop runs twice (unlikely - only one loop)
**Fix**: Ensure `buildGraphFromTraceDataBipartite` called once

### Hypothesis 4: Edge Direction Reversed
**Evidence needed**: Frontend shows TX on wrong side (RIGHT instead of LEFT)
**Cause**: Bug in edge categorization (lines 89-101)
**Fix**: Review edge source/target interpretation

## What to Report

Please paste:

1. **Backend log section** for TX `2c302c88...`:
   ```
   TX 2c302c88f7fa20e8b3cd: X outputs to addr, Y inputs from addr
   ```

2. **Backend ALL EDGES** that mention `2c302c88...`:
   ```
   N: tx_2c302c88... → addr_1nTB9... (16.00000000 BTC)
   [any others?]
   ```

3. **Frontend categorization** for this TX:
   ```
   Receiving TXs (LEFT): ... [does it include 2c302c88?]
   Sending TXs (RIGHT): ... [does it include 2c302c88?]
   ```

4. **Screenshot** of the graph showing:
   - Where TX `2c302c88...` appears (LEFT or RIGHT of address)
   - How many edges connect to it
   - The edge amounts

## Quick Tests

### Test 1: Check Edge Count
- Frontend `totalEdges` should equal backend edge count
- If Frontend > Backend: Frontend duplicating
- If Frontend < Backend: Frontend filtering (shouldn't happen)

### Test 2: Check TX Position
- TX `2c302c88...` should be on LEFT (receives TO address)
- If on RIGHT: Edge categorization bug
- If appears on BOTH sides: Duplicate edge bug

### Test 3: Check Edge Direction
- Click on the edge between TX and address
- Inspect in React DevTools: `source` and `target`
- Should be: `source: 'tx_2c302c88...'`, `target: 'addr_1nTB9...'`
- If opposite: Backend created wrong edge

---

**Once we have the logs, we can pinpoint the exact issue and fix it!**

