import { useState, useEffect } from 'react';
import { Settings, X, Save, CheckCircle, XCircle } from 'lucide-react';
import { getConfig, updateElectrumServer, testElectrumServer } from '../services/api';

interface SettingsPanelProps {
  onClose: () => void;
  edgeAnimation: boolean;
  onEdgeAnimationChange: (enabled: boolean) => void;
  maxOutputs: number;
  onMaxOutputsChange: (value: number) => void;
  maxTransactions: number;
  onMaxTransactionsChange: (value: number) => void;
}

export function SettingsPanel({ 
  onClose, 
  edgeAnimation, 
  onEdgeAnimationChange,
  maxOutputs,
  onMaxOutputsChange,
  maxTransactions,
  onMaxTransactionsChange
}: SettingsPanelProps) {
  const [electrumHost, setElectrumHost] = useState('192.168.2.114');
  const [electrumPort, setElectrumPort] = useState('50002');
  const [useSSL, setUseSSL] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; latency_ms?: number } | null>(null);
  
  // Store the ACTUAL current config from backend (not the edited values)
  const [currentConfig, setCurrentConfig] = useState<{ host: string; port: string; ssl: boolean } | null>(null);

  // Load current config on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await getConfig();
        setElectrumHost(config.electrum_host);
        setElectrumPort(config.electrum_port.toString());
        setUseSSL(config.electrum_use_ssl);
        setCurrentConfig({
          host: config.electrum_host,
          port: config.electrum_port.toString(),
          ssl: config.electrum_use_ssl,
        });
      } catch (error) {
        console.error('Failed to load config:', error);
      }
    };
    loadConfig();
  }, []);

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await testElectrumServer({
        host: electrumHost,
        port: parseInt(electrumPort),
        use_ssl: useSSL,
      });
      setTestResult(result);
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Test failed',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      await updateElectrumServer({
        host: electrumHost,
        port: parseInt(electrumPort),
        use_ssl: useSSL,
      });
      // Update the current config after successful save
      setCurrentConfig({
        host: electrumHost,
        port: electrumPort,
        ssl: useSSL,
      });
      alert(`✅ Electrum server updated to ${electrumHost}:${electrumPort} (SSL: ${useSSL ? 'ON' : 'OFF'})`);
      onClose();
    } catch (error) {
      alert(`❌ Failed to update server: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const presets = [
    { name: 'Custom', host: 'iu1b96e.glddns.com', port: '50002', ssl: false },
    { name: 'DIYNodes (Fastest)', host: 'electrum.diynodes.com', port: '50002', ssl: true },
    { name: 'Fulcrum (Seth)', host: 'fulcrum.sethforprivacy.com', port: '50002', ssl: true },
    { name: 'Bitcoin.lu.ke', host: 'bitcoin.lu.ke', port: '50002', ssl: true },
    { name: 'Electrum Emzy', host: 'electrum.emzy.de', port: '50002', ssl: true },
    { name: 'Electrum Bitaroo', host: 'electrum.bitaroo.net', port: '50002', ssl: true },
  ];

  return (
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
            <label>
              Max Outputs Per Transaction: <strong>{maxOutputs}</strong>
            </label>
            <input
              type="range"
              min="1"
              max="300"
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
              max="300"
              value={maxTransactions}
              onChange={(e) => onMaxTransactionsChange(parseInt(e.target.value))}
              style={{ width: '50%' }}
            />
            <div className="setting-info" style={{ fontSize: '12px', marginTop: '4px' }}>
              Limits how many transactions are expanded when tracing addresses
            </div>
          </div>
        </div>

        <div className="settings-section">
          <h3>Electrum Server</h3>
          
          <div className="settings-presets">
            {presets.map((preset) => (
              <button
                key={preset.name}
                className="preset-button"
                onClick={() => {
                  setElectrumHost(preset.host);
                  setElectrumPort(preset.port);
                  setUseSSL(preset.ssl);
                }}
              >
                {preset.name}
              </button>
            ))}
          </div>

          <div className="setting-field">
            <label>Host:</label>
            <input
              type="text"
              value={electrumHost}
              onChange={(e) => setElectrumHost(e.target.value)}
              placeholder="electrum.server.com"
              className="setting-input"
            />
          </div>

          <div className="setting-field">
            <label>Port:</label>
            <input
              type="number"
              value={electrumPort}
              onChange={(e) => setElectrumPort(e.target.value)}
              placeholder="50002"
              className="setting-input"
            />
          </div>

          <div className="setting-field">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={useSSL}
                onChange={(e) => setUseSSL(e.target.checked)}
              />
              <span>Use SSL</span>
            </label>
          </div>

          <div className="setting-info">
            <strong>Current Active:</strong> {currentConfig ? `${currentConfig.host}:${currentConfig.port} ${currentConfig.ssl ? '(SSL)' : '(No SSL)'}` : 'Loading...'}
          </div>
          <div className="setting-info" style={{ fontSize: '12px', opacity: 0.7 }}>
            <strong>Editing:</strong> {electrumHost}:{electrumPort} {useSSL ? '(SSL)' : '(No SSL)'}
          </div>

          {testResult && (
            <div className={`setting-info ${testResult.success ? 'success' : 'error'}`} style={{
              padding: '8px',
              borderRadius: '4px',
              marginTop: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              {testResult.success ? <CheckCircle size={16} /> : <XCircle size={16} />}
              <span>{testResult.message}</span>
              {testResult.success && testResult.latency_ms && (
                <span style={{ fontSize: '12px', opacity: 0.7 }}>({testResult.latency_ms}ms)</span>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button 
              onClick={handleTest} 
              disabled={isTesting}
              className="preset-button"
              style={{ flex: 1 }}
            >
              {isTesting ? 'Testing...' : '🧪 Test Connection'}
            </button>
            <button 
              onClick={handleSave} 
              disabled={isLoading}
              className="save-button"
              style={{ flex: 1 }}
            >
              <Save size={16} /> {isLoading ? 'Saving...' : 'Save & Apply'}
            </button>
          </div>

          <div className="setting-note" style={{ marginTop: '8px' }}>
            Changes take effect immediately. No restart required.
          </div>
        </div>
      </div>
    </div>
  );
}




