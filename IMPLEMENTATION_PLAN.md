# Implementation Plan - Pending Next Steps

## Priority 1: Complete Cluster + Progressive Loading (CRITICAL)

**Problem**: Address with 346 transactions shows "No new connections to show"

### Task 1.1: Wire Cluster Click Handler
**File**: `frontend/src/components/nodes/TransactionClusterNode.tsx`
**Lines**: ~10

Add onClick to cluster:
```typescript
const handleClick = () => {
  if (clusterData.onExpand) {
    clusterData.onExpand(id, 'expand-cluster');
  }
};

// In JSX:
<div className="cluster-node" onClick={handleClick}>
```

### Task 1.2: Create expandCluster Function  
**File**: `frontend/src/utils/expansionHelpers.ts`
**Lines**: ~60

```typescript
export async function expandCluster(
  clusterNode: Node,
  edgeScaleMax: number,
  apiBaseUrl: string,
  existingNodeIds: Set<string>
): Promise<ExpandResult> {
  const { address, direction, totalCount } = clusterNode.data;
  
  // Fetch first 20 TXs with directional hops
  const hopsBefore = direction === 'receiving' ? 1 : 0;
  const hopsAfter = direction === 'spending' ? 1 : 0;
  
  const response = await fetch(`${apiBaseUrl}/trace/address?...&max_transactions=20`);
  const data = await response.json();
  
  // Extract TX nodes, filter existing, position vertically
  const txNodes = createPositionedTxNodes(data, clusterNode.position);
  
  // Add LoadMore if more than 20 total
  if (totalCount > 20) {
    const loadMoreNode = {
      id: `load-more-${address}-${direction}`,
      type: 'loadMore',
      position: { x: clusterNode.position.x, y: bottomY + 100 },
      data: {
        address, direction,
        currentOffset: 20,
        remainingCount: totalCount - 20,
        totalCount,
      },
    };
    txNodes.push(loadMoreNode);
  }
  
  return { nodes: txNodes, edges };
}
```

### Task 1.3: Handle Cluster Expansion in App.tsx
**File**: `frontend/src/App.tsx` 
**Lines**: ~10

In handleExpandNode:
```typescript
if (node.type === 'transactionCluster') {
  result = await expandCluster(node, edgeScaleMax, API_BASE_URL, existingIds);
  
  // Remove cluster node after expansion
  setNodes(nds => nds.filter(n => n.id !== nodeId));
}
```

### Task 1.4: Implement handleLoadMore
**File**: `frontend/src/App.tsx`
**Lines**: ~50

```typescript
const handleLoadMore = useCallback(async (address: string, direction: string, offset: number) => {
  setIsLoading(true);
  
  try {
    const hopsBefore = direction === 'receiving' ? 1 : 0;
    const hopsAfter = direction === 'spending' ? 1 : 0;
    
    // Fetch next batch - need pagination support in backend!
    // For now: fetch more and filter client-side
    const response = await fetch(`...&max_transactions=${offset + 20}`);
    const data = await response.json();
    
    // Extract TXs from offset to offset+20
    const newTxs = data.nodes
      .filter(n => n.type === 'transaction')
      .slice(offset, offset + 20);
    
    // Position below existing TXs
    const positioned = newTxs.map((tx, idx) => ({
      ...tx,
      position: { x: loadMoreNode.position.x, y: loadMoreNode.position.y + (idx * 90) }
    }));
    
    // Update or remove LoadMore node
    const loadMoreId = `load-more-${address}-${direction}`;
    const remaining = totalCount - offset - 20;
    
    setNodes(nds => {
      const withoutLoadMore = nds.filter(n => n.id !== loadMoreId);
      
      if (remaining > 0) {
        // Update LoadMore
        const updatedLoadMore = {
          ...loadMoreNode,
          position: { x: ..., y: positioned[positioned.length-1].position.y + 100 },
          data: {
            ...loadMoreNode.data,
            currentOffset: offset + 20,
            remainingCount: remaining,
          },
        };
        return [...withoutLoadMore, ...positioned, updatedLoadMore];
      } else {
        // All loaded - remove LoadMore
        return [...withoutLoadMore, ...positioned];
      }
    });
  } finally {
    setIsLoading(false);
  }
}, []);
```

### Task 1.5: Pass onLoadMore to LoadMore Nodes
**File**: `frontend/src/utils/expansionHelpers.ts`
**Lines**: ~5

When creating LoadMore node:
```typescript
data: {
  ...
  onLoadMore: undefined, // Will be set in App.tsx when added to graph
}
```

