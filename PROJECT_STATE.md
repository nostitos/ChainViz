# ChainViz - Current Project State

## Project Overview
Bitcoin blockchain analysis platform for tracing UTXOs and visualizing transaction flows using on-chain data from Electrum server.

**Tech Stack:**
- Backend: Python/FastAPI, Electrum protocol, NetworkX, Redis caching
- Frontend: React/TypeScript, React Flow (graph), TailwindCSS
- Data: Local Electrum server (Fulcrum) at 192.168.8.234:50002

## Recent Major Refactor (Complete)

### What Was Done (~1000 lines deleted)
1. **Fixed Critical Batch RPC Bug**: Responses matched by ID instead of order (txids were getting mixed up!)
2. **Unified Expansion System**: 630-line handleExpandNode → 70 lines, uses cached metadata
3. **Zero-Fetch Expansions**: All data fetched upfront, expansions instant from cache
4. **Single Data Source**: Removed mempool.space, Electrum only
5. **Multi-UTXO Visualization**: Multiple edges per address (shows all UTXOs)
6. **P2PK Support**: Shows "P2PK: {pubkey}" for old script types
7. **Memory Leak Fixed**: History limited to 10, metadata capped at 100 items
8. **Cache Optimized**: TXs 30 days, addresses 1 day

### Architecture: Data-First Approach
```
Initial Load:
  Backend fetches 30 TXs → Resolves ALL inputs → Returns complete metadata
  Frontend displays → User expands → Reads from metadata (NO network call!)
  
Expansion:
  Transaction: metadata.inputs/outputs already there!
  Address (initial): Uses existing edges
  Address (new): Fetches from backend with directional hops
```

### Current Issues Fixed
- ✅ Batch RPC responses out of order (match by ID now)
- ✅ Duplicate node IDs (deduplicate addresses, multiple edges per UTXO)
- ✅ Missing metadata (complete inputs/outputs in all TX nodes)
- ✅ Memory leak (history + metadata limited)
- ✅ P2PK not showing (detect type, extract pubkey, show placeholder)
- ✅ Stale closure in expansion (read fresh state)
- ✅ 500 errors on placeholders (validate address format in 3 places)

## Current Problem: Large Address Expansion

**Issue**: Address with 346 transactions
- User clicks expand → "No new connections to show"
- All TXs already in graph OR filtered out
- Unusable for large addresses

**Solution In Progress**: Cluster + Progressive Loading

### What's Implemented
1. ✅ LoadMoreNode component (visual + CSS)
2. ✅ expandAddressNodeWithFetch creates cluster if >10 TXs
3. ✅ Cluster shows "346 Spending TXs"
4. ⏸️ Click cluster → Nothing (need handler)
5. ⏸️ Click LoadMore → Nothing (need handler)

### What's Needed (IMMEDIATE)

**File: `frontend/src/utils/expansionHelpers.ts`**

Add function:
```typescript
export async function expandCluster(
  clusterNode: Node,
  edgeScaleMax: number,
  apiBaseUrl: string,
  existingNodeIds: Set<string>
): Promise<ExpandResult> {
  // Extract cluster metadata
  // Fetch first 20 TXs
  // Position them
  // Add LoadMore if >20 remain
  // Return nodes + edges
}
```

**File: `frontend/src/App.tsx`**

1. Detect cluster expansion:
```typescript
if (node.type === 'transactionCluster') {
  result = await expandCluster(node, edgeScaleMax, API_BASE_URL, existingIds);
}
```

2. Handle LoadMore:
```typescript
const handleLoadMore = useCallback(async (address, direction, offset) => {
  // Fetch next batch (offset to offset+20)
  // Position below existing
  // Update LoadMore node or remove
}, []);
```

3. Pass handler to LoadMore nodes when creating them

**Estimated**: ~100 lines total to complete feature

## Key Code Locations

### Backend
- **trace.py**: Main tracing endpoints (UTXO + Address)
  - `/api/trace/utxo`: FAST PATH for hops ≤1 (lines 45-199)
  - `/api/trace/address`: Directional address tracing (lines 456-700)
  - Input resolution with P2PK support (lines 554-618)

- **blockchain_data.py**: Electrum interface
  - `fetch_transactions_batch`: Batch RPC with ID matching (lines 256-336)
  - `_parse_transaction`: Parse Electrum response (lines 396-493)
  - `_extract_pubkey_from_p2pk_script`: P2PK pubkey extraction (lines 25-56)

- **electrum_client.py**: RPC client
  - `_batch_call_single`: Match responses by ID (lines 219-330)
  - Retry logic with exponential backoff
  - CHUNK_SIZE = 50 (rate limiting mitigation)

