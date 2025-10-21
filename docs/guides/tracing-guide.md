# Tracing Guide

Complete guide to tracing Bitcoin transactions and addresses with ChainViz.

---

## Overview

ChainViz traces Bitcoin transactions using **hops** instead of depth:

- **Hops Before**: How many steps backward to trace (find sources)
- **Hops After**: How many steps forward to trace (find destinations)

Each "hop" represents one transaction in the chain.

---

## Basic Tracing

### Trace from Address

**Format**: Just enter the Bitcoin address

```
1Gw5PwF6sGVxomatMbj5p4bkk7ED4pyfbu
```

**Settings**:
- **Hops Before**: 0 (don't trace backward)
- **Hops After**: 0 (don't trace forward)

**Result**: Shows the address and its immediate transactions (inputs and outputs)

### Trace from Transaction

**Format**: Enter the transaction ID (txid)

```
49fc56d4c1acd8946cec82d7bf8bf35035118a87ccf70dd29c7d349ef1a530e3
```

**Result**: Shows all inputs and outputs for that transaction

---

## Advanced Tracing

### Find Where Funds Came From

Set **Hops Before** to trace backward:

```
Address: 1Gw5PwF6sGVxomatMbj5p4bkk7ED4pyfbu
Hops Before: 5
Hops After: 0
```

This traces 5 transactions backward to find the original source of funds.

### Find Where Funds Went

Set **Hops After** to trace forward:

```
Address: 1Gw5PwF6sGVxomatMbj5p4bkk7ED4pyfbu
Hops Before: 0
Hops After: 5
```

This traces 5 transactions forward to find where funds were sent.

### Trace Both Directions

```
Address: 1Gw5PwF6sGVxomatMbj5p4bkk7ED4pyfbu
Hops Before: 3
Hops After: 3
```

Shows 3 hops in both directions for complete context around the address.

---

## Understanding the Graph

### Node Types

**🟠 Address Nodes**:
- Bitcoin addresses
- Shows balance and transaction count
- Click to see full details in side panel

**🔵 Transaction Nodes**:
- Bitcoin transactions
- Shows txid and timestamp
- Has expand buttons (◀ ▶) for inputs/outputs

### Edge Types

**Green edges** (solid):
- High confidence (>80%)
- Strong evidence of ownership

**Amber edges** (solid):
- Medium confidence (60-80%)
- Moderate evidence

**Red edges** (dashed):
- Low confidence (<60%)
- Weak evidence

### Edge Width

Edge thickness represents transaction value:
- **Thick edges** = Large amounts
- **Thin edges** = Small amounts

Adjust the **Edge Width Scale** slider to make differences more visible.

---

## Expanding Nodes

### Expand Transaction

Transaction nodes have expand buttons:

**◀ Expand Inputs**:
- Shows where the transaction's inputs came from
- Adds more address nodes to the left

**▶ Expand Outputs**:
- Shows where the transaction's outputs went
- Adds more address nodes to the right

### Expand Address

Address nodes can be expanded in both directions:

**Expand Forward**:
- Shows transactions where this address is an output
- Traces where funds went

**Expand Backward**:
- Shows transactions where this address is an input
- Traces where funds came from

---

## Settings

### Max Outputs Per Transaction

**Range**: 1-300

Controls how many addresses to show for each transaction:

- **Low (10-20)**: Shows only the most important addresses
- **Medium (50-100)**: Shows most addresses
- **High (200-300)**: Shows all addresses (slower)

**Use case**: Large transactions with many outputs can be overwhelming. Lower this to focus on important flows.

### Max Transactions to Expand

**Range**: 1-300

Controls how many transactions to show when expanding:

- **Low (10-20)**: Shows only recent/important transactions
- **Medium (50-100)**: Shows most transactions
- **High (200-300)**: Shows all transactions (slower)

**Use case**: Addresses with many transactions can create cluttered graphs. Lower this to focus on recent activity.

### Edge Width Scale

**Range**: 1-500

Controls the thickness of edges:

- **Low (1-50)**: Thin edges, subtle differences
- **Medium (100-200)**: Moderate thickness
- **High (300-500)**: Thick edges, very visible

**Use case**: Make large transactions stand out more clearly.

---

## Layout Options

### Tree Layout

Click **🌳 Tree Layout** to organize the graph hierarchically:

- **Root node** at the center
- **Children** arranged by layer
- **Minimal edge crossings**
- **Easier to follow flow**

**Use case**: Complex graphs with many nodes become easier to read.

### Force Repulsion

Toggle **⚡ Force Repulsion** to spread nodes apart:

- **Physics-based** node spacing
- **Prevents overlapping**
- **Better visibility**

**Use case**: When nodes are too close together or overlapping.

### Edge Tension

Toggle **🔗 Edge Tension** to pull connected nodes closer:

- **Reduces long edges**
- **Tighter layout**
- **Better clustering**

**Use case**: When nodes are too spread out.

---

## Example Scenarios

### Scenario 1: Find the Source

**Goal**: Find where a suspicious address received funds from

**Steps**:
1. Enter the suspicious address
2. Set **Hops Before**: 10
3. Set **Hops After**: 0
4. Click **Trace**
5. Expand interesting transaction nodes
6. Look for patterns (exchange addresses, known entities)

### Scenario 2: Track the Destination

**Goal**: Find where stolen funds were sent

**Steps**:
1. Enter the theft transaction
2. Set **Hops Before**: 0
3. Set **Hops After**: 10
4. Click **Trace**
5. Expand all transaction nodes
6. Look for exchange deposits or known addresses

### Scenario 3: Complete Investigation

**Goal**: Full context around a suspicious transaction

**Steps**:
1. Enter the transaction ID
2. Set **Hops Before**: 5
3. Set **Hops After**: 5
4. Click **Trace**
5. Enable **Tree Layout**
6. Expand nodes selectively
7. Use **Edge Width Scale** to highlight large flows

### Scenario 4: Wallet Analysis

**Goal**: Analyze all activity from a wallet

**Steps**:
1. Enter the wallet's main address
2. Set **Hops Before**: 3
3. Set **Hops After**: 3
4. Set **Max Transactions**: 50
5. Click **Trace**
6. Enable **Force Repulsion**
7. Look for patterns:
   - Change addresses
   - Recurring transactions
   - Exchange interactions

---

## Heuristics Explained

ChainViz uses multiple heuristics to infer ownership and relationships:

### Common-Input Clustering (90% confidence)

**Principle**: All inputs in a transaction likely belong to the same entity.

**Example**: If Alice sends 0.5 BTC using 3 inputs (0.2 + 0.2 + 0.1), those 3 addresses likely belong to Alice.

**Exception**: CoinJoin transactions break this rule.

### Change Detection

**Address Reuse (95% confidence)**:
- If an address was used before, it's probably a payment, not change

**Round Amounts (70% confidence)**:
- Round numbers (1.0 BTC) are intentional payments
- Odd amounts (1.23456789 BTC) are likely change

**Script Type Matching (80% confidence)**:
- Change outputs match input script types
- P2PKH inputs → P2PKH change

**Optimal Change (75% confidence)**:
- Unnecessary inputs suggest larger output is payment

### Peel Chains

**Pattern**: Sequential small payments from a large UTXO.

**Example**:
```
Large UTXO (10 BTC)
  ↓
TX1: 0.1 BTC to Alice
  ↓
TX2: 0.1 BTC to Bob
  ↓
TX3: 0.1 BTC to Charlie
```

**Use case**: Money laundering, wallet management.

### CoinJoin Detection

**Indicators**:
- Multiple inputs with equal-value outputs
- Multiple outputs with same value
- No clear change output

**Effect**: Breaks common-input clustering heuristic.

**Action**: ChainViz flags these and warns that clustering is unreliable.

---

## Performance Tips

### 1. Start Small

Begin with 0-2 hops and expand selectively:
- Faster loading
- Less overwhelming
- Easier to understand

### 2. Use Selective Expansion

Don't expand everything at once:
- Click expand buttons on interesting nodes
- Build the graph gradually
- Focus on important flows

### 3. Adjust Settings

Tune for your use case:
- **Large transactions**: Lower Max Outputs
- **Active addresses**: Lower Max Transactions
- **Complex graphs**: Enable Tree Layout

### 4. Use Fast Servers

Select the fastest Electrum server:
- Click **⚙️ Settings**
- Try different servers
- Use **🧪 Test** to check speed

### 5. Enable Caching

If using Redis:
- Repeated queries are instant
- Faster expansion
- Better performance

---

## Troubleshooting

### Graph is Empty

**Possible causes**:
- Invalid address format
- Transaction not found
- Server connection issue

**Solutions**:
1. Verify address format (bc1, 1, or 3 prefix)
2. Check transaction exists on blockchain
3. Try different Electrum server

### Graph is Too Slow

**Possible causes**:
- Too many hops
- Too many max outputs
- Slow Electrum server

**Solutions**:
1. Reduce hops (try 0-2 first)
2. Lower Max Outputs (try 20-50)
3. Switch to faster server

### Nodes Overlap

**Solutions**:
1. Enable **Force Repulsion**
2. Use **Tree Layout**
3. Manually drag nodes apart

### Can't See Important Flows

**Solutions**:
1. Increase **Edge Width Scale**
2. Expand more nodes
3. Increase **Max Outputs**

---

## Next Steps

- Learn about [Heuristics](../guides/heuristics-explained.md) in detail
- Master the [UI](../guides/ui-guide.md) features
- Check the [API Reference](../guides/api-reference.md) for automation
- See [Troubleshooting](../troubleshooting/common-issues.md) for help

---

## Resources

- **Bitcoin Explorer**: https://mempool.space/
- **Electrum Protocol**: https://electrum-protocol.readthedocs.io/
- **React Flow Docs**: https://reactflow.dev/

**Happy tracing! 🔍**