Then in App.tsx when adding nodes:
```typescript
const nodesWithHandlers = newNodes.map(n => {
  if (n.type === 'loadMore') {
    return { ...n, data: { ...n.data, onLoadMore: handleLoadMore } };
  }
  return { ...n, data: { ...n.data, onExpand: handleExpandNode } };
});
```

**Estimated Total**: ~135 lines across 3 files

---

## Priority 2: Backend Pagination Support (OPTIONAL)

**Problem**: LoadMore has to fetch ALL TXs and filter client-side (inefficient)

### Task 2.1: Add Skip/Limit Params
**File**: `backend/app/api/trace.py`
**Lines**: ~20

```python
@router.post("/address")
async def trace_from_address(
    address: str,
    hops_before: int = 1,
    hops_after: int = 1,
    max_transactions: int = 100,
    skip: int = 0,  # NEW
    limit: int = 20,  # NEW
):
    # Get full TX list
    txids = await blockchain_service.fetch_address_history(address)
    
    # Paginate
    txids_to_fetch = txids[skip:skip+limit]
    
    # Fetch and return
```

**Benefit**: Efficient, only fetch what's needed
**Cost**: Backend change, more params to track

---

## Priority 3: Console Log Cleanup (POLISH)

**Status**: Partially done, some noise remains

### Task 3.1: Remove Remaining Noise
- "Using ADDRESS-CENTRIC layout"
- "Receiving TXs (LEFT): 15"
- Position calculations
- Duplicate detection logs

Keep only:
- Errors
- User-facing status
- Major operations (Loading, Expanding complete)

**Estimated**: ~20 lines to remove

---

## Priority 4: Fix Address Expansion Filtering (BUG)

**Problem**: Expanding address `1EU5xT9...` returns all existing TXs
- They're filtered as "already in graph"
- Nothing new to show

**Possible Causes**:
1. Address was in initial load → All its TXs already fetched
2. `max_transactions=100` isn't enough (has 346 TXs)
3. Filtering logic too aggressive

**Investigation Needed**:
- Check if address is in initial graph
- Check backend response (how many TXs returned)
- Check filtering (are they really already in graph?)

**Solution**: The cluster implementation solves this by design!

---

## Priority 5: Multi-Hop Slider (FUTURE)

**Status**: Disabled (shows warning for hops >1)

**Implementation**:
- Remove warning
- Implement BFS expansion
- Hop 1 → Hop 2 → Hop 3 progressively
- Each hop expands frontier nodes
- Use arrow buttons mechanism

**Estimated**: ~200 lines

---

## Priority 6: Delete Old/Unused Code (CLEANUP)

### Backend
- `backend/app/analysis/orchestrator.py` - Old recursive tracer (not used)
- `backend/tests/` - No tests being run

### Frontend  
- `AppDeckGL.tsx` - DeckGL version (not used)
- `utils/deckGLBuilder.ts` - DeckGL utilities (not used)
- `utils/graphBuilder.ts` - Old non-bipartite builder
- `components/DeckGLGraph.tsx` - Not used
- Dead code in App.tsx (lines 499-750: disabled auto-expansion)

**Estimated**: ~2000 lines to delete

---

## Priority 7: Performance Optimizations (FUTURE)

### Ideas
1. Virtualize large TX lists in clusters (React Window)
2. Web Workers for graph calculations
3. IndexedDB for client-side caching
4. Lazy load node components
5. Debounce expensive operations

---

## Recommended Implementation Order

**This Session:**
1. ✅ Context compression (done)
2. ⏳ Cluster + progressive loading (Tasks 1.1-1.5) ← DO THIS NOW
3. ⏳ Test with 346 TX address
4. ⏳ Polish console logs

**Next Session:**
5. Backend pagination (optional optimization)
6. Delete old code
7. Multi-hop slider

**Future:**
8. Performance optimizations
9. Additional features

---

## Current Focus: Tasks 1.1-1.5 (Cluster Loading)

**Files to modify:**
1. `frontend/src/components/nodes/TransactionClusterNode.tsx` - Add onClick
2. `frontend/src/utils/expansionHelpers.ts` - Add expandCluster
3. `frontend/src/App.tsx` - Wire handlers

**Testing:**
- Load address with 300+ TXs
- Expand → See cluster
- Click cluster → See first 20 + LoadMore
- Click LoadMore → See next 20
- Verify all 300+ eventually visible

**Ready to implement!**

