import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import './EdgeLegend.css';

export function EdgeLegend() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="edge-legend">
      <button 
        className="legend-toggle"
        onClick={() => setIsExpanded(!isExpanded)}
        title={isExpanded ? "Hide legend" : "Show edge styles legend"}
      >
        <span className="legend-icon">🔗</span>
        <span className="legend-title">Edge Styles</span>
        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {isExpanded && (
        <div className="legend-content">
          <div className="legend-section">
            <h4>Edge Representation</h4>
            <div className="legend-item">
              <div className="edge-example edge-green"></div>
              <div className="legend-text">
                <strong>On-Chain Transactions</strong>
                <p>All edges represent verified Bitcoin transactions on the blockchain</p>
              </div>
            </div>
          </div>

          <div className="legend-section">
            <h4>Edge Width</h4>
            <div className="legend-item">
              <div className="edge-width-examples">
                <div className="edge-example edge-thin"></div>
                <div className="edge-example edge-medium"></div>
                <div className="edge-example edge-thick"></div>
              </div>
              <div className="legend-text">
                <strong>Proportional to Amount</strong>
                <p>Thicker edges = larger BTC amounts (2-50px range)</p>
              </div>
            </div>
          </div>

          <div className="legend-section">
            <h4>Flow Direction</h4>
            <div className="legend-item">
              <div className="edge-example edge-animated"></div>
              <div className="legend-text">
                <strong>Animated Flow</strong>
                <p>Optional animation shows Bitcoin flow direction (toggle in settings)</p>
              </div>
            </div>
            
            <div className="legend-item">
              <div className="edge-example edge-static"></div>
              <div className="legend-text">
                <strong>Arrow Markers</strong>
                <p>Arrows indicate transaction direction</p>
              </div>
            </div>
          </div>

          <div className="legend-section">
            <h4>Edge Labels</h4>
            <div className="legend-item">
              <div className="legend-icon-text">₿</div>
              <div className="legend-text">
                <strong>BTC Amount</strong>
                <p>Shows exact amount transferred (8 decimal places)</p>
                <p className="legend-note">Note: Labels hidden on cluster box edges</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

