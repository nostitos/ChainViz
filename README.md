# ChainViz - Bitcoin Blockchain Analysis Platform

A powerful web-based Bitcoin blockchain analysis platform focused on tracing and visualizing transaction histories using on-chain data only.

## Features

- **UTXO Backward Tracing**: Track UTXOs through the transaction graph to identify origins
- **Advanced Heuristics**: Common-input clustering, change detection, peel chain identification, CoinJoin detection
- **Interactive Visualization**: WebGL-powered graphs with 1000+ nodes, smooth zoom/pan
- **Bulk Import**: Import address lists or derive from xpub (multiple standards and derivation paths)
- **Real-time Updates**: Live blockchain monitoring for new blocks and transactions
- **Confidence Scoring**: All inferences include confidence levels (0.0-1.0)

## Architecture

- **Backend**: Python 3.11+ with FastAPI, async Electrum client, NetworkX for graph analysis
- **Frontend**: React 18+ with TypeScript, Sigma.js for visualization, TailwindCSS
- **Data Source**: Fulcrum Electrum server (default: fulcrum.sethforprivacy.com:50002)
- **Caching**: Redis for performance optimization

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- pnpm
- Redis (optional, for caching)
- Docker & Docker Compose (for containerized setup)

### Development Setup

1. **Clone the repository**
```bash
git clone <repository-url>
cd ChainViz
```

2. **Backend Setup**
```bash
cd backend
poetry install
poetry run uvicorn app.main:app --reload
```

3. **Frontend Setup**
```bash
cd frontend
pnpm install
pnpm dev
```

4. **Docker Compose (Recommended)**
```bash
docker-compose up
```

## Configuration

Default Electrum server: `fulcrum.sethforprivacy.com:50002`

To use a custom server, set environment variable:
```bash
export ELECTRUM_HOST=your-server.com
export ELECTRUM_PORT=50002
```

## API Documentation

Once running, visit `http://localhost:8000/docs` for interactive API documentation.

## Heuristics

### Common-Input Clustering (Confidence: 0.9)
All inputs in a transaction likely belong to the same entity (except CoinJoins).

### Change Detection
- **Address Reuse** (0.95): Reused addresses are payments, not change
- **Round Amounts** (0.7): Round values suggest intentional payments
- **Script Type Matching** (0.8): Change matches input script types
- **Optimal Change** (0.75): Unnecessary inputs indicate larger output is payment
- **Wallet Fingerprinting** (0.6): Wallet-specific patterns

### Pattern Detection
- **Peel Chains**: Sequential small payments from large UTXO
- **CoinJoin**: Multiple inputs with equal-value outputs (breaks heuristics)
- **Temporal Analysis** (0.5): Timing correlations
- **Amount Patterns** (0.6): Fixed denominations, pass-through addresses

## License

MIT

## Contributing

Contributions welcome! Please read CONTRIBUTING.md for guidelines.


