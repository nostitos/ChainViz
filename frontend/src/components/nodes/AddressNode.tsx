import { memo, useState, useEffect } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Wallet, AlertCircle } from 'lucide-react';

export const AddressNode = memo(({ id, data, selected }: NodeProps) => {
  const address = data.address || data.metadata?.address || 'Unknown';
  const isChange = data.metadata?.is_change ?? false;
  const changeReasons = data.metadata?.change_reasons || [];
  const clusterId = data.metadata?.cluster_id;
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
  
  // Fetch balance on mount
  useEffect(() => {
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
  }, [address]);

  const handleExpandSpending = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('🔍 Expanding spending for:', address);
    console.log('onExpand available?', !!data.onExpand);
    if (data.onExpand) {
      console.log('✅ Calling onExpand with:', id, 'spending');
      data.onExpand(id, 'spending');
    } else {
      console.error('❌ No onExpand callback!');
    }
  };

  const handleExpandReceiving = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('🔍 Expanding receiving for:', address);
    console.log('onExpand available?', !!data.onExpand);
    if (data.onExpand) {
      console.log('✅ Calling onExpand with:', id, 'receiving');
      data.onExpand(id, 'receiving');
    } else {
      console.error('❌ No onExpand callback!');
    }
  };

  // External link button removed (available in side panel)

  return (
    <div className={`address-node ${selected ? 'selected' : ''} ${isChange ? 'change' : ''}`}>
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

