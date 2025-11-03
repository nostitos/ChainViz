import { Node, Edge, Position } from '@xyflow/react';

/**
 * Expansion utilities for adding nodes/edges to the graph
 * 
 * Data-first approach: All data is already fetched and cached in node metadata.
 * Expansion just creates UI nodes from this existing data - NO network calls!
 */

export interface ExpandResult {
  nodes: Node[];
  edges: Edge[];
}

/**
 * Calculate edge width using square root scaling
 */
function calculateEdgeWidth(amount: number, edgeScaleMax: number): number {
  const minAmountSats = 100000; // 0.001 BTC
  const scaleMaxSats = edgeScaleMax * 100000000;
  const sqrtBase = Math.sqrt(scaleMaxSats / minAmountSats);
  
  if (amount <= minAmountSats) return 2;
  
  const sqrtValue = Math.sqrt(amount / minAmountSats) / sqrtBase;
  return 2 + (sqrtValue * 68); // 2px base + up to 68px at edgeScaleMax
}

/**
 * Create a properly styled edge with all visual properties
 * Supports multiple edges between same nodes via utxoIndex
 */
export function createStyledEdge(
  source: string,
  target: string,
  amount: number,
  edgeScaleMax: number,
  utxoIndex?: number
): Edge {
  const strokeWidth = calculateEdgeWidth(amount, edgeScaleMax);
  
  // Create unique ID for multiple edges between same nodes
  const baseId = `e-${source}-${target}`;
  const id = utxoIndex !== undefined ? `${baseId}-utxo${utxoIndex}` : baseId;
  
  return {
    id,
    source,
    target,
    type: 'default',
    animated: false,
    data: { 
      amount,
      utxoIndex, // Store for potential custom rendering
    },
    style: {
      stroke: '#4caf50',
      strokeWidth,
    },
    label: amount > 0 ? `${(amount / 100000000).toFixed(8)} BTC` : undefined,
    labelStyle: {
      fill: '#fff',
      fontSize: 12,
      fontWeight: 700,
    },
    labelBgStyle: {
      fill: '#1a1a1a',
      fillOpacity: 0.9,
    },
  };
}

/**
 * Expand a transaction node to show its input or output addresses
 * 
 * Uses data from tx.metadata.inputs/outputs (already fetched!)
 * NO network calls needed!
 */
export function expandTransactionNode(
  txNode: Node,
  direction: 'inputs' | 'outputs',
  edgeScaleMax: number
): ExpandResult {
  const txid = txNode.data.metadata?.txid;
  if (!txid) {
    console.warn('TX node missing txid in metadata');
    return { nodes: [], edges: [] };
  }
  
  // Get addresses from metadata (already fetched during initial load!)
  const addresses = direction === 'inputs' 
    ? (txNode.data.metadata?.inputs || [])
    : (txNode.data.metadata?.outputs || []);
  
  if (addresses.length === 0) {
    console.log(`TX ${txid.substring(0, 20)} has no ${direction} to show`);
    return { nodes: [], edges: [] };
  }
  
  // Group by address to track multiple UTXOs from same address
  const addressGroups = new Map<string, Array<{address: string; value: number; index: number}>>();
  addresses.forEach((addr: any, idx: number) => {
    if (!addressGroups.has(addr.address)) {
      addressGroups.set(addr.address, []);
    }
    addressGroups.get(addr.address)!.push({ address: addr.address, value: addr.value || 0, index: idx });
  });
  
  // Calculate positioning
  const spacing = 90;
  const xOffset = direction === 'inputs' ? -480 : 480;
  
  // Create ONE node per unique address
  const uniqueAddresses = Array.from(addressGroups.keys());
  const startY = -(uniqueAddresses.length - 1) * spacing / 2;
  
  const nodes: Node[] = uniqueAddresses.map((address: string, idx: number) => ({
    id: `addr_${address}`,
    type: 'address',
    position: {
      x: txNode.position.x + xOffset,
      y: txNode.position.y + startY + (idx * spacing),
    },
    data: {
      address: address,
      label: address,
      metadata: { address: address, is_change: false },
    },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  }));
  
  // Create edges - ONE per UTXO (multiple edges to same address if multiple UTXOs!)
  const edges: Edge[] = [];
  addressGroups.forEach((utxos, address) => {
    utxos.forEach((utxo, utxoIdx) => {
      // Create unique edge ID using UTXO index to allow multiple edges
      const edgeId = direction === 'inputs'
        ? `e-addr_${address}-tx_${txid}-utxo${utxo.index}`
        : `e-tx_${txid}-addr_${address}-utxo${utxo.index}`;
      
      const source = direction === 'inputs' ? `addr_${address}` : `tx_${txid}`;
      const target = direction === 'inputs' ? `tx_${txid}` : `addr_${address}`;
      
      // Calculate edge offset/curvature for multiple edges to same address
      // If 3 edges: offsets will be -1, 0, +1 (spread them out)
      const totalEdges = utxos.length;
      const offsetIndex = utxoIdx - (totalEdges - 1) / 2;
      const pathOffset = totalEdges > 1 ? offsetIndex * 20 : 0; // 20px spacing between parallel edges
      
      // Create edge with utxoIndex for unique ID
      const edge = createStyledEdge(source, target, utxo.value, edgeScaleMax, utxo.index);
      
      // Add offset for multiple parallel edges
      if (totalEdges > 1) {
        edge.data = {
          ...edge.data,
          offset: pathOffset, // Custom data for BezierEdge component
        };
      }
      
      edges.push(edge);
    });
  });
  
  // MEMORY OPTIMIZATION: Clear heavy metadata after expansion to prevent memory leaks
  // The inputs/outputs arrays can be HUGE (100+ items with full addresses)
  // Once we've created the nodes/edges, we don't need this data anymore
  if (txNode.data?.metadata) {
    if (direction === 'inputs' && txNode.data.metadata.inputs) {
      delete txNode.data.metadata.inputs;
      console.log('🧹 Cleared inputs metadata to free memory');
    } else if (direction === 'outputs' && txNode.data.metadata.outputs) {
      delete txNode.data.metadata.outputs;
      console.log('🧹 Cleared outputs metadata to free memory');
    }
  }
  
  return { nodes, edges };
}

