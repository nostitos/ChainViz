import { memo } from 'react';
import { Activity, GitBranch, Wallet, ArrowRightLeft } from 'lucide-react';

interface StatsPanelProps {
  totalNodes: number;
  totalEdges: number;
  transactions: number;
  addresses: number;
}

export const StatsPanel = memo(function StatsPanel({ totalNodes, totalEdges, transactions, addresses }: StatsPanelProps) {
  return (
    <div className="stats-panel">
      
      <div className="stat-item">
        <GitBranch size={16} />
        <div>
          <div className="stat-value">{totalEdges}</div>
          <div className="stat-label">Links</div>
        </div>
      </div>
      
      <div className="stat-item">
        <ArrowRightLeft size={16} />
        <div>
          <div className="stat-value">{transactions}</div>
          <div className="stat-label">TX</div>
        </div>
      </div>
      
      <div className="stat-item">
        <Wallet size={16} />
        <div>
          <div className="stat-value">{addresses}</div>
          <div className="stat-label">Addr</div>
        </div>
      </div>
    </div>
  );
});




