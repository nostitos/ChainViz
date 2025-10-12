# ChainViz Frontend

React + TypeScript frontend for Bitcoin blockchain analysis visualization.

## Features

- **Interactive Graph Visualization**: WebGL-powered Sigma.js for smooth rendering of 1000+ nodes
- **UTXO Tracing**: Visual backward tracing with confidence-based coloring
- **Node Inspector**: Detailed information for addresses and transactions
- **Search Interface**: Query by address or transaction ID
- **Real-time Updates**: WebSocket connection for new blocks
- **Confidence Filtering**: Adjust minimum confidence threshold
- **Legend & Tooltips**: Understand node types and edge relationships

## Setup

### Requirements

- Node.js 18+
- pnpm

### Installation

```bash
cd frontend
pnpm install
```

### Development

```bash
pnpm dev
```

Frontend will be available at `http://localhost:5173`

### Build

```bash
pnpm build
```

### Preview Production Build

```bash
pnpm preview
```

## Architecture

### Components

- **GraphCanvas**: Main Sigma.js visualization with WebGL rendering
- **SearchBar**: Input for addresses/transactions with options
- **Inspector**: Detailed panel for selected nodes
- **Controls**: Zoom, pan, reset functionality

### State Management

- React Query for API data fetching and caching
- Local state for UI interactions

### Graph Visualization

Uses Sigma.js with:
- WebGL renderer for performance
- Force Atlas 2 layout algorithm
- Node coloring by type (address, transaction, cluster)
- Edge styling by confidence (solid = high, dashed = low)

### Color Scheme

- **Blue**: Clustered addresses (common-input heuristic)
- **Green**: External addresses
- **Amber**: Change addresses
- **Purple**: Transactions
- **Red edges**: Low confidence (<0.6)
- **Amber edges**: Medium confidence (0.6-0.8)
- **Green edges**: High confidence (>0.8)

## Usage

### Search Examples

1. **Transaction ID with output index**:
   ```
   abcd1234ef567890abcd1234ef567890abcd1234ef567890abcd1234ef567890:0
   ```

2. **Transaction ID (defaults to output 0)**:
   ```
   abcd1234ef567890abcd1234ef567890abcd1234ef567890abcd1234ef567890
   ```

### Options

- **Max Trace Depth**: Number of hops to trace backward (5-50)
- **Confidence Threshold**: Minimum confidence for displayed links (0-100%)
- **Include CoinJoin**: Trace through CoinJoin transactions (experimental)

## Performance

- Optimized for 1000+ nodes
- WebGL rendering for smooth interactions
- Lazy loading of transaction details
- Debounced layout calculations

## Development

### Type Checking

```bash
pnpm tsc --noEmit
```

### Linting

```bash
pnpm lint
```

## License

MIT




