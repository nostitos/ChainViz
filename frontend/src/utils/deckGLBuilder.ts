/**
 * Convert backend trace data to deck.gl graph format
 * Maintains chronological layout: transactions left-to-right, inputs left, outputs right
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
  }>;
}

export interface DeckGLNode {
  id: string;
  x: number;
  y: number;
  type: 'transaction' | 'address';
  label: string;
  address?: string;
  txid?: string;
  isChange?: boolean;
  clusterId?: string;
  timestamp?: number;
  expandableInputs?: number;
  expandableOutputs?: number;
}

export interface DeckGLEdge {
  source: string;
  target: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  amount?: number;
  confidence?: number;
  isBackward?: boolean;
}

export function buildDeckGLGraph(data: TraceData): {
  nodes: DeckGLNode[];
  edges: DeckGLEdge[];
} {
  const nodeMap = new Map<string, DeckGLNode>();
  
  // Separate transactions and addresses
  const txNodes = data.nodes.filter(n => n.type === 'transaction');
  const addrNodes = data.nodes.filter(n => n.type === 'address');
  
  // Sort transactions chronologically (oldest left, newest right)
  txNodes.sort((a, b) => {
    const timeA = a.metadata?.timestamp || 0;
    const timeB = b.metadata?.timestamp || 0;
    return timeA - timeB;
  });

  // Layout constants (more horizontal space for readability)
  const TX_HORIZONTAL_SPACING = 800;
  const ADDR_SPACING = 120;
  const ADDR_OFFSET_X = 480;
  
  // Position transactions horizontally
  txNodes.forEach((node, index) => {
    nodeMap.set(node.id, {
      id: node.id,
      x: index * TX_HORIZONTAL_SPACING,
      y: 0,
      type: 'transaction',
      label: node.label,
      txid: node.metadata?.txid,
      timestamp: node.metadata?.timestamp,
    });
  });

  // Build input/output maps for each TX
  const txInputs: Map<string, DeckGLNode[]> = new Map();
  const txOutputs: Map<string, DeckGLNode[]> = new Map();
  
  txNodes.forEach(tx => {
    txInputs.set(tx.id, []);
    txOutputs.set(tx.id, []);
  });
  
  // Assign addresses to TXs based on edge direction
  data.edges.forEach(edge => {
    // Address → TX = input
    if (edge.source.startsWith('addr_') && edge.target.startsWith('tx_')) {
      const addrNode = data.nodes.find(n => n.id === edge.source);
      if (addrNode) {
        const deckNode: DeckGLNode = {
          id: addrNode.id,
          x: 0,
          y: 0,
          type: 'address',
          label: addrNode.label,
          address: addrNode.metadata?.address,
          isChange: addrNode.metadata?.is_change,
          clusterId: addrNode.metadata?.cluster_id,
        };
        if (!txInputs.get(edge.target)!.find(n => n.id === addrNode.id)) {
          txInputs.get(edge.target)!.push(deckNode);
        }
      }
    }
    
    // TX → Address = output
    if (edge.source.startsWith('tx_') && edge.target.startsWith('addr_')) {
      const addrNode = data.nodes.find(n => n.id === edge.target);
      if (addrNode) {
        const deckNode: DeckGLNode = {
          id: addrNode.id,
          x: 0,
          y: 0,
          type: 'address',
          label: addrNode.label,
          address: addrNode.metadata?.address,
          isChange: addrNode.metadata?.is_change,
          clusterId: addrNode.metadata?.cluster_id,
        };
        if (!txOutputs.get(edge.source)!.find(n => n.id === addrNode.id)) {
          txOutputs.get(edge.source)!.push(deckNode);
        }
      }
    }
  });

  // Position addresses relative to their TXs
  txNodes.forEach(txNode => {
    const tx = nodeMap.get(txNode.id)!;
    const inputs = txInputs.get(txNode.id) || [];
    const outputs = txOutputs.get(txNode.id) || [];
    
    // Separate change outputs
    const changeOutputs = outputs.filter(n => n.isChange);
    const regularOutputs = outputs.filter(n => !n.isChange);
    
    // Position INPUTS on LEFT
    const inputStartY = -((inputs.length - 1) * ADDR_SPACING) / 2;
    inputs.forEach((addr, idx) => {
      addr.x = tx.x - ADDR_OFFSET_X;
      addr.y = inputStartY + (idx * ADDR_SPACING);
      addr.expandableInputs = 0; // Can expand left
      nodeMap.set(addr.id, addr);
    });
    
    // Position REGULAR OUTPUTS on RIGHT
    const outputStartY = -((regularOutputs.length - 1) * ADDR_SPACING) / 2;
    regularOutputs.forEach((addr, idx) => {
      addr.x = tx.x + ADDR_OFFSET_X;
      addr.y = outputStartY + (idx * ADDR_SPACING);
      addr.expandableOutputs = 0; // Can expand right
      nodeMap.set(addr.id, addr);
    });
    
    // Position CHANGE OUTPUTS BELOW TX (300px down)
    const changeStartX = tx.x - ((changeOutputs.length - 1) * ADDR_SPACING) / 2;
    changeOutputs.forEach((addr, idx) => {
      addr.x = changeStartX + (idx * ADDR_SPACING);
      addr.y = tx.y + 300;
      nodeMap.set(addr.id, addr);
    });
  });

  // Build edges with positions
  const deckEdges: DeckGLEdge[] = data.edges.map(edge => {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    
    // Check if backwards (right to left)
    const isBackward = sourceNode && targetNode && sourceNode.x > targetNode.x;
    
    return {
      source: edge.source,
      target: edge.target,
      sourceX: sourceNode?.x ?? 0,
      sourceY: sourceNode?.y ?? 0,
      targetX: targetNode?.x ?? 0,
      targetY: targetNode?.y ?? 0,
      amount: edge.amount,
      confidence: edge.confidence ?? 1.0,
      isBackward,
    };
  });

  return {
    nodes: Array.from(nodeMap.values()),
    edges: deckEdges,
  };
}



