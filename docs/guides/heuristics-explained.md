# Heuristics Explained

Detailed explanation of the heuristics ChainViz uses to analyze Bitcoin transactions.

---

## Overview

ChainViz uses **on-chain data only** to infer ownership and relationships. These heuristics are based on common patterns in Bitcoin usage, but they're not foolproof. Each heuristic includes a **confidence score** (0.0-1.0) to indicate reliability.

---

## Common-Input Clustering

### Principle

**All inputs in a transaction likely belong to the same entity.**

### Confidence: 90%

### Explanation

When creating a Bitcoin transaction, you need to gather enough inputs to cover the output amount. These inputs typically come from your own wallet, so they all belong to you.

**Example**:
```
Transaction: Alice sends 0.5 BTC to Bob

Inputs:
- Address A: 0.2 BTC
- Address B: 0.2 BTC
- Address C: 0.1 BTC

Conclusion: Addresses A, B, and C likely belong to Alice
```

### When It Fails

**CoinJoin transactions** break this rule:
- Multiple people combine their inputs
- Each person's inputs don't necessarily belong together
- Outputs are mixed and redistributed

**Example**:
```
CoinJoin Transaction:
- Alice's input: 1.0 BTC
- Bob's input: 1.0 BTC
- Charlie's input: 1.0 BTC

Outputs:
- Output 1: 1.0 BTC (mixed)
- Output 2: 1.0 BTC (mixed)
- Output 3: 1.0 BTC (mixed)

Conclusion: Inputs don't belong together!
```

### Detection

ChainViz detects CoinJoins by looking for:
- Multiple inputs with equal-value outputs
- Multiple outputs with same value
- No clear change output
- Mixing patterns

When detected, ChainViz:
- Flags the transaction as CoinJoin
- Reduces confidence in clustering
- Warns that heuristics may be unreliable

---

## Change Detection

Change detection identifies which output in a transaction is the "change" (returned to sender) versus the actual payment.

### 1. Address Reuse

**Principle**: If an address was used before, it's probably a payment, not change.

**Confidence**: 95%

**Explanation**:
- Change addresses are typically new (never used before)
- Payment addresses may have been used before
- Reusing addresses is generally avoided for privacy

**Example**:
```
Transaction:
- Input: 1.0 BTC from Address A
- Output 1: 0.5 BTC to Address B (used before) ← Payment
- Output 2: 0.49 BTC to Address C (new) ← Change
```

### 2. Round Amounts

**Principle**: Round numbers are intentional payments, odd amounts are likely change.

**Confidence**: 70%

**Explanation**:
- Payments are often round numbers (1.0 BTC, 0.5 BTC)
- Change is calculated automatically (0.23456789 BTC)
- Humans prefer round numbers for payments

**Example**:
```
Transaction:
- Input: 1.0 BTC
- Output 1: 0.5 BTC ← Likely payment (round)
- Output 2: 0.49 BTC ← Likely change (odd)
```

**Limitations**:
- Some payments use odd amounts
- Change can be round if exact
- Less reliable for small amounts

### 3. Script Type Matching

**Principle**: Change outputs match input script types.

**Confidence**: 80%

**Explanation**:
- Wallets typically use consistent script types
- Change goes back to the same script type as inputs
- Payments may go to different script types

**Script Types**:
- **P2PKH** (Legacy): Starts with `1`
- **P2SH** (SegWit): Starts with `3`
- **P2WPKH** (Native SegWit): Starts with `bc1`

**Example**:
```
Transaction with P2PKH inputs:
- Input 1: 1A1zP... (P2PKH)
- Input 2: 1BvBM... (P2PKH)

Outputs:
- Output 1: 1CRAZ... (P2PKH) ← Likely change (matches inputs)
- Output 2: bc1q... (P2WPKH) ← Likely payment (different type)
```

### 4. Optimal Change

**Principle**: Unnecessary inputs suggest larger output is payment.

**Confidence**: 75%

**Explanation**:
- If you have 1.0 BTC and need to send 0.3 BTC, you might use:
  - Option A: 0.3 BTC input → 0.3 BTC output (exact)
  - Option B: 1.0 BTC input → 0.3 BTC output + 0.7 BTC change
