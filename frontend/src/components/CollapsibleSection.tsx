import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function CollapsibleSection({ title, defaultOpen = true, children }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="collapsible-section">
      <div className="collapsible-header" onClick={() => setIsOpen(!isOpen)}>
        <span className="collapsible-title">{title}</span>
        {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </div>
      {isOpen && <div className="collapsible-content">{children}</div>}
      <style>{`
        .collapsible-section {
          margin: 12px 0;
        }
        
        .collapsible-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          background: rgba(100, 181, 246, 0.1);
          border: 1px solid rgba(100, 181, 246, 0.3);
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s ease;
          user-select: none;
        }
        
        .collapsible-header:hover {
          background: rgba(100, 181, 246, 0.15);
          border-color: rgba(100, 181, 246, 0.5);
        }
        
        .collapsible-title {
          font-weight: 600;
          font-size: 13px;
          color: var(--text-primary);
        }
        
        .collapsible-content {
          padding: 12px 0;
        }
      `}</style>
    </div>
  );
}

