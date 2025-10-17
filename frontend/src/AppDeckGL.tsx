import { useState, useCallback, useEffect } from 'react';
import { SearchBar } from './components/SearchBar';
import { EntityPanel } from './components/EntityPanel';
import { StatsPanel } from './components/StatsPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { DeckGLGraph } from './components/DeckGLGraph';
import { traceFromAddress, traceFromUTXO } from './services/api';
import { buildDeckGLGraph, DeckGLNode, DeckGLEdge } from './utils/deckGLBuilder';
import './App.css';

const DEFAULT_ADDRESS = 'bc1qjgh5zfefhh2k2d2h3tss3d43kd3f3hntrksm63';
const DEFAULT_BACK_HOPS = 4;

function App() {
  const [nodes, setNodes] = useState<DeckGLNode[]>([]);
  const [edges, setEdges] = useState<DeckGLEdge[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // Handle trace from address
  const handleTraceAddress = useCallback(async (address: string, hopsBefore: number = 1, hopsAfter: number = 1) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const data = await traceFromAddress(address, hopsBefore);
      console.log('📦 Raw data from backend:', data);
      const { nodes: newNodes, edges: newEdges } = buildDeckGLGraph(data);
      console.log('🎨 Built deck.gl graph:', newNodes.length, 'nodes,', newEdges.length, 'edges');
      
      setNodes(newNodes);
      setEdges(newEdges);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trace address');
      console.error('Trace error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle trace from transaction
  const handleTraceTransaction = useCallback(async (txid: string, vout: number, hopsBefore: number = 1, hopsAfter: number = 1) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const data = await traceFromUTXO(txid, vout, hopsBefore, 0); // Only backward hops for now
      const { nodes: newNodes, edges: newEdges } = buildDeckGLGraph(data);
      
      setNodes(newNodes);
      setEdges(newEdges);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trace transaction');
      console.error('Trace error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle node click
  const handleNodeClick = useCallback((node: DeckGLNode) => {
    console.log('Node clicked:', node);
    // Convert to React Flow-like format for EntityPanel
    setSelectedEntity({
      id: node.id,
      type: node.type,
      data: {
        address: node.address,
        txid: node.txid,
        metadata: {
          address: node.address,
          txid: node.txid,
          is_change: node.isChange,
          cluster_id: node.clusterId,
          timestamp: node.timestamp,
        }
      }
    });
  }, []);

  // Auto-load default address on mount
  useEffect(() => {
    handleTraceAddress(DEFAULT_ADDRESS, DEFAULT_BACK_HOPS, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Handle expand node
  const handleExpandNode = useCallback(async (nodeId: string, direction?: 'inputs' | 'outputs') => {
    console.log('🚀 EXPAND:', nodeId, direction);
    console.log('Current nodes:', nodes.length);
    console.log('Current edges:', edges.length);
    setIsLoading(true);
    
    try {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) {
        console.error('❌ Node not found:', nodeId);
        return;
      }
      console.log('✅ Found node:', node.type, node.address || node.txid);
      
      // For addresses, expand to show connected TX
      if (node.type === 'address' && node.address) {
        const data = await traceFromAddress(node.address, 2); // +1 depth
        const { nodes: newNodes, edges: newEdges } = buildDeckGLGraph(data);
        
        // Merge with existing (only add new ones)
        const existingIds = new Set(nodes.map(n => n.id));
        const nodesToAdd = newNodes.filter(n => !existingIds.has(n.id));
        
        // Position new nodes relative to clicked node
        const offset = direction === 'inputs' ? -800 : 800;
        nodesToAdd.forEach((newNode, idx) => {
          newNode.x = node.x + offset;
          newNode.y = node.y + (idx * 120) - (nodesToAdd.length * 60);
        });
        
        const allNodes = [...nodes, ...nodesToAdd];
        setNodes(allNodes);
        
        // Rebuild ALL edges with updated positions
        const nodeMap = new Map(allNodes.map(n => [n.id, n]));
        const allEdges = [...edges, ...newEdges.filter(e => 
          nodeMap.has(e.source) && 
          nodeMap.has(e.target) &&
          !edges.some(existing => existing.source === e.source && existing.target === e.target)
        )];
        
        // Update edge positions
        const updatedEdges = allEdges.map(e => ({
          ...e,
          sourceX: nodeMap.get(e.source)?.x ?? e.sourceX,
          sourceY: nodeMap.get(e.source)?.y ?? e.sourceY,
          targetX: nodeMap.get(e.target)?.x ?? e.targetX,
          targetY: nodeMap.get(e.target)?.y ?? e.targetY,
        }));
        
        setEdges(updatedEdges);
      }
      
      // For transactions, expand to show connected addresses
      if (node.type === 'transaction' && node.txid) {
        const data = await traceFromUTXO(node.txid, 0, 2, 0); // +2 hops backward
        const { nodes: newNodes, edges: newEdges } = buildDeckGLGraph(data);
        
        // Merge with existing
        const existingIds = new Set(nodes.map(n => n.id));
        const nodesToAdd = newNodes.filter(n => !existingIds.has(n.id));
        
        // Position new addresses
        const offset = direction === 'inputs' ? -800 : 800;
        nodesToAdd.forEach((newNode, idx) => {
          newNode.x = node.x + offset;
          newNode.y = node.y + (idx * 120) - (nodesToAdd.length * 60);
        });
        
        const allNodes = [...nodes, ...nodesToAdd];
        console.log('➕ Address expand: adding', nodesToAdd.length, 'nodes. Total:', allNodes.length);
        setNodes(allNodes);
        
        // Rebuild ALL edges with updated positions
        const nodeMap = new Map(allNodes.map(n => [n.id, n]));
        const allEdges = [...edges, ...newEdges.filter(e => 
          nodeMap.has(e.source) && 
          nodeMap.has(e.target) &&
          !edges.some(existing => existing.source === e.source && existing.target === e.target)
        )];
        
        // Update edge positions
        const updatedEdges = allEdges.map(e => ({
          ...e,
          sourceX: nodeMap.get(e.source)?.x ?? e.sourceX,
          sourceY: nodeMap.get(e.source)?.y ?? e.sourceY,
          targetX: nodeMap.get(e.target)?.x ?? e.targetX,
          targetY: nodeMap.get(e.target)?.y ?? e.targetY,
        }));
        
        console.log('➕ Address expand: adding', updatedEdges.length - edges.length, 'edges. Total:', updatedEdges.length);
        setEdges(updatedEdges);
      }
      
      // For transactions
      if (node.type === 'transaction' && node.txid) {
        console.log('📦 Expanding transaction...');
        const data = await traceFromUTXO(node.txid, 0, 2, 0); // +2 hops backward
        console.log('Got data:', data);
        const { nodes: newNodes, edges: newEdges } = buildDeckGLGraph(data);
        
        const existingIds = new Set(nodes.map(n => n.id));
        const nodesToAdd = newNodes.filter(n => !existingIds.has(n.id));
        
        const offset = direction === 'inputs' ? -800 : 800;
        nodesToAdd.forEach((newNode, idx) => {
          newNode.x = node.x + offset;
          newNode.y = node.y + (idx * 120) - (nodesToAdd.length * 60);
        });
        
        const allNodes = [...nodes, ...nodesToAdd];
        console.log('➕ TX expand: adding', nodesToAdd.length, 'nodes. Total:', allNodes.length);
        setNodes(allNodes);
        
        const nodeMap = new Map(allNodes.map(n => [n.id, n]));
        const allEdges = [...edges, ...newEdges.filter(e => 
          nodeMap.has(e.source) && 
          nodeMap.has(e.target) &&
          !edges.some(existing => existing.source === e.source && existing.target === e.target)
        )];
        
        const updatedEdges = allEdges.map(e => ({
          ...e,
          sourceX: nodeMap.get(e.source)?.x ?? e.sourceX,
          sourceY: nodeMap.get(e.source)?.y ?? e.sourceY,
          targetX: nodeMap.get(e.target)?.x ?? e.targetX,
          targetY: nodeMap.get(e.target)?.y ?? e.targetY,
        }));
        
        console.log('➕ TX expand: adding', updatedEdges.length - edges.length, 'edges. Total:', updatedEdges.length);
        setEdges(updatedEdges);
      }
      
      console.log('✅ Expansion complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to expand');
      console.error('Expand error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [nodes, edges]);

  return (
    <div className="app">
      {/* Top Search Bar */}
      <SearchBar 
        onTraceAddress={handleTraceAddress} 
        onTraceTransaction={handleTraceTransaction}
        isLoading={isLoading}
        onOpenSettings={() => setShowSettings(true)}
      />
      
      {/* Main Graph Canvas */}
      <div className="graph-container">
        <DeckGLGraph
          nodes={nodes}
          edges={edges}
          onNodeClick={handleNodeClick}
          onExpandNode={handleExpandNode}
        />
        
        {/* Stats Overlay */}
        {nodes.length > 0 && (
          <div style={{
            position: 'absolute',
            bottom: '20px',
            left: '20px',
            zIndex: 10,
          }}>
            <StatsPanel
              totalNodes={nodes.length}
              totalEdges={edges.length}
              transactions={nodes.filter(n => n.type === 'transaction').length}
              addresses={nodes.filter(n => n.type === 'address').length}
            />
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div style={{
            position: 'absolute',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '16px 24px',
            background: 'rgba(244, 67, 54, 0.95)',
            border: '1px solid #f44336',
            borderRadius: '8px',
            color: '#fff',
            zIndex: 100,
            backdropFilter: 'blur(10px)',
          }}>
            ⚠️ {error}
            <button
              onClick={() => setError(null)}
              style={{
                marginLeft: '16px',
                padding: '4px 12px',
                background: 'rgba(255, 255, 255, 0.2)',
                border: 'none',
                borderRadius: '4px',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Loading Overlay */}
        {isLoading && (
          <div style={{
            position: 'absolute',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '16px 24px',
            background: 'rgba(26, 26, 26, 0.95)',
            border: '1px solid #333',
            borderRadius: '8px',
            color: '#fff',
            zIndex: 100,
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}>
            <div className="spinner" />
            <span>Loading blockchain data...</span>
          </div>
        )}
      </div>

      {/* Right Side Panel */}
      {selectedEntity && (
        <EntityPanel
          entity={selectedEntity}
          onClose={() => setSelectedEntity(null)}
          onExpand={() => handleExpandNode(selectedEntity.id)}
        />
      )}

      {/* Settings Panel */}
      {showSettings && (
        <SettingsPanel onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

export default App;

