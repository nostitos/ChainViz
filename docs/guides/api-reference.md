# API Reference

Complete API documentation for ChainViz backend.

---

## Base URL

```
http://localhost:8000/api
```

---

## Endpoints

### Trace UTXO

Trace a specific UTXO backward through the transaction graph.

**Endpoint**: `POST /api/trace/utxo`

**Request Body**:
```json
{
  "txid": "string",
  "vout": 0,
  "hops_before": 5,
  "hops_after": 5,
  "include_coinjoin": true,
  "confidence_threshold": 0.5
}
```

**Parameters**:
- `txid` (string, required): Transaction ID (64 hex characters)
- `vout` (integer, required): Output index (0-based)
- `hops_before` (integer, 0-50, default: 5): Number of hops to trace backward
- `hops_after` (integer, 0-50, default: 5): Number of hops to trace forward
- `include_coinjoin` (boolean, default: true): Include CoinJoin transactions
- `confidence_threshold` (float, 0-1, default: 0.5): Minimum confidence for edges

**Response**:
```json
{
  "nodes": [
    {
      "id": "string",
      "label": "string",
      "type": "address|transaction",
      "value": 0.0,
      "metadata": {
        "address": "string",
        "txid": "string",
        "is_change": false,
        "cluster_id": "string"
      }
    }
  ],
  "edges": [
    {
      "source": "string",
      "target": "string",
      "amount": 0.0,
      "confidence": 0.9,
      "metadata": {
        "vout": 0,
        "vin": 0
      }
    }
  ],
  "hops_before_reached": 5,
  "hops_after_reached": 5,
  "confidence_scores": {
    "common_input": 0.9,
    "change_detection": 0.8
  }
}
```

**Example**:
```bash
curl -X POST http://localhost:8000/api/trace/utxo \
  -H "Content-Type: application/json" \
  -d '{
    "txid": "49fc56d4c1acd8946cec82d7bf8bf35035118a87ccf70dd29c7d349ef1a530e3",
    "vout": 0,
    "hops_before": 5,
    "hops_after": 5,
    "include_coinjoin": true,
    "confidence_threshold": 0.5
  }'
```

---

### Trace Address

Trace an address forward/backward through transactions.

**Endpoint**: `POST /api/trace/address`

**Request Body**:
```json
{
  "address": "string",
  "hops_before": 5,
  "hops_after": 5,
  "max_transactions": 50,
  "include_coinjoin": true,
  "confidence_threshold": 0.5
}
```

**Parameters**:
- `address` (string, required): Bitcoin address (bc1, 1, or 3 prefix)
- `hops_before` (integer, 0-50, default: 5): Number of hops to trace backward
- `hops_after` (integer, 0-50, default: 5): Number of hops to trace forward
- `max_transactions` (integer, 1-300, default: 50): Maximum transactions to include
- `include_coinjoin` (boolean, default: true): Include CoinJoin transactions
- `confidence_threshold` (float, 0-1, default: 0.5): Minimum confidence for edges

**Response**:
```json
{
  "nodes": [...],
  "edges": [...],
  "hops_before_reached": 5,
  "hops_after_reached": 5,
  "confidence_scores": {...}
}
```

**Example**:
```bash
curl -X POST http://localhost:8000/api/trace/address \
  -H "Content-Type: application/json" \
  -d '{
    "address": "1Gw5PwF6sGVxomatMbj5p4bkk7ED4pyfbu",
    "hops_before": 3,
    "hops_after": 3,
    "max_transactions": 100,
    "include_coinjoin": true,
    "confidence_threshold": 0.5
  }'
```

---

### Get Address Info

Get information about a Bitcoin address.

**Endpoint**: `GET /api/address/{address}`

**Parameters**:
- `address` (string, required): Bitcoin address (bc1, 1, or 3 prefix)

**Response**:
```json
{
  "address": "string",
  "balance": 0,
  "total_received": 0,
  "total_sent": 0,
  "transaction_count": 0,
  "first_seen": "2024-01-01T00:00:00Z",
  "last_seen": "2024-01-01T00:00:00Z"
}
```

