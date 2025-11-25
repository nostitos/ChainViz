import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';

// Mimic SearchBar component
const TestSearchBar = memo(function TestSearchBar({ onSearch, value, onChange }: any) {
  const [history, setHistory] = useState<string[]>([]);
  
  useEffect(() => {
    const saved = localStorage.getItem('test_history');
    if (saved) {
      setHistory(JSON.parse(saved));
    }
  }, []);

  return (
    <div style={{ background: '#1a1a1a', padding: '20px', borderBottom: '1px solid #333' }}>
      <h2>🔍 Heavy React Test (No React Flow)</h2>
      <input 
        type="text" 
        value={value} 
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type something..."
        style={{ padding: '10px', width: '300px', background: '#2a2a2a', border: '1px solid #333', borderRadius: '8px', color: 'white', margin: '5px' }}
      />
      <button onClick={onSearch} style={{ padding: '10px 20px', background: '#00bcd4', border: 'none', borderRadius: '8px', color: 'white', fontWeight: 600, cursor: 'pointer', margin: '5px' }}>
        Search
      </button>
      <p>History: {history.length} items</p>
    </div>
  );
});

// Mimic StatsPanel component
const TestStatsPanel = memo(function TestStatsPanel({ nodes, edges }: any) {
  return (
    <div style={{ position: 'absolute', top: '80px', right: '20px', background: 'rgba(26, 26, 26, 0.95)', padding: '15px', borderRadius: '8px', border: '1px solid #333' }}>
      <h3>Stats</h3>
      <p>Nodes: {nodes}</p>
      <p>Edges: {edges}</p>
    </div>
  );
});

// Main Test App - mimics our actual app structure
export default function TestReactHeavy() {
  const [input, setInput] = useState('');
  const [nodes, setNodes] = useState<number[]>([]);
  const [edges, setEdges] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<number | null>(null);
  const [expandedNodes, setExpandedNodes] = useState(new Set<number>());
  
  const nodesRef = useRef(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  const handleSearch = useCallback(() => {
    setIsLoading(true);
    setTimeout(() => {
      setNodes([1, 2, 3, 4, 5]);
      setEdges([1, 2, 3, 4]);
      setIsLoading(false);
    }, 100);
  }, []);

  const handleExpand = useCallback((nodeId: number) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      next.add(nodeId);
      return next;
    });
  }, []);

  const statsData = useMemo(() => ({
    nodes: nodes.length,
    edges: edges.length,
  }), [nodes.length, edges.length]);

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0a0a0a', color: 'white' }}>
      <TestSearchBar 
        onSearch={handleSearch}
        value={input}
        onChange={setInput}
      />
      
      <TestStatsPanel 
        nodes={statsData.nodes}
        edges={statsData.edges}
      />

      <div style={{ padding: '20px', marginTop: '80px' }}>
        <h3>Canvas Area (Empty - No React Flow)</h3>
        <p>Loading: {isLoading ? 'Yes' : 'No'}</p>
        <p>Expanded nodes: {expandedNodes.size}</p>
        
        <div style={{ marginTop: '20px' }}>
          <button onClick={handleSearch} style={{ padding: '10px 20px', background: '#00bcd4', border: 'none', borderRadius: '8px', color: 'white', fontWeight: 600, cursor: 'pointer', margin: '5px' }}>
            Simulate Load
          </button>
          <button onClick={() => handleExpand(Math.random())} style={{ padding: '10px 20px', background: '#00bcd4', border: 'none', borderRadius: '8px', color: 'white', fontWeight: 600, cursor: 'pointer', margin: '5px' }}>
            Simulate Expand
          </button>
          <button onClick={() => {
            setNodes([]);
            setEdges([]);
            setExpandedNodes(new Set());
          }} style={{ padding: '10px 20px', background: '#00bcd4', border: 'none', borderRadius: '8px', color: 'white', fontWeight: 600, cursor: 'pointer', margin: '5px' }}>
            Clear
          </button>
        </div>
        
        <div style={{ marginTop: '40px', padding: '20px', background: '#1a1a1a', borderRadius: '8px' }}>
          <h4>Instructions:</h4>
          <p>1. Check CPU usage in Chrome DevTools Performance tab</p>
          <p>2. With empty state, CPU should be near 0%</p>
          <p>3. Click buttons to test state updates</p>
          <p>4. If CPU is low here but high in main app, React Flow is the culprit</p>
        </div>
      </div>
    </div>
  );
}







