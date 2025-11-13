# ChainViz - Bitcoin Blockchain Analysis Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![Node.js 18+](https://img.shields.io/badge/node-18+-green.svg)](https://nodejs.org/)

A powerful web-based Bitcoin blockchain analysis platform focused on tracing and visualizing transaction histories using on-chain data only.

---

## 🚀 Quick Start

### Docker (Recommended)

```bash
cd /Users/t/Documents/vibbbing/ChainViz
docker-compose up -d
```

Wait ~30 seconds, then open: **http://localhost:5173**

### Manual Setup

```bash
# Backend
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

Open: **http://localhost:5173**

---

## ✨ Features

- **🔍 UTXO Tracing**: Track UTXOs backward and forward through the transaction graph
- **🎯 Advanced Heuristics**: Common-input clustering, change detection, peel chain identification, CoinJoin detection
- **📊 Interactive Visualization**: WebGL-powered graphs with 1000+ nodes, smooth zoom/pan
- **⚡ Real-time Updates**: Live blockchain monitoring for new blocks and transactions
- **🎨 Professional UI**: Drag-and-drop nodes, tree layout, force repulsion, edge tension
- **📈 Confidence Scoring**: All inferences include confidence levels (0.0-1.0)
- **🔧 Dynamic Configuration**: Change Electrum server without restarting

---

## 📚 Documentation

### Getting Started

- **[Installation Guide](docs/getting-started/installation.md)** - Set up ChainViz on your system
- **[Quick Start Guide](docs/getting-started/quick-start.md)** - Get up and running in 2 minutes
- **[Development Setup](docs/getting-started/development-setup.md)** - Set up for development

### User Guides

- **[Tracing Guide](docs/guides/tracing-guide.md)** - Complete guide to tracing Bitcoin transactions
- **[Heuristics Explained](docs/guides/heuristics-explained.md)** - Detailed explanation of analysis heuristics
- **[UI Guide](docs/guides/ui-guide.md)** - Complete guide to the user interface
- **[API Reference](docs/guides/api-reference.md)** - Complete API documentation

### Deployment

- **[Docker Guide](docs/deployment/docker-guide.md)** - Deploy with Docker and Docker Compose
- **[AWS Deployment](docs/deployment/aws-deployment.md)** - Deploy to Amazon Web Services
- **[Auto-Deploy](docs/deployment/auto-deploy.md)** - Set up automated deployments

### Troubleshooting

- **[Common Issues](docs/troubleshooting/common-issues.md)** - Solutions to common problems

---

## 🏗️ Architecture

### Backend

- **Framework**: FastAPI (Python 3.11+)
- **Primary Data Source**: Tiered mempool.space-compatible HTTP endpoints (local node, community mirrors, public API) routed through a lightweight mempool multiplexer with health tracking
- **Fallback Data Source**: Electrum multiplexer (lazy connections, round-robin retry) used only when HTTP tier cannot satisfy a request
- **Caching**: Redis (optional)
- **Analysis**: NetworkX for graph analysis
- **Heuristics**: Multiple algorithms with confidence scoring

### Frontend

- **Framework**: React 18+ with TypeScript
- **Visualization**: React Flow (interactive graphs)
- **Layout**: Tree layout, force repulsion, edge tension
- **Styling**: Custom CSS with dark theme
- **State**: React hooks and context

### Data Flow

```
User Input → Frontend → Backend API → Electrum Server → Blockchain Data
                ↓
         Graph Visualization ← Confidence Scores ← Heuristics Analysis
