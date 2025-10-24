import React from 'react';
import { X, Github, ExternalLink, Info } from 'lucide-react';
import { getVersionInfo } from '../version';

interface AboutPanelProps {
  onClose: () => void;
}

export function AboutPanel({ onClose }: AboutPanelProps) {
  const versionInfo = getVersionInfo();

  return (
    <div className="about-panel">
      <div className="panel-header">
        <div className="panel-title">
          <Info size={20} />
          <h2>About ChainViz</h2>
        </div>
        <button onClick={onClose} className="close-button">
          <X size={20} />
        </button>
      </div>

      <div className="panel-content">
        <div className="about-section">
          <h3>🔗 ChainViz - Bitcoin Blockchain Analysis</h3>
          <p>
            A comprehensive Bitcoin blockchain analysis platform for tracing UTXOs, 
            visualizing transaction flows, and identifying patterns using on-chain data only.
          </p>
        </div>

        <div className="version-section">
          <h4>Version Information</h4>
          <div className="version-details">
            <div className="version-item">
              <span className="version-label">Version:</span>
              <span className="version-value">{versionInfo.version}</span>
            </div>
            <div className="version-item">
              <span className="version-label">Build Date:</span>
              <span className="version-value">{versionInfo.formattedDate}</span>
            </div>
            <div className="version-item">
              <span className="version-label">API Endpoint:</span>
              <span className="version-value">{import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api'}</span>
            </div>
          </div>
        </div>

        <div className="features-section">
          <h4>Key Features</h4>
          <ul className="features-list">
            <li>🔍 <strong>UTXO Backward Tracing</strong> - Recursive tracing with configurable depth</li>
            <li>🧠 <strong>Heuristics Engine</strong> - Common-input clustering, change detection, peel chains</li>
            <li>📊 <strong>Bulk Import</strong> - Support for address lists and xpub derivation</li>
            <li>🎨 <strong>Interactive Visualization</strong> - WebGL-powered graphs with 1000+ nodes</li>
            <li>⚡ <strong>Real-time Updates</strong> - Live block monitoring via Electrum subscriptions</li>
            <li>🔒 <strong>Privacy-First</strong> - On-chain data only, no external attribution databases</li>
          </ul>
        </div>

        <div className="tech-section">
          <h4>Technology Stack</h4>
          <div className="tech-grid">
            <div className="tech-item">
              <strong>Backend:</strong> Python FastAPI, Electrum client, NetworkX
            </div>
            <div className="tech-item">
              <strong>Frontend:</strong> React, TypeScript, Sigma.js, TailwindCSS
            </div>
            <div className="tech-item">
              <strong>Data:</strong> Electrum server, Redis caching, WebSocket
            </div>
          </div>
        </div>

        <div className="links-section">
          <h4>Links</h4>
          <div className="links-grid">
            <a 
              href="https://github.com/your-username/chainviz" 
              target="_blank" 
              rel="noopener noreferrer"
              className="link-item"
            >
              <Github size={16} />
              GitHub Repository
            </a>
            <a 
              href="https://mempool.space" 
              target="_blank" 
              rel="noopener noreferrer"
              className="link-item"
            >
              <ExternalLink size={16} />
              Mempool.space
            </a>
            <a 
              href="https://electrum.org" 
              target="_blank" 
              rel="noopener noreferrer"
              className="link-item"
            >
              <ExternalLink size={16} />
              Electrum Protocol
            </a>
          </div>
        </div>

        <div className="footer-section">
          <p className="footer-text">
            Built with ❤️ for Bitcoin privacy research and blockchain analysis.
          </p>
          <p className="footer-disclaimer">
            <strong>Disclaimer:</strong> This tool is for educational and research purposes. 
            Blockchain analysis is probabilistic and may contain errors.
          </p>
        </div>
      </div>

      <style>{`
        .about-panel {
          position: fixed;
          top: 0;
          right: 0;
          width: 400px;
          height: 100vh;
          background: rgba(26, 26, 26, 0.95);
          border-left: 1px solid rgba(100, 181, 246, 0.3);
          backdrop-filter: blur(10px);
          z-index: 1000;
          overflow-y: auto;
          color: #fff;
        }

        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          border-bottom: 1px solid rgba(100, 181, 246, 0.2);
        }

        .panel-title {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .panel-title h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
        }

        .close-button {
          background: none;
          border: none;
          color: #64b5f6;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          transition: background-color 0.2s;
        }

        .close-button:hover {
          background: rgba(100, 181, 246, 0.1);
        }

        .panel-content {
          padding: 20px;
        }

        .about-section h3 {
          margin: 0 0 12px 0;
          color: #64b5f6;
          font-size: 16px;
        }

        .about-section p {
          margin: 0 0 20px 0;
          line-height: 1.6;
          color: #ccc;
        }

        .version-section,
        .features-section,
        .tech-section,
        .links-section {
          margin-bottom: 24px;
        }

        .version-section h4,
        .features-section h4,
        .tech-section h4,
        .links-section h4 {
          margin: 0 0 12px 0;
          color: #4caf50;
          font-size: 14px;
          font-weight: 600;
        }

        .version-details {
          background: rgba(100, 181, 246, 0.1);
          border-radius: 6px;
          padding: 12px;
        }

        .version-item {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
        }

        .version-item:last-child {
          margin-bottom: 0;
        }

        .version-label {
          color: #999;
          font-size: 12px;
        }

        .version-value {
          color: #fff;
          font-size: 12px;
          font-family: monospace;
        }

        .features-list {
          margin: 0;
          padding-left: 20px;
        }

        .features-list li {
          margin-bottom: 8px;
          line-height: 1.5;
          color: #ccc;
        }

        .tech-grid {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .tech-item {
          background: rgba(76, 175, 80, 0.1);
          border-radius: 4px;
          padding: 8px 12px;
          font-size: 12px;
          color: #ccc;
        }

        .links-grid {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .link-item {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #64b5f6;
          text-decoration: none;
          padding: 8px 12px;
          border-radius: 4px;
          background: rgba(100, 181, 246, 0.1);
          transition: background-color 0.2s;
          font-size: 12px;
        }

        .link-item:hover {
          background: rgba(100, 181, 246, 0.2);
        }

        .footer-section {
          border-top: 1px solid rgba(100, 181, 246, 0.2);
          padding-top: 16px;
        }

        .footer-text {
          margin: 0 0 12px 0;
          color: #4caf50;
          font-size: 12px;
          text-align: center;
        }

        .footer-disclaimer {
          margin: 0;
          color: #999;
          font-size: 11px;
          line-height: 1.4;
          text-align: center;
        }
      `}</style>
    </div>
  );
}
