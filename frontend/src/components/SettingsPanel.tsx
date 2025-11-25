import { useState, useEffect } from 'react';
import { Settings, X } from 'lucide-react';
import { getConfig, type RuntimeConfigResponse } from '../services/api';

interface SettingsPanelProps {
  onClose: () => void;
  edgeAnimation: boolean;
  onEdgeAnimationChange: (enabled: boolean) => void;
  maxOutputs: number;
  onMaxOutputsChange: (value: number) => void;
  maxTransactions: number;
  onMaxTransactionsChange: (value: number) => void;
  clusterThreshold: number;
  onClusterThresholdChange: (value: number) => void;
  balanceFetchingEnabled: boolean;
  onBalanceFetchingChange: (enabled: boolean) => void;
}

export function SettingsPanel({ 
  onClose, 
  edgeAnimation, 
  onEdgeAnimationChange,
  maxOutputs,
  onMaxOutputsChange,
  maxTransactions,
  onMaxTransactionsChange,
  clusterThreshold,
  onClusterThresholdChange,
  balanceFetchingEnabled,
  onBalanceFetchingChange
}: SettingsPanelProps) {
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfigResponse | null>(null);

  // Load current config on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await getConfig();
        setRuntimeConfig(config);
      } catch (error) {
        console.error('Failed to load config:', error);
      }
    };
    loadConfig();
  }, []);

  return (
    <>
      {/* Backdrop overlay */}
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          zIndex: 59,
        }}
        onClick={onClose}
      />
      <div className="settings-panel">
        <div className="panel-header">
          <h2><Settings size={20} /> Settings</h2>
          <button onClick={onClose} className="close-button">
            <X size={20} />
          </button>
        </div>

      <div className="panel-content">
        <div className="settings-section">
          <h3>Display</h3>
          
          <div className="setting-field">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={edgeAnimation}
                onChange={(e) => onEdgeAnimationChange(e.target.checked)}
              />
              <span>Animated Edges</span>
            </label>
          </div>

          <div className="setting-field">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={balanceFetchingEnabled}
                onChange={(e) => onBalanceFetchingChange(e.target.checked)}
              />
              <span>Fetch Address Balances</span>
            </label>
            <div className="setting-info" style={{ fontSize: '12px', marginTop: '4px' }}>
              When disabled, saves hundreds of backend requests for large graphs
            </div>
          </div>

          <div className="setting-field">
            <label>
              Max Outputs Per Transaction: <strong>{maxOutputs}</strong>
            </label>
            <input
              type="range"
              min="1"
              max="1000"
              value={maxOutputs}
              onChange={(e) => onMaxOutputsChange(parseInt(e.target.value))}
              style={{ width: '50%' }}
            />
            <div className="setting-info" style={{ fontSize: '12px', marginTop: '4px' }}>
              Limits how many outputs are shown when expanding transactions
            </div>
          </div>

          <div className="setting-field">
            <label>
              Max Transactions to Expand: <strong>{maxTransactions}</strong>
            </label>
            <input
              type="range"
              min="1"
              max="1000"
              value={maxTransactions}
              onChange={(e) => onMaxTransactionsChange(parseInt(e.target.value))}
              style={{ width: '50%' }}
            />
            <div className="setting-info" style={{ fontSize: '12px', marginTop: '4px' }}>
              Limits how many transactions are expanded when tracing addresses
            </div>
          </div>

          <div className="setting-field">
            <label>
              Cluster Threshold: <strong>{clusterThreshold}</strong>
            </label>
            <input
              type="range"
              min="10"
              max="500"
              value={clusterThreshold}
              onChange={(e) => onClusterThresholdChange(parseInt(e.target.value))}
              style={{ width: '50%' }}
            />
            <div className="setting-info" style={{ fontSize: '12px', marginTop: '4px' }}>
              When expansion would add more than this many nodes, prompt user or create cluster
            </div>
          </div>
        </div>

        <div className="settings-section">
          <h3>Data Source</h3>
          <div className="setting-field">
            <div className="setting-info">
              ChainViz now runs in mempool-only mode. Electrum tooling lives in a separate suite for
              diagnostics and benchmarking.
          </div>
          <div className="setting-info">
              <strong>Active Source:</strong>{' '}
              {runtimeConfig ? runtimeConfig.data_source : 'Loading...'}
            </div>
            <div className="setting-info" style={{ fontSize: '12px', opacity: 0.8 }}>
              <strong>Electrum Fallback:</strong>{' '}
              {runtimeConfig
                ? runtimeConfig.electrum_enabled ? 'Enabled' : 'Disabled'
                : 'Loading...'}
          </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}




