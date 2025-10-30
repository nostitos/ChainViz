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
      is_starting_point?: boolean;
      inputCount?: number;
      outputCount?: number;
      is_bidirectional?: boolean;
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

export function buildGraphFromTraceDataBipartite(data: TraceData, edgeScaleMax: number = 10, maxTransactions: number = 20, maxOutputs: number = 20, startTxid?: string): { nodes: Node[]; edges: Edge[] } {
  console.log('📊 buildGraphFromTraceDataBipartite called with maxTransactions:', maxTransactions, 'maxOutputs:', maxOutputs, 'startTxid:', startTxid);
  
  console.log('🔍 RAW INPUT DATA:', {
    totalNodes: data.nodes.length,
    txNodes: data.nodes.filter(n => n.type === 'transaction').length,
    addrNodes: data.nodes.filter(n => n.type === 'address').length,
    totalEdges: data.edges.length,
    startingPoint: data.nodes.find(n => n.metadata?.is_starting_point)?.id || 'none',
  });
  
  // Log all TX nodes with their metadata
  console.log('🔍 ALL TX NODES FROM BACKEND:');
  data.nodes.filter(n => n.type === 'transaction').forEach((tx, idx) => {
    console.log(`  ${idx}: ${tx.id.substring(3, 23)} - inputs=${tx.metadata?.inputCount}, outputs=${tx.metadata?.outputCount}`);
  });
  
  let nodes: Node[] = [];
  let edges: Edge[] = [];

  // Separate by type
  const txData = data.nodes.filter(n => n.type === 'transaction');
  const addrData = data.nodes.filter(n => n.type === 'address');
  
  console.log(`📊 Found ${txData.length} transactions, ${addrData.length} addresses`);
  
  // Limit transactions if there are too many
  let limitedTxData = txData;
  if (txData.length > maxTransactions) {
    console.log(`⚠️ Limiting transactions: showing ${maxTransactions} of ${txData.length} transactions`);
    // Sort by timestamp and take the most recent ones
    limitedTxData = txData.sort((a, b) => {
      const tA = a.metadata?.timestamp || 0;
      const tB = b.metadata?.timestamp || 0;
      return tB - tA; // Most recent first
    }).slice(0, maxTransactions);
  }
  
  // Build adjacency maps from BOTH perspectives for symmetric bidirectional detection
  
  // Transaction perspective (TX → Addresses)
  const txInputs = new Map<string, string[]>(); // TX → input addresses (LEFT)
  const txOutputs = new Map<string, string[]>(); // TX → output addresses (RIGHT)
  const txBidirectional = new Map<string, string[]>(); // TX → addresses that are BOTH input AND output (BELOW)
  
  // Address perspective (Address → TXs)
  const addrReceiving = new Map<string, string[]>(); // Address → TXs where address receives (LEFT)
  const addrSending = new Map<string, string[]>(); // Address → TXs where address sends (RIGHT)
  const addrBidirectional = new Map<string, string[]>(); // Address → TXs that are BOTH receiving AND sending (BELOW)
  
  // Build adjacency maps based on edge direction
  data.edges.forEach(e => {
    // Address → TX: Address is spending TO the transaction
    if (e.source.startsWith('addr_') && e.target.startsWith('tx_')) {
      // TX perspective: address is an input (LEFT of TX)
      if (!txInputs.has(e.target)) txInputs.set(e.target, []);
      if (!txInputs.get(e.target)!.includes(e.source)) {
        txInputs.get(e.target)!.push(e.source);
      }
      // Address perspective: TX is where address sends (RIGHT of address)
      if (!addrSending.has(e.source)) addrSending.set(e.source, []);
      if (!addrSending.get(e.source)!.includes(e.target)) {
        addrSending.get(e.source)!.push(e.target);
      }
    }
    // TX → Address: TX is paying TO the address
    if (e.source.startsWith('tx_') && e.target.startsWith('addr_')) {
      // TX perspective: address is an output (RIGHT of TX)
      if (!txOutputs.has(e.source)) txOutputs.set(e.source, []);
      if (!txOutputs.get(e.source)!.includes(e.target)) {
        txOutputs.get(e.source)!.push(e.target);
      }
      // Address perspective: TX is where address receives (LEFT of address)
      if (!addrReceiving.has(e.target)) addrReceiving.set(e.target, []);
      if (!addrReceiving.get(e.target)!.includes(e.source)) {
        addrReceiving.get(e.target)!.push(e.source);
      }
    }
  });

  // Sort TXs chronologically
  const sortedTxs = limitedTxData.sort((a, b) => {
    const tA = a.metadata?.timestamp || 0;
    const tB = b.metadata?.timestamp || 0;
    return tA - tB;
  });
  
  // Detect bidirectional connections from BOTH perspectives
  
  // 1. Detect bidirectional addresses (appear in BOTH input and output for same TX)
  sortedTxs.forEach(txNode => {
    const inputs = txInputs.get(txNode.id) || [];
    const outputs = txOutputs.get(txNode.id) || [];
    const bidirectional = inputs.filter(addr => outputs.includes(addr));
    
    if (bidirectional.length > 0) {
      console.log(`🔄 TX ${txNode.id.substring(0, 20)} has ${bidirectional.length} bidirectional addresses`);
      txBidirectional.set(txNode.id, bidirectional);
      
      // Remove from inputs and outputs
      txInputs.set(txNode.id, inputs.filter(addr => !bidirectional.includes(addr)));
      txOutputs.set(txNode.id, outputs.filter(addr => !bidirectional.includes(addr)));
    }
  });
  
  // 2. Detect bidirectional transactions (TX appears in BOTH receiving and sending for same address)
  addrData.forEach(addrNode => {
    const receiving = addrReceiving.get(addrNode.id) || [];
    const sending = addrSending.get(addrNode.id) || [];
    const bidirectional = receiving.filter(tx => sending.includes(tx));
    
    if (bidirectional.length > 0) {
      console.log(`🔄 Address ${addrNode.id.substring(0, 25)} has ${bidirectional.length} bidirectional transactions`);
      addrBidirectional.set(addrNode.id, bidirectional);
      
      // Remove from receiving and sending
      addrReceiving.set(addrNode.id, receiving.filter(tx => !bidirectional.includes(tx)));
      addrSending.set(addrNode.id, sending.filter(tx => !bidirectional.includes(tx)));
    }
  });
  
  console.log('🔍 EDGE CATEGORIZATION:', {
    numTxsWithInputs: txInputs.size,
    numTxsWithOutputs: txOutputs.size,
    numAddrsWithReceiving: addrReceiving.size,
    numAddrsWithSending: addrSending.size,
    numAddrsWithBidirectional: addrBidirectional.size,
  });

  // Layout: Simple left-to-right with TXs evenly spaced
  const TX_SPACING = 800;
  const ADDR_OFFSET = 480; // Distance from TX to addresses (unchanged)
  const ROW_SPACING = 90; // Increased from 60 to 90 for more space between addresses
  
  // Cluster node sizing constants (must match AddressClusterNode.tsx AND CSS)
  const CLUSTER_HEADER_HEIGHT = 45; // padding + font + margin + spacing
  const CLUSTER_ROW_HEIGHT = 14; // EXPLICIT in CSS: .cluster-item { height: 14px }
  
  // Track which addresses have been positioned
  const positioned = new Set<string>();
  
  // Check if we have a starting point ADDRESS (not TX)
  // If so, use ADDRESS-CENTRIC layout instead of TX-centric bipartite
  const startingAddr = addrData.find(a => a.metadata?.is_starting_point === true);
  const useAddressCentricLayout = startingAddr && sortedTxs.length > 0;
  
  if (useAddressCentricLayout) {
    console.log(`📍 Using ADDRESS-CENTRIC layout for starting address: ${startingAddr.id.substring(0, 25)}`);
    
    // Separate TXs by direction relative to this address
    const receivingTxs = addrReceiving.get(startingAddr.id) || [];
    const sendingTxs = addrSending.get(startingAddr.id) || [];
    const bidirTxs = addrBidirectional.get(startingAddr.id) || [];

    console.log(`  Receiving TXs (LEFT): ${receivingTxs.length} - ${receivingTxs.map(t => t.substring(3, 20)).join(', ')}`);
    console.log(`  Sending TXs (RIGHT): ${sendingTxs.length} - ${sendingTxs.map(t => t.substring(3, 20)).join(', ')}`);
    console.log(`  Bidirectional TXs (BELOW): ${bidirTxs.length} - ${bidirTxs.map(t => t.substring(3, 20)).join(', ')}`);
    
    // Position the starting address at center
    nodes.push({
      id: startingAddr.id,
      type: 'address',
      position: { x: 0, y: 0 }, // Center
      data: {
        ...startingAddr,
        label: startingAddr.label,
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });
    positioned.add(startingAddr.id);
    
    // Position receiving TXs on LEFT (stacked vertically)
    const leftStartY = -((receivingTxs.length - 1) * ROW_SPACING) / 2;
    receivingTxs.forEach((txId, txIdx) => {
      const txNodeData = limitedTxData.find(t => t.id === txId);
      if (txNodeData) {
        console.log(`  📍 LEFT TX ${txIdx}: ${txId.substring(3, 23)} - inputs=${txNodeData.metadata?.inputCount}, outputs=${txNodeData.metadata?.outputCount}`);
        nodes.push({
          id: txNodeData.id,
          type: 'transaction',
          position: {
            x: -ADDR_OFFSET, // LEFT
            y: leftStartY + (txIdx * ROW_SPACING),
          },
          data: {
            ...txNodeData,
            label: txNodeData.label,
            metadata: {
              ...txNodeData.metadata,
              inputCount: txNodeData.metadata?.inputCount ?? 0,
              outputCount: txNodeData.metadata?.outputCount ?? 0,
            },
          },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
        });
      } else {
        console.error(`  ❌ TX ${txId} NOT FOUND in limitedTxData!`);
      }
    });
    
    // Position sending TXs on RIGHT (stacked vertically)
    const rightStartY = -((sendingTxs.length - 1) * ROW_SPACING) / 2;
    sendingTxs.forEach((txId, txIdx) => {
      const txNodeData = limitedTxData.find(t => t.id === txId);
      if (txNodeData) {
        console.log(`  📍 RIGHT TX ${txIdx}: ${txId.substring(3, 23)} - inputs=${txNodeData.metadata?.inputCount}, outputs=${txNodeData.metadata?.outputCount}`);
        nodes.push({
          id: txNodeData.id,
          type: 'transaction',
          position: {
            x: ADDR_OFFSET, // RIGHT
            y: rightStartY + (txIdx * ROW_SPACING),
          },
          data: {
            ...txNodeData,
            label: txNodeData.label,
            metadata: {
              ...txNodeData.metadata,
              inputCount: txNodeData.metadata?.inputCount ?? 0,
              outputCount: txNodeData.metadata?.outputCount ?? 0,
            },
          },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
        });
      } else {
        console.error(`  ❌ TX ${txId} NOT FOUND in limitedTxData!`);
      }
    });
    
    // Position bidirectional TXs BELOW (stacked horizontally)
    if (bidirTxs.length > 0) {
      const belowStartX = -((bidirTxs.length - 1) * ROW_SPACING) / 2;
      bidirTxs.forEach((txId, txIdx) => {
        const txNodeData = limitedTxData.find(t => t.id === txId);
        if (txNodeData) {
          nodes.push({
            id: txNodeData.id,
            type: 'transaction',
            position: {
              x: belowStartX + (txIdx * ROW_SPACING),
              y: 300, // BELOW
            },
            data: {
              ...txNodeData,
              label: txNodeData.label,
              metadata: {
                ...txNodeData.metadata,
                inputCount: txNodeData.metadata?.inputCount ?? 0,
                outputCount: txNodeData.metadata?.outputCount ?? 0,
                is_bidirectional: true,
              },
            },
            sourcePosition: Position.Top,
            targetPosition: Position.Top,
          });
        }
      });
    }
    
    // Mark all TXs as processed so they don't get repositioned
    receivingTxs.forEach(txId => positioned.add(txId));
    sendingTxs.forEach(txId => positioned.add(txId));
    bidirTxs.forEach(txId => positioned.add(txId));
    
    // Skip the normal TX-centric bipartite layout - we're done with address-centric
  } else {
    // Normal TX-centric bipartite layout
    // Position TXs first (on horizontal center line)
    // BUT: Mark bidirectional TXs for later repositioning below their connected origin address
    const bidirectionalTxs = new Set<string>();
    addrData.forEach(addr => {
      const bidirTxIds = addrBidirectional.get(addr.id) || [];
      bidirTxIds.forEach(txId => bidirectionalTxs.add(txId));
    });
    
    sortedTxs.forEach((txNode, idx) => {
      // ALWAYS use backend counts - they're the source of truth!
      // Edges are UI elements showing what's DISPLAYED, not what EXISTS
      const inputCount = txNode.metadata?.inputCount ?? 0;
      const outputCount = txNode.metadata?.outputCount ?? 0;
      
      // Log warning if counts are missing from backend
      if (!txNode.metadata?.inputCount || !txNode.metadata?.outputCount) {
        console.warn(`⚠️ TX ${txNode.id.substring(0, 25)} missing inputCount/outputCount from backend!`);
      }
      
      // Note: We don't need to count addresses from edge maps - backend provides the truth
      
      const isBidirectional = bidirectionalTxs.has(txNode.id);
      
      nodes.push({
        id: txNode.id,
        type: 'transaction',
        position: {
          x: idx * TX_SPACING,
          y: 0, // Will be repositioned later if bidirectional
        },
        data: {
          ...txNode,
          label: txNode.label,
          metadata: {
            ...txNode.metadata,
            inputCount,
            outputCount,
            is_bidirectional: isBidirectional, // Mark for repositioning
          },
        },
        sourcePosition: isBidirectional ? Position.Top : Position.Right,
        targetPosition: isBidirectional ? Position.Top : Position.Left,
      });
    });
  }

  // Only run the TX-relative address positioning if we're NOT using address-centric layout
  if (!useAddressCentricLayout) {
  
  sortedTxs.forEach(txNode => {
    const txNodeInGraph = nodes.find(n => n.id === txNode.id)!;
    
    // Get ACTUAL counts from backend metadata
    const actualInputCount = txNodeInGraph.data.metadata?.inputCount ?? 0;
    const actualOutputCount = txNodeInGraph.data.metadata?.outputCount ?? 0;
    
    // Input addresses (LEFT of TX) - these are what we're DISPLAYING, not the total
    const inputAddrIds = txInputs.get(txNode.id) || [];
    const inputAddrs = inputAddrIds.map(id => addrData.find(a => a.id === id)!).filter(Boolean);
    
    // Check if this is the starting transaction or if any input is an origin address
    const isStartTx = startTxid && txNode.metadata?.txid === startTxid;
    const hasOriginAddress = inputAddrs.some(a => a.metadata?.is_starting_point === true);
    
    // Use BACKEND count for clustering decision, not displayed address count!
    // If 10+ ACTUAL inputs AND not the starting TX AND no origin addresses, create cluster node
    if (actualInputCount >= 10 && !isStartTx && !hasOriginAddress) {
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
          label: `${actualInputCount} Inputs${inputAddrs.length < actualInputCount ? ` (${inputAddrs.length} shown)` : ''}`,
          onExpand: undefined, // Will be set later
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      });
      inputAddrs.forEach(a => positioned.add(a.id));
    } else {
      // Show individual address nodes (limited by maxOutputs if starting TX)
      const addrsToShow = isStartTx ? inputAddrs.slice(0, maxOutputs) : inputAddrs;
      
      if (isStartTx && inputAddrs.length > maxOutputs) {
        console.log(`⚠️ Start TX: Limiting inputs from ${inputAddrs.length} to ${maxOutputs}`);
      }
      
      // HYBRID MULTI-COLUMN LAYOUT for inputs (same as outputs):
      // - Small graphs (≤60 nodes): Single column with graduated spacing
      // - Large graphs (>60 nodes): Multi-column at 60 nodes per column
      const NODES_PER_COLUMN = 60;
      const COLUMN_SPACING = 800; // Horizontal spacing between columns
      
      addrsToShow.forEach((addrNode, idx) => {
        if (positioned.has(addrNode.id)) return;
        
        let xPos, yPos;
        
        if (addrsToShow.length <= NODES_PER_COLUMN) {
          // SINGLE COLUMN: Graduated spacing based on total count
          const graduatedOffset = ADDR_OFFSET + Math.floor(addrsToShow.length / 10) * 120;
          xPos = txNodeInGraph.position.x - graduatedOffset; // Negative for left side
          yPos = (idx - addrsToShow.length / 2) * ROW_SPACING;
        } else {
          // MULTI-COLUMN: Split into columns of 60 nodes each
          const column = Math.floor(idx / NODES_PER_COLUMN);
          const row = idx % NODES_PER_COLUMN;
          
          // First column uses graduated spacing, additional columns at fixed intervals
          const firstColumnOffset = ADDR_OFFSET + Math.floor(NODES_PER_COLUMN / 10) * 120; // ~1080px for 60 nodes
          xPos = txNodeInGraph.position.x - firstColumnOffset - (column * COLUMN_SPACING); // Negative for left side
          yPos = (row - NODES_PER_COLUMN / 2) * ROW_SPACING; // Center each column vertically
        }
        
        nodes.push({
          id: addrNode.id,
          type: 'address',
          position: { x: xPos, y: yPos },
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
    const hasOriginOutput = outputAddrs.some(a => a.metadata?.is_starting_point === true);
    
    // Use BACKEND count for clustering decision, not displayed address count!
    // If 10+ ACTUAL outputs AND not the starting TX AND no origin addresses, create cluster node
    if (actualOutputCount >= 10 && !isStartTx && !hasOriginOutput) {
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
          label: `${actualOutputCount} Outputs${regularAddrs.length < actualOutputCount ? ` (${regularAddrs.length} shown)` : ''}`,
          onExpand: undefined, // Will be set later
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      });
      regularAddrs.forEach(a => positioned.add(a.id));
    } else {
      // Change addresses FIRST (slightly above regular outputs) - RIGHT of TX
      changeAddrs.forEach((addrNode, idx) => {
        if (positioned.has(addrNode.id)) return;
        
        // Calculate top regular output position
        const topRegularY = (-regularAddrs.length / 2) * ROW_SPACING;
        
        nodes.push({
          id: addrNode.id,
          type: 'address',
          position: {
            x: txNodeInGraph.position.x + ADDR_OFFSET,
            y: topRegularY - 20 - (idx * ROW_SPACING), // 20px above the topmost regular output (reduced from 50px)
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
      
      // Show individual regular output nodes (starting at y=0, limited by maxOutputs if starting TX)
      const regularAddrsToShow = isStartTx ? regularAddrs.slice(0, maxOutputs) : regularAddrs;
      
      if (isStartTx && regularAddrs.length > maxOutputs) {
        console.log(`⚠️ Start TX: Limiting regular outputs from ${regularAddrs.length} to ${maxOutputs}`);
      }
      
      // HYBRID MULTI-COLUMN LAYOUT for outputs:
      // - Small graphs (≤60 nodes): Single column with graduated spacing
      // - Large graphs (>60 nodes): Multi-column at 60 nodes per column
      const NODES_PER_COLUMN = 60;
      const COLUMN_SPACING = 800; // Horizontal spacing between columns
      
      regularAddrsToShow.forEach((addrNode, idx) => {
        if (positioned.has(addrNode.id)) return;
        
        let xPos, yPos;
        
        if (regularAddrsToShow.length <= NODES_PER_COLUMN) {
          // SINGLE COLUMN: Graduated spacing based on total count
          // More outputs = further from TX
          const graduatedOffset = ADDR_OFFSET + Math.floor(regularAddrsToShow.length / 10) * 120;
          xPos = txNodeInGraph.position.x + graduatedOffset;
          yPos = (idx - regularAddrsToShow.length / 2) * ROW_SPACING;
        } else {
          // MULTI-COLUMN: Split into columns of 60 nodes each
          const column = Math.floor(idx / NODES_PER_COLUMN);
          const row = idx % NODES_PER_COLUMN;
          
          // First column uses graduated spacing, additional columns at fixed intervals
          const firstColumnOffset = ADDR_OFFSET + Math.floor(NODES_PER_COLUMN / 10) * 120; // ~1080px for 60 nodes
          xPos = txNodeInGraph.position.x + firstColumnOffset + (column * COLUMN_SPACING);
          yPos = (row - NODES_PER_COLUMN / 2) * ROW_SPACING; // Center each column vertically
        }
        
        nodes.push({
          id: addrNode.id,
          type: 'address',
          position: { x: xPos, y: yPos },
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
    
    // Bidirectional addresses (BELOW TX) - addresses that are both input and output
    const bidirectionalAddrIds = txBidirectional.get(txNode.id) || [];
    const bidirectionalAddrs = bidirectionalAddrIds.map(id => addrData.find(a => a.id === id)!).filter(Boolean);
    
    if (bidirectionalAddrs.length > 0) {
      console.log(`🔄 Positioning ${bidirectionalAddrs.length} bidirectional addresses below TX ${txNode.id.substring(0, 20)}`);
      
      // Position bidirectional addresses in a horizontal row below the TX
      const startX = txNodeInGraph.position.x - ((bidirectionalAddrs.length - 1) * ROW_SPACING) / 2;
      bidirectionalAddrs.forEach((addrNode, idx) => {
        if (positioned.has(addrNode.id)) return;
        
        nodes.push({
          id: addrNode.id,
          type: 'address',
          position: {
            x: startX + (idx * ROW_SPACING), // Spread horizontally
            y: txNodeInGraph.position.y + 300, // 300px below TX
          },
          data: {
            ...addrNode,
            label: addrNode.label,
            metadata: {
              ...addrNode.metadata,
              is_bidirectional: true, // Mark as bidirectional for styling
            },
          },
          sourcePosition: Position.Top, // Can connect upward
          targetPosition: Position.Top, // Can connect upward
        });
        positioned.add(addrNode.id);
      });
    }
  });
  
  } // End of if (!useAddressCentricLayout)
  
  // Handle standalone addresses (when there are no transactions OR address wasn't positioned)
  // This handles:
  // 1. The 0,0 hops case (just the address node)
  // 2. Addresses that have no edges (shouldn't happen but safety net)
  // SKIP this if using address-centric layout (other addresses will be added with edges)
  const unpositionedAddrs = addrData.filter(addr => !positioned.has(addr.id));
  if (unpositionedAddrs.length > 0 && !useAddressCentricLayout) {
    console.log(`📍 Positioning ${unpositionedAddrs.length} standalone addresses`);
    
    // If there are NO transactions at all, center the address
    if (sortedTxs.length === 0) {
      unpositionedAddrs.forEach((addrNode, idx) => {
        nodes.push({
          id: addrNode.id,
          type: 'address',
          position: {
            x: 0, // Center of viewport
            y: idx * ROW_SPACING, // Stack vertically if multiple
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
    } else {
      // If there ARE transactions but address wasn't positioned, place it at center
      // and position orphan TXs to the sides based on edge direction
      unpositionedAddrs.forEach((addrNode, idx) => {
        const addrX = 0; // Center
        const addrY = idx * ROW_SPACING;
        
        nodes.push({
          id: addrNode.id,
          type: 'address',
          position: { x: addrX, y: addrY },
          data: {
            ...addrNode,
            label: addrNode.label,
          },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
        });
        positioned.add(addrNode.id);
        
        // Find TXs connected to this address and reposition them
        const receivingTxs = addrReceiving.get(addrNode.id) || [];
        const sendingTxs = addrSending.get(addrNode.id) || [];
        const bidirTxs = addrBidirectional.get(addrNode.id) || [];
        
        // Position receiving TXs on LEFT (stacked vertically with proper spacing)
        // Start from top and stack downward
        const leftStartY = addrY - ((receivingTxs.length - 1) * ROW_SPACING) / 2;
        receivingTxs.forEach((txId, txIdx) => {
          const txNode = nodes.find(n => n.id === txId);
          if (txNode) {
            txNode.position = {
              x: addrX - ADDR_OFFSET, // LEFT of address
              y: leftStartY + (txIdx * ROW_SPACING), // Stack vertically with ROW_SPACING
            };
          }
        });
        
        // Position sending TXs on RIGHT (stacked vertically with proper spacing)
        // Start from top and stack downward
        const rightStartY = addrY - ((sendingTxs.length - 1) * ROW_SPACING) / 2;
        sendingTxs.forEach((txId, txIdx) => {
          const txNode = nodes.find(n => n.id === txId);
          if (txNode) {
            txNode.position = {
              x: addrX + ADDR_OFFSET, // RIGHT of address
              y: rightStartY + (txIdx * ROW_SPACING), // Stack vertically with ROW_SPACING
            };
          }
        });
        
        // Position bidirectional TXs BELOW (stacked horizontally)
        if (bidirTxs.length > 0) {
          const startX = addrX - ((bidirTxs.length - 1) * ROW_SPACING) / 2;
          bidirTxs.forEach((txId, txIdx) => {
            const txNode = nodes.find(n => n.id === txId);
            if (txNode) {
              txNode.position = {
                x: startX + (txIdx * ROW_SPACING),
                y: addrY + 300, // BELOW address
              };
            }
          });
        }
      });
    }
  }
  
  // Reposition bidirectional transactions below their connected addresses
  // This creates symmetric behavior: addresses below TXs, TXs below addresses
  addrData.forEach(addrNode => {
    const bidirTxIds = addrBidirectional.get(addrNode.id) || [];
    if (bidirTxIds.length === 0) return;
    
    const addrInGraph = nodes.find(n => n.id === addrNode.id);
    if (!addrInGraph) return;
    
    console.log(`🔄 Repositioning ${bidirTxIds.length} bidirectional TXs below address ${addrNode.id.substring(0, 25)}`);
    
    // Position bidirectional TXs in a horizontal row below the address
    const startX = addrInGraph.position.x - ((bidirTxIds.length - 1) * ROW_SPACING) / 2;
    bidirTxIds.forEach((txId, idx) => {
      const txInGraph = nodes.find(n => n.id === txId);
      if (!txInGraph) return;
      
      // Reposition TX below the address
      txInGraph.position = {
        x: startX + (idx * ROW_SPACING), // Spread horizontally
        y: addrInGraph.position.y + 300, // 300px below address
      };
      console.log(`  ↓ Moved TX ${txId.substring(0, 20)} below address`);
    });
  });

  // Remove duplicate standalone address nodes that are now part of clusters
  const clusteredAddressIds = new Set<string>();
  const clusterNodes = nodes.filter(n => n.type === 'addressCluster');
  console.log(`🔍 Found ${clusterNodes.length} cluster nodes in graph`);
  
  nodes.forEach(n => {
    if (n.type === 'addressCluster' && n.data.addresses) {
      n.data.addresses.forEach((addr: any) => {
        const addrId = `addr_${addr.address}`;
        clusteredAddressIds.add(addrId);
      });
    }
  });
  
  console.log(`🔍 ${clusteredAddressIds.size} addresses are in clusters`);

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
  
  console.log(`🔗 addrToCluster map has ${addrToCluster.size} entries`);
  console.log(`🔗 Cluster nodes: ${nodes.filter(n => n.type === 'addressCluster').map(n => n.id).join(', ')}`);
  
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

  // Deduplicate edges by ID to prevent React warnings
  const edgeMap = new Map<string, Edge>();
  edges.forEach(e => {
    if (!edgeMap.has(e.id)) {
      edgeMap.set(e.id, e);
    }
    // Duplicates are silently merged (keep first occurrence)
  });
  edges = Array.from(edgeMap.values());

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

