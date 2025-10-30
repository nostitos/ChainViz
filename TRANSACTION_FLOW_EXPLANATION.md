# Transaction Flow & Positioning Logic - Complete Explanation

## 🎯 Core Concepts

### Bitcoin Transaction Basics
```
INPUT ADDRESSES → TRANSACTION → OUTPUT ADDRESSES
   (spending)      (validator)     (receiving)
```

A transaction:
- **INPUTS**: Previous outputs being spent (where funds COME FROM)
- **OUTPUTS**: New outputs being created (where funds GO TO)

### Edge Direction in ChainViz

**RULE**: Edges always point in the direction of Bitcoin flow (from source to destination).

```
Address A → TX1 → Address B
```
- `Address A → TX1`: Address A is SPENDING (input to TX1)
- `TX1 → Address B`: TX1 is PAYING (output to Address B)

---

## 🔍 Backend Logic (trace.py)

### For Address Tracing

When tracing address `1ABC...`:

1. **Get transaction history** from Electrum
   - Returns ALL txids where address appears (inputs OR outputs)

2. **Fetch each transaction** and determine direction:
   ```python
   has_output_to_addr = any(out.address == address for out in tx.outputs)
   has_input_from_addr = not has_output_to_addr  # Initial assumption
   ```

3. **Resolve inputs** (to confirm address spending):
   - For each TX input, fetch the PREVIOUS transaction
   - Check if the previous output's address matches our address
   - If YES: Address is spending → Create `Address → TX` edge

4. **Create edges** based on hop direction:
   ```python
   # hops_before > 0: Include TXs that pay TO address (LEFT of address)
   if has_output_to_addr and hops_before > 0:
       edge = EdgeData(source=tx_id, target=addr_id)  # TX → Address
   
   # hops_after > 0: Include TXs where address spends (RIGHT of address)
   if has_input_from_addr and hops_after > 0:
       edge = EdgeData(source=addr_id, target=tx_id)  # Address → TX
   ```

### Transaction Metadata
Backend sends `inputCount` and `outputCount` for each transaction:
- `inputCount`: **Total number of inputs** in the transaction (blockchain fact)
- `outputCount`: **Total number of outputs** in the transaction (blockchain fact)

**IMPORTANT**: These counts are **NOT** the same as the number of address nodes shown in the graph!
- Graph might show 5 input addresses, but TX has 348 inputs (limited by `max_addresses_per_tx`)
- These counts reflect the ACTUAL blockchain transaction structure

---

## 🎨 Frontend Logic (graphBuilderBipartite.ts)

### Edge Interpretation

The frontend receives edges from backend and categorizes them:

```typescript
// TX → Address: TX is paying TO the address
if (e.source.startsWith('tx_') && e.target.startsWith('addr_')) {
  txOutputs.set(tx_id, [addr_id]);           // TX perspective: address is output
  addrReceiving.set(addr_id, [tx_id]);       // Address perspective: TX pays to me
}

// Address → TX: Address is spending TO the transaction
if (e.source.startsWith('addr_') && e.target.startsWith('tx_')) {
  txInputs.set(tx_id, [addr_id]);            // TX perspective: address is input  
  addrSending.set(addr_id, [tx_id]);         // Address perspective: I spend to TX
}
```

### Address-Centric Layout

When the starting node is an ADDRESS (not transaction):

```typescript
const receivingTxs = addrReceiving.get(startAddr.id);  // TXs where addr receives
const sendingTxs = addrSending.get(startAddr.id);      // TXs where addr spends
const bidirTxs = addrBidirectional.get(startAddr.id);  // TXs both ways
```

**Positioning**:
- **LEFT of address**: `receivingTxs` (TXs that pay TO address)
- **RIGHT of address**: `sendingTxs` (TXs where address spends)
- **BELOW address**: `bidirTxs` (address both receives AND spends in same TX)

---

## 🚨 Current Issues

### Problem 1: Double Loading

**Symptom**: "Loads correctly first, then loads again on the other side"

