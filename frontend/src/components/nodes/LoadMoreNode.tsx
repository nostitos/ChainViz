import { memo } from 'react';
import { NodeProps } from '@xyflow/react';
import { Download } from 'lucide-react';
import './LoadMoreNode.css';

interface LoadMoreNodeData {
  remainingCount: number;
  address: string;
  direction: 'receiving' | 'spending';
  currentOffset: number;
  totalCount: number;
  onLoadMore?: (address: string, direction: string, offset: number) => void;
}

export const LoadMoreNode = memo(({ id, data }: NodeProps) => {
  const nodeData = data as LoadMoreNodeData;
  const { remainingCount, address, direction, currentOffset, onLoadMore } = nodeData;
  
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('📥 Load More clicked:', address.substring(0, 20), direction, currentOffset);
    if (onLoadMore) {
      onLoadMore(address, direction, currentOffset);
    } else {
      console.error('❌ No onLoadMore handler!');
    }
  };
  
  return (
    <div className="load-more-node" onClick={handleClick}>
      <div className="load-more-icon">
        <Download size={20} />
      </div>
      <div className="load-more-content">
        <div className="load-more-title">Load 20 More</div>
        <div className="load-more-count">{remainingCount} remaining</div>
      </div>
    </div>
  );
});

LoadMoreNode.displayName = 'LoadMoreNode';

