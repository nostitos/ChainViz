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
import { useForceLayout } from './hooks/useForceLayout';
import { useEdgeTension } from './hooks/useEdgeTension';
import './App.css';

const nodeTypes = {
  transaction: TransactionNode,
  address: AddressNode,
  addressCluster: AddressClusterNode,
  transactionCluster: TransactionClusterNode,
};

function AppContent() {
  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);
  const [selectedEntity, setSelectedEntity] = useState<Node | null>(null);
  const [isPanMode, setIsPanMode] = useState(true);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [edgeAnimation, setEdgeAnimation] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [edgeScaleMax, setEdgeScaleMax] = useState(10); // BTC amount for 70% max width
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

  // Save to cookies when values change
  const handleMaxOutputsChange = (value: number) => {
    setMaxOutputs(value);
    setCookie('maxOutputs', value);
  };

  const handleMaxTransactionsChange = (value: number) => {
    setMaxTransactions(value);
    setCookie('maxTransactions', value);
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
      // Default to 0 hops backward, 1 hop forward (same as clicking Trace with default settings)
      console.log('Loading from URL parameter:', query);
      if (/^[0-9a-fA-F]{64}$/.test(query)) {
        handleTraceTransaction(query, 0, 0, 1); // vout=0, hopsBefore=0, hopsAfter=1
      } else {
        handleTraceAddress(query, 0, 1); // hopsBefore=0, hopsAfter=1
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
          setHistory(prev => [...prev, { nodes, edges }]);
          
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
      
      // Save current state to history before replacing
      if (nodes.length > 0) {
        setHistory(prev => [...prev, { nodes, edges }]);
      }
      
      setNodes(nodesWithHandlers);
      setEdges(newEdges);
      
      // Reset expanded nodes tracking for new graph
      setExpandedNodes(new Set());
      
      // Fit view after a short delay to ensure nodes are rendered
      setTimeout(() => {
        fitView({ padding: 0.2, duration: 400 });
      }, 100);

      // Auto-expand hops using BFS over addresses (skip if hopsBefore = 0)
      if (hopsBefore > 0) {
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

      // Auto-expand hops recursively
      const centerTx = nodesWithHandlers.find(n => n.type === 'transaction' && (n.data.txid === txid || n.data.metadata?.txid === txid));
      if (centerTx && (hopsBefore > 1 || hopsAfter > 1)) {
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

  // Expand a node (fetch more connections)
  const handleExpandNode = useCallback(async (nodeId: string, direction?: 'inputs' | 'outputs' | 'spending' | 'receiving') => {
    console.log('🚀 EXPAND TRIGGERED:', nodeId, direction);
    console.log('🔍 handleExpandNode called with:', { nodeId, direction });
    
    // Temporarily disable repulsion during expansion to prevent interference
    const wasRepulsionEnabled = forceRepulsionEnabled;
    if (wasRepulsionEnabled) {
      console.log('⏸️  Pausing repulsion during expansion');
      setForceRepulsionEnabled(false);
    }
    
    // Only check expansion for transactions (addresses can expand multiple times to show all connected TXs)
    const expandKey = `${nodeId}-${direction || 'default'}`;
    
    // Get node type to determine if we should check expansion
    let nodeType: string | undefined;
    setNodes((currentNodes) => {
      const foundNode = currentNodes.find((n) => n.id === nodeId);
      nodeType = foundNode?.type;
      return currentNodes;
    });
    
    // For transactions only, prevent re-expansion
    if (nodeType === 'transaction' && expandedNodes.has(expandKey)) {
      console.log('⏭️  Transaction already expanded, skipping');
      setError('Transaction already expanded');
      setTimeout(() => setError(null), 2000);
      // Re-enable repulsion if it was enabled
      if (wasRepulsionEnabled) {
        setForceRepulsionEnabled(true);
      }
      return;
    }
    
    // Extract address from nodeId if it's addr_xxx format
    let address: string | undefined;
    if (nodeId.startsWith('addr_')) {
      address = nodeId.substring(5); // Remove 'addr_' prefix
      console.log('📍 Extracted address from ID:', address);
    }
    
    // Use setNodes to get fresh nodes state
    let targetNode: Node | undefined;
    setNodes((currentNodes) => {
      targetNode = currentNodes.find((n) => n.id === nodeId);
      return currentNodes; // Don't change nodes, just read
    });
    
    // If node not found but we have an address, create synthetic node data
    if (!targetNode && address) {
      console.log('💡 Node not in graph (clustered address), using address directly');
      targetNode = {
        id: nodeId,
        type: 'address',
        position: { x: 0, y: 0 },
        data: {
          address,
          metadata: { address },
        },
      } as Node;
    }
    
    if (!targetNode) {
      console.error('❌ Node not found and no address extracted:', nodeId);
      return;
    }

    console.log('✅ Found node:', targetNode.type, targetNode.data);
    setIsLoading(true);
    const node = targetNode;
    try {
      // For addresses, show only the directly connected transaction
      if (node.type === 'address') {
        const address = node.data.address || node.data.metadata?.address;
        if (!address) return;
        
        // Expand by fetching depth=1 FROM THIS ADDRESS (not the original)
        console.log('📡 Expanding address to show connected TX, depth=1 from', address.substring(0, 20));
        const data = await traceFromAddress(address, 1, maxTransactions);
        
        // Merge new nodes/edges with existing
        const { nodes: newNodes, edges: newEdges } = buildGraphFromTraceDataBipartite(data, edgeScaleMax, maxTransactions, maxOutputs);
        
        console.log('📦 Got new data:', newNodes.length, 'nodes');
        
        // Check if the source address is now in a cluster
        const newClusters = newNodes.filter(n => n.type === 'addressCluster' || n.type === 'transactionCluster');
        const sourceAddressInCluster = newClusters.some(cluster => {
          if (cluster.type === 'addressCluster' && cluster.data.addresses) {
            return cluster.data.addresses.some((a: any) => `addr_${a.address}` === nodeId);
          }
          return false;
        });
        
        setNodes((nds) => {
          const existingIds = new Set(nds.map(n => n.id));
          
          // If source address is now in a cluster, remove the original node
          let nodesToKeep = nds;
          if (sourceAddressInCluster) {
            console.log(`🗑️ Source address ${nodeId} is now in a cluster - removing original node`);
            nodesToKeep = nds.filter(n => n.id !== nodeId);
          }
          
          // Find ALL TXs that connect to our address
          const connectedTxs = newNodes.filter(n => 
            n.type === 'transaction' &&
            newEdges.some(e => 
              (e.source === n.id && e.target === nodeId) ||
              (e.target === n.id && e.source === nodeId)
            )
          );
          
          console.log(`🔍 Found ${connectedTxs.length} connected TXs`);
          
          // Filter to NEW TXs only (not already in graph)
          const newTxs = connectedTxs.filter(tx => !existingIds.has(tx.id));
          
          if (newTxs.length === 0) {
            console.log('⚠️ No NEW connected transactions (all already in graph)');
            return nds;
          }
          
          console.log(`🆕 Found ${newTxs.length} NEW transactions to add`);
          
          // If 4 or more TXs, create a transaction cluster node
          if (newTxs.length > 3) {
            console.log('📦 Creating transaction cluster for', newTxs.length, 'transactions');
            
            const sourceNode = nds.find(n => n.id === nodeId);
            const clusterId = `tx-cluster-${nodeId}-${Date.now()}`;
            
            // Limit to maxTransactions
            const txsToShow = newTxs.slice(0, maxTransactions);
            
            const clusterNode = {
              id: clusterId,
              type: 'transactionCluster',
              position: {
                x: (sourceNode?.position.x ?? 0) + 400,
                y: sourceNode?.position.y ?? 0,
              },
              data: {
                transactions: txsToShow.map(tx => ({
                  txid: tx.data.txid || tx.data.metadata?.txid || tx.id,
                  time: tx.data.metadata?.time,
                  blockHeight: tx.data.metadata?.block_height,
                  totalInput: tx.data.metadata?.total_input,
                  totalOutput: tx.data.metadata?.total_output,
                })),
                direction: direction || 'outputs',
                label: `${newTxs.length} Transactions${newTxs.length > maxTransactions ? ` (showing ${maxTransactions})` : ''}`,
              },
              sourcePosition: Position.Right,
              targetPosition: Position.Left,
            };
            
            console.log('➕ Adding transaction cluster node');
            
            // Add edges to connect the cluster to the source node
            const clusterEdges = txsToShow.map((tx, idx) => {
              const txId = tx.data.txid || tx.data.metadata?.txid || tx.id;
              const edgeId = `e-${nodeId}-${clusterId}-${idx}`;
              
              if (direction === 'inputs') {
                // Input cluster: source node → cluster (right side)
                return {
                  id: edgeId,
                  source: nodeId,
                  target: clusterId,
                  // Don't specify sourceHandle - let React Flow auto-connect
                  targetHandle: `in-${idx}`, // Connect to left handle of cluster
                  type: 'default',
                  animated: false,
                  style: { stroke: '#4caf50', strokeWidth: 2 },
                };
              } else {
                // Output cluster: cluster → source node (left side)
                return {
                  id: edgeId,
                  source: clusterId,
                  target: nodeId,
                  sourceHandle: `tx-${idx}`, // Connect to right handle of cluster
                  // Don't specify targetHandle - let React Flow auto-connect
                  type: 'default',
                  animated: false,
                  style: { stroke: '#4caf50', strokeWidth: 2 },
                };
              }
            });
            
            console.log(`🔗 Adding ${clusterEdges.length} edges to connect transaction cluster`);
            setEdges((eds) => [...eds, ...clusterEdges]);
            
            return [...nds, clusterNode];
          }
          
          // If 3 or fewer TXs, show them individually
          // Use the first new TX
          const connectedTx = newTxs[0];
          console.log(`🆕 Adding NEW TX (${newTxs.length} total): ${connectedTx.id.substring(0, 20)}`);
          
          // Add the TX (if new) AND ALL addresses connected to it (inputs + outputs)
          const nodesToAdd = newNodes.filter(n => {
            if (existingIds.has(n.id)) return false;
            
            // Add the TX itself (if new)
            if (n.id === connectedTx.id) return true;
            
            // Add ALL addresses that connect to this TX
            if (n.type === 'address') {
              return newEdges.some(e => 
                (e.source === n.id && e.target === connectedTx.id) ||
                (e.target === n.id && e.source === connectedTx.id)
              );
            }
            
            return false;
          });
          
          if (nodesToAdd.length === 0) {
            console.log('⚠️ No nodes to add');
            return nds;
          }
          
          console.log('🆕 Adding:', nodesToAdd.length, 'nodes (TX + its OTHER addresses)');
          
          // Position: TX goes BETWEEN the source address and new addresses
          const sourceNode = nds.find(n => n.id === nodeId);
          
          // Separate TX and addresses
          const newTxNode = nodesToAdd.find(n => n.id === connectedTx.id);
          const newAddrNodes = nodesToAdd.filter(n => n.id !== connectedTx.id);
          
          // Determine if addresses are inputs or outputs of the NEW TX
          const inputAddresses = newAddrNodes.filter(n => 
            newEdges.some(e => e.source === n.id && e.target === connectedTx.id)
          );
          const outputAddresses = newAddrNodes.filter(n => 
            newEdges.some(e => e.source === connectedTx.id && e.target === n.id)
          );
          
          // Separate change outputs from regular outputs
          const changeOutputs = outputAddresses.filter(n => n.data.metadata?.is_change === true);
          const regularOutputs = outputAddresses.filter(n => n.data.metadata?.is_change !== true);
          
          // Apply maxOutputs limit
          const limitedRegularOutputs = regularOutputs.slice(0, maxOutputs);
          const limitedChangeOutputs = changeOutputs.slice(0, maxOutputs);
          
          if (regularOutputs.length > maxOutputs) {
            console.log(`⚠️ Limiting outputs: showing ${maxOutputs} of ${regularOutputs.length} regular outputs`);
          }
          if (changeOutputs.length > maxOutputs) {
            console.log(`⚠️ Limiting change outputs: showing ${maxOutputs} of ${changeOutputs.length} change outputs`);
          }
          
          console.log(`Expanding from address: ${inputAddresses.length} inputs, ${limitedRegularOutputs.length} outputs (of ${regularOutputs.length}), ${limitedChangeOutputs.length} change (of ${changeOutputs.length})`);
          
          const nodesWithHandlers = nodesToAdd.map((node) => {
            let x, y;
            
            if (node.id === connectedTx.id) {
              // TX goes 400px to the right of source address
              x = (sourceNode?.position.x ?? 0) + 400;
              y = sourceNode?.position.y ?? 0;
            } else if (inputAddresses.includes(node)) {
              // Input addresses go to the LEFT of the source address (-400px from source)
              const inputIdx = inputAddresses.indexOf(node);
              x = (sourceNode?.position.x ?? 0) - 400; // 400px to the left of source
              y = (sourceNode?.position.y ?? 0) + (inputIdx * 120) - (inputAddresses.length * 60);
              console.log(`  Input address ${inputIdx} at (${x}, ${y})`);
            } else if (node.data.metadata?.is_change === true) {
              // Change outputs go to the RIGHT of TX and slightly ABOVE regular outputs
              const changeIdx = limitedChangeOutputs.indexOf(node);
              if (changeIdx === -1) return null; // Skip if not in limited list
              const txX = (sourceNode?.position.x ?? 0) + 400; // TX position
              x = txX + 400; // 400px right of TX
              y = (sourceNode?.position.y ?? 0) - 20 - (changeIdx * 120); // 20px above center, stacked if multiple
              console.log(`  Change output ${changeIdx} at (${x}, ${y})`);
            } else {
              // Regular outputs go to the RIGHT of the TX (+400px from TX)
              const outputIdx = limitedRegularOutputs.indexOf(node);
              if (outputIdx === -1) return null; // Skip if not in limited list
              const txX = (sourceNode?.position.x ?? 0) + 400; // TX position
              x = txX + 400; // 400px right of TX
              y = (sourceNode?.position.y ?? 0) + (outputIdx * 120) - (limitedRegularOutputs.length * 60);
              console.log(`  Regular output ${outputIdx} at (${x}, ${y})`);
            }
            
            return {
              ...node,
              position: { x, y },
              data: { ...node.data, onExpand: handleExpandNode }
            };
          }).filter((node): node is NonNullable<typeof node> => node !== null);
          
          console.log('➕ Adding', nodesWithHandlers.length, 'nodes to', direction === 'inputs' ? 'LEFT' : 'RIGHT');
          
          // Save to history before expanding
          setHistory(prev => [...prev, { nodes: nodesToKeep, edges }]);
          
          // Store for viewport check later
          addedNodesRef.current = nodesWithHandlers;
          
          return [...nodesToKeep, ...nodesWithHandlers];
        });
        
        // Get current node IDs before adding edges
        const currentNodeIds = new Set<string>();
        setNodes((nds) => {
          nds.forEach(n => currentNodeIds.add(n.id));
          return nds;
        });
        
        setEdges((eds) => {
          // Only add edges where BOTH source AND target exist in current graph
          const connectedEdges = newEdges.filter(edge => {
            const bothExist = currentNodeIds.has(edge.source) && currentNodeIds.has(edge.target);
            const notDuplicate = !eds.some(e => e.id === edge.id);
            return bothExist && notDuplicate;
          });
          
          console.log('➕ Adding', connectedEdges.length, 'CONNECTED edges (both endpoints exist)');
          return [...eds, ...connectedEdges];
        });
        
        // Mark this expansion as complete
        setExpandedNodes(prev => new Set(prev).add(expandKey));
        
        // Only adjust viewport if new nodes are outside current view
        requestAnimationFrame(() => {
          if (addedNodesRef.current && !areNodesVisible(addedNodesRef.current)) {
            console.log('🎯 New nodes outside viewport - adjusting view');
            // Fit view without animation first to recalculate bounds
            fitView({ padding: 0.2, duration: 0, maxZoom: 1.5 });
            // Then animate to the new position
            setTimeout(() => {
              fitView({ padding: 0.2, duration: 300, maxZoom: 1.5 });
            }, 10);
          } else {
            console.log('✅ New nodes already visible - no viewport change needed');
          }
        });
      }
      
      // For transactions, show the connected addresses AND their previous/next TXs
      if (node.type === 'transaction') {
        const txid = node.data.txid || node.data.metadata?.txid;
        if (!txid) return;
        
        // Expand by ONLY +1 hop in the specified direction
        const currentHops = (node.data.metadata?.depth ?? 0);
        const expandHops = currentHops + 1;
        console.log('📡 Expanding transaction by +1 hop:', expandHops, 'direction:', direction);
        
        // Determine hops_before and hops_after based on direction
        const hopsBefore = direction === 'backward' ? expandHops : 0;
        const hopsAfter = direction === 'forward' ? expandHops : 0;
        const data = await traceFromUTXO(txid, 0, hopsBefore, hopsAfter, maxOutputs);
        
        // Merge new nodes/edges
        const { nodes: newNodes, edges: newEdges } = buildGraphFromTraceDataBipartite(data, edgeScaleMax, maxTransactions, maxOutputs);
        console.log('📦 Got new data:', newNodes.length, 'nodes');
        
        setNodes((nds) => {
          const existingIds = new Set(nds.map(n => n.id));
          
          // Get ALL new addresses AND transactions
          const newAddresses = newNodes.filter(n => 
            n.type === 'address' && 
            !existingIds.has(n.id)
          );
          
          const newTransactions = newNodes.filter(n =>
            n.type === 'transaction' &&
            !existingIds.has(n.id)
          );
          
          if (newAddresses.length === 0 && newTransactions.length === 0) {
            console.log('⚠️ No new nodes found');
            return nds;
          }
          
          console.log('🆕 Adding addresses:', newAddresses.length, 'and TXs:', newTransactions.length);
          
          // Position based on direction: LEFT = input TXs (parents), RIGHT = output TXs (children)
          const sourceNode = nds.find(n => n.id === nodeId);
          
          // Determine which addresses and TXs go where based on edges
          const inputAddresses = newAddresses.filter(addr =>
            newEdges.some(e => e.source === addr.id && e.target === nodeId)
          );
          const outputAddresses = newAddresses.filter(addr =>
            newEdges.some(e => e.source === nodeId && e.target === addr.id)
          );
          
          // For LEFT expansion: show input addresses and their source TXs
          // For RIGHT expansion: show output addresses and their destination TXs
          const relevantAddresses = direction === 'inputs' ? inputAddresses : outputAddresses;
          const changeAddresses = relevantAddresses.filter(addr => addr.data.metadata?.is_change === true);
          const regularAddresses = relevantAddresses.filter(addr => addr.data.metadata?.is_change !== true);
          
          console.log(`Expanding ${direction}: ${regularAddresses.length} regular, ${changeAddresses.length} change, ${newTransactions.length} TXs`);
          
          // Combine addresses and transactions for positioning
          const allNodesToAdd = [...relevantAddresses, ...newTransactions];
          
          const nodesWithHandlers = allNodesToAdd.map((node) => {
            let x, y;
            
            if (node.type === 'transaction') {
              // TXs go further out: LEFT (-1200) or RIGHT (+1200) from source TX
              const offset = direction === 'inputs' ? -400 : 400;
              const txIdx = newTransactions.indexOf(node);
              x = (sourceNode?.position.x ?? 0) + offset;
              y = (sourceNode?.position.y ?? 0) + (txIdx * 150) - (newTransactions.length * 75);
              console.log(`  TX ${txIdx} at (${x}, ${y})`);
            } else if (node.data.metadata?.is_change === true) {
              // Change outputs go to the RIGHT and slightly ABOVE regular outputs
              const offset = direction === 'inputs' ? -400 : 400;
              const changeIdx = changeAddresses.indexOf(node);
              x = (sourceNode?.position.x ?? 0) + offset;
              y = (sourceNode?.position.y ?? 0) - 20 - (changeIdx * 120); // 20px above, stacked if multiple
              console.log(`  Change address ${changeIdx} at (${x}, ${y})`);
            } else {
              // Regular addresses: LEFT (-400px) for inputs, RIGHT (+400px) for outputs
              const offset = direction === 'inputs' ? -400 : 400;
              const regularIdx = regularAddresses.indexOf(node);
              x = (sourceNode?.position.x ?? 0) + offset;
              y = (sourceNode?.position.y ?? 0) + (regularIdx * 120) - (regularAddresses.length * 60);
              console.log(`  Regular address ${regularIdx} at (${x}, ${y})`);
            }
            
            return {
              ...node,
              position: { x, y },
              data: { ...node.data, onExpand: handleExpandNode }
            };
          });
          
          console.log('➕ Adding', nodesWithHandlers.length, 'addresses to', direction === 'inputs' ? 'LEFT (parents)' : 'RIGHT (children)');
          
          // Store for viewport check later
          addedNodesRef.current = nodesWithHandlers;
          
          return [...nds, ...nodesWithHandlers];
        });
        
        // Get current node IDs before adding edges
        const currentNodeIds = new Set<string>();
        setNodes((nds) => {
          nds.forEach(n => currentNodeIds.add(n.id));
          return nds;
        });
        
        setEdges((eds) => {
          // Only add edges where BOTH source AND target exist in current graph
          const connectedEdges = newEdges.filter(edge => {
            const bothExist = currentNodeIds.has(edge.source) && currentNodeIds.has(edge.target);
            const notDuplicate = !eds.some(e => e.id === edge.id);
            return bothExist && notDuplicate;
          });
          
          console.log('➕ Adding', connectedEdges.length, 'CONNECTED edges (both endpoints exist)');
          return [...eds, ...connectedEdges];
        });
        
        // Mark this expansion as complete
        setExpandedNodes(prev => new Set(prev).add(expandKey));
        
        // Only adjust viewport if new nodes are outside current view
        requestAnimationFrame(() => {
          if (addedNodesRef.current && !areNodesVisible(addedNodesRef.current)) {
            console.log('🎯 New nodes outside viewport - adjusting view');
            // Fit view without animation first to recalculate bounds
            fitView({ padding: 0.2, duration: 0, maxZoom: 1.5 });
            // Then animate to the new position
            setTimeout(() => {
              fitView({ padding: 0.2, duration: 300, maxZoom: 1.5 });
            }, 10);
          } else {
            console.log('✅ New nodes already visible - no viewport change needed');
          }
        });
      }
    } catch (err) {
      console.error('❌ Expand error:', err);
      setError(err instanceof Error ? err.message : 'Failed to expand node');
    } finally {
      setIsLoading(false);
      
      // Check if no nodes were added
      setTimeout(() => {
        let addedAny = false;
        setNodes((nds) => {
          if (nds.length === nodes.length) {
            setError('No further nodes to expand');
            setTimeout(() => setError(null), 3000);
          } else {
            addedAny = true;
          }
          return nds;
        });
        if (!addedAny) {
          console.log('ℹ️ No nodes were added during expand');
        }
        
        // Re-enable repulsion after expansion completes
        if (wasRepulsionEnabled) {
          console.log('▶️  Re-enabling repulsion after expansion');
          setForceRepulsionEnabled(true);
          // Reheat simulation to apply repulsion to new nodes
          if (forceLayoutRef.current) {
            forceLayoutRef.current.reheatSimulation();
          }
        }
      }, 200);
    }
  }, [setNodes, setEdges, fitView, expandedNodes, setExpandedNodes, areNodesVisible, forceRepulsionEnabled]); // Don't include nodes to avoid stale closure!

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
    
    // Find all visible nodes (addresses AND transactions) that haven't been expanded backward yet
    const nodesToExpand = nodes.filter(n => {
      if (!visibleNodeIds.has(n.id)) return false; // Not visible
      
      // Check if already expanded in this direction
      const direction = n.type === 'address' ? 'receiving' : 'inputs';
      const expandKey = `${n.id}-${direction}`;
      if (expandedNodes.has(expandKey)) {
        console.log(`⏭️ Skipping ${n.id} - already expanded backward`);
        return false;
      }
      
      return true; // Include this node for expansion
    });
    
    console.log(`Found ${nodesToExpand.length} visible unexpanded nodes to expand backward`);
    
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
            console.warn(`Failed to expand ${node.id}:`, err);
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
    
    // Find all visible nodes (addresses AND transactions) that haven't been expanded forward yet
    const nodesToExpand = nodes.filter(n => {
      if (!visibleNodeIds.has(n.id)) return false; // Not visible
      
      // Check if already expanded in this direction
      const direction = n.type === 'address' ? 'spending' : 'outputs';
      const expandKey = `${n.id}-${direction}`;
      if (expandedNodes.has(expandKey)) {
        console.log(`⏭️ Skipping ${n.id} - already expanded forward`);
        return false;
      }
      
      return true; // Include this node for expansion
    });
    
    console.log(`Found ${nodesToExpand.length} visible unexpanded nodes to expand forward`);
    
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
        {/* Select Mode Toggle */}
        <button
          onClick={() => {
            setIsSelectMode(!isSelectMode);
            setIsPanMode(false);
          }}
          style={{
            padding: '8px',
            width: '36px',
            height: '36px',
            background: isSelectMode ? '#2196f3' : '#666',
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            fontSize: '18px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
            transition: 'all 0.2s ease',
          }}
          title={isSelectMode ? 'Exit select mode' : 'Enter select mode (select multiple nodes)'}
        >
          {isSelectMode ? '✓' : '⊟'}
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