**Example**:
```bash
curl http://localhost:8000/api/address/1Gw5PwF6sGVxomatMbj5p4bkk7ED4pyfbu
```

---

### Get Transaction

Get detailed information about a Bitcoin transaction.

**Endpoint**: `GET /api/transaction/{txid}`

**Parameters**:
- `txid` (string, required): Transaction ID (64 hex characters)

**Response**:
```json
{
  "txid": "string",
  "hash": "string",
  "version": 1,
  "size": 225,
  "locktime": 0,
  "confirmations": 100,
  "block_height": 800000,
  "block_time": "2024-01-01T00:00:00Z",
  "inputs": [
    {
      "txid": "string",
      "vout": 0,
      "script_sig": "string",
      "sequence": 4294967295,
      "value": 0.0,
      "address": "string"
    }
  ],
  "outputs": [
    {
      "value": 0.0,
      "script_pubkey": "string",
      "address": "string",
      "vout": 0
    }
  ],
  "fees": 0.0001,
  "is_coinjoin": false,
  "heuristics": {
    "common_input": 0.9,
    "change_detection": 0.8
  }
}
```

**Example**:
```bash
curl http://localhost:8000/api/transaction/49fc56d4c1acd8946cec82d7bf8bf35035118a87ccf70dd29c7d349ef1a530e3
```

---

### Bulk Address Import

Import multiple addresses and fetch their history.

**Endpoint**: `POST /api/bulk/addresses`

**Request Body**:
```json
{
  "addresses": ["string"],
  "fetch_history": true
}
```

**Parameters**:
- `addresses` (array, required): List of Bitcoin addresses
- `fetch_history` (boolean, default: true): Fetch transaction history for each address

**Response**:
```json
{
  "imported": 10,
  "failed": 0,
  "addresses": [
    {
      "address": "string",
      "balance": 0,
      "transaction_count": 0
    }
  ]
}
```

**Example**:
```bash
curl -X POST http://localhost:8000/api/bulk/addresses \
  -H "Content-Type: application/json" \
  -d '{
    "addresses": [
      "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
      "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2"
    ],
    "fetch_history": true
  }'
```

---

### Derive Addresses from xpub

Derive Bitcoin addresses from an extended public key (xpub).

**Endpoint**: `POST /api/xpub/derive`

**Request Body**:
```json
{
  "xpub": "string",
  "count": 20,
  "include_change": false,
  "derivation_path": "m/44'/0'/0'"
}
```

**Parameters**:
- `xpub` (string, required): Extended public key
- `count` (integer, 1-100, default: 20): Number of addresses to derive
- `include_change` (boolean, default: false): Include change addresses
- `derivation_path` (string, default: "m/44'/0'/0'"): Derivation path

**Response**:
```json
{
  "derived": 20,
  "addresses": [
    {
      "address": "string",
      "index": 0,
      "path": "m/44'/0'/0'/0/0",
      "is_change": false
    }
  ]
}
```

**Example**:
```bash
curl -X POST http://localhost:8000/api/xpub/derive \
  -H "Content-Type: application/json" \
  -d '{
    "xpub": "xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWKiKrhko4egpiMZbpiaQL2jkwSB1icqYh2cfDfVxVu4qfP3cRjW6bCjF2c5Qq6xVJ8q3FZJ8q3FZJ8q3FZ",
    "count": 10,
    "include_change": false,
    "derivation_path": "m/44'\''/0'\''/0'\''"
  }'
```

---

### Get Configuration

Get current backend configuration.

**Endpoint**: `GET /api/config`

**Response**:
```json
{
  "electrum_host": "string",
  "electrum_port": 50002,
  "electrum_use_ssl": true,
  "redis_host": "localhost",
  "redis_port": 6379
}
```

**Example**:
```bash
curl http://localhost:8000/api/config
```

---

### Update Electrum Server

Update the Electrum server configuration.

**Endpoint**: `POST /api/config/electrum`

**Request Body**:
```json
{
  "host": "string",
  "port": 50002,
  "use_ssl": true
}
```

