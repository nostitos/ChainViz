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
 */
export function createStyledEdge(
  source: string,
  target: string,
  amount: number,
  edgeScaleMax: number
): Edge {
  const strokeWidth = calculateEdgeWidth(amount, edgeScaleMax);
  
  return {
    id: `e-${source}-${target}`,
    source,
    target,
    type: 'default',
    animated: false,
    data: { amount },
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
  
  console.log(`Expanding TX ${txid.substring(0, 20)} - ${direction}: ${addresses.length} addresses from cached data`);
  
  // Calculate positioning
  const spacing = 90;
  const xOffset = direction === 'inputs' ? -480 : 480;
  const startY = -(addresses.length - 1) * spacing / 2;
  
  // Create address nodes in vertical stack
  const nodes: Node[] = addresses.map((addr: any, idx: number) => ({
    id: `addr_${addr.address}`,
    type: 'address',
    position: {
      x: txNode.position.x + xOffset,
      y: txNode.position.y + startY + (idx * spacing),
    },
    data: {
      address: addr.address,
      label: addr.address,
      metadata: { address: addr.address, is_change: false },
    },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  }));
  
  // Create styled edges
  const edges: Edge[] = addresses.map((addr: any) => 
    createStyledEdge(
      direction === 'inputs' ? `addr_${addr.address}` : `tx_${txid}`,
      direction === 'inputs' ? `tx_${txid}` : `addr_${addr.address}`,
      addr.value || 0,
      edgeScaleMax
    )
  );
  
  return { nodes, edges };
}

/**
 * Expand an address node to show its receiving or spending transactions
 * 
 * For addresses from initial load: Uses existing edges (TXs already fetched)
 * For addresses from TX expansion: Returns empty (need backend fetch - not implemented yet)
 * 
 * Note: Expanding newly-added addresses requires fetching their TX history from backend.
 * This is intentionally left as a TODO to keep the refactor simple.
 */
export function expandAddressNode(
  addrNode: Node,
  direction: 'receiving' | 'spending',
  allNodes: Node[],
  allEdges: Edge[]
): ExpandResult {
  const addrId = addrNode.id;
  
  // Check if this address has any edges (was it in the initial load?)
  const hasAnyEdges = allEdges.some(e => e.source === addrId || e.target === addrId);
  
  if (!hasAnyEdges) {
    console.log(`Address ${addrId.substring(0, 25)} is new - would need to fetch TX history from backend`);
    console.log(`TODO: Implement address expansion for newly-added addresses`);
    return { nodes: [], edges: [] };
  }
  
  // Find connected TX IDs from existing edges
  const connectedTxIds = direction === 'receiving'
    ? allEdges.filter(e => e.source.startsWith('tx_') && e.target === addrId).map(e => e.source)
    : allEdges.filter(e => e.source === addrId && e.target.startsWith('tx_')).map(e => e.target);
  
  if (connectedTxIds.length === 0) {
    console.log(`Address ${addrId.substring(0, 25)} has no ${direction} TXs in current graph`);
    return { nodes: [], edges: [] };
  }
  
  console.log(`Expanding address ${addrId.substring(0, 25)} - ${direction}: ${connectedTxIds.length} TXs from existing edges`);
  
  // Get TX nodes from existing graph (they're already there, just not visible!)
  const txNodes = allNodes.filter(n => connectedTxIds.includes(n.id));
  
  // Some TXs might not be in the graph yet (if they were filtered out)
  if (txNodes.length === 0) {
    console.log(`Connected TXs not in graph - they were filtered out or not fetched`);
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

