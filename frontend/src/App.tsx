import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  Panel,
  BackgroundVariant,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { TransactionNode } from './components/nodes/TransactionNode';
import { AddressNode } from './components/nodes/AddressNode';
import { AddressClusterNode } from './components/nodes/AddressClusterNode';
import { TransactionClusterNode } from './components/nodes/TransactionClusterNode';
import { LoadMoreNode } from './components/nodes/LoadMoreNode';
import { BezierEdge } from './components/edges/BezierEdge';
import { SearchBar } from './components/SearchBar';
import { EntityPanel } from './components/EntityPanel';
import { StatsPanel } from './components/StatsPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { AboutPanel } from './components/AboutPanel';
import { PerformanceMonitor } from './components/PerformanceMonitor';
import { EdgeLegend } from './components/EdgeLegend';
import { ProgressLogger } from './components/ProgressLogger';
import { traceFromAddress, traceFromUTXO, traceFromAddressWithStats, traceFromUTXOWithStats } from './services/api';
import { buildGraphFromTraceDataBipartite, optimizeNodePositions } from './utils/graphBuilderBipartite';
import { buildTreeLayout, findRootNode } from './utils/treeLayout';
import { expandTransactionNode, expandAddressNode, expandAddressNodeWithFetch } from './utils/expansionHelpers';
import { useForceLayout } from './hooks/useForceLayout';
import { useEdgeTension } from './hooks/useEdgeTension';
import './App.css';

const nodeTypes = {
  transaction: TransactionNode,
  address: AddressNode,
  addressCluster: AddressClusterNode,
  transactionCluster: TransactionClusterNode,
  loadMore: LoadMoreNode,
};

const edgeTypes = {
  default: BezierEdge,
};

