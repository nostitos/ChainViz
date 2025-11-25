# API Response Comparison Report

## Executive Summary
- mempool.space’s REST API returns fully decoded Bitcoin objects (addresses, values, script types, block metadata) in JSON, while Electrum servers expose lean RPC structures that closely mirror raw Bitcoin Core responses.
- Transaction lookups from mempool include `vin[].prevout` payloads with spendable metadata in satoshis; Electrum requires downstream parsing to recover address/value information and represents amounts in BTC.
- Address queries highlight the philosophical difference: mempool paginates through full transaction bodies plus aggregate stats, whereas Electrum only returns `[{"height": int, "tx_hash": str}]`, forcing clients to hydrate every txid separately.
- Because mempool responses are richer but heavier, the backend keeps mempool as the fast path when coverage exists and falls back to Electrum for completeness or when mempool endpoints time out.

## Sample Collection
- Script: `backend/scripts/compare_api_responses.py`
- Command (from workspace root):
  ```
  PYTHONPATH=backend backend/venv/bin/python backend/scripts/compare_api_responses.py \
    --txid 1a6790ee7804b55399d64c96963d319a568311482bb9d9a26492999fcef21604 \
    --address 1G7CjxPHPFjNH9C86HNd78T87vjznq3wTn \
    --limit 5 \
    --output docs/api-comparison-data
  ```
- Raw outputs live in `docs/api-comparison-data/*.json` with pointers recorded in `metadata.json`.

## Transaction Lookup Comparison

### Raw Responses (trimmed)

```1:56:docs/api-comparison-data/transaction_mempool.json
{
  "fee": 50000,
  "status": {
    "block_hash": "0000000000000ae7f9b23444d8d697128204631273599fd3d57f29e7d01f1330",
    "block_height": 156663,
    "block_time": 1323371117,
    "confirmed": true
  },
  "vin": [
    {
      "prevout": {
        "scriptpubkey_address": "1DUScQF3VJ1p8SrXZvMXR5GdMw7HwxF5i2",
        "scriptpubkey_type": "p2pkh",
        "value": 1496332655
      },
      "scriptsig": "...",
      "sequence": 4294967295
    }
  ],
  "vout": [
    {
      "scriptpubkey_address": "1NvgD8Kxxm2Tqen24jZXPK65LFBBF2gjNX",
      "value": 1052543771
    },
    {
      "scriptpubkey_address": "1G7CjxPHPFjNH9C86HNd78T87vjznq3wTn",
      "value": 443738884
    }
  ],
  "weight": 1036
}
```

```1:49:docs/api-comparison-data/transaction_electrum.json
{
  "blockhash": "0000000000000ae7f9b23444d8d697128204631273599fd3d57f29e7d01f1330",
  "confirmations": 766978,
  "hex": "...",
  "vin": [
    {
      "scriptSig": {"hex": "..."},
      "txid": "c39f5b8aa6a1bfaf2cfe8e4685213bcf671d3b84a71d55beac8d445170f14715",
      "vout": 0
    }
  ],
  "vout": [
    {
      "n": 0,
      "scriptPubKey": {"address": "1NvgD8Kxxm2Tqen24jZXPK65LFBBF2gjNX"},
      "value": 10.52543771
    },
    {
      "n": 1,
      "scriptPubKey": {"address": "1G7CjxPHPFjNH9C86HNd78T87vjznq3wTn"},
      "value": 4.43738884
    }
  ],
  "vsize": 259
}
```

### Field Mapping

| Concern | mempool.space | Electrum | Notes |
| --- | --- | --- | --- |
| Amount units | `value` in satoshis | `value` in BTC (float) | Electrum consumers must multiply by `1e8`. |
| Input address/value | `vin[].prevout.scriptpubkey_address/value` | Not included | Requires follow-up requests or script-sig decoding. |
| Block metadata | `status.block_height`, `status.block_time`, `status.confirmed` | `blockhash`, `blocktime`, `confirmations` | Electrum exposes block hash/confirmations but no `confirmed` boolean. |
| Fee info | `fee`, `feePerVsize`, `weight` | Fee must be derived from inputs - outputs | Mempool includes richer fee metrics natively. |
| Script descriptors | `scriptpubkey_type` (string) | `scriptPubKey.type`, `desc` | Similar detail but different casing/structure. |
| Hex payload | Not included | `hex` full transaction | Electrum mirrors Bitcoin Core’s verbose response. |

### Parsing and Normalization

- Mempool responses include all monetary data the backend needs, so `_parse_mempool_transaction` mostly copies values into our `Transaction` model and trusts the provided satoshi totals.
- Electrum responses lack prevout context and express outputs in BTC, so `_parse_transaction` reconstructs satoshis (`int(raw_value * 100_000_000)`), infers script types, and recomputes fees from hydrated inputs.

