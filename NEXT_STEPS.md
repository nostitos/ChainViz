# Next Steps: Cluster + Progressive Loading

## Current Status

✅ **Completed:**
- Core expansion refactor (~700 lines deleted)
- Zero-fetch expansions (data from cache)
- Multi-UTXO visualization (multiple edges per address)
- P2PK support (shows "P2PK Script" placeholders)
- Arrow buttons (expand leftmost/rightmost only)
- Cache optimized (30 days TXs, 1 day addresses)
- Console logs cleaned up
- Address expansion for newly-added addresses

## Remaining: Hybrid Cluster + Progressive Loading

### The Problem
Address with 300+ transactions:
- Currently: Expands to 20 TXs (hardcoded limit)
- User sees: "No more connections" even though 280+ remain
- Confusing and incomplete

### The Solution: Option 4 (Hybrid)

**Step 1: Initial Click**
- Create TransactionCluster node
- Shows: "300 Spending TXs"
- Positioned where TXs would go

**Step 2: Click Cluster**
- Expands to first 20 TXs
- Positions them in vertical stack
- Adds "Load More" node at bottom
- "Load More" shows: "280 remaining"

**Step 3: Click "Load More"**
- Adds next 20 TXs below current ones
- Updates "Load More" node
- "Load More" shows: "260 remaining"
- Repeat until all shown

## Implementation Plan

### File 1: `frontend/src/components/nodes/LoadMoreNode.tsx` (NEW)

```typescript
interface LoadMoreNodeData {
  remainingCount: number;
  address: string;
  direction: 'receiving' | 'spending';
  currentOffset: number; // Which batch we're on
  onLoadMore: (nodeId: string) => void;
}

export const LoadMoreNode = ({ data }: NodeProps<LoadMoreNodeData>) => {
  return (
    <div className="load-more-node" onClick={() => data.onLoadMore(data.address)}>
      <Download size={16} />
      <span>Load 20 More</span>
      <span className="count">{data.remainingCount} remaining</span>
    </div>
  );
};
```

### File 2: `frontend/src/utils/expansionHelpers.ts`

Update `expandAddressNodeWithFetch`:

```typescript
// Check if result has many TXs (>10)
const totalTxCount = txListData.total || transactions.length;

if (totalTxCount > 10) {
  console.log(`⚠️ Address has ${totalTxCount} TXs - creating cluster node`);
  
  // Create cluster node instead of individual TXs
  return {
    nodes: [{
      id: `tx-cluster-${address}-${direction}-${Date.now()}`,
      type: 'transactionCluster',
      position: {
        x: addrNode.position.x + xOffset,
        y: addrNode.position.y,
      },
      data: {
        address,
        direction,
        totalCount: totalTxCount,
        transactions: [], // Will be loaded progressively
        label: `${totalTxCount} ${direction === 'receiving' ? 'Receiving' : 'Spending'} TXs`,
        onExpand: () => {} // Will be set in App.tsx
      },
    }],
    edges: [{
      id: `e-cluster-${address}-${direction}`,
      source: direction === 'receiving' ? clusterId : addrId,
      target: direction === 'receiving' ? addrId : clusterId,
      ... // Styling
    }]
  };
}

// Otherwise, show TXs directly (< 10)
```

### File 3: `frontend/src/App.tsx`

Add handler for expanding transaction clusters:

```typescript
const handleExpandCluster = useCallback(async (clusterId: string) => {
  const cluster = nodes.find(n => n.id === clusterId);
  if (!cluster || cluster.type !== 'transactionCluster') return;
  
  const address = cluster.data.address;
  const direction = cluster.data.direction;
  const currentOffset = cluster.data.currentOffset || 0;
  
  // Fetch next batch (20 TXs)
  const response = await fetch(`${API_BASE_URL}/trace/address?...&skip=${currentOffset}&limit=20`);
  
  // Add TXs below cluster
  // If more remain, add/update "Load More" node
  // Otherwise remove it
}, []);
```

## Detailed Implementation Steps

1. Create LoadMoreNode component
2. Update expandAddressNodeWithFetch to create cluster for >10 TXs
3. Add cluster expansion handler in App.tsx
4. Handle progressive loading (tracking offset)
5. Style LoadMoreNode to be visually distinct
6. Test with 300+ TX address

## Expected Behavior

```
User clicks address with 300 TXs:
  → Cluster node appears: "300 Spending TXs"
  
User clicks cluster:
  → First 20 TXs appear
  → "Load More (280 remaining)" node appears
  
User clicks "Load More":
  → Next 20 TXs appear
  → "Load More (260 remaining)" updates
  
User clicks "Load More" 14 times total:
  → All 300 TXs visible
  → "Load More" node removed
```

Clean, progressive, user-controlled!

