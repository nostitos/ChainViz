import { Node, Edge } from '@xyflow/react';

interface TreeLayoutConfig {
  nodeSpacing: number;      // Spacing between nodes in the same layer
  layerSpacing: number;     // Spacing between layers
  direction: 'LR' | 'RL' | 'TB' | 'BT';   // Layout direction
}

/**
 * Build a tree layout with minimal edge crossings using the Sugiyama framework
 * and barycenter method for node ordering. Supports multiple directions.
 */
export function buildTreeLayout(
  nodes: Node[],
  edges: Edge[],
  rootNodeId: string,
  config: TreeLayoutConfig = {
    nodeSpacing: 200,
    layerSpacing: 300,
    direction: 'LR'
  }
): Node[] {
  console.log(`🌳 Building tree layout from root: ${rootNodeId}, direction: ${config.direction}`);

  // Step 1: Assign nodes to layers based on distance from root
  const { layers, nodeToLayer } = assignToLayers(nodes, edges, rootNodeId);
  console.log(`📊 Assigned nodes to ${layers.size} layers`);

  // Step 2: Sort nodes within each layer using barycenter method
  const sortedLayers = sortLayersByBarycenter(layers, edges, nodeToLayer);
  console.log(`🔄 Sorted layers to minimize crossings`);

  // Step 3: Assign positions based on direction
  const positions = assignPositions(sortedLayers, config);

  // Step 4: Update node positions
  const updatedNodes = updateNodePositions(nodes, positions);

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

    // Also check for parents (if graph is undirected or we want to capture upstream)
    // For strict tree, we usually only follow outgoing edges. 
    // But if we want to layout the whole component connected to root:
    edges
      .filter(e => e.target === nodeId)
      .forEach(e => {
        if (!visited.has(e.source)) {
          visited.add(e.source);
          // For upstream nodes, we could assign negative layers, 
          // but for simplicity in this BFS, we might treat them as "next" 
          // if we just want to spread them out. 
          // Ideally, we should use topological sort or longest path for DAGs.
          // Here we'll just push them to next layer to avoid overlap, 
          // effectively treating the graph as unrooted for layout purposes 
          // OR we could use -1 for parents if we want them to the left.
          // Let's stick to simple BFS for now, effectively making 'root' the center/start.
          queue.push([e.source, layer + 1]);
        }
      });
  }

  // Add any unvisited nodes to a separate layer (islands)
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
  const sortedLayerIndices = Array.from(layers.keys()).sort((a, b) => a - b);

  sortedLayerIndices.forEach((layer) => {
    const nodes = layers.get(layer)!;
    if (layer === sortedLayerIndices[0]) {
      // First layer - keep original order or sort by ID
      sortedLayers.set(layer, nodes.sort((a, b) => a.id.localeCompare(b.id)));
    } else {
      // Calculate barycenter for each node based on connections to previous layer
      const prevLayer = layer - 1; // Simplified: assumes layers are sequential
      // Ideally we check connections to ALL previous processed layers

      const nodeBarycenters = nodes.map(node => {
        // Find neighbors in previous layers (already sorted)
        const neighbors = edges
          .filter(e => e.target === node.id || e.source === node.id)
          .map(e => e.target === node.id ? e.source : e.target)
          .filter(id => (nodeToLayer.get(id) ?? -1) < layer);

        if (neighbors.length === 0) return 0;

        const sum = neighbors.reduce((acc, neighborId) => {
          // Find position of neighbor in its layer
          const neighborLayerIdx = nodeToLayer.get(neighborId)!;
          const neighborLayerNodes = sortedLayers.get(neighborLayerIdx) || layers.get(neighborLayerIdx);
          if (!neighborLayerNodes) return acc;

          const index = neighborLayerNodes.findIndex(n => n.id === neighborId);
          return acc + (index >= 0 ? index : 0);
        }, 0);

        return sum / neighbors.length;
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
 * Step 3: Assign positions based on direction
 */
function assignPositions(
  sortedLayers: Map<number, Node[]>,
  config: TreeLayoutConfig
): Map<string, { x: number, y: number }> {
  const positions = new Map<string, { x: number, y: number }>();
  const isHorizontal = config.direction === 'LR' || config.direction === 'RL';

  sortedLayers.forEach((nodes, layer) => {
    // Calculate layout coordinate (X for horizontal, Y for vertical) based on layer index
    const layerCoordinate = layer * config.layerSpacing;

    // Calculate cross coordinate (Y for horizontal, X for vertical) based on node index
    const totalCrossSize = (nodes.length - 1) * config.nodeSpacing;
    const startCross = -totalCrossSize / 2;

    nodes.forEach((node, idx) => {
      const crossCoordinate = startCross + idx * config.nodeSpacing;

      let x = 0, y = 0;

      switch (config.direction) {
        case 'LR':
          x = layerCoordinate;
          y = crossCoordinate;
          break;
        case 'RL':
          x = -layerCoordinate;
          y = crossCoordinate;
          break;
        case 'TB':
          x = crossCoordinate;
          y = layerCoordinate;
          break;
        case 'BT':
          x = crossCoordinate;
          y = -layerCoordinate;
          break;
      }

      positions.set(node.id, { x, y });
    });
  });

  return positions;
}

/**
 * Step 4: Update node positions
 */
function updateNodePositions(
  nodes: Node[],
  positions: Map<string, { x: number, y: number }>
): Node[] {
  return nodes.map(node => {
    const pos = positions.get(node.id);
    if (!pos) return node;

    return {
      ...node,
      position: {
        x: pos.x,
        y: pos.y,
      },
    };
  });
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

