# UI Guide

Complete guide to the ChainViz user interface and all its features.

---

## Overview

ChainViz provides a professional, interactive interface for Bitcoin blockchain analysis with:

- **Interactive graph visualization** with drag-and-drop nodes
- **Real-time expansion** of transactions and addresses
- **Multiple layout algorithms** for different use cases
- **Professional dark theme** optimized for long sessions
- **Comprehensive settings** for fine-tuning the experience

---

## Main Interface

### Top Bar

**Search Bar**:
- Enter Bitcoin addresses or transaction IDs
- Set hops before/after
- Click "Trace" to start analysis

**Settings Button** (⚙️):
- Opens settings panel
- Configure graph behavior
- Manage Electrum server

**Select Mode Button** (⊟):
- Toggle multi-node selection
- Drag to select multiple nodes
- Shift+Click to add to selection

### Graph Canvas

**Interactive graph** showing:
- 🟠 **Address nodes** (orange)
- 🔵 **Transaction nodes** (blue)
- **Edges** (lines connecting nodes)
- **Mini-map** (bottom-right corner)

### Side Panels

**Left Panel** (when node selected):
- Node details
- Balance information
- Transaction history
- Expand buttons

**Right Panel** (Stats):
- Node count
- Edge count
- Transaction count
- Real-time updates

---

## Node Types

### Address Nodes (🟠)

**Appearance**:
- Orange gradient background
- Address label (first 8 chars)
- Balance display
- Transaction count

**Features**:
- **Click** to see full details
- **Expand** to trace forward/backward
- **Drag** to reposition

**Details Panel Shows**:
- Full address
- Current balance (BTC)
- Total received (BTC)
- Total sent (BTC)
- Transaction count
- Link to Mempool.space

### Transaction Nodes (🔵)

**Appearance**:
- Blue gradient background
- Transaction ID (first 8 chars)
- Timestamp
- Expand buttons (◀ ▶)

**Features**:
- **Click** to see full details
- **Expand inputs** (◀) to show sources
- **Expand outputs** (▶) to show destinations
- **Drag** to reposition

**Details Panel Shows**:
- Full transaction ID
- Timestamp
- Confirmations
- Input count
- Output count
- Total value
- Link to Mempool.space

### Cluster Nodes

**Address Clusters**:
- Group of addresses (10+)
- Shows count (e.g., "15 Addresses")
- Click to expand individual addresses

**Transaction Clusters**:
- Group of transactions (10+)
- Shows count (e.g., "23 Transactions")
- Click to expand individual transactions

---

## Controls

### Mouse Controls

**Pan**:
- Click and drag background
- Move the entire graph

**Zoom**:
- Scroll wheel up/down
- Pinch on trackpad
- Zoom in/out buttons

**Select**:
- Click node to select
- Shift+Click to add to selection
- Drag to select multiple (in select mode)

**Drag Node**:
- Click and drag node
- Reposition for better visibility

### Keyboard Shortcuts

**Select Mode**:
- Press `S` to toggle select mode
- Shift+Drag to select multiple nodes

**Tree Layout**:
- Press `T` to apply tree layout

**Reset View**:
- Press `R` to reset zoom/pan

---

## Settings Panel

Click **⚙️ Settings** to open the settings panel.

### Graph Settings

**Max Outputs Per Transaction**:
- **Range**: 1-300
- **Default**: 20
- **Effect**: How many addresses to show per transaction
- **Use case**: Lower for large transactions, higher for detailed analysis

**Max Transactions to Expand**:
- **Range**: 1-300
- **Default**: 50
- **Effect**: How many transactions to show when expanding
- **Use case**: Lower for active addresses, higher for complete history

**Edge Width Scale**:
- **Range**: 1-500
- **Default**: 100
- **Effect**: Thickness of edges
- **Use case**: Higher to emphasize large transactions

### Layout Options

**Tree Layout** (🌳):
- **Effect**: Organize graph hierarchically
- **Use case**: Complex graphs with many nodes
- **How it works**:
  - Root node at center
  - Children arranged by layer
  - Minimal edge crossings
  - Easier to follow flow

**Force Repulsion** (⚡):
- **Effect**: Spread nodes apart automatically
- **Use case**: When nodes overlap or are too close
- **How it works**:
  - Physics-based simulation
  - Nodes push each other apart
  - Prevents overlapping
  - Better visibility

**Edge Tension** (🔗):
- **Effect**: Pull connected nodes closer
- **Use case**: When nodes are too spread out
- **How it works**:
  - Long edges pull nodes together
  - Tighter layout
  - Better clustering

### Electrum Server

**Current Active**:
- Shows the currently active server
- Doesn't change until you click "Save & Apply"

**Editing**:
- Shows the values you're currently editing
- Changes as you select presets or type

**Presets**:
- **DIYNodes (Fastest)**: electrum.diynodes.com:50002
- **Bitcoin.lu.ke**: bitcoin.lu.ke:50002
- **Electrum Emzy**: electrum.emzy.de:50002
- **Electrum Bitaroo**: electrum.bitaroo.net:50002
- **Seth's Fulcrum**: fulcrum.sethforprivacy.com:50002

**Custom Server**:
- Enter host, port, and SSL setting manually

**Test Connection** (🧪):
- Tests the connection to the server
- Shows latency and success/failure
- Verifies server supports verbose transactions

**Save & Apply** (💾):
- Saves the settings to the backend
- Restarts the Electrum client
- Updates the active server

---

## Expanding Nodes

### Expand Transaction

**Expand Inputs** (◀):
- Shows where the transaction's inputs came from
- Adds address nodes to the left
- Traces backward

**Expand Outputs** (▶):
- Shows where the transaction's outputs went
- Adds address nodes to the right
- Traces forward