function AppContent() {
  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);
  const [selectedEntity, setSelectedEntity] = useState<Node | null>(null);
  const [isPanMode, setIsPanMode] = useState(true);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [mouseMode, setMouseMode] = useState<'pan' | 'select'>('pan');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [edgeAnimation, setEdgeAnimation] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [edgeScaleMax, setEdgeScaleMax] = useState(() => {
    const saved = localStorage.getItem('edgeScaleMax');
    return saved ? parseFloat(saved) : 10;
  }); // BTC amount for 70% max width
  const [isOptimizing, setIsOptimizing] = useState(false);
  
  // Load settings from cookies with defaults
  const getCookie = (name: string, defaultValue: number): number => {
    const value = document.cookie
      .split('; ')
      .find(row => row.startsWith(`${name}=`))
      ?.split('=')[1];
    return value ? parseInt(value, 10) : defaultValue;
  };

  const setCookie = (name: string, value: number) => {
    document.cookie = `${name}=${value}; max-age=31536000; path=/`; // 1 year
  };
  
  const getCookieBool = (name: string, defaultValue: boolean): boolean => {
    const value = document.cookie
      .split('; ')
      .find(row => row.startsWith(`${name}=`))
      ?.split('=')[1];
    return value ? value === 'true' : defaultValue;
  };

  const setCookieBool = (name: string, value: boolean) => {
    document.cookie = `${name}=${value}; max-age=31536000; path=/`; // 1 year
  };

  const [forceRepulsionEnabled, setForceRepulsionEnabled] = useState(getCookieBool('forceRepulsionEnabled', true)); // Load from cookie
  const [treeLayoutEnabled, setTreeLayoutEnabled] = useState(getCookieBool('treeLayoutEnabled', false)); // Load from cookie
  const [edgeTensionEnabled, setEdgeTensionEnabled] = useState(getCookieBool('edgeTensionEnabled', false)); // Load from cookie
  const [balanceFetchingEnabled, setBalanceFetchingEnabled] = useState(getCookieBool('balanceFetchingEnabled', true)); // Load from cookie

  const [maxOutputs, setMaxOutputs] = useState(getCookie('maxOutputs', 400));
  const [maxTransactions, setMaxTransactions] = useState(getCookie('maxTransactions', 400));
  const [clusterThreshold, setClusterThreshold] = useState(getCookie('clusterThreshold', 100));

  // Save to cookies when values change
  const handleMaxOutputsChange = (value: number) => {
    setMaxOutputs(value);
    setCookie('maxOutputs', value);
  };

  const handleMaxTransactionsChange = (value: number) => {
    setMaxTransactions(value);
    setCookie('maxTransactions', value);
  };

  const handleClusterThresholdChange = (value: number) => {
    setClusterThreshold(value);
    setCookie('clusterThreshold', value);
  };

  const handleBalanceFetchingChange = (enabled: boolean) => {
    setBalanceFetchingEnabled(enabled);
    setCookieBool('balanceFetchingEnabled', enabled);
  };
  
  // Progress tracking
  const [progressLogs, setProgressLogs] = useState<Array<{ timestamp: number; type: 'info' | 'success' | 'error' | 'electrum'; message: string }>>([]);
  const [currentProgress, setCurrentProgress] = useState<{ current: number; total: number; step: string } | undefined>();
  const [hopStats, setHopStats] = useState<Array<{ hop: number; requestCount: number; totalBytes: number }>>([]);
  
  // Helper to add progress log
  const addLog = useCallback((type: 'info' | 'success' | 'error' | 'electrum', message: string) => {
    setProgressLogs(prev => [...prev, { timestamp: Date.now(), type, message }]);
  }, []);
  
  // Helper to track network request
  const trackRequest = useCallback((hop: number, bytes: number) => {
    setHopStats(prev => {
      const existing = prev.find(s => s.hop === hop);
      if (existing) {
        return prev.map(s => s.hop === hop ? { ...s, requestCount: s.requestCount + 1, totalBytes: s.totalBytes + bytes } : s);
      }
      return [...prev, { hop, requestCount: 1, totalBytes: bytes }];
    });
  }, []);
  
  // Auto-load from URL query parameter on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const query = params.get('q');
    if (query && !isLoading && nodes.length === 0) {
      // Auto-load on mount if URL has query parameter
      // Default to 1 hop in both directions
      console.log('Loading from URL parameter:', query);
      if (/^[0-9a-fA-F]{64}$/.test(query)) {
        handleTraceTransaction(query, 0, 1, 1); // vout=0, hopsBefore=1, hopsAfter=1
      } else {
        handleTraceAddress(query, 1, 1); // hopsBefore=1, hopsAfter=1
      }
    }
  }, []); // Run once on mount
  
  // Update all edges when animation setting changes
  useEffect(() => {
    setEdges((eds) => eds.map(edge => ({
      ...edge,
      animated: edgeAnimation,
    })));
  }, [edgeAnimation, setEdges]);

  // Recalculate edge widths when edgeScaleMax changes
  useEffect(() => {
    setEdges((eds) => {
      const minAmountSats = 100000; // 0.001 BTC
      const scaleMaxSats = edgeScaleMax * 100000000; // Convert BTC to satoshis
      const sqrtBase = Math.sqrt(scaleMaxSats / minAmountSats);
      
      return eds.map(edge => {
        const amount = edge.data?.amount || 0;
        let strokeWidth = 2;
        if (amount > minAmountSats) {
          const sqrtValue = Math.sqrt(amount / minAmountSats) / sqrtBase;
          strokeWidth = 2 + (sqrtValue * 68); // 2px base + up to 68px (70% of 100px)
        }
        
        return {
          ...edge,
          style: {
            ...edge.style,
            strokeWidth: strokeWidth,
          },
        };
      });
    });
  }, [edgeScaleMax, setEdges]);
  const [history, setHistory] = useState<Array<{nodes: Node[], edges: Edge[]}>>([]);
  const MAX_HISTORY_SIZE = 10; // Limit history to prevent memory leaks
  const { fitView, getViewport, project } = useReactFlow();
  const forceLayoutRef = useRef<{ reheatSimulation: () => void } | null>(null);
  const addedNodesRef = useRef<Node[] | null>(null);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedEntity(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedEntity(null);
  }, []);
  
  // Undo to previous state
  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setNodes(prev.nodes);
    setEdges(prev.edges);
    setHistory(h => h.slice(0, -1));
    setExpandedNodes(new Set());
  }, [history, setNodes, setEdges]);
  
  // Save graph to JSON file
  const handleSaveGraph = useCallback(() => {
    // Prompt user for filename
    const defaultFilename = `chainviz-graph-${new Date().toISOString().split('T')[0]}`;
    const userFilename = prompt('Enter filename for the graph:', defaultFilename);
    
    // If user cancels, don't save
    if (userFilename === null) return;
    
    // Ensure filename has .json extension
    const filename = userFilename.trim().endsWith('.json') 
      ? userFilename.trim() 
      : `${userFilename.trim()}.json`;
    
    const graphData = {
      nodes,
      edges,
      timestamp: new Date().toISOString(),
      version: '1.0',
    };
    
    const blob = new Blob([JSON.stringify(graphData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [nodes, edges]);
  
  // Restore graph from JSON file
  const handleRestoreGraph = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const graphData = JSON.parse(e.target?.result as string);
        if (graphData.nodes && graphData.edges) {
          // Save current state to history
          setHistory(prev => {
            const newHistory = [...prev, { nodes, edges }];
            // Limit history size to prevent memory leaks
            return newHistory.slice(-MAX_HISTORY_SIZE);
          });
          
          // Restore saved graph (onExpand will be re-attached in useEffect)
          setNodes(graphData.nodes);
          setEdges(graphData.edges.map((edge: Edge) => ({
            ...edge,
            animated: edgeAnimation,
          })));
          setExpandedNodes(new Set());
        }
      } catch (error) {
        console.error('Failed to restore graph:', error);
        alert('Failed to restore graph. Invalid file format.');
      }
    };
    reader.readAsText(file);
  }, [nodes, edges, setNodes, setEdges, edgeAnimation]);

  // Trigger re-render when nodes are dragged to reactivate collision detection
  const onNodeDragStop = useCallback(() => {
    // Reheat the force simulation after manual drag
    if (forceLayoutRef.current?.reheatSimulation) {
      forceLayoutRef.current.reheatSimulation();
    }
  }, []);

  // Helper to check if nodes are visible in current viewport (memoized for performance)
  const areNodesVisible = useCallback((nodesToCheck: Node[]) => {
    if (nodesToCheck.length === 0) return true;
    
    try {
      const viewport = getViewport();
      const viewportWidth = window.innerWidth / viewport.zoom;
      const viewportHeight = window.innerHeight / viewport.zoom;
      const viewportLeft = -viewport.x / viewport.zoom;
      const viewportTop = -viewport.y / viewport.zoom;
      const viewportRight = viewportLeft + viewportWidth;
      const viewportBottom = viewportTop + viewportHeight;
      
      // Check if ALL new nodes are within viewport
      return nodesToCheck.every(node => {
        const nodeRight = node.position.x + 200; // approximate node width
        const nodeBottom = node.position.y + 100; // approximate node height
        
        return (
          node.position.x >= viewportLeft &&
          nodeRight <= viewportRight &&
          node.position.y >= viewportTop &&
          nodeBottom <= viewportBottom
        );
      });
    } catch (err) {
      // If viewport check fails, assume nodes are visible
      console.warn('Viewport check failed:', err);
      return true;
    }
  }, [getViewport]);

  // Helper to get IDs of nodes visible in current viewport
  const getVisibleNodeIds = useCallback((nodesToCheck: Node[]): Set<string> => {
    if (nodesToCheck.length === 0) return new Set();
    
    try {
      const viewport = getViewport();
      const viewportWidth = window.innerWidth / viewport.zoom;
      const viewportHeight = window.innerHeight / viewport.zoom;
      const viewportLeft = -viewport.x / viewport.zoom;
      const viewportTop = -viewport.y / viewport.zoom;
      const viewportRight = viewportLeft + viewportWidth;
      const viewportBottom = viewportTop + viewportHeight;
      
      const visibleIds = new Set<string>();
      
      nodesToCheck.forEach(node => {
        const nodeRight = node.position.x + 200; // approximate node width
        const nodeBottom = node.position.y + 100; // approximate node height
        
        const isVisible = (
          node.position.x >= viewportLeft &&
          nodeRight <= viewportRight &&
          node.position.y >= viewportTop &&
          nodeBottom <= viewportBottom
        );
        
        if (isVisible) {
          visibleIds.add(node.id);
        }
      });
      
      return visibleIds;
    } catch (err) {
      // If viewport check fails, return all node IDs
      console.warn('Viewport check failed:', err);
      return new Set(nodesToCheck.map(n => n.id));
    }
  }, [getViewport]);

  // Handle optimize layout
  const handleOptimizeLayout = useCallback(() => {
    console.log('🎯 User clicked Optimize Layout');
    setIsOptimizing(true);
    
    setNodes((nds) => {
      console.log(`📐 Optimizing ${nds.length} nodes with ${edges.length} edges`);
      const optimized = optimizeNodePositions(nds, edges);
      
      // Save to history before optimizing
      setHistory(h => [...h, { nodes: nds, edges }]);
      
      return optimized;
    });
    
    // Re-fit view and reheat simulation after optimization
    setTimeout(() => {
      fitView({ padding: 0.2, duration: 400 });
      if (forceLayoutRef.current) {
        forceLayoutRef.current.reheatSimulation();
      }
      setIsOptimizing(false);
      console.log('✅ Optimization complete!');
    }, 100);
  }, [edges, setNodes, fitView, setHistory]);

  // Handle tree layout
  const handleTreeLayout = useCallback(() => {
    console.log('🌳 Applying tree layout...');
    setIsOptimizing(true);
    
    setNodes((nds) => {
      // Find root node
      const rootNodeId = findRootNode(nds, edges);
      if (!rootNodeId) {
        console.warn('⚠️ No root node found');
        setIsOptimizing(false);
        return nds;
      }
      
      console.log(`🌳 Root node: ${rootNodeId}`);
      
      // Apply tree layout
      const treeNodes = buildTreeLayout(nds, edges, rootNodeId, {
        nodeSpacing: 400,
        layerSpacing: 300,
        direction: 'LR'
      });
      
      return treeNodes;
    });
    
    // Re-fit view after tree layout
    setTimeout(() => {
      fitView({ padding: 0.2, duration: 400 });
      setIsOptimizing(false);
      console.log('✅ Tree layout complete!');
    }, 100);
  }, [edges, setNodes, fitView]);

  // Handle push away burst
  const handlePushAway = useCallback(() => {
    console.log('💥 Push Away burst activated!');
    if (forceLayoutRef.current) {
      // Temporarily increase repulsion by reheating with higher alpha
      forceLayoutRef.current.reheatSimulation();
      
      // Give visual feedback
      const button = document.querySelector('button[title*="burst of repulsion"]') as HTMLButtonElement;
      if (button) {
        button.style.transform = 'scale(1.2)';
        setTimeout(() => {
          button.style.transform = 'scale(1)';
        }, 300);
      }
    }
  }, []);

  // Apply optimized collision detection (fast convergence, no infinite loops)
  const forceLayout = useForceLayout(nodes, edges, {
    enabled: forceRepulsionEnabled && nodes.length > 0,
    collisionRadius: 60,
    maxTicks: 100, // Stop after 100 ticks for fast convergence
  });

  // Edge tension - pulls nodes closer when edges are long
  useEdgeTension(nodes, edges, {
    enabled: edgeTensionEnabled && nodes.length > 0,
    strength: 0.5, // How strong the tension force is (0-1)
    minLength: 200, // Minimum edge length in pixels
    maxLength: 800, // Maximum edge length before tension kicks in
  });
  
  // Store forceLayout in ref to avoid dependency issues
  useEffect(() => {
    forceLayoutRef.current = forceLayout;
  }, [forceLayout]);

  // Handle trace from address with recursive hops
  const handleTraceAddress = useCallback(async (address: string, hopsBefore: number = 1, hopsAfter: number = 1) => {
    // Update URL with the address
    window.history.pushState({}, '', `?q=${encodeURIComponent(address)}`);
    setUrlQuery(address); // Update state so SearchBar reflects the change
    
    setIsLoading(true);
    setError(null);
    
    try {
      // When both hops are 0, show ALL transactions for the address (origin node view)
      // Otherwise use the maxTransactions setting
      const txLimit = (hopsBefore === 0 && hopsAfter === 0) ? 1000 : maxTransactions;
      
      // Start from immediate neighborhood
      const data = await traceFromAddress(address, hopsBefore, hopsAfter, txLimit);
      console.log('📦 Raw data from backend:', data);
      const { nodes: newNodes, edges: newEdges} = buildGraphFromTraceDataBipartite(data, edgeScaleMax, txLimit, maxOutputs);
      console.log('🎨 Built graph:', newNodes.length, 'nodes,', newEdges.length, 'edges');
      
      // Add expand handler to all nodes
      const nodesWithHandlers = newNodes.map(node => ({
        ...node,
        data: { ...node.data, onExpand: handleExpandNode, balanceFetchingEnabled }
      }));
      
      // Debug: Check if handlers were added
      console.log('🔍 First node has onExpand?', !!nodesWithHandlers[0]?.data?.onExpand);
      
      // Clear history when loading new graph (not an expansion)
      setHistory([]);
      
      setNodes(nodesWithHandlers);
      setEdges(newEdges);
      
      // Reset expanded nodes tracking for new graph
      setExpandedNodes(new Set());
      
      // Fit view after a short delay to ensure nodes are rendered
      setTimeout(() => {
        fitView({ padding: 0.2, duration: 400 });
      }, 100);
      
      // Wait for initial render to complete
      await new Promise(r => setTimeout(r, 300));
      
      // Progressive multi-hop expansion using working expansion system
      if (hopsBefore > 1 || hopsAfter > 1) {
        addLog('info', `🔄 Multi-hop expansion: ${hopsBefore} backward, ${hopsAfter} forward`);
        
        const totalHops = Math.max(hopsBefore, hopsAfter) - 1; // -1 because we already loaded hop 1
        
        // Expand progressively using arrow buttons
        for (let hop = 2; hop <= hopsBefore; hop++) {
          setCurrentProgress({ 
            current: hop - 1, 
            total: totalHops, 
            step: `⬅️ Expanding backward to hop ${hop}/${hopsBefore}...` 
          });
          addLog('info', `⬅️ Expanding to hop ${hop} backward...`);
          await handleExpandBackward();
          await new Promise(r => setTimeout(r, 500)); // Wait for state updates
        }
        
        for (let hop = 2; hop <= hopsAfter; hop++) {
          setCurrentProgress({ 
            current: hopsBefore - 1 + hop - 1, 
            total: totalHops, 
            step: `➡️ Expanding forward to hop ${hop}/${hopsAfter}...` 
          });
          addLog('info', `➡️ Expanding to hop ${hop} forward...`);
          await handleExpandForward();
          await new Promise(r => setTimeout(r, 500)); // Wait for state updates
        }
        
        setCurrentProgress(undefined);
        addLog('success', `✅ Multi-hop expansion complete`);
      }
      
      // OLD broken auto-expansion code (keep disabled for reference)
      if (false && hopsBefore > 0) {
        const centerNode = nodesWithHandlers.find(n => n.type === 'address' && (n.data.address === address || n.data.metadata?.address === address));
        if (centerNode) {
          // BEFORE (left)
          const visited = new Set<string>();
          let frontier: string[] = [centerNode.id];
          for (let step = 0; step < hopsBefore; step++) {
            const next: string[] = [];
            for (const id of frontier) {
              if (visited.has(id)) continue;
              visited.add(id);
              await handleExpandNode(id, 'receiving');
              await new Promise(r => setTimeout(r, 120));
            }
            // pick new leftmost addresses as next frontier
            setNodes((current) => {
              const addrs = current.filter(n => n.type === 'address');
              if (addrs.length) {
                const minX = Math.min(...addrs.map(n => n.position.x));
                const left = addrs.filter(n => Math.abs(n.position.x - minX) < 5)
                                  .map(n => n.id)
                                  .filter(id => !visited.has(id));
                next.push(...left);
              }
              return current;
            });
            frontier = next;
            if (frontier.length === 0) break;
          }
        }
        // AFTER (right)
        if (hopsAfter > 0) {
          const visited = new Set<string>();
          let frontier: string[] = [centerNode.id];
          for (let step = 0; step < hopsAfter; step++) {
            const next: string[] = [];
            for (const id of frontier) {
              if (visited.has(id)) continue;
              visited.add(id);
              await handleExpandNode(id, 'spending');
              await new Promise(r => setTimeout(r, 120));
            }
            // pick new rightmost addresses as next frontier
            setNodes((current) => {
              const addrs = current.filter(n => n.type === 'address');
              if (addrs.length) {
                const maxX = Math.max(...addrs.map(n => n.position.x));
                const right = addrs.filter(n => Math.abs(n.position.x - maxX) < 5)
                                   .map(n => n.id)
                                   .filter(id => !visited.has(id));
                next.push(...right);
              }
              return current;
            });
            frontier = next;
            if (frontier.length === 0) break;
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trace address');
      console.error('Trace error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [setNodes, setEdges, fitView]);

  // Handle trace from transaction with recursive hops
  const handleTraceTransaction = useCallback(async (txid: string, vout: number, hopsBefore: number = 1, hopsAfter: number = 1) => {
    // Update URL with the transaction ID
    window.history.pushState({}, '', `?q=${encodeURIComponent(txid)}`);
    setUrlQuery(txid); // Update state so SearchBar reflects the change
    
    setIsLoading(true);
    setError(null);
    setProgressLogs([]);
    setCurrentProgress(undefined);
    setHopStats([]);
    
    try {
      // Start immediate neighborhood
      addLog('info', `📍 Starting trace from TX: ${txid.substring(0, 16)}...`);
      addLog('electrum', `Fetching ${hopsBefore} hops backward, ${hopsAfter} hops forward...`);
      console.log(`🔧 Using maxOutputs=${maxOutputs} for this trace`);
      const { data, bytes } = await traceFromUTXOWithStats(txid, vout, hopsBefore, hopsAfter, maxOutputs);
      trackRequest(0, bytes);
      addLog('success', `✓ Received ${data.nodes.length} nodes, ${data.edges.length} edges (${(bytes / 1024).toFixed(1)} KB)`);
      
      const { nodes: newNodes, edges: newEdges } = buildGraphFromTraceDataBipartite(data, edgeScaleMax, maxTransactions, maxOutputs, txid);
      
      // Add expand handler to all nodes
      const nodesWithHandlers = newNodes.map(node => ({
        ...node,
        data: { ...node.data, onExpand: handleExpandNode, balanceFetchingEnabled }
      }));
      
      setNodes(nodesWithHandlers);
      setEdges(newEdges);
      
      // Reset expanded nodes tracking for new graph
      setExpandedNodes(new Set());
      
      // Fit view after a short delay to ensure nodes are rendered
      setTimeout(() => {
        fitView({ padding: 0.2, duration: 400 });
      }, 100);
      
      // Wait for initial render to complete
      await new Promise(r => setTimeout(r, 300));

      // Progressive multi-hop expansion using working expansion system
      if (hopsBefore > 1 || hopsAfter > 1) {
        addLog('info', `🔄 Multi-hop expansion: ${hopsBefore} backward, ${hopsAfter} forward`);
        
        const totalHops = Math.max(hopsBefore, hopsAfter) - 1; // -1 because we already loaded hop 1
        
        // Expand progressively using arrow buttons
        for (let hop = 2; hop <= hopsBefore; hop++) {
          setCurrentProgress({ 
            current: hop - 1, 
            total: totalHops, 
            step: `⬅️ Expanding backward to hop ${hop}/${hopsBefore}...` 
          });
          addLog('info', `⬅️ Expanding to hop ${hop} backward...`);
          await handleExpandBackward();
          await new Promise(r => setTimeout(r, 500)); // Wait for state updates
        }
        
        for (let hop = 2; hop <= hopsAfter; hop++) {
          setCurrentProgress({ 
            current: hopsBefore - 1 + hop - 1, 
            total: totalHops, 
            step: `➡️ Expanding forward to hop ${hop}/${hopsAfter}...` 
          });
          addLog('info', `➡️ Expanding to hop ${hop} forward...`);
          await handleExpandForward();
          await new Promise(r => setTimeout(r, 500)); // Wait for state updates
        }
        
        setCurrentProgress(undefined);
        addLog('success', `✅ Multi-hop expansion complete`);
      }
      
      // OLD broken auto-expansion code (keep disabled for reference)
      const centerTx = nodesWithHandlers.find(n => n.type === 'transaction' && (n.data.txid === txid || n.data.metadata?.txid === txid));
      if (false && centerTx && (hopsBefore > 1 || hopsAfter > 1)) {
        const totalHops = (hopsBefore > 1 ? hopsBefore - 1 : 0) + (hopsAfter > 1 ? hopsAfter - 1 : 0);
        let completedHops = 0;
        
        addLog('info', `🔄 Auto-expanding: ${hopsBefore - 1} hops backward, ${hopsAfter - 1} hops forward`);
        
        // Expand backwards (inputs)
        if (hopsBefore > 1) {
          let currentLevel = [centerTx];
          for (let hop = 0; hop < hopsBefore - 1; hop++) {
            completedHops++;
            setCurrentProgress({ current: completedHops, total: totalHops, step: `⬅️ Backward hop ${hop + 1}/${hopsBefore - 1}` });
            addLog('info', `⬅️ Expanding backward hop ${hop + 1}/${hopsBefore - 1}`);
            const nextLevel: typeof nodesWithHandlers = [];
            
            for (const node of currentLevel) {
              if (node.type === 'transaction') {
                // Expand transaction inputs to get previous addresses
                await handleExpandNode(node.id, 'inputs');
                await new Promise(r => setTimeout(r, 100));
                
                // Find newly added input addresses
                const currentNodes = await new Promise<typeof nodesWithHandlers>((resolve) => {
                  setNodes((nds) => {
                    resolve(nds);
                    return nds;
                  });
                });
                const currentEdges = await new Promise<typeof newEdges>((resolve) => {
                  setEdges((eds) => {
                    resolve(eds);
                    return eds;
                  });
                });
                
                const inputAddrs = currentNodes.filter(n => 
                  n.type === 'address' && 
                  !currentLevel.some(cl => cl.id === n.id) &&
                  currentEdges.some(e => e.source === n.id && e.target === node.id)
                );
                nextLevel.push(...inputAddrs);
              } else if (node.type === 'address') {
                // Expand address backwards to get previous transactions
                await handleExpandNode(node.id, 'receiving');
                await new Promise(r => setTimeout(r, 100));
                
                // Find newly added previous transactions
                const currentNodes = await new Promise<typeof nodesWithHandlers>((resolve) => {
                  setNodes((nds) => {
                    resolve(nds);
                    return nds;
                  });
                });
                const currentEdges = await new Promise<typeof newEdges>((resolve) => {
                  setEdges((eds) => {
                    resolve(eds);
                    return eds;
                  });
                });
                
                const prevTxs = currentNodes.filter(n => 
                  n.type === 'transaction' && 
                  !currentLevel.some(cl => cl.id === n.id) &&
                  currentEdges.some(e => e.source === n.id && e.target === node.id)
                );
                nextLevel.push(...prevTxs);
              }
            }
            
            currentLevel = nextLevel;
            if (currentLevel.length === 0) {
              console.log(`⚠️ No more nodes to expand backwards at hop ${hop + 1}`);
              break;
            }
          }
        }
        
        // Expand forwards (outputs)
        if (hopsAfter > 1) {
          let currentLevel = [centerTx];
          for (let hop = 0; hop < hopsAfter - 1; hop++) {
            completedHops++;
            setCurrentProgress({ current: completedHops, total: totalHops, step: `➡️ Forward hop ${hop + 1}/${hopsAfter - 1}` });
            addLog('info', `➡️ Expanding forward hop ${hop + 1}/${hopsAfter - 1}`);
            const nextLevel: typeof nodesWithHandlers = [];
            
            for (const node of currentLevel) {
              if (node.type === 'transaction') {
                // Expand transaction outputs to get next addresses
                await handleExpandNode(node.id, 'outputs');
                await new Promise(r => setTimeout(r, 100));
                
                // Find newly added output addresses
                const currentNodes = await new Promise<typeof nodesWithHandlers>((resolve) => {
                  setNodes((nds) => {
                    resolve(nds);
                    return nds;
                  });
                });
                const currentEdges = await new Promise<typeof newEdges>((resolve) => {
                  setEdges((eds) => {
                    resolve(eds);
                    return eds;
                  });
                });
                
                const outputAddrs = currentNodes.filter(n => 
                  n.type === 'address' && 
                  !currentLevel.some(cl => cl.id === n.id)
                );
                // Only add addresses connected to this TX
                const connectedAddrs = outputAddrs.filter(addr =>
                  currentEdges.some(e => e.source === node.id && e.target === addr.id)
                );
                nextLevel.push(...connectedAddrs);
              } else if (node.type === 'address') {
                // Expand address forwards to get next transactions
                await handleExpandNode(node.id, 'spending');
                await new Promise(r => setTimeout(r, 100));
                
                // Find newly added next transactions
                const currentNodes = await new Promise<typeof nodesWithHandlers>((resolve) => {
                  setNodes((nds) => {
                    resolve(nds);
                    return nds;
                  });
                });
                const currentEdges = await new Promise<typeof newEdges>((resolve) => {
                  setEdges((eds) => {
                    resolve(eds);
                    return eds;
                  });
                });
                
                const nextTxs = currentNodes.filter(n => 
                  n.type === 'transaction' && 
                  !currentLevel.some(cl => cl.id === n.id)
                );
                // Only add transactions connected to this address
                const connectedTxs = nextTxs.filter(tx =>
                  currentEdges.some(e => e.source === node.id && e.target === tx.id)
                );
                nextLevel.push(...connectedTxs);
              }
            }
            
            currentLevel = nextLevel;
            if (currentLevel.length === 0) {
              console.log(`⚠️ No more nodes to expand forwards at hop ${hop + 1}`);
              break;
            }
          }
        }
        
        addLog('success', `✅ Auto-expansion complete!`);
        setCurrentProgress(undefined);
      }
      
      // Final node count
      const finalNodeCount = await new Promise<number>((resolve) => {
        setNodes((nds) => {
          resolve(nds.length);
          return nds;
        });
      });
      addLog('success', `🎯 Graph complete: ${finalNodeCount} total nodes`);
      
    } catch (err) {
      addLog('error', `❌ Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setError(err instanceof Error ? err.message : 'Failed to trace transaction');
      console.error('Trace error:', err);
    } finally {
      setIsLoading(false);
      setCurrentProgress(undefined);
    }
  }, [setNodes, setEdges, fitView, addLog]);

  // Estimate how many nodes would be added by expansion
  const estimateExpansionSize = useCallback((node: Node, direction: 'inputs' | 'outputs' | 'spending' | 'receiving'): number => {
    if (node.type === 'transaction') {
      // For TX: Check metadata for input/output counts
      const count = direction === 'inputs' 
        ? (node.data.metadata?.inputCount || 0)
        : (node.data.metadata?.outputCount || 0);
      
      // Actual unique addresses might be less (due to address reuse)
      // But this gives us a reasonable upper bound
      return count;
    } else if (node.type === 'address') {
      // For address: Can't know without fetching (unless we count existing edges)
      const existingEdges = direction === 'receiving'
        ? edges.filter(e => e.source.startsWith('tx_') && e.target === node.id)
        : edges.filter(e => e.source === node.id && e.target.startsWith('tx_'));
      
      // If has existing edges, those are the connections
      // If no existing edges, unknown (will fetch from backend)
      return existingEdges.length > 0 ? existingEdges.length : 0; // 0 = unknown
    }
    
    return 0;
  }, [edges]);

  // Expand a node (show hidden connections from cached data - NO network calls!)
  const handleExpandNode = useCallback(async (nodeId: string, direction?: 'inputs' | 'outputs' | 'spending' | 'receiving') => {
    console.log('🚀 Expanding:', nodeId, direction);
    
    const expandKey = `${nodeId}-${direction}`;
    
    // Check if already expanded
    if (expandedNodes.has(expandKey)) {
      console.log('Already expanded:', expandKey);
      setError('Already expanded in this direction');
      setTimeout(() => setError(null), 2000);
      return;
    }
    
    const node = nodes.find(n => n.id === nodeId);
    if (!node) {
      console.error('Node not found:', nodeId);
      return;
    }
    
    // Estimate expansion size and warn if too large
    const estimated = estimateExpansionSize(node, direction as any);
    if (estimated > clusterThreshold) {
      const proceed = window.confirm(
        `This expansion will add approximately ${estimated} nodes.\n\n` +
        `This may impact graph performance.\n` +
        `Current threshold: ${clusterThreshold} (change in Settings)\n\n` +
        `Continue anyway?`
      );
      if (!proceed) {
        return;
      }
    }
    
    setIsLoading(true);
    
    try {
      let result: { nodes: Node[]; edges: Edge[] };
      
      if (node.type === 'transaction') {
        // Expand from cached metadata (NO network call!)
        result = expandTransactionNode(node, direction as 'inputs' | 'outputs', edgeScaleMax);
      } else if (node.type === 'address') {
        // Try to expand from existing edges first
        const expandResult = expandAddressNode(node, direction as 'receiving' | 'spending', nodes, edges);
        
        // Check if we need to fetch from backend (newly-added address)
        if ('needsFetch' in expandResult && expandResult.needsFetch) {
          console.log(`📡 Newly-added address - fetching TX history from backend...`);
          
          const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
          const existingIds = new Set(nodes.map(n => n.id));
          
          result = await expandAddressNodeWithFetch(
            expandResult.address,
            node,
            direction as 'receiving' | 'spending',
            edgeScaleMax,
            API_BASE_URL,
            existingIds
          );
        } else {
          result = expandResult;
        }
      } else {
        console.warn('Unknown node type:', node.type);
        return;
      }
      
      // Filter to only NEW nodes
      const existingIds = new Set(nodes.map(n => n.id));
      const newNodes = result.nodes.filter(n => !existingIds.has(n.id));
      const newEdges = result.edges.filter(e => !edges.some(existing => existing.id === e.id));
      
      if (newNodes.length === 0) {
        console.log('No new nodes to add (all already in graph)');
        
        // Check if we fetched data but it was already in graph
        if (node.type === 'address' && result.edges && result.edges.length > 0) {
          setError('All connected transactions already visible in graph');
        } else {
          setError('No new connections to show');
        }
        setTimeout(() => setError(null), 3000);
        return;
      }
      
      console.log(`✅ Adding ${newNodes.length} nodes, ${newEdges.length} edges from cached data`);
      
      // Verify no duplicate IDs before adding
      const newNodeIds = new Set(newNodes.map(n => n.id));
      if (newNodeIds.size !== newNodes.length) {
        console.error('⚠️ DUPLICATE NODE IDS in newNodes!', newNodes.map(n => n.id));
      }
      
      // Add nodes with expand handler
      setNodes(nds => {
        const combined = [...nds, ...newNodes.map(n => ({
          ...n,
          data: { ...n.data, onExpand: handleExpandNode, balanceFetchingEnabled }
        }))];
        
        // Verify no duplicates in combined
        const allIds = combined.map(n => n.id);
        const uniqueIds = new Set(allIds);
        if (allIds.length !== uniqueIds.size) {
          console.error('⚠️ DUPLICATE NODE IDS after merge!');
          const duplicates = allIds.filter((id, idx) => allIds.indexOf(id) !== idx);
          console.error('Duplicates:', [...new Set(duplicates)]);
        }
        
        return combined;
      });
      
      // Add edges
      setEdges(eds => [...eds, ...newEdges]);
      
      // Mark as expanded
      setExpandedNodes(prev => new Set(prev).add(expandKey));
      
    } catch (error) {
      console.error('Error expanding node:', error);
      setError('Failed to expand node');
    } finally {
      setIsLoading(false);
    }
  }, [nodes, edges, expandedNodes, edgeScaleMax, balanceFetchingEnabled]);

  // Re-attach onExpand handler to all nodes (for restored graphs or when handler changes)
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        data: { ...node.data, onExpand: handleExpandNode },
      }))
    );
  }, [handleExpandNode, setNodes, maxOutputs, maxTransactions]);

  // Memoize expensive computations
  const memoizedNodeTypes = useMemo(() => nodeTypes, []);
  const memoizedDefaultEdgeOptions = useMemo(() => ({
    animated: edgeAnimation,
    style: { stroke: '#64b5f6', strokeWidth: 2 },
  }), [edgeAnimation]);
  
  // Memoize stats to prevent StatsPanel re-renders
  const statsData = useMemo(() => ({
    totalNodes: nodes.length,
    totalEdges: edges.length,
    transactions: nodes.filter((n) => n.type === 'transaction').length,
    addresses: nodes.filter((n) => n.type === 'address').length,
  }), [nodes.length, edges.length]); // Only recompute when counts change, not positions

  // For VERY large graphs (200+ nodes), hide distant nodes for performance
  // This is a performance escape hatch for extreme cases
  const [viewportVersion, setViewportVersion] = useState(0);
  
  // Throttled viewport change detection (update max once per 500ms)
  const lastViewportUpdateRef = useRef(0);
  const onMove = useCallback(() => {
    const now = Date.now();
    if (now - lastViewportUpdateRef.current > 500) {
      lastViewportUpdateRef.current = now;
      setViewportVersion(v => v + 1);
    }
  }, []);
  
  const visibleNodes = useMemo(() => {
    // Only apply hiding for VERY large graphs (200+ nodes)
    if (nodes.length < 200) return nodes;
    
    try {
      const viewport = getViewport();
      const viewportWidth = window.innerWidth / viewport.zoom;
      const viewportHeight = window.innerHeight / viewport.zoom;
      const viewportLeft = -viewport.x / viewport.zoom;
      const viewportTop = -viewport.y / viewport.zoom;
      
      // Large buffer (3x viewport) to prevent flickering
      const buffer = 3;
      const expandedLeft = viewportLeft - (viewportWidth * buffer);
      const expandedRight = viewportLeft + viewportWidth * (1 + buffer);
      const expandedTop = viewportTop - (viewportHeight * buffer);
      const expandedBottom = viewportTop + viewportHeight * (1 + buffer);
      
      let hiddenCount = 0;
      const result = nodes.map(node => {
        const nodeRight = node.position.x + 200;
        const nodeBottom = node.position.y + 100;
        
        const isInView = (
          nodeRight >= expandedLeft &&
          node.position.x <= expandedRight &&
          nodeBottom >= expandedTop &&
          node.position.y <= expandedBottom
        );
        
        if (!isInView) hiddenCount++;
        
        return {
          ...node,
          hidden: !isInView,
        };
      });
      
      if (hiddenCount > 0) {
        console.log(`📦 Hiding ${hiddenCount}/${nodes.length} nodes for performance`);
      }
      
      return result;
    } catch (err) {
      console.warn('Visibility optimization failed:', err);
      return nodes;
    }
  }, [nodes, viewportVersion, getViewport]);

  // Expand graph by one hop backward
  const handleExpandBackward = useCallback(async () => {
    if (nodes.length === 0) return;
    
    console.log('⬅️ Expanding graph by 1 hop backward...');
    
    // Get visible nodes in viewport
    const visibleNodeIds = getVisibleNodeIds(nodes);
    const visibleNodes = nodes.filter(n => visibleNodeIds.has(n.id));
    
    if (visibleNodes.length === 0) {
      console.log('No visible nodes to expand');
      return;
    }
    
    // Find the LEFTMOST X position among visible nodes
    const minX = Math.min(...visibleNodes.map(n => n.position.x));
    
    // Find nodes at or near the leftmost position (within 50px tolerance)
    const TOLERANCE = 50;
    const leftmostNodes = visibleNodes.filter(n => Math.abs(n.position.x - minX) < TOLERANCE);
    
    // Filter to only unexpanded nodes
    const nodesToExpand = leftmostNodes.filter(n => {
      const direction = n.type === 'address' ? 'receiving' : 'inputs';
      const expandKey = `${n.id}-${direction}`;
      if (expandedNodes.has(expandKey)) {
        console.log(`⏭️ Skipping ${n.id} - already expanded backward`);
        return false;
      }
      return true;
    });
    
    console.log(`Expanding ${nodesToExpand.length} leftmost unexpanded nodes`);
    
    if (nodesToExpand.length === 0) {
      setError('All visible nodes already expanded backward');
      setTimeout(() => setError(null), 2000);
      return;
    }
    
    // Warn if too many nodes to expand
    if (nodesToExpand.length > 20) {
      const proceed = window.confirm(
        `This will expand ${nodesToExpand.length} nodes, which may take a while and add many new nodes to the graph.\n\n` +
        `Consider zooming in to show fewer nodes, or adjusting Max Outputs/Transactions settings.\n\n` +
        `Continue anyway?`
      );
      if (!proceed) {
        return;
      }
    }
    
    setIsLoading(true);
    
    try {
      let expandedCount = 0;
      let skippedCount = 0;
      
      // Expand in batches to show progress
      const BATCH_SIZE = 5;
      for (let i = 0; i < nodesToExpand.length; i += BATCH_SIZE) {
        const batch = nodesToExpand.slice(i, i + BATCH_SIZE);
        
        setCurrentProgress({
          current: i,
          total: nodesToExpand.length,
          step: `⬅️ Expanding ${i + 1}-${Math.min(i + BATCH_SIZE, nodesToExpand.length)} of ${nodesToExpand.length} nodes backward...`
        });
        
        for (const node of batch) {
          try {
            if (node.type === 'address') {
              await handleExpandNode(node.id, 'receiving');
            } else if (node.type === 'transaction') {
              await handleExpandNode(node.id, 'inputs');
            }
            expandedCount++;
          } catch (err) {
            console.error(`Failed to expand ${node.id.substring(0, 25)}:`, err);
            skippedCount++;
          }
        }
      }
      
      addLog('success', `✅ Expanded ${expandedCount} nodes backward${skippedCount > 0 ? ` (${skippedCount} skipped)` : ''}`);
      console.log('✅ Backward expansion complete');
    } catch (error) {
      console.error('❌ Error expanding backward:', error);
      setError('Failed to expand graph backward');
    } finally {
      setIsLoading(false);
      setCurrentProgress(undefined);
    }
  }, [nodes, expandedNodes, getVisibleNodeIds, handleExpandNode, addLog, setCurrentProgress]);

  // Expand graph by one hop forward
  const handleExpandForward = useCallback(async () => {
    if (nodes.length === 0) return;
    
    console.log('➡️ Expanding graph by 1 hop forward...');
    
    // Get visible nodes in viewport
    const visibleNodeIds = getVisibleNodeIds(nodes);
    const visibleNodes = nodes.filter(n => visibleNodeIds.has(n.id));
    
    if (visibleNodes.length === 0) {
      console.log('No visible nodes to expand');
      return;
    }
    
    // Find the RIGHTMOST X position among visible nodes
    const maxX = Math.max(...visibleNodes.map(n => n.position.x));
    
    // Find nodes at or near the rightmost position (within 50px tolerance)
    const TOLERANCE = 50;
    const rightmostNodes = visibleNodes.filter(n => Math.abs(n.position.x - maxX) < TOLERANCE);
    
    // Filter to only unexpanded nodes
    const nodesToExpand = rightmostNodes.filter(n => {
      const direction = n.type === 'address' ? 'spending' : 'outputs';
      const expandKey = `${n.id}-${direction}`;
      if (expandedNodes.has(expandKey)) {
        console.log(`⏭️ Skipping ${n.id} - already expanded forward`);
        return false;
      }
      return true;
    });
    
    console.log(`Expanding ${nodesToExpand.length} rightmost unexpanded nodes`);
    
    if (nodesToExpand.length === 0) {
      setError('All visible nodes already expanded forward');
      setTimeout(() => setError(null), 2000);
      return;
    }
    
    // Warn if too many nodes to expand
    if (nodesToExpand.length > 20) {
      const proceed = window.confirm(
        `This will expand ${nodesToExpand.length} nodes, which may take a while and add many new nodes to the graph.\n\n` +
        `Consider zooming in to show fewer nodes, or adjusting Max Outputs/Transactions settings.\n\n` +
        `Continue anyway?`
      );
      if (!proceed) {
        return;
      }
    }
    
    setIsLoading(true);
    
    try {
      let expandedCount = 0;
      let skippedCount = 0;
      
      // Expand in batches to show progress
      const BATCH_SIZE = 5;
      for (let i = 0; i < nodesToExpand.length; i += BATCH_SIZE) {
        const batch = nodesToExpand.slice(i, i + BATCH_SIZE);
        
        setCurrentProgress({
          current: i,
          total: nodesToExpand.length,
          step: `➡️ Expanding ${i + 1}-${Math.min(i + BATCH_SIZE, nodesToExpand.length)} of ${nodesToExpand.length} nodes forward...`
        });
        
        for (const node of batch) {
          try {
            if (node.type === 'address') {
              await handleExpandNode(node.id, 'spending');
            } else if (node.type === 'transaction') {
              await handleExpandNode(node.id, 'outputs');
            }
            expandedCount++;
          } catch (err) {
            console.warn(`Failed to expand ${node.id}:`, err);
            skippedCount++;
          }
        }
      }
      
      addLog('success', `✅ Expanded ${expandedCount} nodes forward${skippedCount > 0 ? ` (${skippedCount} skipped)` : ''}`);
      console.log('✅ Forward expansion complete');
    } catch (error) {
      console.error('❌ Error expanding forward:', error);
      setError('Failed to expand graph forward');
    } finally {
      setIsLoading(false);
      setCurrentProgress(undefined);
    }
  }, [nodes, expandedNodes, getVisibleNodeIds, handleExpandNode, addLog, setCurrentProgress]);

  // Get query from URL (reactive to changes)
  const [urlQuery, setUrlQuery] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('q') || '';
  });

  // Listen for URL changes (when user clicks back/forward)
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      setUrlQuery(params.get('q') || '');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Keyboard shortcuts for expand buttons
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      if (e.key === '<' || e.key === ',') {
        e.preventDefault();
        handleExpandBackward();
      } else if (e.key === '>' || e.key === '.') {
        e.preventDefault();
        handleExpandForward();
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleExpandBackward, handleExpandForward]);

  // Right-click to toggle selection mode
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      // Check if right-click is on the graph canvas (not on UI elements)
      const target = e.target as HTMLElement;
      if (target.closest('.react-flow') && !target.closest('.react-flow__node')) {
        e.preventDefault();
        setMouseMode(prev => prev === 'pan' ? 'select' : 'pan');
        setIsSelectMode(prev => !prev);
      }
    };
    
    window.addEventListener('contextmenu', handleContextMenu);
    return () => window.removeEventListener('contextmenu', handleContextMenu);
  }, []);

  return (
    <div className="app">
      {/* Top Search Bar */}
      <SearchBar 
        onTraceAddress={handleTraceAddress} 
        onTraceTransaction={handleTraceTransaction}
        isLoading={isLoading}
        onOpenSettings={() => setShowSettings(true)}
        onOpenAbout={() => setShowAbout(true)}
        edgeScaleMax={edgeScaleMax}
        onEdgeScaleMaxChange={setEdgeScaleMax}
        onExpandBackward={handleExpandBackward}
        onExpandForward={handleExpandForward}
        hasGraph={nodes.length > 0}
        initialQuery={urlQuery}
      />
      
      {/* Main Graph Canvas */}
      <div className="graph-container">
        <ReactFlow
          nodes={visibleNodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onNodeDragStop={onNodeDragStop}
          nodeTypes={memoizedNodeTypes}
          edgeTypes={edgeTypes}
          nodesDraggable={true}
          fitView
          minZoom={0.1}
          maxZoom={2}
          panOnDrag={!isSelectMode}
          selectionOnDrag={isSelectMode}
          panOnScroll={false}
          zoomOnScroll={true}
          selectionMode={isSelectMode ? "partial" : undefined}
          multiSelectionKeyCode={isSelectMode ? "Shift" : null}
          defaultEdgeOptions={memoizedDefaultEdgeOptions}
          onMove={onMove}
          // Performance optimizations
          nodeOrigin={[0.5, 0.5]}
          selectNodesOnDrag={isSelectMode}
          elevateNodesOnSelect={false}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#333" />
          <Controls />
          <MiniMap
            nodeStrokeWidth={3}
            nodeColor={(node) => {
              if (node.type === 'transaction') return '#00bcd4';
              if (node.type === 'address') return '#ff9800';
              return '#999';
            }}
            style={{
              background: '#1a1a1a',
              border: '1px solid #444',
            }}
          />
          
          {/* Stats Overlay */}
          <Panel position="top-right">
            <StatsPanel
              totalNodes={statsData.totalNodes}
              totalEdges={statsData.totalEdges}
              transactions={statsData.transactions}
              addresses={statsData.addresses}
            />
          </Panel>
          
          
          {/* Undo Button (top of bottom-right) */}
          {history.length > 0 && (
            <Panel position="bottom-right">
              <button
                onClick={handleUndo}
                style={{
                  padding: '12px 20px',
                  background: '#ff9800',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
                }}
              >
                ↶ Undo ({history.length})
              </button>
            </Panel>
          )}

          {/* Loading Overlay */}
          {isLoading && (
            <Panel position="top-center">
              <div className="loading-panel">
                <div className="spinner" />
                <span>Loading blockchain data...</span>
              </div>
            </Panel>
          )}

          {/* Error Overlay */}
          {error && (
            <Panel position="top-center">
              <div className="error-panel">
                <span>⚠️ {error}</span>
                <button onClick={() => setError(null)}>Dismiss</button>
              </div>
            </Panel>
          )}
        </ReactFlow>
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
        <SettingsPanel 
          onClose={() => setShowSettings(false)}
          edgeAnimation={edgeAnimation}
          onEdgeAnimationChange={setEdgeAnimation}
          maxOutputs={maxOutputs}
          onMaxOutputsChange={handleMaxOutputsChange}
          maxTransactions={maxTransactions}
          onMaxTransactionsChange={handleMaxTransactionsChange}
          clusterThreshold={clusterThreshold}
          onClusterThresholdChange={handleClusterThresholdChange}
          balanceFetchingEnabled={balanceFetchingEnabled}
          onBalanceFetchingChange={handleBalanceFetchingChange}
        />
      )}

      {/* About Panel */}
      {showAbout && (
        <AboutPanel 
          onClose={() => setShowAbout(false)}
        />
      )}

      {/* Bottom Control Bar */}
      <div style={{
        position: 'fixed',
        bottom: '10px',
        left: '50px',
        display: 'flex',
        alignItems: 'flex-end',
        gap: '10px',
        zIndex: 1000,
      }}>
        {/* Mouse Mode Toggle */}
        <button
          onClick={() => {
            const newMode = mouseMode === 'pan' ? 'select' : 'pan';
            setMouseMode(newMode);
            setIsSelectMode(newMode === 'select');
          }}
          style={{
            padding: '8px 12px',
            height: '36px',
            background: mouseMode === 'select' ? '#2196f3' : '#666',
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
            transition: 'all 0.2s ease',
          }}
          title={mouseMode === 'select' ? 'Switch to PAN mode (right-click also toggles)' : 'Switch to SELECT mode (right-click also toggles)'}
        >
          {mouseMode === 'select' ? (
            <>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3 3v10h10V3H3zm1 1h8v8H4V4z"/>
                <rect x="1" y="1" width="4" height="4" opacity="0.5"/>
                <rect x="11" y="1" width="4" height="4" opacity="0.5"/>
                <rect x="1" y="11" width="4" height="4" opacity="0.5"/>
                <rect x="11" y="11" width="4" height="4" opacity="0.5"/>
              </svg>
              SELECT
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 3L6 5h1.5v3H5V6.5L3 8l2 1.5V8h2.5v3H6l2 2 2-2H8.5V8H11v1.5l2-1.5-2-1.5V8H8.5V5H10l-2-2z"/>
              </svg>
              PAN
            </>
          )}
        </button>

        {/* Optimize Layout Button */}
        <button
          onClick={handleOptimizeLayout}
          disabled={nodes.length === 0 || isOptimizing}
          style={{
            padding: '8px 16px',
            background: nodes.length === 0 || isOptimizing ? '#555' : '#9c27b0',
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            fontSize: '13px',
            fontWeight: 600,
            cursor: nodes.length === 0 || isOptimizing ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
            transition: 'all 0.2s ease',
          }}
          title="Reorganize nodes to minimize edge crossings"
        >
          📐 {isOptimizing ? 'Optimizing...' : 'Optimize Layout'}
        </button>

        {/* Tree Layout Button */}
        <button
          onClick={handleTreeLayout}
          disabled={nodes.length === 0 || isOptimizing}
          style={{
            padding: '8px 16px',
            background: nodes.length === 0 || isOptimizing ? '#555' : '#9c27b0',
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            fontSize: '13px',
            fontWeight: 600,
            cursor: nodes.length === 0 || isOptimizing ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
            transition: 'all 0.2s ease',
          }}
          title="Apply tree layout with minimal edge crossings"
        >
          🌳 {isOptimizing ? 'Applying...' : 'Tree Layout'}
        </button>

        {/* Repulsion Toggle */}
        <button
          onClick={() => {
            const newValue = !forceRepulsionEnabled;
            setForceRepulsionEnabled(newValue);
            setCookieBool('forceRepulsionEnabled', newValue); // Save to cookie
            if (!forceRepulsionEnabled && forceLayoutRef.current) {
              // Reheat simulation when enabling
              forceLayoutRef.current.reheatSimulation();
            }
          }}
          disabled={nodes.length === 0}
          style={{
            padding: '8px 16px',
            background: nodes.length === 0 ? '#555' : forceRepulsionEnabled ? '#4caf50' : '#666',
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            fontSize: '13px',
            fontWeight: 600,
            cursor: nodes.length === 0 ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
            transition: 'all 0.2s ease',
          }}
          title={forceRepulsionEnabled ? 'Disable physics repulsion' : 'Enable physics repulsion'}
        >
          {forceRepulsionEnabled ? '🌀 Repulsion ON' : '⭕ Repulsion OFF'}
        </button>

        {/* Tree Layout Toggle */}
        <button
          onClick={() => {
            const newValue = !treeLayoutEnabled;
            setTreeLayoutEnabled(newValue);
            setCookieBool('treeLayoutEnabled', newValue); // Save to cookie
            if (newValue) {
              // Auto-apply tree layout when enabled
              handleTreeLayout();
            }
          }}
          disabled={nodes.length === 0}
          style={{
            padding: '8px 16px',
            background: nodes.length === 0 ? '#555' : treeLayoutEnabled ? '#9c27b0' : '#666',
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            fontSize: '13px',
            fontWeight: 600,
            cursor: nodes.length === 0 ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
            transition: 'all 0.2s ease',
          }}
          title={treeLayoutEnabled ? 'Disable tree layout mode' : 'Enable tree layout mode (auto-apply on expansion)'}
        >
          {treeLayoutEnabled ? '🌳 Tree ON' : '⭕ Tree OFF'}
        </button>

        {/* Edge Tension Toggle */}
        <button
          onClick={() => {
            const newValue = !edgeTensionEnabled;
            setEdgeTensionEnabled(newValue);
            setCookieBool('edgeTensionEnabled', newValue); // Save to cookie
          }}
          disabled={nodes.length === 0}
          style={{
            padding: '8px 16px',
            background: nodes.length === 0 ? '#555' : edgeTensionEnabled ? '#ff9800' : '#666',
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            fontSize: '13px',
            fontWeight: 600,
            cursor: nodes.length === 0 ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
            transition: 'all 0.2s ease',
          }}
          title={edgeTensionEnabled ? 'Disable edge tension' : 'Enable edge tension (pulls nodes closer when edges are long)'}
        >
          {edgeTensionEnabled ? '🔗 Tension ON' : '⭕ Tension OFF'}
        </button>

        {/* Push Away Burst */}
        <button
          onClick={handlePushAway}
          disabled={nodes.length === 0 || !forceRepulsionEnabled}
          style={{
            padding: '8px 16px',
            background: nodes.length === 0 || !forceRepulsionEnabled ? '#555' : '#ff6b6b',
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            fontSize: '13px',
            fontWeight: 600,
            cursor: nodes.length === 0 || !forceRepulsionEnabled ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
            transition: 'transform 0.2s ease',
          }}
          title="Apply a burst of repulsion force to spread nodes apart"
        >
          💥 Push Away
        </button>

        {/* Save/Load Buttons Group */}
        <div style={{
          display: 'flex',
          gap: '2px',
          background: 'rgba(26, 26, 26, 0.95)',
          borderRadius: '8px',
          overflow: 'hidden',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
        }}>
          <button
            onClick={handleSaveGraph}
            disabled={nodes.length === 0}
            style={{
              padding: '8px 16px',
              background: nodes.length === 0 ? '#555' : '#444',
              border: 'none',
              borderRight: '1px solid rgba(100, 181, 246, 0.2)',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: nodes.length === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease',
            }}
            title="Save graph to file"
          >
            💾 Save
          </button>
          
          <label
            style={{
              padding: '8px 16px',
              background: '#444',
              border: 'none',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease',
            }}
            title="Load graph from file"
          >
            📂 Load
            <input
              type="file"
              accept=".json"
              onChange={handleRestoreGraph}
              style={{ display: 'none' }}
            />
          </label>
        </div>

        {/* Performance Monitor (only in development) */}
        {process.env.NODE_ENV === 'development' && (
          <PerformanceMonitor nodeCount={nodes.length} edgeCount={edges.length} />
        )}

        {/* Progress Logger - next to Performance Monitor */}
        <ProgressLogger
          logs={progressLogs}
          currentProgress={currentProgress}
          isLoading={isLoading}
          hopStats={hopStats}
        />
      </div>
    </div>
  );
}

function App() {
  return (
    <ReactFlowProvider>
      <AppContent />
    </ReactFlowProvider>
  );
}

export default App;
