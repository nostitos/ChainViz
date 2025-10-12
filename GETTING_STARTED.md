# Getting Started with ChainViz

## Quick Start (Docker Compose - Recommended)

1. **Clone and navigate to the project**:
   ```bash
   cd ChainViz
   ```

2. **Start all services**:
   ```bash
   docker-compose up
   ```

3. **Access the application**:
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:8000
   - API Documentation: http://localhost:8000/docs

4. **Try a sample query**:
   - In the search bar, enter a Bitcoin transaction ID (txid:vout format)
   - Example: `abcd1234ef567890abcd1234ef567890abcd1234ef567890abcd1234ef567890:0`
   - Click "Trace" to see the visualization

## Manual Setup

### Backend

1. **Install dependencies**:
   ```bash
   cd backend
   poetry install
   ```

2. **Configure environment** (optional):
   ```bash
   cp .env.example .env
   # Edit .env to customize settings
   ```

3. **Start Redis** (optional, for caching):
   ```bash
   redis-server
   ```

4. **Run the server**:
   ```bash
   poetry run uvicorn app.main:app --reload
   ```

### Frontend

1. **Install dependencies**:
   ```bash
   cd frontend
   pnpm install
   ```

2. **Start development server**:
   ```bash
   pnpm dev
   ```

## Understanding the Interface

### Search Bar
- **Input**: Enter a transaction ID with optional output index (e.g., `txid:0`)
- **Options** (click gear icon):
  - **Max Depth**: How many hops to trace backward (5-50)
  - **Confidence Threshold**: Minimum confidence to show links (0-100%)
  - **Include CoinJoin**: Experimental feature to trace through mixing transactions

### Graph Visualization
- **Zoom**: Use mouse wheel or +/- buttons
- **Pan**: Click and drag the background
- **Select Node**: Click on any node to see details
- **Hover**: Hover over nodes to highlight connections

### Node Colors
- 🔵 **Blue**: Addresses in the same cluster (spent together)
- 🟢 **Green**: External addresses (not clustered)
- 🟡 **Amber**: Change addresses (identified by heuristics)
- 🟣 **Purple**: Transactions

### Edge Styles
- **Green Solid**: High confidence (>80%)
- **Amber Solid**: Medium confidence (60-80%)
- **Red Dashed**: Low confidence (<60%)

### Inspector Panel
When you click a node, the inspector panel shows:
- Node type (address or transaction)
- Full label/ID with copy button
- Link to Mempool.space explorer
- Change output indicators
- Cluster membership
- Additional metadata

## Example Queries

### 1. Simple Transaction Trace
```
Enter: abc123...def456:0
Max Depth: 10
Confidence: 50%
```
This will trace the first output of the transaction 10 hops backward.

### 2. Deep Analysis
```
Enter: abc123...def456:1
Max Depth: 30
Confidence: 70%
```
Only shows high-confidence links, useful for filtering noise.

### 3. Include CoinJoin (Experimental)
```
Enter: abc123...def456:0
Max Depth: 15
Confidence: 50%
Include CoinJoin: ✓
```
Attempts to trace through CoinJoin transactions (less reliable).

## API Examples

### Trace a UTXO
```bash
curl -X POST http://localhost:8000/api/trace/utxo \
  -H "Content-Type: application/json" \
  -d '{
    "txid": "abcd1234ef567890abcd1234ef567890abcd1234ef567890abcd1234ef567890",
    "vout": 0,
    "max_depth": 20,
    "confidence_threshold": 0.5
  }'
```

### Get Address Information
```bash
curl http://localhost:8000/api/address/1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa
```

### Derive Addresses from xpub
```bash
curl -X POST http://localhost:8000/api/xpub/derive \
  -H "Content-Type: application/json" \
  -d '{
    "xpub": "xpub6CUGRUo...",
    "count": 20
  }'
```

### Import Bulk Addresses
```bash
curl -X POST http://localhost:8000/api/bulk/addresses \
  -H "Content-Type: application/json" \
  -d '{
    "addresses": ["1A1z...", "1BvB..."],
    "fetch_history": true
  }'
```

## Understanding Heuristics

### Common-Input Clustering (90% confidence)
- All addresses that spend together in a transaction likely belong to the same person
- Exception: CoinJoin transactions break this rule

### Change Detection
Multiple signals combined:
- **Address Reuse** (95%): If address was used before, it's probably payment
- **Round Amounts** (70%): Round numbers (1.0 BTC) are intentional payments
- **Script Type** (80%): Change outputs match input script types
- **Optimal Change** (75%): Unnecessary inputs suggest larger output is payment

### Peel Chains
- Sequential small payments from a large UTXO
- Common in money laundering and large wallet management
- Platform identifies the pattern and follows the chain

### CoinJoin Detection
- Detects Wasabi, Whirlpool, JoinMarket, and generic mixing
- Warns that clustering breaks at these points
- Still identifies change outputs from unequal values

## Performance Tips

1. **Start with smaller depths** (10-15) and increase if needed
2. **Use confidence filtering** to reduce noise
3. **Enable caching** (Redis) for faster repeated queries
4. **Batch operations** when analyzing multiple addresses

## Troubleshooting

### Backend won't start
- Check Python version: `python --version` (need 3.11+)
- Install dependencies: `poetry install`
- Check Redis: `redis-cli ping` (should return PONG)

### Frontend won't start
- Check Node version: `node --version` (need 18+)
- Install pnpm: `npm install -g pnpm`
- Clear node_modules: `rm -rf node_modules && pnpm install`

### Slow traces
- Enable Redis caching
- Reduce max depth
- Check Electrum server connection

### Empty graph
- Verify transaction ID format (64 hex characters)
- Check output index exists
- Try with vout=0 if unsure

## Next Steps

1. Read [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) for technical details
2. Check [backend/README.md](backend/README.md) for API documentation
3. See [frontend/README.md](frontend/README.md) for UI details
4. Run tests: `poetry run pytest` (backend) or `pnpm test` (frontend)

## Support

For issues or questions:
- Check API docs: http://localhost:8000/docs
- Review code comments in source files
- See heuristics documentation in backend/README.md

Happy analyzing! 🔍




