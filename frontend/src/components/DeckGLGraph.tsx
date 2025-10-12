import { useEffect, useRef, useState, useCallback } from 'react';
import { DeckGL } from '@deck.gl/react';
import { ScatterplotLayer, LineLayer, TextLayer } from '@deck.gl/layers';
import { OrthographicView } from '@deck.gl/core';
import type { PickingInfo, Layer } from '@deck.gl/core';
import * as d3 from 'd3-force';

interface GraphNode {
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

interface GraphEdge {
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

interface DeckGLGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeClick?: (node: GraphNode) => void;
  onNodeHover?: (node: GraphNode | null) => void;
  onExpandNode?: (nodeId: string, direction: 'inputs' | 'outputs') => void;
}

const INITIAL_VIEW_STATE = {
  target: [0, 0, 0],
  zoom: 0,
  minZoom: -10,
  maxZoom: 10,
};

const VIEWS = [
  new OrthographicView({
    id: 'ortho',
    controller: {
      dragPan: true,
      dragRotate: false,
      scrollZoom: true,
      doubleClickZoom: false,
      touchRotate: false,
    },
  })
];

export function DeckGLGraph({ 
  nodes, 
  edges, 
  onNodeClick, 
  onNodeHover,
  onExpandNode 
}: DeckGLGraphProps) {
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [showExpandMenu, setShowExpandMenu] = useState<{
    x: number;
    y: number;
    nodeId: string;
    direction: 'inputs' | 'outputs';
    count: number;
  } | null>(null);
  const simulationRef = useRef<d3.Simulation<any, any> | null>(null);
  const [physicsNodes, setPhysicsNodes] = useState<GraphNode[]>(nodes);
  const [updatedEdges, setUpdatedEdges] = useState<GraphEdge[]>(edges);

  // Apply D3 force physics for bouncy collision detection
  useEffect(() => {
    if (nodes.length === 0) return;

    const simNodes = nodes.map(n => ({
      id: n.id,
      x: n.x,
      y: n.y,
      vx: 0,
      vy: 0,
    }));

    if (simulationRef.current) {
      simulationRef.current.nodes(simNodes);
      simulationRef.current.alpha(0.3).restart();
    } else {
      const simulation = d3
        .forceSimulation(simNodes)
        .force('collision', d3.forceCollide()
          .radius(80)
          .strength(0.7)
          .iterations(3))
        .alphaDecay(0.005)
        .velocityDecay(0.2);

      simulation.on('tick', () => {
        const updated = nodes.map((node) => {
          const simNode = simNodes.find(n => n.id === node.id) as any;
          if (simNode) {
            return {
              ...node,
              x: simNode.x,
              y: simNode.y,
            };
          }
          return node;
        });
        setPhysicsNodes(updated);
        
        // Update edge positions to match node positions
        const nodeMap = new Map(updated.map(n => [n.id, n]));
        setUpdatedEdges(edges.map(e => ({
          ...e,
          sourceX: nodeMap.get(e.source)?.x ?? e.sourceX,
          sourceY: nodeMap.get(e.source)?.y ?? e.sourceY,
          targetX: nodeMap.get(e.target)?.x ?? e.targetX,
          targetY: nodeMap.get(e.target)?.y ?? e.targetY,
        })));
      });

      simulationRef.current = simulation;
    }

    return () => {
      if (simulationRef.current) {
        simulationRef.current.stop();
      }
    };
  }, [nodes]);

  // Handle node click
  const handleClick = useCallback((info: PickingInfo) => {
    // Check if clicking on LEFT expand button
    if (info.layer?.id === 'expand-buttons-left' && info.object) {
      const node = info.object as GraphNode;
      console.log('🔵 Clicked LEFT expand for:', node.id);
      if (onExpandNode) {
        onExpandNode(node.id, 'inputs');
      }
      return;
    }
    
    // Check if clicking on RIGHT expand button
    if (info.layer?.id === 'expand-buttons-right' && info.object) {
      const node = info.object as GraphNode;
      console.log('🔵 Clicked RIGHT expand for:', node.id);
      if (onExpandNode) {
        onExpandNode(node.id, 'outputs');
      }
      return;
    }
    
    // Regular node click
    if (info.object && info.layer?.id === 'nodes-layer') {
      const node = info.object as GraphNode;
      setSelectedNode(node.id);
      if (onNodeClick) {
        onNodeClick(node);
      }
    }
  }, [onNodeClick, onExpandNode]);

  // Handle node hover
  const handleHover = useCallback((info: PickingInfo) => {
    if (info.object && info.layer?.id === 'nodes-layer') {
      const node = info.object as GraphNode;
      setHoveredNode(node.id);
      if (onNodeHover) {
        onNodeHover(node);
      }
    } else {
      setHoveredNode(null);
      if (onNodeHover) {
        onNodeHover(null);
      }
    }
  }, [onNodeHover]);

  // Helper: calculate arrow head position (80% along the line, before target node)
  const getArrowPosition = (edge: GraphEdge): [number, number, number] => {
    const t = 0.8; // 80% along the line
    const x = edge.sourceX + (edge.targetX - edge.sourceX) * t;
    const y = edge.sourceY + (edge.targetY - edge.sourceY) * t;
    return [x, y, 0.5];
  };

  // Build layers
  const layers: Layer[] = [
    // Edges Layer (forward connections)
    new LineLayer({
      id: 'edges-layer',
      data: updatedEdges.filter(e => !e.isBackward),
      getSourcePosition: (d: GraphEdge) => [d.sourceX, d.sourceY, 0],
      getTargetPosition: (d: GraphEdge) => [d.targetX, d.targetY, 0],
      getColor: (d: GraphEdge) => {
        const conf = d.confidence ?? 1.0;
        if (conf >= 0.8) return [76, 175, 80]; // Green
        if (conf < 0.5) return [255, 152, 0]; // Orange
        return [100, 181, 246]; // Blue
      },
      getWidth: (d: GraphEdge) => 2 + (d.confidence ?? 1.0) * 2,
      widthUnits: 'pixels',
    }),
    
    // Arrow heads for forward edges
    new TextLayer({
      id: 'arrows-forward',
      data: updatedEdges.filter(e => !e.isBackward),
      getPosition: getArrowPosition,
      getText: () => '▶',
      getSize: 16,
      getColor: (d: GraphEdge) => {
        const conf = d.confidence ?? 1.0;
        if (conf >= 0.8) return [76, 175, 80];
        if (conf < 0.5) return [255, 152, 0];
        return [100, 181, 246];
      },
      getAngle: (d: GraphEdge) => {
        const dx = d.targetX - d.sourceX;
        const dy = d.targetY - d.sourceY;
        return (Math.atan2(dy, dx) * 180) / Math.PI;
      },
      fontWeight: 900,
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'center',
    }),
    
    // Backward edges
    new LineLayer({
      id: 'backward-edges-layer',
      data: updatedEdges.filter(e => e.isBackward),
      getSourcePosition: (d: GraphEdge) => [d.sourceX, d.sourceY, 0],
      getTargetPosition: (d: GraphEdge) => [d.targetX, d.targetY, 0],
      getColor: (d: GraphEdge) => {
        const conf = d.confidence ?? 1.0;
        if (conf >= 0.8) return [76, 175, 80, 200];
        if (conf < 0.5) return [255, 152, 0, 200];
        return [100, 181, 246, 200];
      },
      getWidth: (d: GraphEdge) => 3 + (d.confidence ?? 1.0) * 2,
      widthUnits: 'pixels',
    }),
    
    // Arrow heads for backward edges
    new TextLayer({
      id: 'arrows-backward',
      data: updatedEdges.filter(e => e.isBackward),
      getPosition: getArrowPosition,
      getText: () => '▶',
      getSize: 16,
      getColor: (d: GraphEdge) => {
        const conf = d.confidence ?? 1.0;
        if (conf >= 0.8) return [76, 175, 80, 200];
        if (conf < 0.5) return [255, 152, 0, 200];
        return [100, 181, 246, 200];
      },
      getAngle: (d: GraphEdge) => {
        const dx = d.targetX - d.sourceX;
        const dy = d.targetY - d.sourceY;
        return (Math.atan2(dy, dx) * 180) / Math.PI;
      },
      fontWeight: 900,
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'center',
    }),
    
    // Edge labels (BTC amounts)
    new TextLayer({
      id: 'edge-labels',
      data: updatedEdges.filter(e => e.amount),
      getPosition: (d: GraphEdge) => [
        (d.sourceX + d.targetX) / 2,
        (d.sourceY + d.targetY) / 2,
        0
      ],
      getText: (d: GraphEdge) => `${((d.amount ?? 0) / 100000000).toFixed(8)} BTC`,
      getSize: 12,
      getColor: [255, 255, 255],
      getBackgroundColor: [26, 26, 26, 230],
      background: true,
      backgroundPadding: [4, 2],
      fontFamily: 'Monaco, Courier New, monospace',
      fontWeight: 700,
    }),
    
    // Nodes Layer (circles)
    new ScatterplotLayer({
      id: 'nodes-layer',
      data: physicsNodes,
      getPosition: (d: GraphNode) => [d.x, d.y, 0],
      getRadius: (d: GraphNode) => (d.type === 'transaction' ? 40 : 35),
      getFillColor: (d: GraphNode) => {
        if (d.id === selectedNode) {
          return d.type === 'transaction' ? [0, 229, 255] : [255, 183, 77];
        }
        if (d.id === hoveredNode) {
          return d.type === 'transaction' ? [0, 220, 255] : [255, 200, 100];
        }
        if (d.isChange) {
          return [255, 167, 38]; // Orange for change
        }
        return d.type === 'transaction' ? [0, 188, 212] : [255, 152, 0];
      },
      getLineColor: (d: GraphNode) => {
        if (d.id === selectedNode) return [255, 255, 255];
        return [255, 255, 255, 100];
      },
      lineWidthMinPixels: 2,
      stroked: true,
      filled: true,
      radiusUnits: 'pixels',
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 100],
    }),
    
    // Node labels (trimmed addresses/txids) - positioned BELOW nodes
    new TextLayer({
      id: 'node-labels',
      data: physicsNodes,
      getPosition: (d: GraphNode) => [d.x, d.y + 50, 0], // 50px below circle
      getText: (d: GraphNode) => {
        const text = d.address || d.txid || d.label;
        if (text.length > 12) {
          return `${text.substring(0, 6)}...${text.substring(text.length - 6)}`;
        }
        return text;
      },
      getSize: 11,
      getColor: [255, 255, 255],
      fontFamily: 'Monaco, Courier New, monospace',
      fontWeight: 600,
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'top',
    }),
    
    // Expand buttons - only show for HOVERED node
    ...(hoveredNode ? [
      // LEFT expand button (circle + arrow)
      new ScatterplotLayer({
        id: 'expand-buttons-left',
        data: physicsNodes.filter(n => n.id === hoveredNode),
        getPosition: (d: GraphNode) => [d.x - 70, d.y, 1],
        getRadius: 20,
        getFillColor: [100, 181, 246, 255],
        getLineColor: [255, 255, 255],
        lineWidthMinPixels: 2,
        stroked: true,
        filled: true,
        radiusUnits: 'pixels',
        pickable: true,
      }),
      
      new TextLayer({
        id: 'expand-text-left',
        data: physicsNodes.filter(n => n.id === hoveredNode),
        getPosition: (d: GraphNode) => [d.x - 70, d.y, 2],
        getText: () => '◀',
        getSize: 18,
        getColor: [255, 255, 255],
        fontWeight: 900,
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'center',
      }),
      
      // RIGHT expand button (circle + arrow)
      new ScatterplotLayer({
        id: 'expand-buttons-right',
        data: physicsNodes.filter(n => n.id === hoveredNode),
        getPosition: (d: GraphNode) => [d.x + 70, d.y, 1],
        getRadius: 20,
        getFillColor: [100, 181, 246, 255],
        getLineColor: [255, 255, 255],
        lineWidthMinPixels: 2,
        stroked: true,
        filled: true,
        radiusUnits: 'pixels',
        pickable: true,
      }),
      
      new TextLayer({
        id: 'expand-text-right',
        data: physicsNodes.filter(n => n.id === hoveredNode),
        getPosition: (d: GraphNode) => [d.x + 70, d.y, 2],
        getText: () => '▶',
        getSize: 18,
        getColor: [255, 255, 255],
        fontWeight: 900,
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'center',
      }),
    ] : []),
  ];

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <DeckGL
        views={VIEWS}
        initialViewState={viewState}
        controller={true}
        layers={layers}
        onClick={handleClick}
        onHover={handleHover}
        getCursor={({ isHovering }) => (isHovering ? 'pointer' : 'grab')}
        parameters={{
          clearColor: [0.06, 0.06, 0.06, 1]
        }}
        glOptions={{
          preserveDrawingBuffer: true,
        }}
      />
      
      {/* Expansion Selection Menu */}
      {showExpandMenu && (
        <div
          style={{
            position: 'absolute',
            left: showExpandMenu.x,
            top: showExpandMenu.y,
            background: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: '8px',
            padding: '12px',
            zIndex: 1000,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
          }}
        >
          <div style={{ color: '#fff', fontSize: '13px', marginBottom: '8px' }}>
            Expand {showExpandMenu.direction} ({showExpandMenu.count} nodes)?
          </div>
          <button
            onClick={() => {
              if (onExpandNode) {
                onExpandNode(showExpandMenu.nodeId, showExpandMenu.direction);
              }
              setShowExpandMenu(null);
            }}
            style={{
              width: '100%',
              padding: '8px',
              background: '#00bcd4',
              border: 'none',
              borderRadius: '6px',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Expand All
          </button>
          <button
            onClick={() => setShowExpandMenu(null)}
            style={{
              width: '100%',
              padding: '8px',
              marginTop: '6px',
              background: '#333',
              border: '1px solid #444',
              borderRadius: '6px',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

