import { memo, useCallback, useState, useRef, useEffect } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ArrowRightLeft, Clock, ShieldAlert, Activity, Copy } from 'lucide-react';
import { formatBTC } from '@/services/graphBuilder';

interface TransactionNodeData {
  txid?: string;
  metadata?: {
    txid?: string;
    timestamp?: number;
    inputCount?: number;
    outputCount?: number;
    is_starting_point?: boolean;
    inputs?: Array<{address: string; value: number}>;
    outputs?: Array<{address: string; value: number}>;
  };
  onExpand?: (nodeId: string, direction: 'inputs' | 'outputs') => void;
  onUpdateNodeData?: (nodeId: string, updates: any) => void;
}

type AddressEntry = {
  address: string;
  value: number;
};

type HoverDetails = {
  inputCount: number;
  outputCount: number;
  inputs: AddressEntry[];
  outputs: AddressEntry[];
  fee: number | null;
  feeRate: number | null;
  size?: number;
  vsize?: number;
  weight?: number;
  totalInputValue: number;
  totalOutputValue: number;
  confirmations?: number;
  blockHeight?: number | null;
  coinjoinInfo?: unknown;
  changeOutput?: number | null;
};

export const TransactionNode = memo(({ id, data, selected }: NodeProps) => {
  const nodeData = data as TransactionNodeData;
  const txid = nodeData.txid || nodeData.metadata?.txid || 'Unknown';
  const timestamp = nodeData.metadata?.timestamp;
  const isStartingPoint = nodeData.metadata?.is_starting_point ?? false;
  const [hoverData, setHoverData] = useState<HoverDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [hoverError, setHoverError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const expandTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
  
  const formattedDate = timestamp 
    ? new Date(timestamp * 1000).toLocaleString([], { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric',
        hour: '2-digit', 
        minute: '2-digit' 
      })
    : '';
  
  // Show only first and last 6 characters
  const shortTxid = txid.length > 12 
    ? `${txid.substring(0, 6)}...${txid.substring(txid.length - 6)}`
    : txid;
  
  const handleCopyTxid = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(txid);
      // Could add a toast notification here if desired
    } catch (err) {
      console.error('Failed to copy TXID:', err);
    }
  }, [txid]);

  const handleExpandInputs = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    console.log('🔍 Expanding inputs for:', txid);
    console.log('🔍 nodeData.onExpand exists?', !!nodeData.onExpand);
    if (nodeData.onExpand) {
      console.log('✅ Calling onExpand with inputs');
      nodeData.onExpand(id, 'inputs');
    } else {
      console.error('❌ No onExpand handler!');
    }
  };

  const handleExpandOutputs = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    console.log('🔍 Expanding outputs for:', txid);
    console.log('🔍 nodeData.onExpand exists?', !!nodeData.onExpand);
    if (nodeData.onExpand) {
      console.log('✅ Calling onExpand with outputs');
      nodeData.onExpand(id, 'outputs');
    } else {
      console.error('❌ No onExpand handler!');
    }
  };

  // Remove hover-driven TX fetch; we’ll fetch once on mount below
  
  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    const target = e.target as Element | null;
    if (target?.closest('.expand-handle-btn')) {
      return;
    }
    if (expandTimeoutRef.current) {
      clearTimeout(expandTimeoutRef.current);
    }
    expandTimeoutRef.current = setTimeout(() => {
      setIsExpanded(true);
    }, 200);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // If we're over a button, clear any pending timeout and collapse
    const elementAtPoint = document.elementFromPoint(e.clientX, e.clientY);
    if (elementAtPoint?.closest('.expand-handle-btn')) {
      if (expandTimeoutRef.current) {
        clearTimeout(expandTimeoutRef.current);
        expandTimeoutRef.current = null;
      }
      setIsExpanded(false);
    }
  }, []);
  
  const handleMouseLeave = useCallback((e: React.MouseEvent) => {
    // Don't clear if moving to a button
    const relatedTarget = (e.nativeEvent as MouseEvent).relatedTarget as HTMLElement;
    if (relatedTarget?.closest('.expand-handle-btn')) {
      return;
    }
    
    // Clear the expansion timeout if mouse leaves before delay completes
    if (expandTimeoutRef.current) {
      clearTimeout(expandTimeoutRef.current);
      expandTimeoutRef.current = null;
    }
    
    // Reset expanded state (keep hoverData cached for re-expansion)
    setIsExpanded(false);
  }, []);

  const displayedInputMetric =
    hoverData?.inputCount ??
    nodeData.metadata?.inputs?.length ??
    nodeData.metadata?.inputCount ??
    '?';
  const displayedOutputMetric =
    hoverData?.outputCount ??
    nodeData.metadata?.outputs?.length ??
    nodeData.metadata?.outputCount ??
    '?';
  const isCoinJoin = Boolean(hoverData?.coinjoinInfo);
  const hasChangeOutput = hoverData?.changeOutput !== null && hoverData?.changeOutput !== undefined;

  // Prefetch TX details once on mount to populate counts/addresses (no hover reloads)
  useEffect(() => {
    let aborted = false;
    (async () => {
      if (!txid || hoverData) return;
      try {
        setLoadingDetails(true);
        setHoverError(null);
        const response = await fetch(`${apiBase}/transaction/${txid}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        if (aborted) return;
        const tx = payload.transaction;
        const inputs: AddressEntry[] = (tx.inputs || [])
          .filter((inp: any) => inp.address)
          .map((inp: any) => ({ address: inp.address, value: inp.value ?? 0 }));
        const outputs: AddressEntry[] = (tx.outputs || [])
          .filter((out: any) => out.address)
          .map((out: any) => ({ address: out.address, value: out.value ?? 0 }));
        const totalInputValue = inputs.reduce((sum, entry) => sum + (entry.value || 0), 0);
        const totalOutputValue = outputs.reduce((sum, entry) => sum + (entry.value || 0), 0);
        setHoverData({
          inputCount: tx.inputs?.length ?? 0,
          outputCount: tx.outputs?.length ?? 0,
          inputs,
          outputs,
          fee: tx.fee ?? null,
          feeRate: payload.fee_rate ?? null,
          size: tx.size,
          vsize: tx.vsize,
          weight: tx.weight,
          totalInputValue,
          totalOutputValue,
          confirmations: tx.confirmations,
          blockHeight: tx.block_height,
          coinjoinInfo: payload.coinjoin_info,
          changeOutput: payload.change_output ?? null,
        });
        if (nodeData.onUpdateNodeData) {
          nodeData.onUpdateNodeData(id, { inputs, outputs });
        }
      } catch (err) {
        if (!aborted) setHoverError('Failed to load details');
      } finally {
        if (!aborted) setLoadingDetails(false);
      }
    })();
    return () => {
      aborted = true;
      if (expandTimeoutRef.current) {
        clearTimeout(expandTimeoutRef.current);
      }
    };
  }, [apiBase, txid, hoverData, id, nodeData.onUpdateNodeData]);

  return (
    <div 
      className={`transaction-node ${selected ? 'selected' : ''} ${isStartingPoint ? 'starting-point' : ''} ${isExpanded ? 'expanded' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={isStartingPoint ? {
        borderColor: '#fbbf24',
        borderWidth: '3px',
        boxShadow: '0 0 15px rgba(251, 191, 36, 0.5)',
        background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.2), rgba(251, 191, 36, 0.05))'
      } : undefined}
    >
      {/* Handles for connections - auto positioning */}
      <Handle type="target" position={Position.Left} style={{ background: '#4caf50' }} />
      <Handle type="source" position={Position.Right} style={{ background: '#ff9800' }} />
      
      <div className="node-header">
        {/* TOP LEFT expand button */}
        <button 
          className="expand-handle-btn top-left nodrag" 
          onClick={handleExpandInputs}
          title="Expand inputs"
        >
          <span className="io-count">{displayedInputMetric}</span>
          <span className="arrow">◀</span>
        </button>
        
        <div className="header-content">
        <ArrowRightLeft size={18} />
        <span className="node-value" title={txid}>{shortTxid}</span>
          <button 
            className="copy-txid-btn nodrag" 
            onClick={handleCopyTxid} 
            title="Copy TXID"
          >
            <Copy size={12} />
          </button>
        </div>
        
        {/* TOP RIGHT expand button */}
        <button 
          className="expand-handle-btn top-right nodrag" 
          onClick={handleExpandOutputs}
          title="Expand outputs"
        >
          <span className="arrow">▶</span>
          <span className="io-count">{displayedOutputMetric}</span>
        </button>
      </div>
      
      <div className="node-content">
        {timestamp && (
        <div className="node-meta">
            <span className="node-time">
              <Clock size={11} /> {formattedDate}
            </span>
          </div>
        )}
        
        <div className="tx-hover-details">
          {loadingDetails && <div className="tx-loading">Loading details…</div>}
          {hoverError && <div className="tx-error">{hoverError}</div>}
          
          {hoverData && (
            <>
              <div className="tx-stat-row">
                {hoverData.feeRate !== null && (
                  <div className="tx-stat">
                    <span className="label">Fee</span>
                    <span className="value">{hoverData.feeRate} sat/vB</span>
                  </div>
                )}
                {(hoverData.vsize ?? hoverData.size) && (
                  <div className="tx-stat">
                    <span className="label">Size</span>
                    <span className="value">{hoverData.vsize ?? hoverData.size} vB</span>
                  </div>
          )}
        </div>
        
              {hoverData.confirmations !== undefined && hoverData.confirmations > 0 && (
                <div className="tx-stat-row">
                  <div className="tx-stat">
                    <span className="label">Confs</span>
                    <span className="value">{hoverData.confirmations}</span>
                  </div>
                </div>
              )}

              <div className="tx-stat-row">
                <div className="tx-stat">
                  <span className="label">Transacted</span>
                  <span className="value">{formatBTC(hoverData.totalOutputValue)}</span>
                </div>
              </div>

              <div className="tx-badges">
                {isCoinJoin && <span className="tx-coinjoin-badge"><ShieldAlert size={12} /> CoinJoin?</span>}
                {hasChangeOutput && <span className="tx-change-badge"><Activity size={12} /> Change detected</span>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
});

TransactionNode.displayName = 'TransactionNode';

