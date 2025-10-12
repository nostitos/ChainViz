import { Node, Edge, Position } from '@xyflow/react';

/**
 * Bipartite layout: Alternating Address-TX-Address-TX columns
 * Ensures all edges flow left-to-right (no backwards edges)
 */

interface TraceData {
  nodes: Array<{
    id: string;
    label: string;
    type: 'transaction' | 'address';
    value: number | null;
    metadata?: {
      txid?: string;
      address?: string;
      is_change?: boolean;
      cluster_id?: string;
      timestamp?: number;
      depth?: number;
    };
  }>;
  edges: Array<{
    source: string;
    target: string;
    txid?: string;
    amount?: number;
    confidence?: number;
    metadata?: {
      vout?: number;
      [key: string]: any;
    };
  }>;
}

export function buildGraphFromTraceDataBipartite(data: TraceData, edgeScaleMax: number = 10): { nodes: Node[]; edges: Edge[] } {
  let nodes: Node[] = [];
  const edges: Edge[] = [];

  // Separate by type
  const txData = data.nodes.filter(n => n.type === 'transaction');
  const addrData = data.nodes.filter(n => n.type === 'address');
  
  // Build adjacency maps
  const txInputs = new Map<string, string[]>(); // TX → input addresses
  const txOutputs = new Map<string, string[]>(); // TX → output addresses
  
  data.edges.forEach(e => {
    if (e.source.startsWith('addr_') && e.target.startsWith('tx_')) {
      if (!txInputs.has(e.target)) txInputs.set(e.target, []);
      if (!txInputs.get(e.target)!.includes(e.source)) {
        txInputs.get(e.target)!.push(e.source);
      }
    }
    if (e.source.startsWith('tx_') && e.target.startsWith('addr_')) {
      if (!txOutputs.has(e.source)) txOutputs.set(e.source, []);
      if (!txOutputs.get(e.source)!.includes(e.target)) {
        txOutputs.get(e.source)!.push(e.target);
      }
    }
  });

  // Sort TXs chronologically
  const sortedTxs = txData.sort((a, b) => {
    const tA = a.metadata?.timestamp || 0;
    const tB = b.metadata?.timestamp || 0;
    return tA - tB;
  });

  // Layout: Simple left-to-right with TXs evenly spaced
  const TX_SPACING = 800;
  const ADDR_OFFSET = 480;
  const ROW_SPACING = 120;
  
  // Cluster node sizing constants (must match AddressClusterNode.tsx AND CSS)
  const CLUSTER_HEADER_HEIGHT = 45; // padding + font + margin + spacing
  const CLUSTER_ROW_HEIGHT = 14; // EXPLICIT in CSS: .cluster-item { height: 14px }
  
  // Position TXs first
  sortedTxs.forEach((txNode, idx) => {
    const inputCount = txInputs.get(txNode.id)?.length || 0;
    const outputCount = txOutputs.get(txNode.id)?.length || 0;
    
    nodes.push({
      id: txNode.id,
      type: 'transaction',
      position: {
        x: idx * TX_SPACING,
        y: 0,
      },
      data: {
        ...txNode,
        label: txNode.label,
        metadata: {
          ...txNode.metadata,
          inputCount,
          outputCount,
        },
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });
  });

  // Position ALL addresses relative to their connected TXs
  const positioned = new Set<string>();
  
  sortedTxs.forEach(txNode => {
    const txNodeInGraph = nodes.find(n => n.id === txNode.id)!;
    
    // Input addresses (LEFT of TX)
    const inputAddrIds = txInputs.get(txNode.id) || [];
    const inputAddrs = inputAddrIds.map(id => addrData.find(a => a.id === id)!).filter(Boolean);
    
    // If 10+ inputs, create cluster node
    if (inputAddrs.length >= 10) {
      const clusterId = `cluster-inputs-${txNode.id}`;
      
      // Get amounts from edges
      const addressAmounts = inputAddrs.map(a => {
        const edge = data.edges.find(e => e.source === a.id && e.target === txNode.id);
        return {
          address: a.metadata?.address || a.label,
          amount: edge?.amount || 0,
          isChange: a.metadata?.is_change,
          vout: undefined, // Inputs don't have vout
        };
      });
      
      // Calculate vertical centering: header + (rows * row_height) / 2
      const totalHeight = CLUSTER_HEADER_HEIGHT + (addressAmounts.length * CLUSTER_ROW_HEIGHT);
      
      nodes.push({
        id: clusterId,
        type: 'addressCluster',
        position: {
          x: txNodeInGraph.position.x - ADDR_OFFSET,
          y: -totalHeight / 2, // Center the entire cluster box vertically
        },
        data: {
          addresses: addressAmounts,
          direction: 'inputs',
          label: `${inputAddrs.length} Inputs`,
          onExpand: undefined, // Will be set later
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      });
      inputAddrs.forEach(a => positioned.add(a.id));
    } else {
      // Show individual address nodes
      inputAddrs.forEach((addrNode, idx) => {
        if (positioned.has(addrNode.id)) return;
        
        nodes.push({
          id: addrNode.id,
          type: 'address',
          position: {
            x: txNodeInGraph.position.x - ADDR_OFFSET,
            y: (idx - inputAddrs.length / 2) * ROW_SPACING,
          },
          data: {
            ...addrNode,
            label: addrNode.label,
          },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
        });
        positioned.add(addrNode.id);
      });
    }
    
    // Output addresses (RIGHT of TX)
    const outputAddrIds = txOutputs.get(txNode.id) || [];
    const outputAddrs = outputAddrIds.map(id => addrData.find(a => a.id === id)!).filter(Boolean);
    
    const changeAddrs = outputAddrs.filter(a => a.metadata?.is_change === true);
    const regularAddrs = outputAddrs.filter(a => a.metadata?.is_change !== true);
    
    // If 10+ outputs, create cluster node
    if (regularAddrs.length >= 10) {
      const clusterId = `cluster-outputs-${txNode.id}`;
      
      // Get amounts and vout from edges
      const addressAmounts = regularAddrs.map(a => {
        const edge = data.edges.find(e => e.source === txNode.id && e.target === a.id);
        // Extract vout from edge metadata if available
        const vout = edge?.metadata?.vout;
        return {
          address: a.metadata?.address || a.label,
          amount: edge?.amount || 0,
          isChange: a.metadata?.is_change,
          vout: vout, // Include vout for outputs
        };
      });
      
      // Calculate vertical centering: header + (rows * row_height) / 2
      const totalHeight = CLUSTER_HEADER_HEIGHT + (addressAmounts.length * CLUSTER_ROW_HEIGHT);
      
      nodes.push({
        id: clusterId,
        type: 'addressCluster',
        position: {
          x: txNodeInGraph.position.x + ADDR_OFFSET,
          y: -totalHeight / 2, // Center the entire cluster box vertically
        },
        data: {
          addresses: addressAmounts,
          direction: 'outputs',
          label: `${regularAddrs.length} Outputs`,
          onExpand: undefined, // Will be set later
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      });
      regularAddrs.forEach(a => positioned.add(a.id));
    } else {
      // Change addresses FIRST (above regular outputs) - RIGHT of TX
      changeAddrs.forEach((addrNode, idx) => {
        if (positioned.has(addrNode.id)) return;
        
        // Calculate top regular output position
        const topRegularY = (-regularAddrs.length / 2) * ROW_SPACING;
        
        nodes.push({
          id: addrNode.id,
          type: 'address',
          position: {
            x: txNodeInGraph.position.x + ADDR_OFFSET,
            y: topRegularY - 50 - (idx * ROW_SPACING), // 50px above the topmost regular output
          },
          data: {
            ...addrNode,
            label: addrNode.label,
          },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
        });
        positioned.add(addrNode.id);
      });
      
      // Show individual regular output nodes (starting at y=0)
      regularAddrs.forEach((addrNode, idx) => {
        if (positioned.has(addrNode.id)) return;
        
        nodes.push({
          id: addrNode.id,
          type: 'address',
          position: {
            x: txNodeInGraph.position.x + ADDR_OFFSET,
            y: (idx - regularAddrs.length / 2) * ROW_SPACING,
          },
          data: {
            ...addrNode,
            label: addrNode.label,
          },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
        });
        positioned.add(addrNode.id);
      });
    }
  });

  // Remove duplicate standalone address nodes that are now part of clusters
  const clusteredAddressIds = new Set<string>();
  nodes.forEach(n => {
    if (n.type === 'addressCluster' && n.data.addresses) {
      n.data.addresses.forEach((addr: any) => {
        const addrId = `addr_${addr.address}`;
        clusteredAddressIds.add(addrId);
      });
    }
  });

  // Filter out standalone nodes for clustered addresses
  nodes = nodes.filter(n => {
    if (n.type === 'address' && clusteredAddressIds.has(n.id)) {
      console.log(`🗑️ Removing duplicate standalone node: ${n.id} (exists in cluster)`);
      return false;  // Remove duplicate
    }
    return true;
  });

  console.log(`✅ After cleanup: ${nodes.length} nodes (removed ${clusteredAddressIds.size} duplicates)`);

  // Build edges (remap to cluster nodes if addresses are in clusters)
  const addrToCluster = new Map<string, { clusterId: string; index: number; direction: 'inputs' | 'outputs' }>();
  nodes.forEach(n => {
    if (n.type === 'addressCluster' && n.data.addresses) {
      const clusterDirection = n.data.direction as 'inputs' | 'outputs';
      n.data.addresses.forEach((addr: any, idx: number) => {
        const addrId = `addr_${addr.address}`;
        addrToCluster.set(addrId, { clusterId: n.id, index: idx, direction: clusterDirection });
      });
    }
  });
  
  // Find max amount for proportional edge widths
  const maxAmount = Math.max(...data.edges.map(e => e.amount || 0), 1);
  
  // Square root scaling: edgeScaleMax BTC = 70% of max width (70px out of 100px)
  // Formula: width = 2 + sqrt(amount/minAmount) / sqrt(scaleMax/minAmount) * 68
  // where minAmount = 0.001 BTC (100,000 sats)
  const minAmountSats = 100000; // 0.001 BTC
  const scaleMaxSats = edgeScaleMax * 100000000; // Convert BTC to satoshis
  const sqrtBase = Math.sqrt(scaleMaxSats / minAmountSats);
  
  data.edges.forEach((edgeData, index) => {
    const confidence = edgeData.confidence ?? 1.0;
    const amount = edgeData.amount || 0;
    
    // All edges are green - they represent actual on-chain transactions
    const strokeColor = '#4caf50';
    
    // Square root width calculation: 2px min (at 0.001 BTC), 70% max at edgeScaleMax, no hard cap above
    // 2px for amounts <= 0.001 BTC
    // Scales with square root up to ~70px at edgeScaleMax (70% of 100px max)
    // Can exceed 70px for amounts > edgeScaleMax (no hard cap)
    let strokeWidth = 2;
    if (amount > minAmountSats) {
      const sqrtValue = Math.sqrt(amount / minAmountSats) / sqrtBase;
      strokeWidth = 2 + (sqrtValue * 68); // 2px base + up to 68px (70% of 100px)
    }
    
    // Check if source/target are in clusters
    let source = edgeData.source;
    let sourceHandle: string | undefined;
    if (addrToCluster.has(edgeData.source)) {
      const cluster = addrToCluster.get(edgeData.source)!;
      source = cluster.clusterId;
      
      // Input clusters sending to TX: use right-side handle (addr-)
      if (cluster.direction === 'inputs' && edgeData.target.startsWith('tx_')) {
        sourceHandle = `addr-${cluster.index}`;
      }
      // If source is in output cluster (shouldn't happen normally)
      else if (cluster.direction === 'outputs') {
        sourceHandle = `addr-${cluster.index}`;
      }
    }
    
    let target = edgeData.target;
    let targetHandle: string | undefined;
    if (addrToCluster.has(edgeData.target)) {
      const cluster = addrToCluster.get(edgeData.target)!;
      target = cluster.clusterId;
      
      // Output clusters receiving from TX: use left-side handle (addr-)
      if (cluster.direction === 'outputs' && edgeData.source.startsWith('tx_')) {
        targetHandle = `addr-${cluster.index}`;
      }
      // Input clusters receiving from external address: use left-side handle (in-)
      else if (cluster.direction === 'inputs' && edgeData.source.startsWith('addr_')) {
        targetHandle = `in-${cluster.index}`;
      }
    }
    
    // Only show label if NOT connecting to a cluster node
    const isClusterEdge = source.startsWith('cluster-') || target.startsWith('cluster-');
    
    // Create unique edge ID based on source, target, and handles to prevent duplicates
    const edgeId = sourceHandle || targetHandle
      ? `e-${source}-${sourceHandle || 'default'}-${target}-${targetHandle || 'default'}`
      : `e-${source}-${target}`;
    
    const edge: Edge = {
      id: edgeId,
      source,
      target,
      sourceHandle,
      targetHandle,
      type: 'default',
      animated: false, // All edges are the same - no animation by default
      data: {
        amount: amount, // Store amount in data for recalculation
      },
      style: {
        stroke: strokeColor,
        strokeWidth,
      },
      label: (amount > 0 && !isClusterEdge) ? `${(amount / 100000000).toFixed(8)} BTC` : undefined,
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
    
    edges.push(edge);
  });

  return { nodes, edges };
}

/**
 * Reduce edge crossings using the Barycenter method with iterative refinement
 * Reorders address nodes vertically to minimize crossings
 * 
 * @param nodes - Current graph nodes
 * @param edges - Current graph edges
 * @param iterations - Number of optimization passes (default 3)
 * @returns Optimized nodes with reduced crossings
 */
export function optimizeNodePositions(nodes: Node[], edges: Edge[], iterations: number = 3): Node[] {
  console.log(`📐 Starting layout optimization with ${iterations} iterations...`);
  let optimized = [...nodes];
  
  // Run multiple passes for better results
  for (let iter = 0; iter < iterations; iter++) {
    console.log(`\n📐 === Iteration ${iter + 1}/${iterations} ===`);
    optimized = optimizeSinglePass(optimized, edges, iter);
  }
  
  return optimized;
}

/**
 * Single optimization pass using barycenter method
 */
function optimizeSinglePass(nodes: Node[], edges: Edge[], iteration: number): Node[] {
  const optimized = [...nodes];
  
  // Group nodes by X position (columns) - round to nearest 100 to handle slight variations
  const columns = new Map<number, Node[]>();
  nodes.forEach(node => {
    const x = Math.round(node.position.x / 100) * 100;
    if (!columns.has(x)) columns.set(x, []);
    columns.get(x)!.push(node);
  });
  
  console.log(`📐 Found ${columns.size} columns to optimize`);
  let totalMoved = 0;
  
  // Sort column keys for consistent ordering
  const sortedColumns = Array.from(columns.keys()).sort((a, b) => a - b);
  
  // Alternate sweep direction for better results
  const columnsToProcess = iteration % 2 === 0 
    ? sortedColumns  // Left-to-right
    : sortedColumns.reverse();  // Right-to-left
  
  console.log(`📐 Sweep direction: ${iteration % 2 === 0 ? 'Left→Right' : 'Right→Left'}`)
  
  // Process columns in sweep order
  columnsToProcess.forEach((x) => {
    const columnNodes = columns.get(x)!;
    
    // Optimize ALL node types (addresses AND transactions)
    const nodesToOptimize = columnNodes.filter(n => 
      n.type === 'address' || n.type === 'addressCluster' || n.type === 'transaction'
    );
    
    if (nodesToOptimize.length < 2) {
      console.log(`📐 Column at x=${x}: ${nodesToOptimize.length} nodes (skipping)`);
      return; // No point optimizing 0-1 nodes
    }
    
    const nodeTypes = nodesToOptimize.map(n => n.type).join(', ');
    console.log(`📐 Column at x=${x}: Optimizing ${nodesToOptimize.length} nodes (${nodeTypes})`);
    
    // Calculate barycenter for each node
    const barycenters = nodesToOptimize.map(node => {
      // Find all edges connected to this node
      const connectedEdges = edges.filter(e => 
        e.source === node.id || e.target === node.id
      );
      
      if (connectedEdges.length === 0) {
        // No connections - keep current position
        return { node: node, bc: node.position.y, connections: 0 };
      }
      
      // Find connected nodes
      const connectedNodes = connectedEdges.map(e => {
        const otherId = e.source === node.id ? e.target : e.source;
        return nodes.find(n => n.id === otherId);
      }).filter(Boolean) as Node[];
      
      // Calculate average Y position (barycenter)
      const avgY = connectedNodes.reduce((sum, n) => sum + n.position.y, 0) / connectedNodes.length;
      
      return { 
        node: node, 
        bc: avgY,
        connections: connectedNodes.length 
      };
    });
    
    // Sort by barycenter (nodes with similar barycenters will be close)
    barycenters.sort((a, b) => a.bc - b.bc);
    
    // Reassign Y positions with generous spacing to avoid squishing
    const ROW_SPACING = 200; // Increased from 120 to 200 for more breathing room
    barycenters.forEach((item, idx) => {
      const nodeInOptimized = optimized.find(n => n.id === item.node.id);
      if (nodeInOptimized) {
        const oldY = nodeInOptimized.position.y;
        // Center the column vertically with extra spacing
        const newY = (idx - barycenters.length / 2) * ROW_SPACING;
        nodeInOptimized.position.y = newY;
        
        if (Math.abs(oldY - newY) > 1) {
          totalMoved++;
        }
        
        console.log(`  ${item.node.data.label?.substring(0, 20)}... y: ${oldY.toFixed(0)} → ${newY.toFixed(0)} (bc=${item.bc.toFixed(0)}, conn=${item.connections})`);
      }
    });
  });
  
  console.log(`📐 Optimization complete! Moved ${totalMoved} nodes`);
  return optimized;
}

