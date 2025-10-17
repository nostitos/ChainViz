import React from 'react';
import { Handle, Position } from '@xyflow/react';

interface TxInfo {
  txid: string;
  time?: number;
  blockHeight?: number;
  totalInput?: number;
  totalOutput?: number;
}

interface TransactionClusterData {
  transactions: TxInfo[];
  direction: 'inputs' | 'outputs';
  label: string;
  totalCount?: number; // Total number of transactions (including those not displayed)
  onExpand?: (txid: string, direction: 'inputs' | 'outputs') => void;
}

export const TransactionClusterNode: React.FC<{ data: TransactionClusterData }> = ({ data }) => {
  const { transactions, direction, label, totalCount } = data;
  
  const HEADER_HEIGHT = 45;
  const ROW_HEIGHT = 16;
  
  const formatBTC = (sats?: number) => {
    if (sats === undefined) return '?.????????';
    return (sats / 100000000).toFixed(8);
  };
  
  const formatDate = (timestamp?: number) => {
    if (!timestamp) return 'Unknown';
    return new Date(timestamp * 1000).toLocaleDateString();
  };
  
  const shortTxid = (txid: string) => {
    return `${txid.substring(0, 8)}...${txid.substring(txid.length - 8)}`;
  };

  return (
    <div className="transaction-cluster-node">
      {/* Create handles for each transaction in the cluster */}
      {transactions.map((tx, idx) => {
        const handleTop = HEADER_HEIGHT + (ROW_HEIGHT / 2) + (idx * ROW_HEIGHT);
        
        if (direction === 'inputs') {
          // Input clusters need BOTH left and right handles
          return (
            <React.Fragment key={`handles-${idx}`}>
              {/* LEFT handle - receives edges from addresses */}
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
              {/* RIGHT handle - sends to main transaction */}
              <Handle
                key={`source-${idx}`}
                type="source"
                position={Position.Right}
                id={`tx-${idx}`}
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
          // Output clusters only need RIGHT handles (send to addresses)
          return (
            <Handle
              key={`handle-${idx}`}
              type="source"
              position={Position.Right}
              id={`tx-${idx}`}
              style={{
                background: '#4caf50',
                width: 8,
                height: 8,
                right: -4,
                top: handleTop,
                position: 'absolute',
              }}
            />
          );
        }
      })}
      
      <div className="cluster-header">
        <div className="cluster-title">
          {totalCount && totalCount > transactions.length 
            ? `${transactions.length} of ${totalCount} ${label}` 
            : label}
        </div>
      </div>
      
      <div className="cluster-list">
        {transactions.map((tx, idx) => (
          <div key={tx.txid} className="tx-cluster-item" style={{ position: 'relative' }}>
            <span className="tx-cluster-txid" title={tx.txid}>
              {shortTxid(tx.txid)}
            </span>
            <span className="tx-cluster-date">{formatDate(tx.time)}</span>
            {tx.totalOutput !== undefined && (
              <span className="tx-cluster-amount">₿ {formatBTC(tx.totalOutput)}</span>
            )}
            
            {/* Expand button for inputs */}
            {direction === 'inputs' && (
              <button
                className="cluster-expand-btn nodrag"
                onClick={(e) => {
                  e.stopPropagation();
                  console.log('🔍 Expand from clustered transaction:', tx.txid);
                  if (data.onExpand) {
                    data.onExpand(tx.txid, 'inputs');
                  }
                }}
                title="Expand this transaction's inputs"
                style={{
                  position: 'absolute',
                  right: '4px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                }}
              >
                ◀
              </button>
            )}
            
            {/* Expand button for outputs */}
            {direction === 'outputs' && (
              <button
                className="cluster-expand-btn nodrag"
                onClick={(e) => {
                  e.stopPropagation();
                  console.log('🔍 Expand from clustered transaction:', tx.txid);
                  if (data.onExpand) {
                    data.onExpand(tx.txid, 'outputs');
                  }
                }}
                title="Expand this transaction's outputs"
                style={{
                  position: 'absolute',
                  right: '4px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                }}
              >
                ▶
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

