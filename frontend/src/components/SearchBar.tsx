import { useState, useEffect } from 'react';
import { Search, Loader2, Settings, Info, ChevronLeft, ChevronRight } from 'lucide-react';

interface SearchBarProps {
  onTraceAddress: (address: string, hopsBefore: number, hopsAfter: number) => void;
  onTraceTransaction: (txid: string, vout: number, hopsBefore: number, hopsAfter: number) => void;
  isLoading: boolean;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
  edgeScaleMax: number;
  onEdgeScaleMaxChange: (value: number) => void;
  onExpandBackward?: () => void;
  onExpandForward?: () => void;
  hasGraph: boolean;
  initialQuery?: string;
}

export function SearchBar({ onTraceAddress, onTraceTransaction, isLoading, onOpenSettings, onOpenAbout, edgeScaleMax, onEdgeScaleMaxChange, onExpandBackward, onExpandForward, hasGraph, initialQuery }: SearchBarProps) {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  
  // Save edgeScaleMax to localStorage when it changes
  const handleEdgeScaleMaxChange = (value: number) => {
    onEdgeScaleMaxChange(value);
    localStorage.setItem('edgeScaleMax', value.toString());
  };
  const [showDropdown, setShowDropdown] = useState(false);

  // Load history from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('search_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load search history:', e);
      }
    }
  }, []);
  
  // Set input from initial query (from URL)
  useEffect(() => {
    if (initialQuery) {
      setInput(initialQuery);
    }
  }, [initialQuery]);

  const saveToHistory = (value: string) => {
    const newHistory = [value, ...history.filter(h => h !== value)].slice(0, 10);
    setHistory(newHistory);
    localStorage.setItem('search_history', JSON.stringify(newHistory));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;

    // Save to history
    saveToHistory(trimmed);
    setShowDropdown(false);

    // Detect if it's a transaction (64 hex chars) or address
    // Always use 1 hop in each direction for initial load
    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
      // It's a transaction ID (always use vout 0)
      onTraceTransaction(trimmed, 0, 1, 1);
    } else {
      // It's an address
      onTraceAddress(trimmed, 1, 1);
    }
  };

  const handleSelectHistory = (value: string) => {
    setInput(value);
    setShowDropdown(false);
  };

  return (
    <div className="search-bar">
      <div className="search-container">
        <div className="logo" style={{ cursor: 'pointer' }} onClick={() => window.location.href = '/'}>
          <h1>⛓️ UTXO.link</h1>
          <p>Bitcoin Blockchain Analysis</p>
        </div>
        
        <div className="header-buttons">
          <button className="settings-button" onClick={onOpenSettings} title="Settings">
            <Settings size={20} />
          </button>
          <button className="about-button" onClick={onOpenAbout} title="About">
            <Info size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="search-form">
          <div className="input-group">
            <Search size={20} className="search-icon" />
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
              placeholder="Bitcoin address or transaction ID..."
              className="address-input"
              disabled={isLoading}
            />
            
            {/* History Dropdown */}
            {showDropdown && history.length > 0 && (
              <div className="history-dropdown">
                <div className="history-header">Recent Searches</div>
                {history.map((item, index) => (
                  <button
                    key={index}
                    className="history-item"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectHistory(item);
                    }}
                  >
                    <span className="history-icon">
                      {/^[0-9a-fA-F]{64}$/.test(item) ? '🔄' : '👛'}
                    </span>
                    <span className="history-text" title={item}>
                      {item.length > 40 ? `${item.substring(0, 20)}...${item.substring(item.length - 20)}` : item}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          
          {/* Hop Navigation Buttons - Only show when graph is loaded */}
          {hasGraph && (onExpandBackward || onExpandForward) && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {onExpandBackward && (
                <button
                  type="button"
                  onClick={onExpandBackward}
                  disabled={isLoading}
                  className="hop-arrow-button"
                  title="Expand graph by 1 hop backward (or press < key)"
                  style={{
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                  }}
                >
                  <ChevronLeft size={18} />
                  Backward
                </button>
              )}
              {onExpandForward && (
                <button
                  type="button"
                  onClick={onExpandForward}
                  disabled={isLoading}
                  className="hop-arrow-button"
                  title="Expand graph by 1 hop forward (or press > key)"
                  style={{
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                  }}
                >
                  Forward
                  <ChevronRight size={18} />
                </button>
              )}
            </div>
          )}
                  
                  {/* Edge Width Scale */}
                  <div className="depth-control">
                    <label>Amount/Width</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input
                        type="number"
                        min="1"
                        max="500"
                        step="any"
                        value={edgeScaleMax}
                        onChange={(e) => handleEdgeScaleMaxChange(parseFloat(e.target.value) || 1)}
                        className="hop-input"
                        disabled={isLoading}
                        style={{ width: '80px' }}
                      />
                      <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>BTC</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="500"
                      step="0.1"
                      value={edgeScaleMax}
                      onChange={(e) => handleEdgeScaleMaxChange(parseFloat(e.target.value))}
                      className="depth-slider"
                      disabled={isLoading}
                    />
                  </div>
          
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="trace-button"
          >
            {isLoading ? (
              <>
                <Loader2 size={16} className="spinner" />
                Tracing...
              </>
            ) : (
              <>
                <Search size={16} />
                Trace
              </>
            )}
          </button>
        </form>
      </div>

      <style>{`
        .header-buttons {
          display: flex;
          gap: 8px;
        }

        .settings-button,
        .about-button {
          background: rgba(100, 181, 246, 0.1);
          border: 1px solid rgba(100, 181, 246, 0.3);
          border-radius: 6px;
          color: #64b5f6;
          cursor: pointer;
          padding: 8px;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .settings-button:hover,
        .about-button:hover {
          background: rgba(100, 181, 246, 0.2);
          border-color: rgba(100, 181, 246, 0.5);
          transform: translateY(-1px);
        }

        .about-button {
          background: rgba(76, 175, 80, 0.1);
          border-color: rgba(76, 175, 80, 0.3);
          color: #4caf50;
        }

        .about-button:hover {
          background: rgba(76, 175, 80, 0.2);
          border-color: rgba(76, 175, 80, 0.5);
        }

        .hop-arrow-button {
          background: rgba(100, 181, 246, 0.2);
          border: 1px solid rgba(100, 181, 246, 0.5);
          border-radius: 4px;
          color: var(--text-primary);
          cursor: pointer;
          padding: 4px 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
          min-width: 32px;
          height: 28px;
        }

        .hop-arrow-button:hover:not(:disabled) {
          background: rgba(100, 181, 246, 0.3);
          border-color: rgba(100, 181, 246, 0.7);
          transform: translateY(-1px);
        }

        .hop-arrow-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}