/**
 * Expand an address node to show its receiving or spending transactions
 * 
 * ALWAYS fetches from backend because an address can have many more transactions
 * than what's currently visible in the graph. The graph might only show 1-2 TXs
 * involving this address, but the address could have hundreds of transactions.
 */
export function expandAddressNode(
  addrNode: Node,
  direction: 'receiving' | 'spending',
  allNodes: Node[],
  allEdges: Edge[]
): ExpandResult | { needsFetch: true; address: string } {
  const address = addrNode.data.address || addrNode.data.metadata?.address;
  
  // ALWAYS fetch from backend for addresses
  // Unlike transactions (which have ALL inputs/outputs in metadata),
  // addresses only show transactions that are currently in the graph.
  // There could be many more transactions involving this address!
  return { needsFetch: true, address: address || '' };
}

/**
 * Expand a newly-added address node by fetching its TX history from backend
 * 
 * This is used when an address was added from TX expansion and has no edges yet.
 * Fetches transaction list, then full TX data with metadata, creates nodes/edges.
 */
export async function expandAddressNodeWithFetch(
  address: string,
  addrNode: Node,
  direction: 'receiving' | 'spending',
  edgeScaleMax: number,
  apiBaseUrl: string,
  existingNodeIds: Set<string>,
  maxTransactions: number = 1000
): Promise<ExpandResult> {
  console.log(`📡 Fetching ${direction} TXs for ${address.substring(0, 20)}...`);
  
  // Use /api/trace/address with DIRECTIONAL hops (only fetch what we need!)
  const hopsBefore = direction === 'receiving' ? 1 : 0;
  const hopsAfter = direction === 'spending' ? 1 : 0;
  
  const response = await fetch(
    `${apiBaseUrl}/trace/address?address=${encodeURIComponent(address)}&hops_before=${hopsBefore}&hops_after=${hopsAfter}&max_transactions=${maxTransactions}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }
  );
  
  if (!response.ok) {
    throw new Error(`Failed to fetch address trace: ${response.status}`);
  }
  
  const data = await response.json();
  console.log(`📊 Backend returned: ${data.nodes.length} nodes, ${data.edges.length} edges, total_nodes=${data.total_nodes}`);
  
  const totalTxCount = data.total_nodes - 1; // Subtract the address node itself
  
  // Handle case where address has no transactions in this direction
  if (totalTxCount === 0) {
    const directionText = direction === 'receiving' ? 'receiving' : 'spending';
    console.log(`ℹ️ Address has no ${directionText} transactions`);
    alert(`This address has no ${directionText} transactions.\n\n${direction === 'spending' ? 'The address has only received funds and never spent them.' : 'The address has only spent funds and never received them.'}`);
    return { nodes: [], edges: [] };
  }
  
  // HYBRID CLUSTERING THRESHOLDS:
  // ≤10 TXs: Show all immediately (fast, manageable)
  // 10-50 TXs: Show all with warning (acceptable performance)
  // 50+ TXs: Create cluster with progressive loading
  const SHOW_ALL_THRESHOLD = 10;
  const CLUSTER_THRESHOLD = 50;
  const BATCH_SIZE = 20;
  
  if (totalTxCount > SHOW_ALL_THRESHOLD && totalTxCount <= CLUSTER_THRESHOLD) {
    console.log(`⚠️ ${totalTxCount} TXs found - showing all with warning (acceptable performance)`);
    // Continue to show all TXs (fall through to normal logic below)
  } else if (totalTxCount > CLUSTER_THRESHOLD) {
    console.log(`⚠️ ${totalTxCount} TXs found - creating cluster with progressive loading`);
    
    // Extract first batch of TX nodes
    const allTxNodes = data.nodes.filter((n: any) => n.type === 'transaction');
    const firstBatch = allTxNodes.slice(0, BATCH_SIZE);
    const remainingCount = totalTxCount - BATCH_SIZE;
    
    const xOffset = direction === 'receiving' ? -480 : 480;
    const clusterId = `tx-cluster-${address}-${direction}`;
    
    // Create TX nodes for first batch
    const spacing = 90;
    const startY = -(firstBatch.length - 1) * spacing / 2;
    
    const txNodes: Node[] = firstBatch.map((txNode: any, idx: number) => ({
      id: txNode.id,
      type: 'transaction',
      position: {
        x: addrNode.position.x + xOffset,
        y: addrNode.position.y + startY + (idx * spacing),
      },
      data: {
        txid: txNode.metadata?.txid,
        label: txNode.label,
        metadata: txNode.metadata,
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    }));
    
    // Create edges for first batch
    const addrId = `addr_${address}`;
    const firstBatchIds = new Set(firstBatch.map((tx: any) => tx.id));
    
    const txEdges: Edge[] = data.edges
      .filter((edge: any) => {
        const connectsToAddr = edge.source === addrId || edge.target === addrId;
        const connectsToFirstBatch = firstBatchIds.has(edge.source) || firstBatchIds.has(edge.target);
        return connectsToAddr && connectsToFirstBatch;
      })
      .map((edge: any) => {
        const amount = edge.amount || 0;
        return createStyledEdge(edge.source, edge.target, amount, edgeScaleMax);
      });
    
    // Create LoadMore node if there are remaining TXs
    const loadMoreNode: Node | null = remainingCount > 0 ? {
      id: `loadmore-${clusterId}`,
      type: 'loadMore',
      position: {
        x: addrNode.position.x + xOffset,
        y: addrNode.position.y + startY + (firstBatch.length * spacing),
      },
      data: {
        remainingCount,
        address,
        direction,
        currentOffset: BATCH_SIZE,
        totalCount: totalTxCount,
        onLoadMore: undefined, // Will be set by App.tsx
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    } : null;
    
    return {
      nodes: loadMoreNode ? [...txNodes, loadMoreNode] : txNodes,
      edges: txEdges,
    };
  }
  
  // Otherwise show TXs directly (<= 10)
  // Extract TX nodes (filter out the address node itself)
  const allTxNodes = data.nodes.filter((n: any) => n.type === 'transaction');
  const newTxNodes = allTxNodes.filter((n: any) => !existingNodeIds.has(n.id));
  
  console.log(`📊 TX filtering: ${allTxNodes.length} total TXs, ${newTxNodes.length} new (${allTxNodes.length - newTxNodes.length} already in graph)`);
  
  const txNodes = newTxNodes.map((txNode: any) => {
      // Backend already provides complete metadata!
      return {
        id: txNode.id,
        type: 'transaction',
        position: { x: 0, y: 0 }, // Will be positioned
        data: {
          txid: txNode.metadata?.txid,
          label: txNode.label,
          metadata: txNode.metadata, // Already has inputs, outputs, counts!
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      };
    });
  
  if (txNodes.length === 0) {
    return { nodes: [], edges: [] };
  }
  
  // Position TX nodes
  const spacing = 90;
  const xOffset = direction === 'receiving' ? -480 : 480;
  const startY = -(txNodes.length - 1) * spacing / 2;
  
  const nodes: Node[] = txNodes.map((tx: any, idx: number) => ({
    ...tx,
    position: {
      x: addrNode.position.x + xOffset,
      y: addrNode.position.y + startY + (idx * spacing),
    },
  }));
  
  // Extract edges from backend response (already styled!)
  // Filter to only edges connecting to our address and new TXs
  const addrId = `addr_${address}`;
  const newTxIds = new Set(txNodes.map((tx: any) => tx.id));
  
  const edges: Edge[] = data.edges
    .filter((edge: any) => {
      // Only include edges that connect our address to the new TXs
      const connectsToAddr = edge.source === addrId || edge.target === addrId;
      const connectsToNewTx = newTxIds.has(edge.source) || newTxIds.has(edge.target);
      return connectsToAddr && connectsToNewTx;
    })
    .map((edge: any) => {
      // Backend edges need to be converted to React Flow Edge format with styling
      const amount = edge.amount || 0;
      return createStyledEdge(edge.source, edge.target, amount, edgeScaleMax);
    });
  
  
  return { nodes, edges };
}

/**
 * Load more transactions for a progressive loading scenario
 * 
 * Fetches the next batch of transactions from the backend and creates nodes/edges
 */
export async function loadMoreTransactions(
  address: string,
  direction: 'receiving' | 'spending',
  currentOffset: number,
  addrNode: Node,
  edgeScaleMax: number,
  apiBaseUrl: string,
  existingNodeIds: Set<string>,
  maxTransactions: number = 1000
): Promise<ExpandResult & { remainingCount: number }> {
  console.log(`📡 Loading more TXs for ${address.substring(0, 20)}... offset=${currentOffset}`);
  
  const BATCH_SIZE = 20;
  
  // Fetch from backend with offset
  const hopsBefore = direction === 'receiving' ? 1 : 0;
  const hopsAfter = direction === 'spending' ? 1 : 0;
  
  const response = await fetch(
    `${apiBaseUrl}/trace/address?address=${encodeURIComponent(address)}&hops_before=${hopsBefore}&hops_after=${hopsAfter}&max_transactions=${maxTransactions}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }
  );
  
  if (!response.ok) {
    throw new Error(`Failed to fetch address trace: ${response.status}`);
  }
  
  const data = await response.json();
  const totalTxCount = data.total_nodes - 1;
  
  // Extract TX nodes and slice the next batch
  const allTxNodes = data.nodes.filter((n: any) => n.type === 'transaction');
  const nextBatch = allTxNodes.slice(currentOffset, currentOffset + BATCH_SIZE);
  const remainingCount = Math.max(0, totalTxCount - currentOffset - nextBatch.length);
  
  console.log(`📊 Loading batch: offset=${currentOffset}, batch=${nextBatch.length}, remaining=${remainingCount}`);
  
  if (nextBatch.length === 0) {
    return { nodes: [], edges: [], remainingCount: 0 };
  }
  
  // Position new TX nodes (continue from where we left off)
  const spacing = 90;
  const xOffset = direction === 'receiving' ? -480 : 480;
  
  // Calculate starting Y based on current offset
  // We need to position these BELOW the existing TXs
  const startY = -(currentOffset - 1) * spacing / 2 + (currentOffset * spacing);
  
  const txNodes: Node[] = nextBatch.map((txNode: any, idx: number) => ({
    id: txNode.id,
    type: 'transaction',
    position: {
      x: addrNode.position.x + xOffset,
      y: startY + (idx * spacing),
    },
    data: {
      txid: txNode.metadata?.txid,
      label: txNode.label,
      metadata: txNode.metadata,
    },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  }));
  
  // Create edges for this batch
  const addrId = `addr_${address}`;
  const batchIds = new Set(nextBatch.map((tx: any) => tx.id));
  
  const txEdges: Edge[] = data.edges
    .filter((edge: any) => {
      const connectsToAddr = edge.source === addrId || edge.target === addrId;
      const connectsToBatch = batchIds.has(edge.source) || batchIds.has(edge.target);
      return connectsToAddr && connectsToBatch;
    })
    .map((edge: any) => {
      const amount = edge.amount || 0;
      return createStyledEdge(edge.source, edge.target, amount, edgeScaleMax);
    });
  
  return { nodes: txNodes, edges: txEdges, remainingCount };
}

