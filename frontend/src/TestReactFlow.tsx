import { useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

function TestReactFlowContent() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const addNodes = () => {
    setNodes([
      { id: '1', position: { x: 100, y: 100 }, data: { label: 'Node 1' }, type: 'default' },
      { id: '2', position: { x: 300, y: 100 }, data: { label: 'Node 2' }, type: 'default' },
      { id: '3', position: { x: 500, y: 100 }, data: { label: 'Node 3' }, type: 'default' },
    ]);
    setEdges([
      { id: 'e1-2', source: '1', target: '2' },
      { id: 'e2-3', source: '2', target: '3' },
    ]);
  };

  const clearNodes = () => {
    setNodes([]);
    setEdges([]);
  };

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0a0a0a', color: 'white' }}>
      <div style={{ 
        position: 'absolute', 
        top: 10, 
        left: 10, 
        zIndex: 10,
        background: 'rgba(0, 0, 0, 0.9)',
        padding: '20px',
        borderRadius: '8px',
        border: '1px solid #333'
      }}>
        <h2>🔍 React Flow CPU Test</h2>
        <p><strong>Nodes:</strong> {nodes.length} | <strong>Edges:</strong> {edges.length}</p>
        
        <div style={{ marginTop: '10px' }}>
          <button 
            onClick={addNodes}
            style={{ padding: '10px 20px', background: '#00bcd4', border: 'none', borderRadius: '8px', color: 'white', fontWeight: 600, cursor: 'pointer', margin: '5px' }}
          >
            Add 3 Nodes
          </button>
          <button 
            onClick={clearNodes}
            style={{ padding: '10px 20px', background: '#f44336', border: 'none', borderRadius: '8px', color: 'white', fontWeight: 600, cursor: 'pointer', margin: '5px' }}
          >
            Clear
          </button>
        </div>

        <div style={{ marginTop: '20px', padding: '15px', background: '#1a1a1a', borderRadius: '8px' }}>
          <h4>Test Instructions:</h4>
          <p>1. Open Chrome DevTools → Performance tab</p>
          <p>2. Start recording</p>
          <p>3. Wait 5 seconds (don't touch anything)</p>
          <p>4. Stop recording</p>
          <p>5. Check if CPU is high even when idle</p>
        </div>
      </div>

      <div style={{ width: '100%', height: '100%' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
          minZoom={0.1}
          maxZoom={2}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#333" />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}

export default function TestReactFlow() {
  return (
    <ReactFlowProvider>
      <TestReactFlowContent />
    </ReactFlowProvider>
  );
}