**Parameters**:
- `host` (string, required): Electrum server hostname
- `port` (integer, required): Electrum server port
- `use_ssl` (boolean, required): Use SSL/TLS

**Response**:
```json
{
  "electrum_host": "string",
  "electrum_port": 50002,
  "electrum_use_ssl": true,
  "message": "Configuration updated successfully"
}
```

**Example**:
```bash
curl -X POST http://localhost:8000/api/config/electrum \
  -H "Content-Type: application/json" \
  -d '{
    "host": "fulcrum.sethforprivacy.com",
    "port": 50002,
    "use_ssl": true
  }'
```

---

### Test Electrum Server

Test connection to an Electrum server.

**Endpoint**: `POST /api/config/electrum/test`

**Request Body**:
```json
{
  "host": "string",
  "port": 50002,
  "use_ssl": true
}
```

**Parameters**:
- `host` (string, required): Electrum server hostname
- `port` (integer, required): Electrum server port
- `use_ssl` (boolean, required): Use SSL/TLS

**Response**:
```json
{
  "success": true,
  "message": "Connection successful",
  "latency_ms": 150,
  "features": {
    "batch": true,
    "verbose": true
  }
}
```

**Example**:
```bash
curl -X POST http://localhost:8000/api/config/electrum/test \
  -H "Content-Type: application/json" \
  -d '{
    "host": "fulcrum.sethforprivacy.com",
    "port": 50002,
    "use_ssl": true
  }'
```

---

## WebSocket

### Connect to WebSocket

Connect to real-time blockchain updates.

**Endpoint**: `ws://localhost:8000/ws`

**Message Format**:
```json
{
  "action": "subscribe",
  "address": "string"
}
```

**Response**:
```json
{
  "type": "notification",
  "data": {
    "address": "string",
    "transaction": "string",
    "block_height": 800000
  }
}
```

**Example**:
```javascript
const ws = new WebSocket('ws://localhost:8000/ws');

ws.onopen = () => {
  ws.send(JSON.stringify({
    action: 'subscribe',
    address: '1Gw5PwF6sGVxomatMbj5p4bkk7ED4pyfbu'
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('New transaction:', data);
};
```

---

## Error Responses

### 400 Bad Request

```json
{
  "detail": "Invalid request parameters"
}
```

### 404 Not Found

```json
{
  "detail": "Address not found"
}
```

### 500 Internal Server Error

```json
{
  "detail": "Internal server error"
}
```

---

## Rate Limiting

- **Default**: 100 requests per minute
- **Burst**: 200 requests per minute
- **Headers**:
  - `X-RateLimit-Limit`: Request limit
  - `X-RateLimit-Remaining`: Requests remaining
  - `X-RateLimit-Reset`: Reset time (Unix timestamp)

---

## Authentication

Currently, ChainViz does not require authentication. All endpoints are public.

**Future**: API key authentication may be added for production deployments.

---

## Interactive API Documentation

Visit http://localhost:8000/docs for interactive API documentation with:
- Try-it-out functionality
- Request/response examples
- Schema definitions
- Authentication testing

---

## Examples

### Python

```python
import requests

# Trace UTXO
response = requests.post(
    'http://localhost:8000/api/trace/utxo',
    json={
        'txid': '49fc56d4c1acd8946cec82d7bf8bf35035118a87ccf70dd29c7d349ef1a530e3',
        'vout': 0,
        'hops_before': 5,
        'hops_after': 5
    }
)
data = response.json()
print(f"Found {len(data['nodes'])} nodes")
```

### JavaScript

```javascript
// Trace address
const response = await fetch('http://localhost:8000/api/trace/address', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    address: '1Gw5PwF6sGVxomatMbj5p4bkk7ED4pyfbu',
    hops_before: 3,
    hops_after: 3
  })
});
const data = await response.json();
console.log(`Found ${data.nodes.length} nodes`);
```

---

## Further Reading

- **FastAPI Documentation**: https://fastapi.tiangolo.com/
- **Electrum Protocol**: https://electrum-protocol.readthedocs.io/
- **Bitcoin JSON-RPC**: https://developer.bitcoin.org/reference/rpc/

---

**Happy coding! 🚀**