### Frontend
- **App.tsx**: Main component
  - `handleExpandNode`: Unified expansion (lines 920-1045)
  - `handleExpandBackward/Forward`: Arrow buttons (lines 1111-1300)
  - Fresh state reading to avoid stale closure

- **expansionHelpers.ts**: Expansion logic
  - `expandTransactionNode`: From metadata, multi-UTXO (lines 70-168)
  - `expandAddressNode`: From existing edges (lines 175-220)
  - `expandAddressNodeWithFetch`: Backend fetch, clusters >10 (lines 235-360)
  - **TODO**: `expandCluster` - Load first batch from cluster
  - **TODO**: Update for LoadMore progressive loading

- **graphBuilderBipartite.ts**: Layout engine
  - Address-centric vs TX-centric layouts (lines 154-320)
  - Clustering logic (lines 400-730)
  - Edge styling (lines 746-865)

### Components
- **TransactionNode.tsx**: Shows TX with input/output counts, expand buttons
- **AddressNode.tsx**: Shows address, balance (validates before fetch!)
- **TransactionClusterNode.tsx**: Shows "N Transactions" ← Need onClick
- **LoadMoreNode.tsx**: "Load 20 More (N remaining)" ← Has onClick
- **EntityPanel.tsx**: Sidebar with TX/address details

## Data Flow

### Initial Load (Address)
```
User loads: 1ABC...
  ↓
Backend: GET address history (30 TXIDs)
  ↓
Backend: Batch fetch 30 TXs
  ↓
Backend: Batch fetch ALL previous TXs (resolve inputs)
  ↓
Backend: Build complete metadata (inputs[], outputs[])
  ↓
Backend: Filter by direction (hops_before/after)
  ↓
Frontend: Display address + 15 LEFT + 15 RIGHT
  ↓
All cached 30 days!
```

### Expansion (Transaction)
```
User clicks: ▶ on TX
  ↓
Frontend: Read tx.metadata.outputs (already there!)
  ↓
Frontend: Deduplicate addresses (4 unique from 9 outputs)
  ↓
Frontend: Create 4 address nodes
  ↓
Frontend: Create 9 edges (one per UTXO)
  ↓
Display instantly (NO network call!)
```

### Expansion (Address with 346 TXs) - BROKEN NOW
```
User clicks: ▶ on address
  ↓
Frontend: No edges in that direction
  ↓
Frontend: Fetch from backend (hops_after=1, max=100)
  ↓
Backend: Returns TXs (but only 20-100, not all 346!)
  ↓
Frontend: Filters existing
  ↓
Frontend: "No new connections" ← PROBLEM!
```

### Expansion (Address with 346 TXs) - WILL BE
```
User clicks: ▶ on address
  ↓
Frontend: No edges in that direction  
  ↓
Frontend: Fetch to check count
  ↓
Backend: Returns total_nodes=347 (346 TXs + 1 address)
  ↓
Frontend: 346 > 10 → Create cluster node
  ↓
User clicks cluster
  ↓
Frontend: Fetch first 20 TXs
  ↓
Frontend: Position + add LoadMore
  ↓
User clicks LoadMore
  ↓
Frontend: Fetch next 20
  ↓
Repeat until all shown
```

## Known Limitations

1. **Multi-hop (slider >1)**: Disabled, shows warning
2. **Newly-added address expansion**: Works but fetches up to 100 TXs
3. **Cluster expansion**: Not implemented yet (CURRENT WORK)
4. **LoadMore progressive**: Not implemented yet (CURRENT WORK)

## Critical Files for Next Feature

**KEEP:**
- backend/app/api/trace.py
- backend/app/services/blockchain_data.py
- backend/app/services/electrum_client.py
- backend/app/models/blockchain.py
- frontend/src/App.tsx
- frontend/src/utils/expansionHelpers.ts
- frontend/src/utils/graphBuilderBipartite.ts
- frontend/src/components/nodes/* (all)
- CLUSTER_STATUS.md, NEXT_STEPS.md

**DELETE (historical):**
- All other .md files (15+)
- deployment/, docs/ (not needed now)
- backend/tests/ (not testing now)
- AppDeckGL.tsx, deckGLBuilder.ts (unused)

## Next Immediate Tasks

1. Add onClick to TransactionClusterNode
2. Create expandCluster in expansionHelpers.ts
3. Create handleLoadMore in App.tsx
4. Wire everything together
5. Test with 1EU5xT9... (346 TXs)

**Estimated**: 2-3 hours to complete
**Files to modify**: 3 (TransactionClusterNode, expansionHelpers, App.tsx)
**Lines to add**: ~150

Then large addresses will be fully usable!