```

### Data Sources Strategy

- The backend first queries a **local mempool.space instance** for full transaction context (inputs, outputs, prevouts).  
- If a transaction exceeds configured thresholds (inputs/size) or the local node is unavailable, the request is routed to **community-hosted mempool.space mirrors** or the public API, respecting per-endpoint concurrency limits.  
- Only when all HTTP tiers fail does ChainViz fall back to the Electrum multiplexer to guarantee coverage.

---

## 🎯 Use Cases

- **🔍 Transaction Analysis**: Trace Bitcoin transactions backward and forward
- **💰 Wallet Investigation**: Analyze wallet activity and patterns
- **🕵️ Forensic Analysis**: Identify transaction patterns and relationships
- **📊 Compliance**: Verify transaction sources and destinations
- **🎓 Education**: Learn about Bitcoin transaction flows

---

## 🔧 Configuration

### Electrum Server

Configure the Electrum server in the UI:

1. Click **⚙️ Settings**
2. Select a server from the dropdown or enter custom settings
3. Click **🧪 Test Connection** to verify
4. Click **💾 Save & Apply** to update

**Default**: `fulcrum.sethforprivacy.com:50002` (SSL enabled)

**Recommended Servers**:
- DIYNodes (Fastest)
- Bitcoin.lu.ke
- Electrum Emzy
- Electrum Bitaroo
- Seth's Fulcrum (fallback)

### Environment Variables

```bash
# Electrum Server
ELECTRUM_HOST=fulcrum.sethforprivacy.com
ELECTRUM_PORT=50002
ELECTRUM_USE_SSL=true

# Redis (optional)
REDIS_HOST=localhost
REDIS_PORT=6379
```

---

## 🧠 Heuristics

ChainViz uses multiple heuristics to analyze Bitcoin transactions:

### Common-Input Clustering (90% confidence)
All inputs in a transaction likely belong to the same entity (except CoinJoins).

### Change Detection
- **Address Reuse** (95%): Reused addresses are payments, not change
- **Round Amounts** (70%): Round values suggest intentional payments
- **Script Type Matching** (80%): Change matches input script types
- **Optimal Change** (75%): Unnecessary inputs indicate larger output is payment
- **Wallet Fingerprinting** (60%): Wallet-specific patterns

### Pattern Detection
- **Peel Chains**: Sequential small payments from large UTXO
- **CoinJoin**: Multiple inputs with equal-value outputs (breaks heuristics)
- **Temporal Analysis** (50%): Timing correlations
- **Amount Patterns** (60%): Fixed denominations, pass-through addresses

---

## 📖 Example Usage

### Trace an Address

```bash
# Enter address
1Gw5PwF6sGVxomatMbj5p4bkk7ED4pyfbu

# Set hops
Hops Before: 3
Hops After: 3

# Click "Trace"
```

### Trace a Transaction

```bash
# Enter transaction ID
49fc56d4c1acd8946cec82d7bf8bf35035118a87ccf70dd29c7d349ef1a530e3

# Click "Trace"
```

### API Example

```bash
curl -X POST http://localhost:8000/api/trace/address \
  -H "Content-Type: application/json" \
  -d '{
    "address": "1Gw5PwF6sGVxomatMbj5p4bkk7ED4pyfbu",
    "hops_before": 3,
    "hops_after": 3
  }'
```

---

## 🧪 Testing

### Backend Tests

```bash
cd backend
source venv/bin/activate
pytest
```

### Frontend Tests

```bash
cd frontend
npm test
```

---

## 🤝 Contributing

Contributions are welcome! Please read our [Development Setup Guide](docs/getting-started/development-setup.md) to get started.

### Code Style

- **Python**: Black, isort, mypy
- **TypeScript**: ESLint, Prettier
- **Commits**: Conventional commits

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **Electrum Protocol**: For blockchain data access
- **React Flow**: For interactive graph visualization
- **FastAPI**: For the backend framework
- **NetworkX**: For graph analysis

---

## 📞 Support

- **Documentation**: See [docs/](docs/) folder
- **Issues**: Create an issue on GitHub
- **Discussions**: Join the discussion

---

## 🗺️ Roadmap

- [ ] Advanced filtering and search
- [ ] Export graphs to PDF/PNG
- [ ] Multi-currency support (Litecoin, Bitcoin Cash)
- [ ] Lightning Network analysis
- [ ] Machine learning for pattern detection
- [ ] Mobile app

---

**Happy analyzing! 🔍**

---

<div align="center">

**Made with ❤️ for the Bitcoin community**

[Documentation](docs/) • [API Reference](docs/guides/api-reference.md) • [Troubleshooting](docs/troubleshooting/common-issues.md)

</div>
