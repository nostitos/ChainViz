import { Node, Edge } from '@xyflow/react';

interface TreeLayoutConfig {
  nodeSpacing: number;      // Horizontal spacing between nodes (400px)
  layerSpacing: number;     // Vertical spacing between layers (300px)
  direction: 'LR' | 'RL';   // Left-to-Right or Right-to-Left
}

/**
 * Build a tree layout with minimal edge crossings using the Sugiyama framework
 * and barycenter method for node ordering
 */
export function buildTreeLayout(
  nodes: Node[],
  edges: Edge[],
  rootNodeId: string,
  config: TreeLayoutConfig = {
    nodeSpacing: 400,
    layerSpacing: 300,
    direction: 'LR'
  }
): Node[] {
  console.log(`🌳 Building tree layout from root: ${rootNodeId}`);
  
  // Step 1: Assign nodes to layers based on distance from root
  const { layers, nodeToLayer } = assignToLayers(nodes, edges, rootNodeId);
  console.log(`📊 Assigned nodes to ${layers.size} layers`);
  
  // Step 2: Sort nodes within each layer using barycenter method
  const sortedLayers = sortLayersByBarycenter(layers, edges, nodeToLayer);
  console.log(`🔄 Sorted layers to minimize crossings`);
  
  // Step 3: Assign X positions (horizontal)
  const xPositions = assignXPositions(sortedLayers, config.nodeSpacing);
  
  // Step 4: Assign Y positions (vertical layers)
  const yPositions = assignYPositions(sortedLayers, config.layerSpacing);
  
  // Step 5: Update node positions
  const updatedNodes = updateNodePositions(nodes, xPositions, yPositions);
  
  console.log(`✅ Tree layout complete: ${updatedNodes.length} nodes positioned`);
  return updatedNodes;
}

/**
 * Step 1: Assign nodes to layers using BFS from root
 */
function assignToLayers(
  nodes: Node[],
  edges: Edge[],
  rootNodeId: string
): { layers: Map<number, Node[]>; nodeToLayer: Map<string, number> } {
  const layers = new Map<number, Node[]>();
  const nodeToLayer = new Map<string, number>();
  const visited = new Set<string>();
  
  // Find root node
  const rootNode = nodes.find(n => n.id === rootNodeId);
  if (!rootNode) {
    console.warn(`⚠️ Root node ${rootNodeId} not found, using first node`);
    const firstNode = nodes[0];
    if (firstNode) {
      layers.set(0, [firstNode]);
      nodeToLayer.set(firstNode.id, 0);
    }
    return { layers, nodeToLayer };
  }
  
  // BFS from root to assign layers
  const queue: [string, number][] = [[rootNodeId, 0]];
  visited.add(rootNodeId);
  
  while (queue.length > 0) {
    const [nodeId, layer] = queue.shift()!;
    
    // Add node to layer
    if (!layers.has(layer)) {
      layers.set(layer, []);
    }
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      layers.get(layer)!.push(node);
      nodeToLayer.set(nodeId, layer);
    }
    
    // Add children to next layer
    edges
      .filter(e => e.source === nodeId)
      .forEach(e => {
        if (!visited.has(e.target)) {
          visited.add(e.target);
          queue.push([e.target, layer + 1]);
        }
      });
  }
  
  // Add any unvisited nodes to a separate layer
  const unvisitedNodes = nodes.filter(n => !visited.has(n.id));
  if (unvisitedNodes.length > 0) {
    const maxLayer = Math.max(...Array.from(layers.keys()));
    layers.set(maxLayer + 1, unvisitedNodes);
    unvisitedNodes.forEach(n => nodeToLayer.set(n.id, maxLayer + 1));
  }
  
  return { layers, nodeToLayer };
}

/**
 * Step 2: Sort layers using barycenter method to minimize crossings
 */
function sortLayersByBarycenter(
  layers: Map<number, Node[]>,
  edges: Edge[],
  nodeToLayer: Map<string, number>
): Map<number, Node[]> {
  const sortedLayers = new Map<number, Node[]>();
  
  // Sort each layer by barycenter (average position of connected nodes in adjacent layer)
  layers.forEach((nodes, layer) => {
    if (layer === 0) {
      // Root layer - keep original order
      sortedLayers.set(layer, nodes);
    } else {
      // Calculate barycenter for each node
      const nodeBarycenters = nodes.map(node => {
        const incomingEdges = edges.filter(e => e.target === node.id);
        if (incomingEdges.length === 0) return 0;
        
        const sum = incomingEdges.reduce((acc, e) => {
          const sourceLayer = nodeToLayer.get(e.source) ?? 0;
          const sourceNodes = layers.get(sourceLayer);
          if (!sourceNodes) return acc;
          
          const sourceIndex = sourceNodes.findIndex(n => n.id === e.source);
          return acc + sourceIndex;
        }, 0);
        
        return sum / incomingEdges.length;
      });
      
      // Sort nodes by barycenter
      const sorted = nodes
        .map((node, idx) => ({ node, barycenter: nodeBarycenters[idx] }))
        .sort((a, b) => a.barycenter - b.barycenter)
        .map(item => item.node);
      
      sortedLayers.set(layer, sorted);
    }
  });
  
  return sortedLayers;
}

/**
 * Step 3: Assign X positions (horizontal)
 */
function assignXPositions(
  sortedLayers: Map<number, Node[]>,
  nodeSpacing: number
): Map<string, number> {
  const xPositions = new Map<string, number>();
  
  sortedLayers.forEach((nodes, layer) => {
    const totalWidth = (nodes.length - 1) * nodeSpacing;
    const startX = -totalWidth / 2;
    
    nodes.forEach((node, idx) => {
      xPositions.set(node.id, startX + idx * nodeSpacing);
    });
  });
  
  return xPositions;
}

/**
 * Step 4: Assign Y positions (vertical layers)
 */
function assignYPositions(
  sortedLayers: Map<number, Node[]>,
  layerSpacing: number
): Map<string, number> {
  const yPositions = new Map<string, number>();
  
  sortedLayers.forEach((nodes, layer) => {
    nodes.forEach(node => {
      yPositions.set(node.id, layer * layerSpacing);
    });
  });
  
  return yPositions;
}

/**
 * Step 5: Update node positions
 */
function updateNodePositions(
  nodes: Node[],
  xPositions: Map<string, number>,
  yPositions: Map<string, number>
): Node[] {
  return nodes.map(node => ({
    ...node,
    position: {
      x: xPositions.get(node.id) ?? node.position.x,
      y: yPositions.get(node.id) ?? node.position.y,
    },
  }));
}

/**
 * Find the root node (transaction or address with no incoming edges)
 */
export function findRootNode(nodes: Node[], edges: Edge[]): string | null {
  // Find nodes with no incoming edges
  const nodesWithIncoming = new Set(edges.map(e => e.target));
  const rootNodes = nodes.filter(n => !nodesWithIncoming.has(n.id));
  
  if (rootNodes.length === 0) {
    return nodes[0]?.id ?? null;
  }
  
  // Prefer transaction nodes as root
  const txRoot = rootNodes.find(n => n.type === 'transaction');
  if (txRoot) return txRoot.id;
  
  // Otherwise use first node
  return rootNodes[0].id;
}

