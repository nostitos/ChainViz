# Quick Start Guide

Get up and running with ChainViz in under 2 minutes!

---

## 🚀 Start ChainViz

### Option 1: Docker (Recommended)

```bash
cd /Users/t/Documents/vibbbing/ChainViz
docker-compose up -d
```

Wait ~30 seconds, then open: **http://localhost:5173**

### Option 2: Manual Setup

**Terminal 1 - Backend**:
```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 2 - Frontend**:
```bash
cd frontend
npm run dev
```

Then open: **http://localhost:5173**

---

## 🎯 First Trace

### Test with a Real Address

1. **Enter address** in the search bar:
   ```
   1Gw5PwF6sGVxomatMbj5p4bkk7ED4pyfbu
   ```

2. **Set hops**:
   - **Hops Before**: `0` (don't trace backward)
   - **Hops After**: `0` (don't trace forward)

3. **Click "Trace"**

You should see a graph with:
- 🟠 **Orange nodes** = Addresses
- 🔵 **Blue nodes** = Transactions
- **Green edges** = Bitcoin flows

---

## 📊 Understanding the Graph

### Node Types

- **🟠 Address Nodes**: Bitcoin addresses
  - Shows balance and transaction count
  - Click to see full details in side panel

- **🔵 Transaction Nodes**: Bitcoin transactions
  - Shows txid and timestamp
  - Has expand buttons (◀ ▶) to show more inputs/outputs

### Controls

- **Drag nodes** to rearrange the graph
- **Scroll** to zoom in/out
- **Click background** to pan
- **Click node** to see details in the side panel

### Expand Nodes

**Transaction nodes** have expand buttons:
- **◀** = Expand inputs (show where funds came from)
- **▶** = Expand outputs (show where funds went)

**Address nodes** can be expanded:
- Click the **expand icon** (⮕) to trace forward
- Click the **expand icon** (⮕) to trace backward

---

## ⚙️ Settings

Click the **⚙️ Settings** button to access:

### Graph Settings

- **Max Outputs Per Transaction**: How many addresses to show per transaction (1-300)
- **Max Transactions to Expand**: How many transactions to show when expanding (1-300)
- **Edge Width Scale**: Thickness of edges (1-500)

### Layout Options

- **Tree Layout**: Organize graph hierarchically
- **Force Repulsion**: Physics-based node spacing
- **Edge Tension**: Pull connected nodes closer

### Electrum Server

- Select a server from the dropdown
- Click **🧪 Test** to verify connection
- Click **💾 Save & Apply** to update

---

## 🔍 Example Queries

### 1. Simple Address Trace

```
Address: 1Gw5PwF6sGVxomatMbj5p4bkk7ED4pyfbu
Hops Before: 0
Hops After: 0
```

Shows the address and its immediate transactions.

### 2. Trace Backward (Find Source)

```
Address: 1Gw5PwF6sGVxomatMbj5p4bkk7ED4pyfbu
Hops Before: 5
Hops After: 0
```

Traces 5 steps backward to find where funds originated.

### 3. Trace Forward (Find Destination)

```
Address: 1Gw5PwF6sGVxomatMbj5p4bkk7ED4pyfbu
Hops Before: 0
Hops After: 5
```

Traces 5 steps forward to find where funds went.

### 4. Trace Both Directions

```
Address: 1Gw5PwF6sGVxomatMbj5p4bkk7ED4pyfbu
Hops Before: 3
Hops After: 3
```

Shows 3 steps in both directions for complete context.

### 5. Trace from Transaction

```
Transaction: 49fc56d4c1acd8946cec82d7bf8bf35035118a87ccf70dd29c7d349ef1a530e3
```

Shows all inputs and outputs for that transaction.

---

## 🎨 Graph Features

### Select Mode

Click the **⊟** button to enter select mode:
- **Drag to select** multiple nodes
- **Shift+Click** to add to selection
- **Right-click** for context menu

### Tree Layout

Click **🌳 Tree Layout** to organize the graph:
- Hierarchical arrangement
- Minimal edge crossings
- Easier to follow transaction flow

### Force Repulsion

Toggle **⚡ Force Repulsion** to:
- Spread nodes apart automatically
- Prevent overlapping
- Better node visibility

### Edge Tension

Toggle **🔗 Edge Tension** to:
- Pull connected nodes closer
- Reduce long edges
- Tighter graph layout

---

## 💡 Tips for Best Results

1. **Start small**: Use 0-2 hops initially
2. **Expand selectively**: Click expand buttons on interesting nodes
3. **Use tree layout**: Makes complex graphs easier to read
4. **Adjust edge width**: Make important flows more visible
5. **Test servers**: Use the fastest Electrum server available

---

## 🎓 Next Steps

- **Learn tracing**: See [Tracing Guide](../guides/tracing-guide.md)
- **Understand heuristics**: See [Heuristics Explained](../guides/heuristics-explained.md)
- **Master the UI**: See [UI Guide](../guides/ui-guide.md)
- **Deploy to production**: See [Deployment Guide](../deployment/docker-guide.md)

---

## 🆘 Need Help?

- **Can't see the graph?** Check [Troubleshooting](../troubleshooting/common-issues.md)
- **Slow performance?** Try reducing hops or max outputs
- **Connection errors?** Try a different Electrum server
- **Questions?** Check the [API Documentation](../guides/api-reference.md)

**Happy tracing! 🔍**

