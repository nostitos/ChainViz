import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ArrowRightLeft, Clock } from 'lucide-react';

export const TransactionNode = memo(({ id, data, selected }: NodeProps) => {
  const txid = data.txid || data.metadata?.txid || 'Unknown';
  const timestamp = data.metadata?.timestamp;
  const depth = data.metadata?.depth ?? 0;
  const inputCount = data.metadata?.inputCount ?? 0;
  const outputCount = data.metadata?.outputCount ?? 0;
  
  const formattedDate = timestamp 
    ? new Date(timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';
  
  // Show only first and last 6 characters
  const shortTxid = txid.length > 12 
    ? `${txid.substring(0, 6)}...${txid.substring(txid.length - 6)}`
    : txid;

  const handleExpandInputs = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('🔍 Expanding inputs for:', txid);
    if (data.onExpand) {
      data.onExpand(id, 'inputs');
    }
  };

  const handleExpandOutputs = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('🔍 Expanding outputs for:', txid);
    if (data.onExpand) {
      data.onExpand(id, 'outputs');
    }
  };

  // External link button removed (available in side panel)

  return (
    <div className={`transaction-node ${selected ? 'selected' : ''}`}>
      {/* LEFT side expand button */}
      <div className="handle-container left">
        <button className="expand-handle-btn nodrag" onClick={handleExpandInputs} title="Expand inputs">
          ◀
        </button>
      </div>
      
      {/* RIGHT side expand button */}
      <div className="handle-container right">
        <button className="expand-handle-btn nodrag" onClick={handleExpandOutputs} title="Expand outputs">
          ▶
        </button>
      </div>
      
      {/* Handles for connections - auto positioning */}
      <Handle type="target" position={Position.Left} style={{ background: '#4caf50' }} />
      <Handle type="source" position={Position.Right} style={{ background: '#ff9800' }} />
      
      <div className="node-header">
        <ArrowRightLeft size={18} />
        <span className="node-value" title={txid}>{shortTxid}</span>
      </div>
      
      <div className="node-content">
        <div className="node-meta">
          {timestamp && (
            <span className="node-time">
              <Clock size={11} /> {formattedDate}
            </span>
          )}
          <span className="node-depth-badge">D:{depth}</span>
        </div>
        
        {/* Input/Output counts */}
        <div className="tx-io-counts">
          {inputCount > 0 && (
            <span className="io-count input-count" title={`${inputCount} inputs`}>
              ◀ {inputCount}
            </span>
          )}
          {outputCount > 0 && (
            <span className="io-count output-count" title={`${outputCount} outputs`}>
              {outputCount} ▶
            </span>
          )}
        </div>
        
      {/* Actions removed to keep node compact */}
      </div>
    </div>
  );
});

TransactionNode.displayName = 'TransactionNode';

