# ChainViz Backend

FastAPI backend for Bitcoin blockchain analysis using on-chain data from Electrum server.

## Features

- **UTXO Backward Tracing**: Recursive tracing with multiple heuristics
- **Address Clustering**: Common-input ownership heuristic with confidence scoring
- **Change Detection**: Multiple heuristics (address reuse, round amounts, script type matching)
- **Peel Chain Detection**: Identify sequential payment patterns
- **CoinJoin Detection**: Detect Wasabi, Whirlpool, and generic CoinJoins
- **Bulk Import**: Import address lists or derive from xpub
- **Real-time Updates**: WebSocket for new block notifications

## Setup

### Requirements

- Python 3.11+
- Poetry
- Redis (optional, for caching)
- Access to Electrum server (default: fulcrum.sethforprivacy.com:50002)

### Installation

```bash
cd backend
poetry install
```

### Configuration

Copy `.env.example` to `.env` and adjust settings:

```bash
ELECTRUM_HOST=fulcrum.sethforprivacy.com
ELECTRUM_PORT=50002
REDIS_HOST=localhost
REDIS_PORT=6379
```

### Run Development Server

```bash
poetry run uvicorn app.main:app --reload
```

API will be available at `http://localhost:8000`

API documentation: `http://localhost:8000/docs`

## API Endpoints

### Trace UTXO

```bash
POST /api/trace/utxo
{
  "txid": "abcd1234...",
  "vout": 0,
  "max_depth": 20,
  "include_coinjoin": false,
  "confidence_threshold": 0.5
}
```

### Get Address Info

```bash
GET /api/address/{address}
```

### Get Transaction

```bash
GET /api/transaction/{txid}
```

### Bulk Address Import

```bash
POST /api/bulk/addresses
{
  "addresses": ["1A1z...", "1BvB..."],
  "fetch_history": true
}
```

### xpub Derivation

```bash
POST /api/xpub/derive
{
  "xpub": "xpub6CUGRUo...",
  "count": 20,
  "include_change": false
}
```

## Architecture

### Analysis Engine

The analysis engine combines multiple heuristics:

1. **Common-Input Clustering** (0.9 confidence)
   - Groups addresses that appear as inputs in the same transaction

2. **Change Detection** (varies):
   - Address reuse (0.95)
   - Round amounts (0.7)
   - Script type matching (0.8)
   - Optimal change (0.75)
   - Wallet fingerprinting (0.6)

3. **Peel Chain Detection**
   - Identifies sequential small payments from large UTXO

4. **CoinJoin Detection**
   - Detects mixing transactions (breaks clustering heuristic)

### Caching Strategy

- Address histories: 5 minutes TTL
- Transaction details: 1 hour TTL
- Cluster data: 10 minutes TTL

### Electrum Client

Uses batching for improved performance when fetching multiple transactions.

## Testing

```bash
poetry run pytest
```

## Development

### Code Style

```bash
poetry run black app/
poetry run isort app/
poetry run mypy app/
```

### Add Dependencies

```bash
poetry add package-name
```

## License

MIT




