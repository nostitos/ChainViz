# Understanding Bitcoin Tracing: Address vs UTXO

## ✅ Now You Can Trace From BOTH!

### 📍 **Option 1: Trace from Address** (Easiest!)

Just enter any Bitcoin address and we'll trace where the funds came from.

**Example:**
```
Address: 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa
```

The system will:
1. Find all transactions involving that address
2. Pick the most recent one
3. Trace backwards to see where those funds originated

**API Endpoint:**
```bash
POST /api/trace/address?address=1A1z...&max_depth=15
```

---

### 🎯 **Option 2: Trace from UTXO** (Advanced)

For more precision, specify exactly WHICH output of WHICH transaction.

## What is UTXO?

**UTXO** = **U**nspent **T**ransaction **O**utput

Think of it like this:
- When Alice sends Bitcoin to Bob and Charlie
- The transaction creates 2 outputs:
  - Output 0 (vout=0): Money to Bob
  - Output 1 (vout=1): Money to Charlie

## What is vout?

**vout** = **v**ector **out** = **output index**

It's just the number of the output (starting from 0).

### Real Example

Imagine this transaction:
```
Transaction: abc123...
├── Input: Alice's address (1.0 BTC)
└── Outputs:
    ├── Output 0 (vout=0): 0.3 BTC → Bob's address
    └── Output 1 (vout=1): 0.7 BTC → Alice's change address
```

To trace Bob's money: `txid=abc123, vout=0`
To trace Alice's change: `txid=abc123, vout=1`

## Why Does This Matter?

**Change Outputs** are critical in blockchain analysis!

When someone sends Bitcoin:
- One output goes to the recipient (payment)
- Another output returns to the sender (change, like getting change from cash)

Our system detects which output is likely change using 5+ heuristics:
- ✅ Round amounts → likely payment
- ✅ Reused address → likely payment
- ✅ Script type matching inputs → likely change
- ✅ And more...

## Which Should You Use?

### Use **Address Tracing** when:
- ✅ You just have an address (most common)
- ✅ You want quick results
- ✅ You don't care about specific outputs

### Use **UTXO Tracing** when:
- ✅ You know the exact transaction
- ✅ You want to trace a specific output
- ✅ The address has many transactions and you want precision

## How to Find vout?

1. Go to a block explorer (e.g., mempool.space)
2. Look up your transaction
3. See the outputs listed (Output #0, Output #1, etc.)
4. Use that number as vout

## Try It Now!

Open the demo page:
```
file:///Users/t/Documents/vibbbing/ChainViz/demo.html
```

**Tab 1: "From Address"** - Just paste any address!  
**Tab 2: "From UTXO"** - For advanced users who know the transaction

---

## API Examples

### Trace from Address
```bash
curl -X POST "http://localhost:8000/api/trace/address?address=1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa&max_depth=10"
```

### Trace from UTXO
```bash
curl -X POST http://localhost:8000/api/trace/utxo \
  -H "Content-Type: application/json" \
  -d '{
    "txid": "your_tx_id",
    "vout": 0,
    "max_depth": 10
  }'
```

## Summary

**Address**: "Where did funds to THIS ADDRESS come from?"
**UTXO**: "Where did THIS SPECIFIC OUTPUT come from?"

Both work - choose what's easier for you! 🎉




