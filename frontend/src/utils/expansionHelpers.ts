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
  
  
  return { nodes, edges };
}

/**
 * Expand an address node to show its receiving or spending transactions
 * 
 * For addresses from initial load: Uses existing edges (TXs already fetched)
 * For addresses from TX expansion: Returns special marker to trigger backend fetch
 */
export function expandAddressNode(
  addrNode: Node,
  direction: 'receiving' | 'spending',
  allNodes: Node[],
  allEdges: Edge[]
): ExpandResult | { needsFetch: true; address: string } {
  const addrId = addrNode.id;
  const address = addrNode.data.address || addrNode.data.metadata?.address;
  
  // Find connected TX IDs from existing edges in the requested direction
  const connectedTxIds = direction === 'receiving'
    ? allEdges.filter(e => e.source.startsWith('tx_') && e.target === addrId).map(e => e.source)
    : allEdges.filter(e => e.source === addrId && e.target.startsWith('tx_')).map(e => e.target);
  
  // If no edges in this direction, need to fetch from backend
  if (connectedTxIds.length === 0) {
    return { needsFetch: true, address: address || '' };
  }
  
  // Get TX nodes from existing graph (they're already there, just not visible!)
  const txNodes = allNodes.filter(n => connectedTxIds.includes(n.id));
  
  // Some TXs might not be in the graph yet (if they were filtered out)
  if (txNodes.length === 0) {
    return { nodes: [], edges: [] };
  }
  
  // Calculate positioning
  const spacing = 90;
  const xOffset = direction === 'receiving' ? -480 : 480;
  const startY = -(txNodes.length - 1) * spacing / 2;
  
  // Position TXs in vertical stack (create new positioned copies)
  const nodes: Node[] = txNodes.map((tx, idx) => ({
    ...tx,
    position: {
      x: addrNode.position.x + xOffset,
      y: addrNode.position.y + startY + (idx * spacing),
    },
  }));
  
  // Get relevant edges (they already exist!)
  const edges: Edge[] = allEdges.filter(e => 
    (direction === 'receiving' && connectedTxIds.includes(e.source) && e.target === addrId) ||
    (direction === 'spending' && e.source === addrId && connectedTxIds.includes(e.target))
  );
  
  return { nodes, edges };
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
  existingNodeIds: Set<string>
): Promise<ExpandResult> {
  console.log(`📡 Fetching ${direction} TXs for ${address.substring(0, 20)}...`);
  
  // Use /api/trace/address with DIRECTIONAL hops (only fetch what we need!)
  const hopsBefore = direction === 'receiving' ? 1 : 0;
  const hopsAfter = direction === 'spending' ? 1 : 0;
  
  const response = await fetch(
    `${apiBaseUrl}/trace/address?address=${encodeURIComponent(address)}&hops_before=${hopsBefore}&hops_after=${hopsAfter}&max_transactions=20`,
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
  
  // If many TXs (>10), create cluster node instead
  const CLUSTER_THRESHOLD = 10;
  if (totalTxCount > CLUSTER_THRESHOLD) {
    console.log(`⚠️ ${totalTxCount} TXs found - creating cluster node`);
    
    const xOffset = direction === 'receiving' ? -480 : 480;
    const clusterId = `tx-cluster-${address}-${direction}`;
    
    return {
      nodes: [{
        id: clusterId,
        type: 'transactionCluster',
        position: {
          x: addrNode.position.x + xOffset,
          y: addrNode.position.y,
        },
        data: {
          address,
          direction,
          totalCount: totalTxCount,
          currentOffset: 0,
          transactions: [], // Will be populated when cluster is expanded
          label: `${totalTxCount} ${direction === 'receiving' ? 'Receiving' : 'Spending'} TXs`,
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      }],
      edges: [{
        id: `e-cluster-${address}-${direction}`,
        source: direction === 'receiving' ? clusterId : `addr_${address}`,
        target: direction === 'receiving' ? `addr_${address}` : clusterId,
        type: 'default',
        animated: false,
        style: {
          stroke: '#666',
          strokeWidth: 3,
          strokeDasharray: '5,5',
        },
        label: `${totalTxCount} TXs`,
      }],
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

