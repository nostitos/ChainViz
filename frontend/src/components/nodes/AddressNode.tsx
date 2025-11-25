import { memo, useCallback, useState, useRef } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Wallet, AlertCircle, Copy } from 'lucide-react';
import { formatBTC } from '@/services/graphBuilder';

interface AddressDetails {
  address: string;
  balance: number;
  total_received: number;
  total_sent: number;
  tx_count: number;
  receiving_count?: number | null;
  spending_count?: number | null;
  utxos?: any[];
  script_type?: string | null;
  cluster_id?: string | null;
}

interface AddressNodeData {
  address?: string;
  metadata?: {
    address?: string;
    is_change?: boolean;
    change_reasons?: string[];
    cluster_id?: string;
    is_starting_point?: boolean;
    receiving_count?: number;
    spending_count?: number;
  };
  addressDetails?: AddressDetails;
  onExpand?: (nodeId: string, direction: 'inputs' | 'outputs' | 'spending' | 'receiving') => void;
}

export const AddressNode = memo(({ id, data, selected }: NodeProps) => {
  const nodeData = data as AddressNodeData;
  const address = nodeData.address || nodeData.metadata?.address || 'Unknown';
  const details = nodeData.addressDetails;



  const isChange = nodeData.metadata?.is_change ?? false;
  const changeReasons = nodeData.metadata?.change_reasons || [];
  const clusterId = nodeData.metadata?.cluster_id;
  const isStartingPoint = nodeData.metadata?.is_starting_point ?? false;
  const [isExpanded, setIsExpanded] = useState(false);
  const expandTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const receivingCount = details?.receiving_count ?? nodeData.metadata?.receiving_count ?? null;
  const spendingCount = details?.spending_count ?? nodeData.metadata?.spending_count ?? null;
  const utxoCount = details?.utxos?.length ?? 0;
  const txCount = details?.tx_count ?? 0;
  const totalReceived = details?.total_received ?? 0;
  const totalSent = details?.total_sent ?? 0;
  const balance = details?.balance ?? 0;
  const hasPositiveBalance = balance > 0;

  const shortAddress = address.length > 12
    ? `${address.substring(0, 6)}...${address.substring(address.length - 6)}`
    : address;

  const changeReasonText = changeReasons.length > 0
    ? changeReasons.join(', ')
    : 'Change detected';

  const handleCopyAddress = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(address);
    } catch (err) {
      console.error('Failed to copy address:', err);
    }
  }, [address]);

  const handleExpandSpending = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    console.log('🔍 Expanding spending for:', address);
    if (nodeData.onExpand) {
      nodeData.onExpand(id, 'spending');
    } else {
      console.error('❌ No onExpand callback!');
    }
  };

  const handleExpandReceiving = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    console.log('🔍 Expanding receiving for:', address);
    if (nodeData.onExpand) {
      nodeData.onExpand(id, 'receiving');
    } else {
      console.error('❌ No onExpand callback!');
    }
  };

  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    if (expandTimeoutRef.current) {
      clearTimeout(expandTimeoutRef.current);
    }
    const target = e.target as Element | null;
    if (target?.closest('.expand-handle-btn')) {
      return;
    }
    expandTimeoutRef.current = setTimeout(() => {
      setIsExpanded(true);
    }, 200);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const elementAtPoint = document.elementFromPoint(e.clientX, e.clientY);
    if (elementAtPoint?.closest('.expand-handle-btn')) {
      if (expandTimeoutRef.current) {
        clearTimeout(expandTimeoutRef.current);
        expandTimeoutRef.current = null;
      }
      setIsExpanded(false);
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (expandTimeoutRef.current) {
      clearTimeout(expandTimeoutRef.current);
      expandTimeoutRef.current = null;
    }
    setIsExpanded(false);
  }, []);

  return (
    <div
      className={`address-node ${selected ? 'selected' : ''} ${isChange ? 'change' : ''} ${isStartingPoint ? 'starting-point' : ''} ${isExpanded ? 'expanded' : ''}`}
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
      <Handle type="target" position={Position.Left} id="receiving" style={{ background: '#4caf50' }} />
      <Handle type="source" position={Position.Right} id="spending" style={{ background: '#ff9800' }} />

      <div className="node-header">
        {/* TOP LEFT expand button (receiving) */}
        <button
          className="expand-handle-btn top-left nodrag"
          onClick={handleExpandReceiving}
          title="Expand receiving"
        >
          <span className="io-count">{receivingCount !== null ? receivingCount : '?'}</span>
          <span className="arrow">◀</span>
        </button>

        <div className="header-content">
          <Wallet size={22} className="wallet-icon" />
          <span className="node-value" title={address}>{shortAddress}</span>
          <button
            className="copy-address-btn nodrag"
            onClick={handleCopyAddress}
            title="Copy address"
          >
            <Copy size={12} />
          </button>

          {isChange && <AlertCircle size={14} className="change-icon" />}
        </div>

        {/* TOP RIGHT expand button (spending) */}
        <button
          className="expand-handle-btn top-right nodrag"
          onClick={handleExpandSpending}
          title="Expand spending"
        >
          <span className="arrow">▶</span>
          <span className="io-count">{spendingCount !== null ? spendingCount : '?'}</span>
        </button>
      </div>

      {hasPositiveBalance && (
        <div className="address-balance-inline">
          <span>{formatBTC(balance)}</span>
        </div>
      )}

      <div className="node-content">
        <div className="node-meta">
          {isChange && <span className="change-tag" title={changeReasonText}>CHANGE</span>}
          {(clusterId || details?.cluster_id) && (
            <span className="cluster-tag">C:{clusterId || details?.cluster_id}</span>
          )}
        </div>

        <div className="addr-hover-details">
          {!details && (
            <div className="addr-loading">Loading address info…</div>
          )}

          {details && (
            <>
              <div className="addr-stat-row">
                <div className="addr-stat">
                  <span className="label">Balance</span>
                  <span className="value">{formatBTC(balance)}</span>
                </div>
                <div className="addr-stat">
                  <span className="label">TXs</span>
                  <span className="value">{txCount}</span>
                </div>
              </div>

              <div className="addr-stat-row">
                <div className="addr-stat">
                  <span className="label">Received</span>
                  <span className="value">{formatBTC(totalReceived)}</span>
                </div>
                <div className="addr-stat">
                  <span className="label">Sent</span>
                  <span className="value">{formatBTC(totalSent)}</span>
                </div>
              </div>

              {utxoCount > 0 && (
                <div className="addr-stat-row">
                  <div className="addr-stat">
                    <span className="label">UTXOs</span>
                    <span className="value">{utxoCount}</span>
                  </div>
                </div>
              )}

              {details.script_type && (
                <div className="addr-stat-row">
                  <div className="addr-stat">
                    <span className="label">Type</span>
                    <span className="value">{details.script_type}</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
});

AddressNode.displayName = 'AddressNode';