**Suspected Cause**: 
- Frontend might be calling `buildGraphFromTraceDataBipartite` twice
- Or backend is returning duplicate edges
- Or bidirectional detection is incorrectly moving nodes

**Debug Steps**:
1. Check console for "📊 buildGraphFromTraceDataBipartite called" (should appear ONCE per trace)
2. Check backend logs for edge creation (look for duplicate edges with same source/target)
3. Check if bidirectional detection is removing TXs from one side but they reappear

### Problem 2: InputCount/OutputCount Mismatch

**Symptom**: "Number of input and output in transaction box doesn't match reality"

**Current Behavior**:
```typescript
metadata: {
  inputCount: txNode.metadata?.inputCount ?? 0,   // From backend
  outputCount: txNode.metadata?.outputCount ?? 0, // From backend
}
```

**Question**: What is "reality"?
- Reality A: Blockchain truth (348 inputs, 375 outputs) ← Backend provides this
- Reality B: Graph display (60 inputs shown, 375 outputs shown) ← UI visual
- Reality C: Number of connected edges in graph ← Don't use this!

**Current Rule**: We use Reality A (backend counts) because they're the source of truth.

### Problem 3: Left-Right Confusion

**Symptom**: "Complete mixup of left-right, input-output at different levels"

**Analysis**:
The terms are context-dependent:

| Context | LEFT means | RIGHT means |
|---------|-----------|-------------|
| **From Address POV** | TXs where I **receive** | TXs where I **spend** |
| **From TX POV** | Addresses that **send to me** (inputs) | Addresses I **send to** (outputs) |
| **Bitcoin Reality** | Previous outputs (inputs) | New outputs (outputs) |
| **Edge Direction** | Source → Target | Source → Target |

**Current Implementation**:
```typescript
// Address-centric (correct?)
const receivingTxs = addrReceiving.get(addr);  // TXs with TX→Addr edges (LEFT)
const sendingTxs = addrSending.get(addr);      // TXs with Addr→TX edges (RIGHT)

// TX-centric (correct?)
const txInputs = txInputs.get(tx);   // Addrs with Addr→TX edges (LEFT of TX)
const txOutputs = txOutputs.get(tx); // Addrs with TX→Addr edges (RIGHT of TX)
```

---

## ✅ Expected Behavior

### When Loading Address `1ABC...` with 1 hop back, 1 hop forward:

1. **Backend returns**:
   - Address node: `addr_1ABC...` (marked `is_starting_point: true`)
   - 15 TX nodes where address receives (have `TX→Addr` edges)
   - 15 TX nodes where address spends (have `Addr→TX` edges)
   - Metadata for each TX: `inputCount`, `outputCount` (total blockchain counts)

2. **Frontend layout**:
   - Address at center (x=0, y=0)
   - 15 receiving TXs on LEFT (x=-480)
   - 15 sending TXs on RIGHT (x=+480)
   - 0 bidirectional TXs BELOW (y=+300)

3. **Transaction nodes show**:
   - Label: First 16 chars of txid
   - Metadata: `inputCount: 348, outputCount: 375` (from blockchain)
   - **NOT** the number of visible address nodes connected

4. **Edges**:
   - Green edges connecting addresses to TXs
   - Width based on amount (square root scaling)
   - Direction follows Bitcoin flow

### When Expanding a Transaction Node:

Currently NOT IMPLEMENTED for address-centric mode.
- Expanding should add more addresses (inputs/outputs of that TX)
- Should preserve the central address position
- New addresses positioned relative to their TX, not the central address

---

## 🔧 Recommended Fixes

### Fix 1: Add Debug Logging
Add console logs to identify double-loading:

