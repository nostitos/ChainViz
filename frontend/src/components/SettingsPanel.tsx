import { useState } from 'react';
import { Settings, X, Save } from 'lucide-react';

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

  const handleSave = () => {
    // Save to localStorage
    localStorage.setItem('electrum_host', electrumHost);
    localStorage.setItem('electrum_port', electrumPort);
    localStorage.setItem('electrum_use_ssl', String(useSSL));
    
    alert('Settings saved! Restart backend with:\nELECTRUM_HOST=' + electrumHost + ' ELECTRUM_PORT=' + electrumPort);
    onClose();
  };

  const presets = [
    { name: 'Local', host: '192.168.2.114', port: '50002', ssl: false },
    { name: 'Fulcrum (Seth)', host: 'fulcrum.sethforprivacy.com', port: '50002', ssl: true },
    { name: 'Blockstream', host: 'electrum.blockstream.info', port: '50002', ssl: true },
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
            <strong>Current:</strong> {electrumHost}:{electrumPort} {useSSL ? '(SSL)' : '(No SSL)'}
          </div>

          <button onClick={handleSave} className="save-button">
            <Save size={16} /> Save Settings
          </button>

          <div className="setting-note">
            Note: Backend restart required for changes to take effect.
          </div>
        </div>
      </div>
    </div>
  );
}




