import React, { useState, useEffect, useRef } from 'react';

interface LogEntry {
  timestamp: number;
  type: 'info' | 'success' | 'error' | 'electrum';
  message: string;
}

interface HopStats {
  hop: number;
  requestCount: number;
  totalBytes: number;
}

interface ProgressLoggerProps {
  logs: LogEntry[];
  currentProgress?: { current: number; total: number; step: string };
  isLoading: boolean;
  hopStats?: HopStats[];
}

export const ProgressLogger: React.FC<ProgressLoggerProps> = ({ logs, currentProgress, isLoading, hopStats = [] }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (isExpanded && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isExpanded]);

  if (!isLoading && logs.length === 0) return null;
  
  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
  };

  const getLogColor = (type: string) => {
    switch (type) {
      case 'success': return '#4caf50';
      case 'error': return '#f44336';
      case 'electrum': return '#00bcd4';
      default: return '#fff';
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
  };

  return (
    <div
      style={{
        position: 'relative',
        background: 'rgba(26, 26, 26, 0.95)',
        border: '1px solid rgba(100, 181, 246, 0.3)',
        borderRadius: '8px',
        padding: '12px',
        minWidth: '300px',
        maxWidth: '500px',
        backdropFilter: 'blur(10px)',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
      }}
    >
      {/* Header with progress */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '8px',
          cursor: 'pointer',
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isLoading && (
            <div
              style={{
                width: '12px',
                height: '12px',
                border: '2px solid rgba(100, 181, 246, 0.3)',
                borderTopColor: '#64b5f6',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
          )}
          <span style={{ color: '#fff', fontSize: '14px', fontWeight: 600 }}>
            {isLoading ? 'Loading...' : 'Complete'}
          </span>
        </div>
        <button
          style={{
            background: 'none',
            border: 'none',
            color: '#64b5f6',
            fontSize: '16px',
            cursor: 'pointer',
            padding: '0 4px',
          }}
        >
          {isExpanded ? '▼' : '▶'}
        </button>
      </div>

      {/* Progress bar */}
      {currentProgress && isLoading && (
        <div style={{ marginBottom: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ color: '#999', fontSize: '11px' }}>{currentProgress.step}</span>
            <span style={{ color: '#64b5f6', fontSize: '11px', fontFamily: 'monospace' }}>
              {currentProgress.current}/{currentProgress.total}
            </span>
          </div>
          <div
            style={{
              width: '100%',
              height: '4px',
              background: 'rgba(100, 181, 246, 0.2)',
              borderRadius: '2px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${(currentProgress.current / currentProgress.total) * 100}%`,
                height: '100%',
                background: '#64b5f6',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      )}

      {/* Hop Statistics */}
      {hopStats.length > 0 && (
        <div style={{ marginBottom: '8px', paddingTop: '8px', borderTop: '1px solid rgba(100, 181, 246, 0.2)' }}>
          <div style={{ color: '#64b5f6', fontSize: '11px', fontWeight: 600, marginBottom: '4px' }}>
            Network Activity by Hop:
          </div>
          {hopStats.map((stat) => (
            <div
              key={stat.hop}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '10px',
                fontFamily: 'monospace',
                color: '#999',
                marginBottom: '2px',
              }}
            >
              <span style={{ color: '#64b5f6' }}>Hop {stat.hop}:</span>
              <span>{stat.requestCount} requests</span>
              <span style={{ color: '#4caf50' }}>{formatBytes(stat.totalBytes)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Expandable logs */}
      {isExpanded && (
        <div
          style={{
            maxHeight: '400px',
            overflowY: 'auto',
            marginTop: '8px',
            paddingTop: '8px',
            borderTop: '1px solid rgba(100, 181, 246, 0.2)',
          }}
        >
          {logs.map((log, idx) => (
            <div
              key={idx}
              style={{
                fontSize: '11px',
                fontFamily: 'monospace',
                color: getLogColor(log.type),
                marginBottom: '4px',
                display: 'flex',
                gap: '8px',
              }}
            >
              <span style={{ color: '#666' }}>{formatTime(log.timestamp)}</span>
              <span style={{ flex: 1, wordBreak: 'break-word' }}>{log.message}</span>
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