```typescript
// At start of buildGraphFromTraceDataBipartite
console.log('🔍 BUILD START:', { 
  txCount: data.nodes.filter(n => n.type === 'transaction').length,
  addrCount: data.nodes.filter(n => n.type === 'address').length,
  edgeCount: data.edges.length,
  startingAddr: data.nodes.find(n => n.metadata?.is_starting_point)?.id
});

// After edge categorization
console.log('🔍 EDGE CATEGORIZATION:', {
  txInputs: Array.from(txInputs.entries()).map(([tx, addrs]) => `${tx.substring(0,20)}: ${addrs.length} inputs`),
  txOutputs: Array.from(txOutputs.entries()).map(([tx, addrs]) => `${tx.substring(0,20)}: ${addrs.length} outputs`),
  addrReceiving: Array.from(addrReceiving.entries()).map(([addr, txs]) => `${addr.substring(0,25)}: ${txs.length} receiving TXs`),
  addrSending: Array.from(addrSending.entries()).map(([addr, txs]) => `${addr.substring(0,25)}: ${txs.length} sending TXs`),
});

// After positioning
console.log('🔍 POSITIONED NODES:', {
  totalNodes: nodes.length,
  txNodes: nodes.filter(n => n.type === 'transaction').length,
  addrNodes: nodes.filter(n => n.type === 'address').length,
  leftTxs: nodes.filter(n => n.type === 'transaction' && n.position.x < -400).length,
  rightTxs: nodes.filter(n => n.type === 'transaction' && n.position.x > 400).length,
  belowTxs: nodes.filter(n => n.type === 'transaction' && n.position.y > 200).length,
});
```

### Fix 2: Clarify Transaction Counts

Add a tooltip/explanation on transaction nodes:
```typescript
// In TransactionNode component
<div title={`Total on blockchain: ${inputCount} inputs, ${outputCount} outputs. Showing: ${connectedInputs} / ${connectedOutputs}`}>
  {inputCount} inputs / {outputCount} outputs
</div>
```

### Fix 3: Verify Edge Direction

Add validation after edge creation:
```typescript
// Validate edges match Bitcoin reality
data.edges.forEach(edge => {
  if (edge.source.startsWith('tx_') && edge.target.startsWith('addr_')) {
    // TX → Address: This is an OUTPUT of the TX
    console.log(`✅ Valid output edge: ${edge.source.substring(0,20)} → ${edge.target.substring(0,25)} (${edge.amount} sats)`);
  } else if (edge.source.startsWith('addr_') && edge.target.startsWith('tx_')) {
    // Address → TX: This is an INPUT to the TX
    console.log(`✅ Valid input edge: ${edge.source.substring(0,25)} → ${edge.target.substring(0,20)} (${edge.amount} sats)`);
  } else {
    console.error(`❌ Invalid edge direction: ${edge.source} → ${edge.target}`);
  }
});
```

---

## 📋 Testing Checklist

When loading address `1nTB9VyK9BEDVkFztjMb5QqJsxYAkAi1Q` with 1,1 hops:

- [ ] Console shows "Using ADDRESS-CENTRIC layout"
- [ ] Console shows receiving TXs count = sending TXs count (or close)
- [ ] No "Positioning 287 standalone addresses" message
- [ ] No duplicate edge warnings
- [ ] Transaction nodes show correct inputCount/outputCount from blockchain
- [ ] Clicking a TX shows details matching blockchain explorer
- [ ] Edges flow in correct direction (TX→Addr for outputs, Addr→TX for inputs)
- [ ] No TXs appear on both left AND right of address (unless bidirectional)
- [ ] Bidirectional TXs (if any) positioned BELOW address

---

## 🤔 Questions for User

1. **When you say "loads them again on the other side"**:
   - Do you mean TXs that were on the LEFT now also appear on the RIGHT?
   - Or do you mean the SAME TXs move from LEFT to RIGHT?
   - Or do you mean NEW TXs are added in a second wave?

2. **For "inputCount/outputCount mismatch"**:
   - What numbers are shown in the UI?
   - What numbers do you expect (from blockchain explorer)?
   - Are you comparing to the graph display or blockchain reality?

3. **For "left-right confusion"**:
   - Can you point to a specific transaction and describe:
     - Where it appears in the graph (left/right of address)
     - What direction it SHOULD be (left/right)
     - What the blockchain explorer says about it

With these answers, we can pinpoint the exact issue and fix it.

