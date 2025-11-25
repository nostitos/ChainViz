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
  SelectionMode,
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
import { findRootNode } from './utils/treeLayout';
import { buildFlowLayout } from './utils/flowLayout';
import { expandTransactionNode, expandAddressNode, expandAddressNodeWithFetch, loadMoreTransactions } from './utils/expansionHelpers';
import { useForceLayout } from './hooks/useForceLayout';
import { useEdgeTension } from './hooks/useEdgeTension';
import { useGraphHistory } from './hooks/useGraphHistory';
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

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

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

  const { takeSnapshot, undo, redo, canUndo, canRedo } = useGraphHistory();

  // Get query from URL (reactive to changes)
  const [urlQuery, setUrlQuery] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('q') || '';
  });
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

  const [forceRepulsionEnabled, setForceRepulsionEnabled] = useState(getCookieBool('forceRepulsionEnabled', false)); // Load from cookie - default OFF to save CPU
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

  // Helper to add progress log with limit to prevent memory leak
  const addLog = useCallback((type: 'info' | 'success' | 'error' | 'electrum', message: string) => {
    setProgressLogs(prev => {
      const newLog = { timestamp: Date.now(), type, message };
      const updated = [...prev, newLog];
      // Keep only last 100 logs to prevent unbounded growth
      return updated.slice(-100);
    });
  }, []);

  // Helper to track network request with limit
  const trackRequest = useCallback((hop: number, bytes: number) => {
    setHopStats(prev => {
      const existing = prev.find(s => s.hop === hop);
      if (existing) {
        return prev.map(s => s.hop === hop ? { ...s, requestCount: s.requestCount + 1, totalBytes: s.totalBytes + bytes } : s);
      }
      // Limit to 50 hops max to prevent unbounded growth
      const updated = [...prev, { hop, requestCount: 1, totalBytes: bytes }];
      return updated.slice(-50);
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

  // Recalculate edge widths when edgeScaleMax changes (with debounce to prevent memory spikes)
  const edgeScaleMaxRef = useRef(edgeScaleMax);
  useEffect(() => {
    edgeScaleMaxRef.current = edgeScaleMax;

    // Debounce edge recalculation to prevent rapid updates
    const timer = setTimeout(() => {
      setEdges((eds) => {
        const minAmountSats = 100000; // 0.001 BTC
        const scaleMaxSats = edgeScaleMaxRef.current * 100000000; // Convert BTC to satoshis
        const sqrtBase = Math.sqrt(scaleMaxSats / minAmountSats);

        return eds.map(edge => {
          const amount = edge.data?.amount || 0;
          let strokeWidth = 2;
          if (amount > minAmountSats) {
            const sqrtValue = Math.sqrt(amount / minAmountSats) / sqrtBase;
            strokeWidth = 2 + (sqrtValue * 68); // 2px base + up to 68px (70% of 100px)
          }

          // Only update if strokeWidth actually changed
          const currentWidth = edge.style?.strokeWidth || 2;
          if (Math.abs(currentWidth - strokeWidth) < 0.5) {
            return edge; // Return same object to prevent re-render
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
    }, 100); // 100ms debounce

    return () => clearTimeout(timer);
  }, [edgeScaleMax, setEdges]);
  const [history, setHistory] = useState<Array<{ nodes: Node[], edges: Edge[] }>>([]);
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

  const onNodeMouseEnter = useCallback((_: React.MouseEvent, node: Node) => {
    // Move hovered node to end of array so it renders on top
    setNodes((nds) => {
      // Optimization: if node is already at the end, do nothing to avoid re-renders
      if (nds.length > 0 && nds[nds.length - 1].id === node.id) {
        return nds;
      }
      const filtered = nds.filter((n) => n.id !== node.id);
      return [...filtered, node];
    });
  }, [setNodes]);

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
    takeSnapshot(nodesRef.current, edgesRef.current, expandedNodes);
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
  }, []); // getViewport is stable from React Flow, no need in deps

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
  }, []); // getViewport is stable from React Flow, no need in deps

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

  // Handle Flow Layout (Semantic: Inputs -> Tx -> Outputs)
  const handleFlowLayout = useCallback(() => {
    console.log('🌊 Applying Flow Layout...');
    setIsOptimizing(true);

    setNodes((nds) => {
      // Try to find the original query address/tx as root first
      // This ensures backward expansion creates negative ranks
      let rootNodeId: string | null = null;

      if (urlQuery) {
        const cleanQuery = urlQuery.trim();
        // Try to find node matching the query
        const queryNode = nds.find(n =>
          n.id === cleanQuery ||
          n.id === `addr_${cleanQuery}` ||
          n.id === `tx_${cleanQuery}`
        );

        if (queryNode) {
          rootNodeId = queryNode.id;
          console.log(`🎯 Using query address as root: ${rootNodeId}`);
        } else {
          console.warn(`⚠️ Query node '${cleanQuery}' not found in graph. Available nodes:`, nds.length);
        }
      }

      // Fall back to findRootNode if query not found
      if (!rootNodeId) {
        rootNodeId = findRootNode(nds, edges);
      }

      if (!rootNodeId) {
        console.warn('⚠️ No root node found');
        setIsOptimizing(false);
        return nds;
      }

      console.log(`🌊 Root node: ${rootNodeId}`);

      // Apply Flow Layout
      const flowNodes = buildFlowLayout(nds, edges, rootNodeId, {
        horizontalSpacing: 450,
        verticalSpacing: 60,
      });

      return flowNodes;
    });

    // Re-fit view after layout
    setTimeout(() => {
      fitView({ padding: 0.2, duration: 400 });
      setIsOptimizing(false);
      console.log('✅ Flow layout complete!');
    }, 100);
  }, [edges, setNodes, fitView, urlQuery]);

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
  // IMPORTANT: Only enable for small-medium graphs to prevent memory leaks
  const forceLayout = useForceLayout(nodes, edges, {
    enabled: forceRepulsionEnabled && nodes.length > 0 && nodes.length < 150,
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

  // Store latest nodes/edges in refs to avoid stale closures
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const fetchedAddressesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    nodesRef.current = nodes;
    edgesRef.current = edges;
  }, [nodes, edges]);

  const hydrateAddressNodes = useCallback(async (targetNodes?: Node[]) => {
    const sourceNodes = targetNodes ?? nodesRef.current;
    if (!sourceNodes || sourceNodes.length === 0) {
      return;
    }

    const addresses = Array.from(
      new Set(
        sourceNodes
          .filter((node) => node.type === 'address')
          .map((node) => {
            const nodeData = node.data as any;
            const addr = nodeData?.address || nodeData?.metadata?.address;
            if (!addr) {
              return null;
            }
            if (nodeData?.addressDetails) {
              return null;
            }
            if (fetchedAddressesRef.current.has(addr)) {
              return null;
            }
            return addr;
          })
          .filter((addr): addr is string => Boolean(addr))
      )
    );

    if (addresses.length === 0) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/address/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          addresses,
          include_details: true,
        }),
      });

      if (!response.ok) {
        console.error('Batch address lookup failed', response.status);
        return;
      }

      const payload: any[] = await response.json();
      const detailMap = new Map<string, any>();
      payload.forEach((entry) => {
        if (entry?.address) {
          detailMap.set(entry.address, entry);
          fetchedAddressesRef.current.add(entry.address);
        }
      });

      if (detailMap.size === 0) {
        console.warn('hydrateAddressNodes: Payload returned 0 addresses');
        return;
      }

      console.log('hydrateAddressNodes: Updating nodes with details for:', Array.from(detailMap.keys()));

      setNodes((current) =>
        current.map((node) => {
          if (node.type !== 'address') {
            return node;
          }
          const nodeData = node.data as any;
          const addr = nodeData?.address || nodeData?.metadata?.address;
          if (!addr) {
            console.warn('hydrateAddressNodes: Node missing address', node.id);
            return node;
          }
          const details = detailMap.get(addr);
          if (!details) {
            // Only log if we expected this address to be in the payload (i.e. it was in the request)
            if (addresses.includes(addr)) {
              console.warn(`hydrateAddressNodes: No details returned for ${addr}`);
            }
            return node;
          }
          return {
            ...node,
            data: {
              ...nodeData,
              addressDetails: details,
            },
          };
        })
      );
    } catch (error) {
      console.error('Failed to batch fetch addresses', error);
    }
  }, [setNodes]);

  // Estimate how many nodes would be added by expansion
  const estimateExpansionSize = useCallback((node: Node, direction: 'inputs' | 'outputs' | 'spending' | 'receiving'): number => {
    if (node.type === 'transaction') {
      // For TX: Check metadata for input/output counts
      const metadata = node.data.metadata as any;
      const count = direction === 'inputs'
        ? (metadata?.inputCount || 0)
        : (metadata?.outputCount || 0);

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
  const handleExpandNode = useCallback(async (nodeId: string, direction?: 'inputs' | 'outputs' | 'spending' | 'receiving', saveHistory: boolean = true) => {
    console.log('🚀 Expanding:', nodeId, direction);

    if (saveHistory) {
      takeSnapshot(nodesRef.current, edgesRef.current, expandedNodes);
    }

    const expandKey = `${nodeId}-${direction}`;

    // Check if already expanded
    if (expandedNodes.has(expandKey)) {
      console.log('Already expanded:', expandKey);
      setError('Already expanded in this direction');
      setTimeout(() => setError(null), 2000);
      return;
    }

    // Get fresh node and edges state from refs to avoid stale closure
    const currentNodes = nodesRef.current;
    const currentEdges = edgesRef.current;
    const node = currentNodes.find(n => n.id === nodeId);

    console.log(`📊 handleExpandNode: ${currentNodes.length} nodes in state`);

    if (!node) {
      console.error('❌ Node not found:', nodeId);
      console.error('Looking for:', JSON.stringify(nodeId));
      console.error('Available IDs:', currentNodes.map(n => JSON.stringify(n.id)));
      console.error('ID match check:', currentNodes.map(n => ({
        id: n.id,
        matches: n.id === nodeId,
        lengthDiff: n.id.length - nodeId.length
      })));
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

    let lastApiRequest: string | null = null;

    try {
      let result: { nodes: Node[]; edges: Edge[] };

      if (node.type === 'transaction') {
        // Check if we have the required metadata
        const metadata = node.data.metadata as any;
        const requiredData = direction === 'inputs' ? metadata?.inputs : metadata?.outputs;

        if (!requiredData || requiredData.length === 0) {
          // Need to fetch transaction details first
          console.log(`📡 Fetching transaction details for ${node.id} before expansion...`);
          const txid = metadata?.txid || node.data.txid;
          if (!txid) {
            console.error('❌ Transaction node missing txid');
            setError('Transaction node missing ID');
            setTimeout(() => setError(null), 2000);
            setIsLoading(false);
            return;
          }

          lastApiRequest = `${API_BASE_URL}/transaction/${txid}`;

          try {
            const response = await fetch(lastApiRequest);
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`);
            }
            const payload = await response.json();
            const tx = payload.transaction;

            // Parse inputs and outputs
            // DON'T filter out inputs/outputs! Backend provides placeholders for non-standard addresses
            const inputs: Array<{ address: string; value: number }> = (tx.inputs || [])
              .map((inp: any) => ({
                address: inp.address || 'Unknown',
                value: inp.value ?? 0,
              }));
            const outputs: Array<{ address: string; value: number }> = (tx.outputs || [])
              .map((out: any) => ({
                address: out.address || 'Unknown',
                value: out.value ?? 0,
              }));

            // Update node metadata with fetched data
            setNodes((nds) =>
              nds.map((n) => {
                if (n.id === nodeId) {
                  return {
                    ...n,
                    data: {
                      ...n.data,
                      metadata: {
                        ...n.data.metadata,
                        inputs,
                        outputs,
                      },
                    },
                  };
                }
                return n;
              })
            );

            // Update the node reference for expansion
            const updatedNodes = nodesRef.current.map((n) => {
              if (n.id === nodeId) {
                return {
                  ...n,
                  data: {
                    ...n.data,
                    metadata: {
                      ...n.data.metadata,
                      inputs,
                      outputs,
                    },
                  },
                };
              }
              return n;
            });
            nodesRef.current = updatedNodes;

            // Now expand with updated node
            const updatedNode = updatedNodes.find(n => n.id === nodeId);
            if (updatedNode) {
              result = expandTransactionNode(updatedNode, direction as 'inputs' | 'outputs', edgeScaleMax);
            } else {
              result = { nodes: [], edges: [] };
            }
          } catch (error) {
            console.error('Failed to fetch transaction details:', error);
            setError('Failed to fetch transaction details');
            setTimeout(() => setError(null), 3000);
            setIsLoading(false);
            return;
          }
        } else {
          // Expand from cached metadata (NO network call!)
          result = expandTransactionNode(node, direction as 'inputs' | 'outputs', edgeScaleMax);
        }
      } else if (node.type === 'address') {
        // Try to expand from existing edges first
        const expandResult = expandAddressNode(node, direction as 'receiving' | 'spending', currentNodes, currentEdges);

        // Check if we need to fetch from backend (newly-added address)
        if ('needsFetch' in expandResult && expandResult.needsFetch) {
          // Check if it's a placeholder (P2PK, No Address, etc.)
          const address = expandResult.address;
          if (address.includes('P2PK') || address.includes('No Address') || address.includes('OP_RETURN')) {
            console.log(`⏭️ Skipping expansion for placeholder address: ${address}`);
            result = { nodes: [], edges: [] };
          } else {
            console.log(`📡 Newly-added address - fetching TX history from backend...`);

            const existingIds = new Set(currentNodes.map(n => n.id));
            lastApiRequest = `${API_BASE_URL}/trace/address?address=${encodeURIComponent(address)}&direction=${direction}`;

            result = await expandAddressNodeWithFetch(
              address,
              node,
              direction as 'receiving' | 'spending',
              edgeScaleMax,
              API_BASE_URL,
              existingIds,
              maxTransactions
            );

            // Show warning toast if present (10-50 TX range)
            if ('warning' in result && result.warning) {
              setError(result.warning);
              setTimeout(() => setError(null), 1500);
            }
          }
        } else {
          result = expandResult;
        }
      } else {
        console.warn('Unknown node type:', node.type);
        return;
      }

      // Filter to only NEW nodes (use fresh state!)
      const existingIds = new Set(currentNodes.map(n => n.id));
      const newNodes = result.nodes.filter(n => !existingIds.has(n.id));
      const newEdges = result.edges.filter(e => !currentEdges.some(existing => existing.id === e.id));

      if (newNodes.length === 0 && newEdges.length === 0) {
        console.log('No new nodes or edges to add (all already in graph)');

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

      // Add nodes with expand handler and loadMore handler
      // Add nodes with expand handler and loadMore handler
      setNodes(nds => {
        const existingIds = new Set(nds.map(n => n.id));
        const uniqueNewNodes = newNodes.filter(n => !existingIds.has(n.id));

        if (uniqueNewNodes.length === 0) return nds;

        const combined = [...nds, ...uniqueNewNodes.map(n => {
          // Add appropriate handlers based on node type
          if (n.type === 'loadMore') {
            return {
              ...n,
              data: { ...n.data, onLoadMore: handleLoadMore }
            };
          } else {
            return {
              ...n,
              data: { ...n.data, onExpand: handleExpandNode, balanceFetchingEnabled, maxTransactions }
            };
          }
        })];

        return combined;
      });

      // Add edges
      setEdges(eds => {
        const existingIds = new Set(eds.map(e => e.id));
        const uniqueNewEdges = newEdges.filter(e => !existingIds.has(e.id));
        return uniqueNewEdges.length > 0 ? [...eds, ...uniqueNewEdges] : eds;
      });
      hydrateAddressNodes(newNodes);

      // Mark as expanded
      setExpandedNodes(prev => new Set(prev).add(expandKey));

    } catch (error) {
      console.error('Error expanding node:', error);
      const nodeDescriptor =
        node?.type === 'transaction'
          ? node?.data?.metadata?.txid || node?.data?.label || node?.id
          : node?.data?.address || node?.data?.metadata?.address || node?.data?.label || node?.id;
      const parts = [
        `Failed to expand ${node?.type || 'node'} ${nodeDescriptor ?? ''}`.trim(),
        direction ? `Direction: ${direction}` : null,
        lastApiRequest ? `API: ${lastApiRequest}` : null,
        error instanceof Error ? `Reason: ${error.message}` : null,
      ].filter(Boolean);
      setError(parts.join(' • '));
    } finally {
      setIsLoading(false);
    }
  }, [expandedNodes, edgeScaleMax, balanceFetchingEnabled, maxTransactions, hydrateAddressNodes]); // setNodes/setEdges are stable from React Flow

  // Handle LoadMore button clicks for progressive loading
  const handleLoadMore = useCallback(async (address: string, direction: string, currentOffset: number) => {
    console.log(`📥 LoadMore clicked: ${address.substring(0, 20)}, ${direction}, offset=${currentOffset}`);

    setIsLoading(true);

    try {
      // Get current nodes/edges from refs to avoid stale closure
      const currentNodes = nodesRef.current;
      const currentEdges = edgesRef.current;

      // Find the address node
      const addrNode = currentNodes.find(n => n.id === `addr_${address}`);
      if (!addrNode) {
        console.error('❌ Address node not found:', address);
        return;
      }

      const existingIds = new Set(currentNodes.map(n => n.id));

      // Load next batch
      const result = await loadMoreTransactions(
        address,
        direction as 'receiving' | 'spending',
        currentOffset,
        addrNode,
        edgeScaleMax,
        API_BASE_URL,
        existingIds,
        maxTransactions
      );

      console.log(`✅ Loaded ${result.nodes.length} more TXs, ${result.remainingCount} remaining`);

      // Find and remove old LoadMore node
      const oldLoadMoreId = `loadmore-tx-cluster-${address}-${direction}`;
      const filteredNodes = currentNodes.filter(n => n.id !== oldLoadMoreId);

      // Add new TX nodes
      const newNodes = [...filteredNodes, ...result.nodes];

      // Create new LoadMore node if there are still remaining TXs
      if (result.remainingCount > 0) {
        const spacing = 90;
        const xOffset = direction === 'receiving' ? -480 : 480;
        const newOffset = currentOffset + result.nodes.length;

        // Position LoadMore below the last TX
        const lastTxY = result.nodes[result.nodes.length - 1]?.position.y || 0;

        const loadMoreNode: Node = {
          id: oldLoadMoreId,
          type: 'loadMore',
          position: {
            x: addrNode.position.x + xOffset,
            y: lastTxY + spacing,
          },
          data: {
            remainingCount: result.remainingCount,
            address,
            direction,
            currentOffset: newOffset,
            totalCount: currentOffset + result.nodes.length + result.remainingCount,
            onLoadMore: handleLoadMore,
          },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
        };

        newNodes.push(loadMoreNode);
      }

      // Add new edges
      const newEdges = [...currentEdges, ...result.edges];

      setNodes(newNodes);
      setEdges(newEdges);
      hydrateAddressNodes(result.nodes);

    } catch (error) {
      console.error('Error loading more transactions:', error);
      setError('Failed to load more transactions');
    } finally {
      setIsLoading(false);
    }
  }, [edgeScaleMax, maxTransactions, hydrateAddressNodes]); // nodes/edges read from refs, setNodes/setEdges are stable from React Flow

  // Delete selected nodes
  const handleDeleteSelected = useCallback(() => {
    const selectedNodes = nodesRef.current.filter(n => n.selected);
    if (selectedNodes.length === 0) return;

    takeSnapshot(nodesRef.current, edgesRef.current, expandedNodes);

    const selectedIds = new Set(selectedNodes.map(n => n.id));

    // Remove nodes
    const newNodes = nodesRef.current.filter(n => !selectedIds.has(n.id));

    // Remove connected edges
    const newEdges = edgesRef.current.filter(e =>
      !selectedIds.has(e.source) && !selectedIds.has(e.target)
    );

    // Update expandedNodes state
    const newExpandedNodes = new Set(expandedNodes);

    // 1. Remove keys for deleted nodes
    for (const key of expandedNodes) {
      const [nodeId] = key.split('-');
      if (selectedIds.has(nodeId)) {
        newExpandedNodes.delete(key);
      }
    }

    // 2. Remove keys for surviving neighbors that lost a connection
    // Identify edges being removed where one end is DELETED and the other is SURVIVING
    const removedEdges = edgesRef.current.filter(e =>
      (selectedIds.has(e.source) && !selectedIds.has(e.target)) ||
      (!selectedIds.has(e.source) && selectedIds.has(e.target))
    );

    removedEdges.forEach(e => {
      if (selectedIds.has(e.source)) {
        // Source deleted, Target survives.
        // Target lost an input (if Tx) or receiving (if Addr)
        // We need to reset the Target's expansion state in that direction
        const targetNode = nodesRef.current.find(n => n.id === e.target);
        if (targetNode) {
          if (targetNode.type === 'transaction') {
            // Tx lost an input (Addr). Reset 'inputs'
            newExpandedNodes.delete(`${targetNode.id}-inputs`);
          } else if (targetNode.type === 'address') {
            // Addr lost a sender (Tx). Reset 'receiving'
            newExpandedNodes.delete(`${targetNode.id}-receiving`);
          }
        }
      } else {
        // Target deleted, Source survives.
        // Source lost an output (if Tx) or spending (if Addr)
        const sourceNode = nodesRef.current.find(n => n.id === e.source);
        if (sourceNode) {
          if (sourceNode.type === 'transaction') {
            // Tx lost an output (Addr). Reset 'outputs'
            newExpandedNodes.delete(`${sourceNode.id}-outputs`);
          } else if (sourceNode.type === 'address') {
            // Addr lost a spender (Tx). Reset 'spending'
            newExpandedNodes.delete(`${sourceNode.id}-spending`);
          }
        }
      }
    });

    setNodes(newNodes);
    setEdges(newEdges);
    setExpandedNodes(newExpandedNodes);

    addLog('info', `🗑️ Deleted ${selectedNodes.length} nodes`);
  }, [takeSnapshot, addLog, expandedNodes]);

  // Handle Delete/Backspace key for deletion
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only if not typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        handleDeleteSelected();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDeleteSelected]);

  // Prune leaf nodes (degree <= 1)
  const handlePruneLeaves = useCallback(() => {
    const currentNodes = nodesRef.current;
    const currentEdges = edgesRef.current;

    // Calculate degree
    const degree = new Map<string, number>();
    currentEdges.forEach(e => {
      degree.set(e.source, (degree.get(e.source) || 0) + 1);
      degree.set(e.target, (degree.get(e.target) || 0) + 1);
    });

    // Identify leaves (degree <= 1)
    // Exclude origin/search query node
    const leaves = currentNodes.filter(n => {
      const d = degree.get(n.id) || 0;
      return d <= 1 && n.id !== urlQuery;
    });

    if (leaves.length === 0) {
      addLog('info', 'No leaf nodes to prune');
      return;
    }

    takeSnapshot(currentNodes, currentEdges, expandedNodes);

    const leafIds = new Set(leaves.map(n => n.id));

    const newNodes = currentNodes.filter(n => !leafIds.has(n.id));
    const newEdges = currentEdges.filter(e =>
      !leafIds.has(e.source) && !leafIds.has(e.target)
    );

    // Update expandedNodes state
    const newExpandedNodes = new Set(expandedNodes);

    // 1. Remove keys for deleted nodes
    for (const key of expandedNodes) {
      const [nodeId] = key.split('-');
      if (leafIds.has(nodeId)) {
        newExpandedNodes.delete(key);
      }
    }

    // 2. Remove keys for surviving neighbors that lost a connection
    // Identify edges being removed where one end is DELETED and the other is SURVIVING
    const removedEdges = currentEdges.filter(e =>
      (leafIds.has(e.source) && !leafIds.has(e.target)) ||
      (!leafIds.has(e.source) && leafIds.has(e.target))
    );

    removedEdges.forEach(e => {
      if (leafIds.has(e.source)) {
        // Source deleted, Target survives.
        // Target lost an input (if Tx) or receiving (if Addr)
        const targetNode = currentNodes.find(n => n.id === e.target);
        if (targetNode) {
          if (targetNode.type === 'transaction') {
            // Tx lost an input (Addr). Reset 'inputs'
            newExpandedNodes.delete(`${targetNode.id}-inputs`);
          } else if (targetNode.type === 'address') {
            // Addr lost a sender (Tx). Reset 'receiving'
            newExpandedNodes.delete(`${targetNode.id}-receiving`);
          }
        }
      } else {
        // Target deleted, Source survives.
        // Source lost an output (if Tx) or spending (if Addr)
        const sourceNode = currentNodes.find(n => n.id === e.source);
        if (sourceNode) {
          if (sourceNode.type === 'transaction') {
            // Tx lost an output (Addr). Reset 'outputs'
            newExpandedNodes.delete(`${sourceNode.id}-outputs`);
          } else if (sourceNode.type === 'address') {
            // Addr lost a spender (Tx). Reset 'spending'
            newExpandedNodes.delete(`${sourceNode.id}-spending`);
          }
        }
      }
    });

    setNodes(newNodes);
    setEdges(newEdges);
    setExpandedNodes(newExpandedNodes);

    addLog('success', `🍂 Pruned ${leaves.length} leaf nodes`);
  }, [takeSnapshot, urlQuery, addLog, expandedNodes]);

  // Expand graph by one hop backward
  const handleExpandBackward = useCallback(async () => {
    takeSnapshot(nodesRef.current, edgesRef.current, expandedNodes);
    // Get fresh nodes state from ref to avoid stale closure
    const currentNodes = nodesRef.current;

    if (currentNodes.length === 0) return;

    console.log('⬅️ Expanding graph by 1 hop backward...');

    // Get visible nodes in viewport
    const visibleNodeIds = getVisibleNodeIds(currentNodes);
    const visibleNodes = currentNodes.filter(n => visibleNodeIds.has(n.id));

    if (visibleNodes.length === 0) {
      console.log('No visible nodes to expand');
      return;
    }

    // Check for selection - if any nodes are selected, only consider those
    const selectedVisibleNodes = visibleNodes.filter(n => n.selected);
    const candidateNodes = selectedVisibleNodes.length > 0 ? selectedVisibleNodes : visibleNodes;

    // Find origin node (search query or 0,0) to determine "left/right" split
    const originNode = currentNodes.find(n => n.id === urlQuery) || currentNodes.find(n => Math.abs(n.position.x) < 1 && Math.abs(n.position.y) < 1);
    const originX = originNode ? originNode.position.x : 0;

    // Filter to only unexpanded nodes to the LEFT of origin
    const nodesToExpand = candidateNodes.filter(n => {
      // Only expand nodes that are physically to the left of the origin (with small tolerance)
      if (n.position.x > originX + 10) return false;
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
              await handleExpandNode(node.id, 'receiving', false);
            } else if (node.type === 'transaction') {
              await handleExpandNode(node.id, 'inputs', false);
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
  }, [expandedNodes, getVisibleNodeIds, handleExpandNode, addLog, setCurrentProgress]);

  // Expand graph by one hop forward
  const handleExpandForward = useCallback(async () => {
    takeSnapshot(nodesRef.current, edgesRef.current, expandedNodes);
    // Get fresh nodes state from ref to avoid stale closure
    const currentNodes = nodesRef.current;

    if (currentNodes.length === 0) return;

    console.log('➡️ Expanding graph by 1 hop forward...');
    console.log(`📊 Current graph has ${currentNodes.length} nodes:`, currentNodes.map(n => `${n.id} (${n.type})`).join(', '));

    // Get visible nodes in viewport
    const visibleNodeIds = getVisibleNodeIds(currentNodes);
    const visibleNodes = currentNodes.filter(n => visibleNodeIds.has(n.id));

    if (visibleNodes.length === 0) {
      console.log('No visible nodes to expand');
      return;
    }

    // Check for selection - if any nodes are selected, only consider those
    const selectedVisibleNodes = visibleNodes.filter(n => n.selected);
    const candidateNodes = selectedVisibleNodes.length > 0 ? selectedVisibleNodes : visibleNodes;

    // Find origin node (search query or 0,0) to determine "left/right" split
    const originNode = currentNodes.find(n => n.id === urlQuery) || currentNodes.find(n => Math.abs(n.position.x) < 1 && Math.abs(n.position.y) < 1);
    const originX = originNode ? originNode.position.x : 0;

    // Filter to only unexpanded nodes to the RIGHT of origin
    const nodesToExpand = candidateNodes.filter(n => {
      // Only expand nodes that are physically to the right of the origin (with small tolerance)
      if (n.position.x < originX - 10) return false;
      const direction = n.type === 'address' ? 'spending' : 'outputs';
      const expandKey = `${n.id}-${direction}`;
      if (expandedNodes.has(expandKey)) {
        console.log(`⏭️ Skipping ${n.id} - already expanded forward`);
        return false;
      }
      return true;
    });

    console.log(`Expanding ${nodesToExpand.length} rightmost unexpanded nodes`);
    console.log('Node IDs to expand:', nodesToExpand.map(n => `${n.id} (${n.type})`));

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
              await handleExpandNode(node.id, 'spending', false);
            } else if (node.type === 'transaction') {
              await handleExpandNode(node.id, 'outputs', false);
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
  }, [expandedNodes, getVisibleNodeIds, handleExpandNode, addLog, setCurrentProgress]);

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
      const { nodes: newNodes, edges: newEdges } = buildGraphFromTraceDataBipartite(data, edgeScaleMax, txLimit, maxOutputs);
      console.log('🎨 Built graph:', newNodes.length, 'nodes,', newEdges.length, 'edges');

      // Add expand handler to all nodes
      const nodesWithHandlers = newNodes.map(node => ({
        ...node,
        data: { ...node.data, onExpand: handleExpandNode, balanceFetchingEnabled, maxTransactions }
      }));

      // Debug: Check if handlers were added
      console.log('🔍 First node has onExpand?', !!nodesWithHandlers[0]?.data?.onExpand);

      // Clear history when loading new graph (not an expansion)
      setHistory([]);

      setNodes(nodesWithHandlers);
      setEdges(newEdges);
      fetchedAddressesRef.current = new Set();
      hydrateAddressNodes(nodesWithHandlers);

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
  }, [setNodes, setEdges, fitView, hydrateAddressNodes, maxTransactions, maxOutputs, edgeScaleMax, balanceFetchingEnabled, handleExpandNode, addLog, setCurrentProgress, handleExpandBackward, handleExpandForward]);

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
        data: { ...node.data, onExpand: handleExpandNode, balanceFetchingEnabled, maxTransactions }
      }));

      setNodes(nodesWithHandlers);
      setEdges(newEdges);
      fetchedAddressesRef.current = new Set();
      hydrateAddressNodes(nodesWithHandlers);

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
  }, [setNodes, setEdges, fitView, addLog, hydrateAddressNodes, maxTransactions, maxOutputs, edgeScaleMax, balanceFetchingEnabled, handleExpandNode, setCurrentProgress, handleExpandBackward, handleExpandForward]);



  // Re-attach onExpand handler to all nodes (for restored graphs or when handler changes)
  // OPTIMIZED: Only update if handler actually changed to prevent unnecessary re-renders
  const handleExpandNodeRef = useRef(handleExpandNode);
  const handleLoadMoreRef = useRef(handleLoadMore);

  useEffect(() => {
    handleExpandNodeRef.current = handleExpandNode;
    handleLoadMoreRef.current = handleLoadMore;
  }, [handleExpandNode, handleLoadMore]);

  useEffect(() => {
    // Only run once when settings change, not on every render
    setNodes((nds) =>
      nds.map((node) => {
        // Only create new object if callbacks are different
        const needsUpdate =
          node.data.onExpand !== handleExpandNodeRef.current ||
          (node.type === 'loadMore' && node.data.onLoadMore !== handleLoadMoreRef.current);

        if (!needsUpdate) {
          return node;
        }

        return {
          ...node,
          data: {
            ...node.data,
            onExpand: handleExpandNodeRef.current,
            onLoadMore: node.type === 'loadMore' ? handleLoadMoreRef.current : node.data.onLoadMore,
            onUpdateNodeData: (nodeId: string, updates: any) => {
              setNodes((nds) => {
                const updated = nds.map((n) => {
                  if (n.id === nodeId) {
                    return {
                      ...n,
                      data: {
                        ...n.data,
                        metadata: {
                          ...n.data.metadata,
                          ...updates,
                        },
                      },
                    };
                  }
                  return n;
                });
                // Update ref immediately so expansion can use it
                nodesRef.current = updated;
                return updated;
              });
            },
          },
        };
      })
    );
  }, [setNodes, maxOutputs, maxTransactions, handleExpandNode, handleLoadMore]);

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

  // Throttled viewport change detection (update max once per 1000ms to reduce memory pressure)
  const lastViewportUpdateRef = useRef(0);
  const onMove = useCallback(() => {
    // Only track viewport for very large graphs (200+ nodes)
    if (nodes.length < 200) return;

    const now = Date.now();
    if (now - lastViewportUpdateRef.current > 1000) {
      lastViewportUpdateRef.current = now;
      setViewportVersion(v => v + 1);
    }
  }, [nodes.length]);

  const visibleNodes = useMemo(() => {
    // Only apply hiding for VERY large graphs (300+ nodes) - increased threshold
    if (nodes.length < 300) return nodes;

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
  }, [nodes, viewportVersion]); // Removed getViewport from deps - it's stable from React Flow

  // Expand graph by one hop backward


  // Expand only the selected node forward
  const handleExpandSelectedForward = useCallback(async () => {
    if (!selectedEntity) {
      console.log('No node selected');
      return;
    }

    const direction = selectedEntity.type === 'address' ? 'spending' : 'outputs';
    await handleExpandNode(selectedEntity.id, direction);
  }, [selectedEntity, handleExpandNode]);

  // Expand only the selected node backward
  const handleExpandSelectedBackward = useCallback(async () => {
    if (!selectedEntity) {
      console.log('No node selected');
      return;
    }

    const direction = selectedEntity.type === 'address' ? 'receiving' : 'inputs';
    await handleExpandNode(selectedEntity.id, direction);
  }, [selectedEntity, handleExpandNode]);



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

      if (e.key === '<') {
        // Shift+, → expand all visible backward
        e.preventDefault();
        handleExpandBackward();
      } else if (e.key === ',') {
        // , → expand selected backward
        e.preventDefault();
        handleExpandSelectedBackward();
      } else if (e.key === '>') {
        // Shift+. → expand all visible forward
        e.preventDefault();
        handleExpandForward();
      } else if (e.key === '.') {
        // . → expand selected forward
        e.preventDefault();
        handleExpandSelectedForward();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleExpandBackward, handleExpandForward, handleExpandSelectedBackward, handleExpandSelectedForward]);

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
          onNodeMouseEnter={onNodeMouseEnter}
          onPaneClick={onPaneClick}
          onNodeDragStop={onNodeDragStop}
          nodeTypes={memoizedNodeTypes}
          edgeTypes={edgeTypes}
          nodesDraggable={true}
          minZoom={0.1}
          maxZoom={4}
          deleteKeyCode={null} // Disable native deletion to use our custom handler with history
          defaultEdgeOptions={{
            type: 'default',
            animated: edgeAnimation,
          }}
          proOptions={{ hideAttribution: true }}
          panOnDrag={!isSelectMode}
          selectionOnDrag={isSelectMode}
          panOnScroll={false}
          zoomOnScroll={true}
          selectionMode={SelectionMode.Partial}
          multiSelectionKeyCode={isSelectMode ? "Shift" : null}
          // Performance optimizations
          nodeOrigin={[0.5, 0.5]}
          selectNodesOnDrag={isSelectMode}
          elevateNodesOnSelect={false}
        >
          <Panel position="top-left" style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => undo(nodes, edges, expandedNodes, setNodes, setEdges, setExpandedNodes)}
              disabled={!canUndo}
              className="react-flow__controls-button"
              style={{
                width: 'auto',
                padding: '6px 12px',
                opacity: canUndo ? 1 : 0.5,
                background: '#333',
                color: '#fff',
                border: '1px solid #555',
                borderRadius: '4px',
                cursor: canUndo ? 'pointer' : 'not-allowed',
                fontSize: '14px',
                fontWeight: 600
              }}
              title="Undo (Cmd+Z)"
            >
              ↩️ Undo
            </button>
            <button
              onClick={() => redo(nodes, edges, expandedNodes, setNodes, setEdges, setExpandedNodes)}
              disabled={!canRedo}
              className="react-flow__controls-button"
              style={{
                width: 'auto',
                padding: '6px 12px',
                opacity: canRedo ? 1 : 0.5,
                background: '#333',
                color: '#fff',
                border: '1px solid #555',
                borderRadius: '4px',
                cursor: canRedo ? 'pointer' : 'not-allowed',
                fontSize: '14px',
                fontWeight: 600
              }}
              title="Redo (Cmd+Shift+Z)"
            >
              ↪️ Redo
            </button>
            <div style={{ width: '1px', background: '#555', margin: '0 4px' }} />
            <button
              onClick={handleDeleteSelected}
              className="react-flow__controls-button"
              style={{
                width: 'auto',
                padding: '6px 12px',
                background: '#333',
                color: '#ff6b6b',
                border: '1px solid #555',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 600
              }}
              title="Delete Selected (Delete/Backspace)"
            >
              🗑️ Delete
            </button>
            <button
              onClick={handlePruneLeaves}
              className="react-flow__controls-button"
              style={{
                width: 'auto',
                padding: '6px 12px',
                background: '#333',
                color: '#4dabf7',
                border: '1px solid #555',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 600
              }}
              title="Prune Leaf Nodes"
            >
              🍂 Prune Leaves
            </button>
          </Panel>
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
                <path d="M3 3v10h10V3H3zm1 1h8v8H4V4z" />
                <rect x="1" y="1" width="4" height="4" opacity="0.5" />
                <rect x="11" y="1" width="4" height="4" opacity="0.5" />
                <rect x="1" y="11" width="4" height="4" opacity="0.5" />
                <rect x="11" y="11" width="4" height="4" opacity="0.5" />
              </svg>
              SELECT
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 3L6 5h1.5v3H5V6.5L3 8l2 1.5V8h2.5v3H6l2 2 2-2H8.5V8H11v1.5l2-1.5-2-1.5V8H8.5V5H10l-2-2z" />
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

        {/* Flow Layout Button */}
        <button
          onClick={handleFlowLayout}
          disabled={nodes.length === 0 || isOptimizing}
          style={{
            padding: '8px 16px',
            background: nodes.length === 0 || isOptimizing ? '#555' : '#2196f3',
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
          title="Apply semantic flow layout (Inputs -> Tx -> Outputs)"
        >
          � {isOptimizing ? 'Applying...' : 'Flow Layout'}
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
              // Auto-apply flow layout when enabled
              handleFlowLayout();
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
          title={treeLayoutEnabled ? 'Disable flow layout mode' : 'Enable flow layout mode (auto-apply on expansion)'}
        >
          {treeLayoutEnabled ? '� Flow ON' : '⭕ Flow OFF'}
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

        {/* Performance Monitor (only in development) - Note: Uses requestAnimationFrame so it will add some CPU usage */}
        {import.meta.env.DEV && (
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