**Button Appearance**:
- Shows count of inputs/outputs
- Example: "◀ 5" means 5 inputs
- Example: "▶ 3" means 3 outputs

### Expand Address

**Expand Forward**:
- Shows transactions where this address is an output
- Traces where funds went

**Expand Backward**:
- Shows transactions where this address is an input
- Traces where funds came from

**Expand Button**:
- Click the expand icon (⮕) on the address node
- Choose direction (forward/backward)

---

## Layout Algorithms

### Default Layout

**Bipartite Layout**:
- Addresses and transactions in separate layers
- Address in center
- Transactions positioned by relationship
- Inputs to the left, outputs to the right

**Best for**: Simple graphs, initial view

### Tree Layout

**Hierarchical Layout**:
- Root node at center
- Children arranged by layer
- Minimal edge crossings
- Barycenter method for positioning

**Best for**: Complex graphs, following transaction flow

**How to use**:
1. Click **🌳 Tree Layout** button
2. Graph reorganizes automatically
3. Click again to return to default

### Force Repulsion

**Physics-Based Layout**:
- Nodes push each other apart
- Prevents overlapping
- Better visibility
- Continuous simulation

**Best for**: Overlapping nodes, dense graphs

**How to use**:
1. Toggle **⚡ Force Repulsion**
2. Nodes spread apart automatically
3. Toggle off to stop

**Note**: Automatically pauses during expansion to prevent interference

### Edge Tension

**Tension-Based Layout**:
- Long edges pull nodes together
- Tighter layout
- Better clustering
- Periodic updates (every 200ms)

**Best for**: Spread out nodes, loose graphs

**How to use**:
1. Toggle **🔗 Edge Tension**
2. Nodes pull together
3. Toggle off to stop

---

## Color Coding

### Node Colors

**🟠 Address Nodes** (Orange):
- Bitcoin addresses
- Shows balance and transaction count

**🔵 Transaction Nodes** (Blue):
- Bitcoin transactions
- Shows txid and timestamp

**🟣 Cluster Nodes** (Purple):
- Groups of 10+ nodes
- Shows count

### Edge Colors

**Green** (solid):
- High confidence (>80%)
- Strong evidence of ownership

**Amber** (solid):
- Medium confidence (60-80%)
- Moderate evidence

**Red** (dashed):
- Low confidence (<60%)
- Weak evidence

### Edge Width

**Thick edges**:
- Large transaction amounts
- Important flows

**Thin edges**:
- Small transaction amounts
- Minor flows

**Adjustable**: Use Edge Width Scale slider (1-500)

---

## Tips & Tricks

### 1. Start Small

Begin with 0-2 hops and expand selectively:
- Faster loading
- Less overwhelming
- Easier to understand

### 2. Use Tree Layout for Complex Graphs

Tree layout makes complex graphs easier to read:
- Hierarchical organization
- Minimal edge crossings
- Clear flow direction

### 3. Toggle Force Repulsion When Needed

Use force repulsion when nodes overlap:
- Physics-based spacing
- Prevents overlapping
- Better visibility

### 4. Adjust Edge Width for Clarity

Make important flows stand out:
- Increase Edge Width Scale
- Large transactions become more visible
- Easier to follow money flow

### 5. Use Select Mode for Multiple Nodes

Select multiple nodes at once:
- Toggle select mode (⊟)
- Drag to select
- Shift+Click to add

### 6. Test Different Servers

Find the fastest Electrum server:
- Open settings
- Try different presets
- Click "🧪 Test" to check speed
- Save the fastest one

### 7. Expand Selectively

Don't expand everything at once:
- Click expand buttons on interesting nodes
- Build the graph gradually
- Focus on important flows

### 8. Use the Mini-Map

Navigate large graphs with the mini-map:
- Bottom-right corner
- Shows entire graph
- Click to jump to area

---

## Troubleshooting

### Nodes Overlap

**Solution**: Enable Force Repulsion
1. Click **⚙️ Settings**
2. Toggle **⚡ Force Repulsion**
3. Nodes spread apart automatically

### Graph is Too Spread Out

**Solution**: Use Tree Layout or Edge Tension
1. Click **🌳 Tree Layout** for hierarchical organization
2. Or toggle **🔗 Edge Tension** to pull nodes closer

### Can't See Important Flows

**Solution**: Increase Edge Width Scale
1. Click **⚙️ Settings**
2. Increase **Edge Width Scale** slider
3. Large transactions become more visible

### Slow Performance

**Solution**: Reduce settings
1. Lower **Max Outputs Per Transaction**
2. Lower **Max Transactions to Expand**
3. Use fewer hops
4. Try a faster Electrum server

### Can't Click Expand Buttons

**Solution**: Ensure you're in normal mode (not select mode)
1. Click the **⊟** button to exit select mode
2. Try clicking expand buttons again

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `S` | Toggle select mode |
| `T` | Apply tree layout |
| `R` | Reset view |
| `Escape` | Close panels |
| `Ctrl/Cmd + Z` | Undo (if implemented) |

---

## Best Practices

1. **Start with default settings** and adjust as needed
2. **Use tree layout** for complex graphs
3. **Enable force repulsion** when nodes overlap
4. **Adjust edge width** to emphasize important flows
5. **Test different servers** to find the fastest
6. **Expand selectively** to build the graph gradually
7. **Use select mode** to work with multiple nodes
8. **Check the mini-map** to navigate large graphs

---

## Next Steps

- Learn about [Tracing](../guides/tracing-guide.md) Bitcoin transactions
- Understand [Heuristics](../guides/heuristics-explained.md) in detail
- Check the [API Reference](../guides/api-reference.md) for automation
- See [Troubleshooting](../troubleshooting/common-issues.md) for help

---

**Happy analyzing! 🎨**

