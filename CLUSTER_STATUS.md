# Cluster + Progressive Loading Status

## ✅ Completed

1. **LoadMoreNode component** - Visual component for "Load 20 More" button
2. **Cluster creation** - expandAddressNodeWithFetch creates cluster for >10 TXs
3. **TransactionCluster node** - Shows "300 Spending TXs" etc.
4. **Console cleanup** - Removed ~15 noisy logs

## ⏸️ In Progress

**Cluster Expansion Handler** - Needs implementation in App.tsx

When user clicks TransactionCluster node:
1. Detect click on cluster
2. Fetch first 20 TXs (with skip=0, limit=20)
3. Create TX nodes with positions
4. Add LoadMore node at bottom if more remain
5. Replace cluster with TXs + LoadMore

## 🔄 Next Steps

### Immediate (to complete feature):

**File: `frontend/src/App.tsx`**

Add cluster click handler:
```typescript
const handleClusterClick = useCallback(async (cluster: Node) => {
  if (cluster.type !== 'transactionCluster') return;
  
  const { address, direction, totalCount } = cluster.data;
  
  // Fetch first batch (backend already limits to 20)
  const hopsBefore = direction === 'receiving' ? 1 : 0;
  const hopsAfter = direction === 'spending' ? 1 : 0;
  
  const response = await fetch(...);
  const data = await response.json();
  
  // Extract TXs
  const txNodes = createTxNodesFromData(data, cluster.position);
  
  // Add LoadMore node if needed
  const remainingCount = totalCount - 20;
  if (remainingCount > 0) {
    const loadMoreNode = {
      id: `load-more-${address}-${direction}`,
      type: 'loadMore',
      position: { x: cluster.position.x, y: cluster.position.y + (20 * 90) },
      data: {
        address,
        direction,
        currentOffset: 20,
        remainingCount,
        totalCount,
        onLoadMore: handleLoadMore,
      },
    };
    txNodes.push(loadMoreNode);
  }
  
  // Remove cluster, add TXs
  setNodes(nds => [...nds.filter(n => n.id !== cluster.id), ...txNodes]);
}, []);
```

**File: `frontend/src/App.tsx`**

Add LoadMore handler:
```typescript
const handleLoadMore = useCallback(async (address: string, direction: string, offset: number) => {
  // Fetch next batch with skip=offset
  // Create TX nodes
  // Update or remove LoadMore node
  // Add new TXs to graph
}, []);
```

### Testing

With address `1EU5xT9xN7ttZF6iTr4RdoHm4daTKg2rEr` (300+ TXs):

1. ✅ Initial expansion → Creates cluster "300 Spending TXs"
2. ⏸️ Click cluster → Should show first 20 TXs + "Load More (280 remaining)"
3. ⏸️ Click "Load More" → Should add next 20 + update to "260 remaining"
4. ⏸️ Repeat 14 times → All 300 TXs shown, "Load More" removed

## Implementation Notes

### Backend Support Needed

Current `/api/trace/address` doesn't support pagination (skip/limit).
Two options:

**Option A**: Add pagination params to existing endpoint
```python
@router.post("/address")
async def trace_from_address(
    address: str,
    hops_before: int = 1,
    hops_after: int = 1,
    max_transactions: int = 20,
    skip: int = 0,  # NEW
    limit: int = 20,  # NEW
```

**Option B**: Make multiple requests and filter
- Request max_transactions=100
- Filter by offset client-side
- Less efficient but works with existing code

Recommend: **Option A** (add skip/limit params)

### Current Behavior

Right now:
- Address with 300 TXs → Creates cluster ✅
- Cluster click → Nothing happens (no handler) ⏸️
- Need to wire up the expansion

## Files to Modify

1. ✅ `frontend/src/components/nodes/LoadMoreNode.tsx` - Created
2. ✅ `frontend/src/components/nodes/LoadMoreNode.css` - Created
3. ✅ `frontend/src/utils/expansionHelpers.ts` - Cluster creation added
4. ⏸️ `frontend/src/App.tsx` - Need cluster/loadMore handlers
5. ⏸️ `backend/app/api/trace.py` - Add skip/limit params (optional)

## Estimated Remaining Work

- 50 lines: Cluster expansion handler
- 30 lines: LoadMore handler  
- 20 lines: Backend pagination (optional)
- **Total: ~100 lines to complete feature**

Very close to done!