- Option A is more efficient (lower fees)
- Option B suggests the 1.0 BTC input was the only option

**Example**:
```
Transaction:
- Input: 1.0 BTC (only input available)
- Output 1: 0.3 BTC ← Likely payment (smaller)
- Output 2: 0.7 BTC ← Likely change (larger)
```

### 5. Wallet Fingerprinting

**Principle**: Wallets have characteristic patterns.

**Confidence**: 60%

**Explanation**:
- Different wallets use different strategies
- Some wallets always use round amounts
- Some wallets prefer certain script types
- Some wallets have specific change patterns

**Examples**:
- **Electrum**: Often uses P2PKH, round amounts
- **Ledger**: Prefers native SegWit (bc1)
- **Exodus**: Uses multiple script types

**Limitations**:
- Less reliable for custom wallets
- Patterns can change over time
- Requires historical data

---

## Peel Chains

### Pattern

**Sequential small payments from a large UTXO.**

### Confidence: 85%

### Explanation

A "peel chain" is when someone makes a series of small payments from a large UTXO, leaving the rest as change. This is common in:
- Money laundering (breaking large amounts into smaller ones)
- Wallet management (spending from large UTXO over time)
- Privacy strategies (avoiding large transactions)

**Example**:
```
Large UTXO: 10.0 BTC

Transaction 1:
- Input: 10.0 BTC
- Output 1: 0.1 BTC to Alice
- Output 2: 9.9 BTC (change)

Transaction 2:
- Input: 9.9 BTC
- Output 1: 0.1 BTC to Bob
- Output 2: 9.8 BTC (change)

Transaction 3:
- Input: 9.8 BTC
- Output 1: 0.1 BTC to Charlie
- Output 2: 9.7 BTC (change)

Pattern: Peel chain detected!
```

### Detection

ChainViz identifies peel chains by looking for:
- Sequential transactions from same UTXO
- Small output amounts relative to input
- Consistent change pattern
- Time proximity

### Use Cases

**Money Laundering**:
- Breaking large amounts into smaller ones
- Avoiding detection by exchanges
- Mixing funds through multiple transactions

**Wallet Management**:
- Spending from large UTXO over time
- Avoiding large transaction fees
- Managing liquidity

**Privacy**:
- Avoiding large transactions
- Reducing traceability
- Breaking up funds

---

## Temporal Analysis

### Principle

**Timing patterns reveal relationships.**

### Confidence: 50%

### Explanation

Transactions that happen close together in time may be related. This is useful for:
- Identifying coordinated activity
- Finding related transactions
- Detecting patterns

**Example**:
```
Transaction 1: 10:00:00 - Alice sends to Bob
Transaction 2: 10:00:15 - Bob sends to Charlie
Transaction 3: 10:00:30 - Charlie sends to David

Pattern: Rapid sequential transactions (15 seconds apart)
Conclusion: Likely coordinated activity
```

### Limitations

- Less reliable for normal usage
- Can be coincidental
- Requires additional evidence
- Low confidence score (50%)

---

## Amount Patterns

### Fixed Denominations

**Principle**: Recurring amounts suggest intentional patterns.

**Confidence**: 60%

**Example**:
```
Transaction 1: 0.1 BTC
Transaction 2: 0.1 BTC
Transaction 3: 0.1 BTC
Transaction 4: 0.1 BTC

Pattern: Fixed denomination (0.1 BTC)
Conclusion: Likely systematic payments
```

### Pass-Through Addresses

**Principle**: Addresses that receive and send similar amounts are pass-throughs.

**Confidence**: 70%

**Example**:
```
Address receives: 1.0 BTC
Address sends: 1.0 BTC (same amount)
Time difference: Very short

Conclusion: Likely pass-through address (not final destination)
```

---

## Combining Heuristics

ChainViz combines multiple heuristics to increase confidence:

### Example: High-Confidence Change Detection

