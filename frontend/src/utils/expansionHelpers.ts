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
  
  console.log(`Expanding TX ${txid.substring(0, 20)} - ${direction}: ${addresses.length} UTXOs from cached data`);
  
  // Group by address to track multiple UTXOs from same address
  const addressGroups = new Map<string, Array<{address: string; value: number; index: number}>>();
  addresses.forEach((addr: any, idx: number) => {
    if (!addressGroups.has(addr.address)) {
      addressGroups.set(addr.address, []);
    }
    addressGroups.get(addr.address)!.push({ address: addr.address, value: addr.value || 0, index: idx });
  });
  
  console.log(`  ${addressGroups.size} unique addresses, ${addresses.length} total UTXOs`);
  
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
  
  console.log(`  Created ${nodes.length} unique address nodes, ${edges.length} edges (showing all UTXOs)`);
  
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
  
  // Check if this address has any edges (was it in the initial load?)
  const hasAnyEdges = allEdges.some(e => e.source === addrId || e.target === addrId);
  
  if (!hasAnyEdges) {
    console.log(`Address ${addrId.substring(0, 25)} is new - needs backend fetch`);
    // Return marker to indicate we need to fetch from backend
    return { needsFetch: true, address: address || '' };
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
  console.log(`📡 Fetching TX history for ${address.substring(0, 20)}...`);
  
  // Step 1: Fetch transaction list
  const txListResponse = await fetch(`${apiBaseUrl}/address/${address}/transactions`);
  if (!txListResponse.ok) {
    throw new Error(`Failed to fetch TX list: ${txListResponse.status}`);
  }
  const txListData = await txListResponse.json();
  const transactions = txListData.transactions || [];
  
  console.log(`  Got ${transactions.length} transactions`);
  
  if (transactions.length === 0) {
    return { nodes: [], edges: [] };
  }
  
  // Filter by direction
  const relevantTxs = direction === 'receiving'
    ? transactions.filter((tx: any) => tx.outputs_to_address && tx.outputs_to_address.length > 0)
    : transactions; // For 'spending', need to check inputs (will verify when fetching full data)
  
  console.log(`  ${relevantTxs.length} TXs match direction: ${direction}`);
  
  // Limit to prevent overwhelming the graph
  const MAX_TXS = 20;
  const txsToFetch = relevantTxs.slice(0, MAX_TXS);
  
  // Filter out TXs already in graph
  const txidsToFetch = txsToFetch
    .map((tx: any) => tx.txid)
    .filter((txid: string) => !existingNodeIds.has(`tx_${txid}`));
  
  console.log(`  Fetching ${txidsToFetch.length} new TXs (${txsToFetch.length - txidsToFetch.length} already in graph)`);
  
  if (txidsToFetch.length === 0) {
    return { nodes: [], edges: [] };
  }
  
  // Step 2: Fetch complete TX data with metadata (inputs/outputs resolved)
  const txNodesData = await Promise.all(
    txidsToFetch.map(async (txid: string) => {
      const response = await fetch(`${apiBaseUrl}/transaction/${txid}`);
      if (!response.ok) {
        console.warn(`Failed to fetch TX ${txid}: ${response.status}`);
        return null;
      }
      const data = await response.json();
      const tx = data.transaction;
      
      return {
        txid: tx.txid,
        timestamp: tx.timestamp,
        inputCount: tx.inputs?.length || 0,
        outputCount: tx.outputs?.length || 0,
        inputs: (tx.inputs || [])
          .map((inp: any) => ({ address: inp.address, value: inp.value }))
          .filter((i: any) => i.address),
        outputs: (tx.outputs || [])
          .map((out: any) => ({ address: out.address, value: out.value }))
          .filter((o: any) => o.address),
      };
    })
  );
  
  const validTxs = txNodesData.filter(Boolean);
  console.log(`  Fetched ${validTxs.length} TXs with complete metadata`);
  
  // Step 3: Create TX nodes
  const spacing = 90;
  const xOffset = direction === 'receiving' ? -480 : 480;
  const startY = -(validTxs.length - 1) * spacing / 2;
  
  const nodes: Node[] = validTxs.map((txData: any, idx: number) => ({
    id: `tx_${txData.txid}`,
    type: 'transaction',
    position: {
      x: addrNode.position.x + xOffset,
      y: addrNode.position.y + startY + (idx * spacing),
    },
    data: {
      txid: txData.txid,
      label: `${txData.txid.substring(0, 16)}...`,
      metadata: {
        txid: txData.txid,
        timestamp: txData.timestamp,
        inputCount: txData.inputCount,
        outputCount: txData.outputCount,
        inputs: txData.inputs,
        outputs: txData.outputs,
      },
    },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  }));
  
  // Step 4: Create edges (handle multi-UTXO!)
  const edges: Edge[] = [];
  
  validTxs.forEach((txData: any) => {
    const txid = txData.txid;
    
    if (direction === 'receiving') {
      // TX → Address edges (TX pays TO address)
      const outputsToAddr = txData.outputs.filter((out: any) => out.address === address);
      outputsToAddr.forEach((out: any, utxoIdx: number) => {
        edges.push(createStyledEdge(
          `tx_${txid}`,
          `addr_${address}`,
          out.value || 0,
          edgeScaleMax,
          utxoIdx
        ));
      });
    } else {
      // Address → TX edges (address spends TO tx)
      const inputsFromAddr = txData.inputs.filter((inp: any) => inp.address === address);
      inputsFromAddr.forEach((inp: any, utxoIdx: number) => {
        edges.push(createStyledEdge(
          `addr_${address}`,
          `tx_${txid}`,
          inp.value || 0,
          edgeScaleMax,
          utxoIdx
        ));
      });
    }
  });
  
  console.log(`  Created ${nodes.length} TX nodes, ${edges.length} edges`);
  
  return { nodes, edges };
}

