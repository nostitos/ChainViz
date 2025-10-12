import type { Node, Edge } from '@xyflow/react';
import { Position } from '@xyflow/react';

interface TraceData {
  nodes: Array<{
    id: string;
    type: string;
    label: string;
    metadata?: any;
  }>;
  edges: Array<{
    source: string;
    target: string;
    amount?: number;
    confidence?: number;
  }>;
}

export function buildGraphFromTraceData(data: TraceData): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Separate transactions and addresses
  const txNodes: Node[] = [];
  const addrNodes: Node[] = [];
  
  data.nodes.forEach((nodeData) => {
    const node: Node = {
      id: nodeData.id,
      type: nodeData.type,
      position: { x: 0, y: 0 }, // Will be calculated
      data: {
        ...nodeData,
        label: nodeData.label,
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };

    if (nodeData.type === 'transaction') {
      txNodes.push(node);
    } else {
      addrNodes.push(node);
    }
    nodes.push(node);
  });

  // Sort transactions chronologically (oldest first, left to right)
  txNodes.sort((a, b) => {
    const timeA = a.data.metadata?.timestamp || 0;
    const timeB = b.data.metadata?.timestamp || 0;
    return timeA - timeB; // Older = smaller timestamp = left side
  });

  // Layout: More horizontal space for readability (60% more space)
  const TX_HORIZONTAL_SPACING = 800; // Spacing between transactions (+300px)
  const ADDR_SPACING = 120; // Spacing between stacked addresses
  const ADDR_OFFSET_X = 480; // Distance from TX to addresses (+180px = 60% more)
  const VERTICAL_SPACING = 120; // Spacing for orphaned nodes
  
  // Position transactions horizontally in the CENTER (chronologically)
  txNodes.forEach((node, index) => {
    node.position = {
      x: index * TX_HORIZONTAL_SPACING,
      y: 0, // All TXs on same horizontal line (center)
    };
  });

  // Build separate input/output lists for each TX
  const txInputs: Map<string, Node[]> = new Map();
  const txOutputs: Map<string, Node[]> = new Map();
  
  // Initialize maps
  txNodes.forEach(tx => {
    txInputs.set(tx.id, []);
    txOutputs.set(tx.id, []);
  });
  
  // Assign addresses to their TXs based on edge direction
  console.log('🔗 Processing edges...');
  data.edges.forEach(edge => {
    console.log(`Edge: ${edge.source.substring(0, 25)}... → ${edge.target.substring(0, 25)}...`);
    
    // If edge goes FROM address TO tx, it's an input
    if (edge.source.startsWith('addr_') && edge.target.startsWith('tx_')) {
      const addr = addrNodes.find(n => n.id === edge.source);
      if (addr && !txInputs.get(edge.target)!.includes(addr)) {
        console.log(`  ✅ Adding as INPUT to ${edge.target.substring(0, 25)}...`);
        txInputs.get(edge.target)!.push(addr);
      }
    }
    
    // If edge goes FROM tx TO address, it's an output
    if (edge.source.startsWith('tx_') && edge.target.startsWith('addr_')) {
      const addr = addrNodes.find(n => n.id === edge.target);
      if (addr && !txOutputs.get(edge.source)!.includes(addr)) {
        console.log(`  ✅ Adding as OUTPUT from ${edge.source.substring(0, 25)}...`);
        txOutputs.get(edge.source)!.push(addr);
      }
    }
  });

  // Position addresses for each TX
  txNodes.forEach(tx => {
    const inputAddrs = txInputs.get(tx.id) || [];
    const outputAddrs = txOutputs.get(tx.id) || [];
    
    // Separate change outputs from regular outputs
    const changeOutputs = outputAddrs.filter(addr => addr.data.metadata?.is_change === true);
    const regularOutputs = outputAddrs.filter(addr => addr.data.metadata?.is_change !== true);
    
    console.log(`TX ${tx.id.substring(0, 25)}...: ${inputAddrs.length} inputs, ${regularOutputs.length} regular outputs, ${changeOutputs.length} change outputs`);
    
    // Position INPUTS on the LEFT
    const inputStartY = -((inputAddrs.length - 1) * ADDR_SPACING) / 2;
    inputAddrs.forEach((addr, idx) => {
      addr.position = {
        x: tx.position.x - ADDR_OFFSET_X, // LEFT of TX
        y: inputStartY + (idx * ADDR_SPACING),
      };
      console.log(`  Input ${idx}: ${addr.id.substring(0, 20)}... at x=${addr.position.x}, y=${addr.position.y}`);
    });
    
    // Position REGULAR OUTPUTS on the RIGHT
    const outputStartY = -((regularOutputs.length - 1) * ADDR_SPACING) / 2;
    regularOutputs.forEach((addr, idx) => {
      addr.position = {
        x: tx.position.x + ADDR_OFFSET_X, // RIGHT of TX
        y: outputStartY + (idx * ADDR_SPACING),
      };
      console.log(`  Output ${idx}: ${addr.id.substring(0, 20)}... at x=${addr.position.x}, y=${addr.position.y}`);
    });
    
    // Position CHANGE OUTPUTS BELOW the TX (300px down)
    const changeStartX = tx.position.x - ((changeOutputs.length - 1) * ADDR_SPACING) / 2;
    changeOutputs.forEach((addr, idx) => {
      addr.position = {
        x: changeStartX + (idx * ADDR_SPACING), // CENTERED horizontally
        y: tx.position.y + 300, // 300px BELOW TX
      };
      console.log(`  Change ${idx}: ${addr.id.substring(0, 20)}... at x=${addr.position.x}, y=${addr.position.y} (BELOW TX)`);
    });
  });

  // Handle orphaned addresses (no TX connection found)
  addrNodes.forEach((node, index) => {
    if (node.position.x === 0 && node.position.y === 0) {
      node.position = {
        x: txNodes.length * TX_HORIZONTAL_SPACING,
        y: index * VERTICAL_SPACING,
      };
    }
  });

  // Build edges with styling based on confidence
  data.edges.forEach((edgeData, index) => {
    const confidence = edgeData.confidence ?? 1.0;
    const amount = edgeData.amount;
    
    // Get source and target nodes to determine direction
    const sourceNode = nodes.find(n => n.id === edgeData.source);
    const targetNode = nodes.find(n => n.id === edgeData.target);
    
    // Check if edge goes backwards (right to left)
    const isBackwards = sourceNode && targetNode && sourceNode.position.x > targetNode.position.x;
    
    // Color coding based on confidence
    let strokeColor = '#64b5f6'; // Blue
    if (confidence < 0.5) strokeColor = '#ff9800'; // Orange
    if (confidence >= 0.8) strokeColor = '#4caf50'; // Green
    
    const edge: Edge = {
      id: `e-${edgeData.source}-${edgeData.target}-${index}`,
      source: edgeData.source,
      target: edgeData.target,
      // Use smoothstep for backwards edges (more curved)
      type: isBackwards ? 'smoothstep' : 'default',
      animated: confidence > 0.7,
      style: {
        stroke: strokeColor,
        strokeWidth: 2 + (confidence * 2),
      },
      // Extra curve for backwards edges
      ...(isBackwards && {
        pathOptions: {
          offset: 50, // Offset the path to curve around nodes
          borderRadius: 30, // Smoother corners
        }
      }),
      label: amount ? `${(amount / 100000000).toFixed(8)} BTC` : undefined,
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

  // Final debug output
  console.log('\n📊 FINAL GRAPH POSITIONS:');
  txNodes.forEach(tx => {
    const txid = tx.data.metadata?.txid?.substring(0, 20) || tx.id.substring(0, 20);
    console.log(`\nTX ${txid}... at (${tx.position.x}, ${tx.position.y})`);
    
    const inputs = txInputs.get(tx.id) || [];
    console.log(`  Inputs (${inputs.length}):`);
    inputs.forEach(addr => {
      const addrStr = addr.data.metadata?.address?.substring(0, 15) || addr.id.substring(0, 15);
      console.log(`    ${addrStr}... at (${addr.position.x}, ${addr.position.y})`);
    });
    
    const outputs = txOutputs.get(tx.id) || [];
    console.log(`  Outputs (${outputs.length}):`);
    outputs.forEach(addr => {
      const addrStr = addr.data.metadata?.address?.substring(0, 15) || addr.id.substring(0, 15);
      console.log(`    ${addrStr}... at (${addr.position.x}, ${addr.position.y})`);
    });
  });

  return { nodes, edges };
}