```
Transaction:
- Input: 1.0 BTC (P2PKH)
- Output 1: 0.5 BTC to Address B (P2PKH, used before)
- Output 2: 0.49 BTC to Address C (P2PKH, new address)

Heuristics:
1. Address Reuse: Output 1 used before (95% confidence)
2. Round Amounts: Output 1 is round (70% confidence)
3. Script Type: Both outputs match input (80% confidence)
4. Optimal Change: Output 2 is smaller (75% confidence)

Combined Confidence: ~90%
Conclusion: Output 1 is payment, Output 2 is change
```

### Example: Low-Confidence Change Detection

```
Transaction:
- Input: 1.0 BTC (P2PKH)
- Output 1: 0.3 BTC to Address B (P2WPKH, new address)
- Output 2: 0.7 BTC to Address C (P2PKH, new address)

Heuristics:
1. Address Reuse: Neither used before (50% confidence)
2. Round Amounts: Neither is round (50% confidence)
3. Script Type: Output 2 matches input (80% confidence)
4. Optimal Change: Output 2 is larger (25% confidence)

Combined Confidence: ~50%
Conclusion: Uncertain, need more evidence
```

---

## Confidence Scores

Confidence scores indicate how reliable a heuristic is:

- **90-100%**: Very high confidence, strong evidence
- **70-89%**: High confidence, good evidence
- **50-69%**: Medium confidence, moderate evidence
- **30-49%**: Low confidence, weak evidence
- **0-29%**: Very low confidence, unreliable

### When to Trust Heuristics

**High Confidence (>80%)**:
- Use for important decisions
- Reliable for most cases
- Good evidence of ownership

**Medium Confidence (50-80%)**:
- Use as supporting evidence
- Combine with other heuristics
- Consider context

**Low Confidence (<50%)**:
- Use with caution
- Require additional evidence
- Don't rely on alone

---

## Limitations

### 1. CoinJoins Break Heuristics

CoinJoin transactions mix inputs from multiple people, breaking common-input clustering and change detection.

### 2. Privacy Techniques

Advanced privacy techniques (CoinSwap, PayJoin) can break heuristics:
- **CoinSwap**: Atomic swaps between parties
- **PayJoin**: Sender and receiver both contribute inputs

### 3. Exchange Wallets

Exchange wallets have different patterns:
- Hot/cold wallet transfers
- User deposits/withdrawals
- Internal shuffling

### 4. Custodial Wallets

Custodial wallets (Coinbase, Binance) have centralized control:
- Not all inputs belong to same user
- Change may go to different users
- Patterns are different

### 5. Lightning Network

Lightning transactions don't appear on-chain:
- Off-chain payments are invisible
- Channel opens/closes are visible
- Less useful for tracing

---

## Best Practices

### 1. Use Multiple Heuristics

Don't rely on a single heuristic. Combine multiple heuristics for higher confidence.

### 2. Consider Context

Look at the bigger picture:
- Transaction history
- Timing patterns
- Amount patterns
- Known entities

### 3. Verify with External Data

Cross-reference with:
- Known addresses (exchanges, services)
- Public data (social media, forums)
- Other blockchain analysis tools

### 4. Be Cautious with Low Confidence

Low-confidence heuristics (<50%) should be used with caution and require additional evidence.

### 5. Understand Limitations

Recognize when heuristics don't apply:
- CoinJoin transactions
- Privacy techniques
- Exchange wallets
- Custodial services

---

## Further Reading

- **Common-Input Ownership Heuristic**: https://en.bitcoin.it/wiki/Common-input-ownership_heuristic
- **Change Detection**: https://en.bitcoin.it/wiki/Change
- **CoinJoin**: https://en.bitcoin.it/wiki/CoinJoin
- **Privacy Techniques**: https://en.bitcoin.it/wiki/Privacy

---

## Summary

ChainViz uses multiple heuristics to analyze Bitcoin transactions:

1. **Common-Input Clustering** (90%): Inputs belong together
2. **Change Detection** (70-95%): Identify change outputs
3. **Peel Chains** (85%): Sequential small payments
4. **Temporal Analysis** (50%): Timing patterns
5. **Amount Patterns** (60-70%): Fixed denominations, pass-throughs

**Remember**: Heuristics are probabilistic, not deterministic. Always consider confidence scores and context.

**Happy analyzing! 🔍**

