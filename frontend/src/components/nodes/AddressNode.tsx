import { memo, useState, useEffect } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Wallet, AlertCircle } from 'lucide-react';

interface AddressNodeData {
  address?: string;
  metadata?: {
    address?: string;
    is_change?: boolean;
    change_reasons?: string[];
    cluster_id?: string;
    is_starting_point?: boolean;
  };
  onExpand?: (nodeId: string, direction: 'inputs' | 'outputs' | 'spending' | 'receiving') => void;
  balanceFetchingEnabled?: boolean;
}

export const AddressNode = memo(({ id, data, selected }: NodeProps) => {
  const nodeData = data as AddressNodeData;
  const address = nodeData.address || nodeData.metadata?.address || 'Unknown';
  const isChange = nodeData.metadata?.is_change ?? false;
  const changeReasons = nodeData.metadata?.change_reasons || [];
  const clusterId = nodeData.metadata?.cluster_id;
  const isStartingPoint = nodeData.metadata?.is_starting_point ?? false;
  const balanceFetchingEnabled = nodeData.balanceFetchingEnabled ?? true;
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Show only first and last 6 characters
  const shortAddress = address.length > 12
    ? `${address.substring(0, 6)}...${address.substring(address.length - 6)}`
    : address;
  
  // Format change reasons for display
  const changeReasonText = changeReasons.length > 0 
    ? changeReasons.join(', ') 
    : 'Change detected';
  
  // Fetch balance and metadata on mount (only if enabled)
  useEffect(() => {
    if (!balanceFetchingEnabled) return; // Skip if disabled
    if (!address || address === 'Unknown') return;
    
    setLoading(true);
    fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api'}/address/${address}`)
      .then(res => res.json())
      .then(data => {
        setBalance(data.balance / 100000000); // Convert satoshis to BTC
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch balance:', err);
        setLoading(false);
      });
  }, [address, balanceFetchingEnabled]);
  

  const handleExpandSpending = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('🔍 Expanding spending for:', address);
    console.log('onExpand available?', !!nodeData.onExpand);
    if (nodeData.onExpand) {
      console.log('✅ Calling onExpand with:', id, 'spending');
      nodeData.onExpand(id, 'spending');
    } else {
      console.error('❌ No onExpand callback!');
    }
  };

  const handleExpandReceiving = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('🔍 Expanding receiving for:', address);
    console.log('onExpand available?', !!nodeData.onExpand);
    if (nodeData.onExpand) {
      console.log('✅ Calling onExpand with:', id, 'receiving');
      nodeData.onExpand(id, 'receiving');
    } else {
      console.error('❌ No onExpand callback!');
    }
  };

  // External link button removed (available in side panel)

  return (
    <div 
      className={`address-node ${selected ? 'selected' : ''} ${isChange ? 'change' : ''} ${isStartingPoint ? 'starting-point' : ''}`}
      style={isStartingPoint ? {
        borderColor: '#fbbf24',
        borderWidth: '3px',
        boxShadow: '0 0 15px rgba(251, 191, 36, 0.5)',
        background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.2), rgba(251, 191, 36, 0.05))'
      } : undefined}
    >
        {/* LEFT side expand button */}
      <div className="handle-container left">
        <button className="expand-handle-btn nodrag" onClick={handleExpandReceiving} title="Expand more">
          ◀
        </button>
      </div>
      
      {/* RIGHT side expand button */}
      <div className="handle-container right">
        <button className="expand-handle-btn nodrag" onClick={handleExpandSpending} title="Expand more">
          ▶
        </button>
      </div>
      
      {/* Handles for connections - auto positioning */}
      <Handle type="target" position={Position.Left} id="receiving" style={{ background: '#4caf50' }} />
      <Handle type="source" position={Position.Right} id="spending" style={{ background: '#ff9800' }} />
      
      <div className="node-header">
        <Wallet size={18} />
        <span className="node-value" title={address}>{shortAddress}</span>
        {isChange && <AlertCircle size={14} className="change-icon" />}
      </div>
      
      <div className="node-content compact">
        <div className="node-meta">
          {isChange && <span className="change-tag" title={changeReasonText}>CHANGE</span>}
          {clusterId && <span className="cluster-tag">C:{clusterId}</span>}
        </div>
        {!loading && balance !== null && balance > 0 && (
          <div className="balance-text" title={`${balance.toFixed(8)} BTC`}>
            ₿ {balance.toFixed(8)}
          </div>
        )}
      </div>
    </div>
  );
});

AddressNode.displayName = 'AddressNode';

