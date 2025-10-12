import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Wallet } from 'lucide-react';

interface ClusterData {
  addresses: Array<{
    address: string;
    amount: number;
    isChange?: boolean;
    vout?: number; // UTXO index for outputs
  }>;
  direction: 'inputs' | 'outputs';
  onExpand?: (nodeId: string, direction: 'inputs' | 'outputs') => void;
}

export const AddressClusterNode = memo(({ id, data, selected }: NodeProps) => {
  const clusterData = data as ClusterData;
  const { addresses, direction } = clusterData;
  
  const HEADER_HEIGHT = 45; // Height of the header (padding + font + margin + spacing)
  const ROW_HEIGHT = 14; // EXPLICIT height set in CSS (.cluster-item { height: 14px })
  
  const totalAmount = addresses.reduce((sum, a) => sum + a.amount, 0);
  const formatBTC = (sats: number) => (sats / 100000000).toFixed(8) + ' BTC';
  const shortAddr = (addr: string) => 
    addr.length > 20 ? `${addr.substring(0, 8)}...${addr.substring(addr.length - 8)}` : addr;

  return (
    <div className={`address-cluster-node ${selected ? 'selected' : ''}`}>
      {/* Create ALL handles upfront so React Flow can find them */}
      {addresses.map((item, idx) => {
        const handleTop = HEADER_HEIGHT + (ROW_HEIGHT / 2) + (idx * ROW_HEIGHT);
        
        if (direction === 'inputs') {
          // Input clusters need BOTH left and right handles
          return (
            <React.Fragment key={`handles-${idx}`}>
              {/* LEFT handle - receives edges from expanded addresses */}
              <Handle
                key={`target-${idx}`}
                type="target"
                position={Position.Left}
                id={`in-${idx}`}
                style={{
                  background: '#4caf50',
                  width: 8,
                  height: 8,
                  left: -4,
                  top: handleTop,
                  position: 'absolute',
                }}
              />
              {/* RIGHT handle - sends to transaction */}
              <Handle
                key={`source-${idx}`}
                type="source"
                position={Position.Right}
                id={`addr-${idx}`}
                style={{
                  background: '#4caf50',
                  width: 8,
                  height: 8,
                  right: -4,
                  top: handleTop,
                  position: 'absolute',
                }}
              />
            </React.Fragment>
          );
        } else {
          // Output clusters only need LEFT handles (receive from TX)
          return (
            <Handle
              key={`handle-${idx}`}
              type="target"
              position={Position.Left}
              id={`addr-${idx}`}
              style={{
                background: item.isChange ? '#ffa726' : '#4caf50',
                width: 8,
                height: 8,
                left: -4,
                top: handleTop,
                position: 'absolute',
              }}
            />
          );
        }
      })}
      
      <div className="cluster-header">
        <Wallet size={16} />
        <span className="cluster-title">
          {addresses.length} {direction === 'inputs' ? 'Inputs' : 'Outputs'}
        </span>
        <span className="cluster-total">{formatBTC(totalAmount)}</span>
      </div>
      
      <div className="cluster-list">
        {addresses.map((item, idx) => {
          // Create tooltip with full address and vout info
          const tooltip = direction === 'outputs' && item.vout !== undefined
            ? `vout ${item.vout}: ${item.address}`
            : item.address;
          
          return (
          <div key={idx} className="cluster-item" style={{ position: 'relative' }}>
            
            <span className="cluster-addr" title={tooltip}>
              {shortAddr(item.address)}
            </span>
            <span className="cluster-amt">{formatBTC(item.amount)}</span>
            {item.isChange && <span className="cluster-change-tag">CHG</span>}
            
            {/* Expand button for outputs */}
            {direction === 'outputs' && (
              <button
                className="cluster-expand-btn nodrag"
                onClick={(e) => {
                  e.stopPropagation();
                  console.log('🔍 Expand from clustered address:', item.address);
                  if (clusterData.onExpand) {
                    // Create a synthetic node ID for this address
                    clusterData.onExpand(`addr_${item.address}`, 'spending');
                  }
                }}
                title="Expand this address"
              >
                ▶
              </button>
            )}
            
            {/* Expand button for inputs */}
            {direction === 'inputs' && (
              <button
                className="cluster-expand-btn nodrag"
                onClick={(e) => {
                  e.stopPropagation();
                  console.log('🔍 Expand from clustered address:', item.address);
                  if (clusterData.onExpand) {
                    clusterData.onExpand(`addr_${item.address}`, 'receiving');
                  }
                }}
                title="Expand this address"
              >
                ◀
              </button>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
});

AddressClusterNode.displayName = 'AddressClusterNode';

