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
}

export const TransactionClusterNode: React.FC<{ data: TransactionClusterData }> = ({ data }) => {
  const { transactions, direction, label } = data;
  
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
      {/* Handle for connections */}
      {direction === 'inputs' && <Handle type="target" position={Position.Left} />}
      {direction === 'outputs' && <Handle type="source" position={Position.Right} />}
      
      <div className="cluster-header">
        <div className="cluster-title">{label}</div>
      </div>
      
      <div className="cluster-list">
        {transactions.map((tx, idx) => (
          <div key={tx.txid} className="tx-cluster-item">
            <span className="tx-cluster-txid" title={tx.txid}>
              {shortTxid(tx.txid)}
            </span>
            <span className="tx-cluster-date">{formatDate(tx.time)}</span>
            {tx.totalOutput !== undefined && (
              <span className="tx-cluster-amount">₿ {formatBTC(tx.totalOutput)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