```547:613:backend/app/services/blockchain_data.py
    def _parse_mempool_transaction(self, txid: str, data: Dict[str, Any]) -> Transaction:
        ...
        inputs.append(TransactionInput(
            txid=vin.get("txid"),
            vout=vin.get("vout"),
            address=prevout.get("scriptpubkey_address"),
            value=prevout.get("value"),
        ))
        ...
        outputs.append(TransactionOutput(
            n=i,
            value=vout.get("value"),
            address=vout.get("scriptpubkey_address"),
            script_type=self._map_mempool_script_type(vout.get("scriptpubkey_type")),
        ))
```

```615:712:backend/app/services/blockchain_data.py
    def _parse_transaction(self, txid: str, tx_data: Dict[str, Any]) -> Transaction:
        ...
        if isinstance(raw_value, (int, float)):
            value_sats = int(raw_value * 100_000_000)
        ...
        total_in = sum(inp.value for inp in inputs if inp.value)
        total_out = sum(out.value for out in outputs)
        fee = total_in - total_out if total_in > 0 else None
```

- The additional normalization cost is why Electrum calls are reserved for fallback scenarios or when mempool lacks coverage.

### Advantages & Trade-offs
- **mempool.space**
  - Pros: Rich fee metrics, explicit address/value attribution, no need for additional prevout lookups.
  - Cons: Heavier payloads, rate limits per endpoint, pagination required for large address histories, occasional endpoint cooldowns observed in the script run.
- **Electrum**
  - Pros: Lightweight RPC schema, deterministic JSON-RPC responses, no pagination for history.
  - Cons: Requires post-processing to recover satoshis and prevout metadata, extra requests to fetch balances or script info, less descriptive error messages.

## Address Lookup Comparison

### Raw Responses (trimmed)

```1:70:docs/api-comparison-data/address_mempool.json
{
  "summary": {
    "chain_stats": {
      "funded_txo_count": 126,
      "spent_txo_count": 126,
      "tx_count": 252
    }
  },
  "txs_page": [
    {
      "txid": "ecfe7e0e...",
      "status": {"block_height": 163493, "block_time": 1327316604},
      "vin": [{"prevout": {"scriptpubkey_address": "1G7Cjx...", "value": 671940014}}],
      "vout": [{"scriptpubkey_address": "1PrEbV...", "value": 171890014}, ...]
    },
    ...
  ]
}
```

```1:30:docs/api-comparison-data/address_electrum.json
[
  {"height": 156305, "tx_hash": "f024e976fdbfacc5..."},
  {"height": 156307, "tx_hash": "062ed0ff2bd490db..."},
  {"height": 156324, "tx_hash": "5f482c83a477ad57..."},
  ...
]
```

### Field Mapping & Pagination

| Concern | mempool.space | Electrum | Notes |
| --- | --- | --- | --- |
| Aggregates | `summary.chain_stats` & `mempool_stats` | Not provided | Backend must compute counts itself when using Electrum. |
| History payload | `txs_page` contains full tx bodies (vin/vout/status) | Array of `{height, tx_hash}` | Electrum history requires subsequent `blockchain.transaction.get` calls. |
| Pagination | Offset/limit parameters, default 100 per page | Not needed (server returns full list) | Large mempool requests can be slow; Electrum replies quickly but pushes work downstream. |
| Data freshness | Includes on-chain + mempool stats | On-chain finality only (height) | mempool exposes mempool residency; Electrum focuses on confirmed data. |

### Data Completeness & Performance
- For the 2011-era address, mempool returned five fully decoded transactions plus aggregate counts within a single HTTP response (~74 KB JSON), while Electrum streamed 252 history entries (~12 KB) without transaction bodies.
- Electrum’s lean response enables rapid graph construction when cached transactions already exist, but any missing txid triggers a separate RPC call, increasing round-trips.
- mempool’s richer response eliminates the need for secondary lookups yet suffers from public endpoint throttling; during supplementary sampling the datasource reported cooldowns (`mempool.space` entering a 5 s cooldown after ~1.6 s).

## Key Takeaways
- Use mempool.space first for its complete, ready-to-visualize structures and fee metrics; it minimizes parsing complexity but introduces heavier payloads and rate limits.
- Maintain Electrum as the canonical on-chain fallback: it reliably returns every history entry even for very old addresses, though it demands local normalization (`_parse_transaction`) and prevout hydration.
- The new `backend/scripts/compare_api_responses.py` script automates sample collection so future regressions in either API can be documented with concrete artifacts stored under `docs/api-comparison-data/`.

