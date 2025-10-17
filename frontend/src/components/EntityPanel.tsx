import { useState, useEffect } from 'react';
import { X, ExternalLink, Expand, ArrowRight, ArrowLeft, Copy, Check } from 'lucide-react';
import type { Node } from '@xyflow/react';

interface EntityPanelProps {
  entity: Node;
  onClose: () => void;
  onExpand: () => void;
}

interface TransactionDetails {
  inputs: Array<{ address: string; value: number }>;
  outputs: Array<{ address: string; value: number; vout: number }>;
  change_output: number | null;
  change_confidence: number | null;
}

interface AddressInfo {
  balance: number;
  total_received: number;
  total_sent: number;
  tx_count: number;
  transactions: string[];
}

// Improved change detection: pick at most ONE candidate with highest score
function scriptTypeFromAddress(addr?: string): 'taproot' | 'segwit' | 'p2pkh' | 'p2sh' | 'unknown' {
  if (!addr) return 'unknown';
  if (addr.startsWith('bc1p')) return 'taproot';
  if (addr.startsWith('bc1q')) return 'segwit';
  if (addr.startsWith('1')) return 'p2pkh';
  if (addr.startsWith('3')) return 'p2sh';
  return 'unknown';
}

type ChangeDecision = { vout: number; probability: number; reasons: string[]; score: number } | null;

function getChangeDecision(inputs: any[], outputs: any[]): ChangeDecision {
  if (!outputs || outputs.length < 2) return null;

  // CoinJoin/EQ-outputs suspicion: many equal amounts → do not mark change
  const valueCounts = new Map<number, number>();
  for (const o of outputs) valueCounts.set(o.value, (valueCounts.get(o.value) || 0) + 1);
  const hasManyEquals = Array.from(valueCounts.values()).some(c => c >= 3);
  if (hasManyEquals) return null;

  // Predominant input script type
  const inputTypes = inputs.map(i => scriptTypeFromAddress(i.address));
  const typeCounts = new Map<string, number>();
  inputTypes.forEach(t => typeCounts.set(t, (typeCounts.get(t) || 0) + 1));
  const predominantType = Array.from(typeCounts.entries()).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'unknown';

  const amounts = outputs.map((o: any) => o.value).sort((a: number,b: number)=>a-b);
  const median = amounts[Math.floor(amounts.length/2)];
  const max = Math.max(...amounts);

  const isRoundAmount = (sats: number) => sats % 1000000 === 0 || sats % 100000 === 0;

  const maxScore = 3 + 2 + 1 + 1; // sum of weights
  const scored = outputs.map((o: any) => {
    let score = 0;
    const reasons: string[] = [];
    
    const outScriptType = scriptTypeFromAddress(o.address);
    const matchesInputType = outScriptType === predominantType;
    const isSmallerThanMedian = o.value < median;
    const isNonRound = !isRoundAmount(o.value);
    const isNotFirst = o.vout > 0;
    
    // Prefer matching input script type
    if (matchesInputType) {
      score += 3;
      reasons.push(`Script type matches inputs (${predominantType})`);
    }
    // Usually smaller than main payment
    if (isSmallerThanMedian) {
      score += 2;
      reasons.push(`Smaller than median output (${(median / 100000000).toFixed(8)} BTC)`);
    }
    // Non-round amounts often are change
    if (isNonRound) {
      score += 1;
      reasons.push(`Non-round amount (${(o.value / 100000000).toFixed(8)} BTC)`);
    }
    // Not the first output (weak prior)
    if (isNotFirst) {
      score += 1;
      reasons.push(`Positioned after first output (vout #${o.vout})`);
    }
    
    return { vout: o.vout, score, reasons, probability: score / maxScore };
  });

  // Pick unique top candidate above threshold
  const top = scored.sort((a,b)=>b.score-a.score);
  if (top.length === 0) return null;
  if (top[0].score < 3) return null; // threshold
  if (top.length > 1 && top[0].score === top[1].score) return null; // ambiguous
  return { vout: top[0].vout, probability: top[0].probability, reasons: top[0].reasons, score: top[0].score };
}

export function EntityPanel({ entity, onClose, onExpand }: EntityPanelProps) {
  const isTransaction = entity.type === 'transaction';
  const data = entity.data;
  const metadata = data.metadata || {};
  const [txDetails, setTxDetails] = useState<TransactionDetails | null>(null);
  const [addressInfo, setAddressInfo] = useState<AddressInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const copyToClipboard = async (text: string, type: 'id' | 'address') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'id') {
        setCopiedId(text);
        setTimeout(() => setCopiedId(null), 2000);
      } else {
        setCopiedAddress(text);
        setTimeout(() => setCopiedAddress(null), 2000);
      }
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Fetch transaction details when transaction is selected
  useEffect(() => {
    if (isTransaction) {
      const txid = data.txid || metadata.txid;
      if (txid) {
        setLoading(true);
        fetch(`http://localhost:8000/api/transaction/${txid}`)
          .then(res => res.json())
          .then(async (data) => {
            const tx = data.transaction;
            console.log('📦 Fetched TX data:', tx);
            
            // For inputs, we need to fetch previous TXs to get addresses
            const inputsWithAddrs = await Promise.all(
              tx.inputs.map(async (inp: any) => {
                if (inp.txid && inp.address === null) {
                  // Fetch previous TX to get the address
                  try {
                    const prevTxRes = await fetch(`http://localhost:8000/api/transaction/${inp.txid}`);
                    const prevTxData = await prevTxRes.json();
                    const prevOut = prevTxData.transaction.outputs[inp.vout];
                    return {
                      address: prevOut.address || 'Unknown',
                      value: prevOut.value || 0
                    };
                  } catch (e) {
                    return { address: 'Unknown', value: 0 };
                  }
                }
                return {
                  address: inp.address || 'Unknown',
                  value: inp.value || 0
                };
              })
            );
            
            const outputs = tx.outputs.map((out: any) => ({
              address: out.address || 'Unknown',
              value: out.value || 0,
              vout: out.n
            }));

            setTxDetails({
              inputs: inputsWithAddrs,
              outputs,
              change_output: data.change_output,
              change_confidence: data.change_confidence,
            });
          })
          .catch(err => console.error('Failed to fetch TX details:', err))
          .finally(() => setLoading(false));
      }
    }
  }, [entity.id, isTransaction, data.txid, metadata.txid]);
  
  // Fetch address info when address is selected
  useEffect(() => {
    if (!isTransaction) {
      const address = data.address || metadata.address;
      if (!address) return;
      
      setLoading(true);
      fetch(`http://localhost:8000/api/address/${address}`)
        .then(res => res.json())
        .then(data => {
          console.log('📊 Address info fetched:', data);
          setAddressInfo({
            balance: data.balance || 0,
            total_received: data.total_received || 0,
            total_sent: data.total_sent || 0,
            tx_count: data.tx_count || 0,
            transactions: data.transactions || [],
          });
        })
        .catch(err => console.error('Failed to fetch address info:', err))
        .finally(() => setLoading(false));
    }
  }, [entity.id, isTransaction, data.address, metadata.address]);

  const renderField = (label: string, value: any, copyable: boolean = false) => {
    if (value === undefined || value === null) return null;
    
    const valueStr = String(value);
    const isCopied = copiedId === valueStr || copiedAddress === valueStr;
    
    return (
      <div className="detail-row">
        <span className="detail-label">{label}:</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="detail-value" style={{ flex: 1 }}>{valueStr}</span>
          {copyable && (
            <button
              onClick={() => copyToClipboard(valueStr, label.toLowerCase().includes('address') ? 'address' : 'id')}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                color: isCopied ? '#4caf50' : 'var(--text-secondary)',
                transition: 'color 0.2s'
              }}
              title={isCopied ? 'Copied!' : 'Copy to clipboard'}
            >
              {isCopied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          )}
        </div>
      </div>
    );
  };

  const formatBTC = (sats: number) => {
    // Always show full 8 decimal places
    return (sats / 100000000).toFixed(8) + ' BTC';
  };
  const shortAddr = (addr: string) => addr.length > 20 
    ? `${addr.substring(0, 10)}...${addr.substring(addr.length - 10)}`
    : addr;

  return (
    <div className="entity-panel">
      <div className="panel-header">
        <h2>{isTransaction ? '🔄 Transaction' : '👛 Address'}</h2>
        <button onClick={onClose} className="close-button">
          <X size={20} />
        </button>
      </div>

      <div className="panel-content">
        {isTransaction ? (
          <>
            {renderField('Transaction ID', data.txid || metadata.txid, true)}
            {renderField('Depth', metadata.depth)}
            {renderField('Timestamp', metadata.timestamp ? new Date(metadata.timestamp * 1000).toLocaleString() : null)}

            {/* Show Inputs and Outputs */}
            {loading ? (
              <div className="tx-loading">Loading details...</div>
            ) : txDetails ? (
              <>
                <div className="tx-section">
                  <h3 className="tx-section-title">
                    <ArrowLeft size={16} /> Inputs ({txDetails.inputs.length})
                  </h3>
                  {txDetails.inputs.map((input, idx) => (
                    <div key={idx} className="tx-item">
                      <span className="tx-item-addr" title={input.address}>
                        {shortAddr(input.address)}
                      </span>
                      <span className="tx-item-amount">{formatBTC(input.value)}</span>
                    </div>
                  ))}
                </div>

                        <div className="tx-section">
                          <h3 className="tx-section-title">
                            <ArrowRight size={16} /> Outputs ({txDetails.outputs.length})
                          </h3>
                          {/* Regular outputs (not change) */}
                          {(() => {
                            // Use backend's change determination, NOT frontend recalculation
                            const changeVout = txDetails.change_output ?? null;
                            return txDetails.outputs.filter((o: any) => o.vout !== changeVout);
                          })().map((output: any) => (
                            <div key={output.vout} className="tx-item">
                              <span className="tx-item-vout">#{output.vout}</span>
                              <span className="tx-item-addr" title={output.address}>
                                {shortAddr(output.address)}
                              </span>
                              <span className="tx-item-amount">{formatBTC(output.value)}</span>
                            </div>
                          ))}
                          
                          {/* Probable change output (single, if any) - USE BACKEND DETERMINATION */}
                          {(() => {
                            // Use backend's change detection, don't recalculate!
                            if (txDetails.change_output === null) return null;
                            const changeOutput = txDetails.outputs.find((o: any) => o.vout === txDetails.change_output);
                            if (!changeOutput) return null;
                            
                            // Recalculate reasons ONLY to explain what the backend found
                            const decision = getChangeDecision(txDetails.inputs, txDetails.outputs);
                            const actualReasons = decision?.vout === txDetails.change_output ? decision.reasons : [];
                            
                            return (
                              <>
                                <div className="tx-change-separator">
                                  Probable Change ({txDetails.change_confidence ? (txDetails.change_confidence * 100).toFixed(0) : '0'}% confidence):
                                </div>
                                <div className="tx-item tx-item-change">
                                  <span className="tx-item-vout">#{changeOutput.vout}</span>
                                  <span className="tx-item-addr" title={changeOutput.address}>
                                    {shortAddr(changeOutput.address)}
                                  </span>
                                  <span className="tx-item-amount">{formatBTC(changeOutput.value)}</span>
                                  <span className="change-badge">CHANGE</span>
                                </div>
                                {actualReasons.length > 0 && (
                                  <div style={{
                                    fontSize: '12px',
                                    color: 'var(--text-primary)',
                                    marginTop: '12px',
                                    padding: '12px',
                                    background: 'rgba(255, 152, 0, 0.15)',
                                    borderRadius: '6px',
                                    borderLeft: '3px solid var(--accent-orange)'
                                  }}>
                                    <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#ffa726' }}>
                                    ⚠️ Evidence for Change Detection:
                                  </div>
                                    <ul style={{ margin: '0', paddingLeft: '20px', lineHeight: '1.6' }}>
                                      {actualReasons.map((reason, i) => (
                                        <li key={i} style={{ marginBottom: '4px', color: '#fff' }}>{reason}</li>
                                      ))}
                                    </ul>
                                  <div style={{
                                    fontSize: '11px',
                                    color: '#ff9800',
                                    marginTop: '8px',
                                    padding: '8px',
                                    background: 'rgba(255, 152, 0, 0.1)',
                                    borderRadius: '4px',
                                    borderLeft: '3px solid #ff9800'
                                  }}>
                                    ⓘ Only {actualReasons.length} of 4 possible indicators detected. Weak evidence - change detection is uncertain.
                                  </div>
                                  </div>
                                )}
                                <div style={{ 
                                  marginTop: '10px', 
                                  fontSize: '11px', 
                                  fontStyle: 'italic',
                                  color: 'var(--text-secondary)',
                                  borderTop: '1px solid rgba(255, 152, 0, 0.2)',
                                  paddingTop: '8px'
                                }}>
                                  ⓘ Change detection is PROBABILISTIC, not certain. Heuristics can be wrong.
                                </div>
                              </>
                            );
                          })()}
                        </div>
              </>
            ) : null}
          </>
        ) : (
          <>
            {renderField('Address', data.address || metadata.address, true)}
            {renderField('Cluster ID', metadata.cluster_id)}
            
            {/* Show address statistics */}
            {loading ? (
              <div className="tx-loading">Loading address info...</div>
            ) : addressInfo ? (
              <div style={{ marginTop: '16px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px', color: '#4caf50' }}>
                  📊 Address Statistics
                </h3>
                <div className="detail-row">
                  <span className="detail-label">Current Balance:</span>
                  <span className="detail-value" style={{ color: addressInfo.balance > 0 ? '#4caf50' : '#999' }}>
                    {formatBTC(addressInfo.balance)}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Total Received:</span>
                  <span className="detail-value">{formatBTC(addressInfo.total_received)}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Total Sent:</span>
                  <span className="detail-value">{formatBTC(addressInfo.total_sent)}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">TX Count:</span>
                  <span className="detail-value">{addressInfo.tx_count}</span>
                </div>
                
                {/* Transaction History */}
                {addressInfo.transactions.length > 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px', color: '#64b5f6' }}>
                      📜 Transaction History (Recent {Math.min(10, addressInfo.transactions.length)})
                    </h3>
                    <div style={{ 
                      maxHeight: '200px', 
                      overflowY: 'auto', 
                      fontSize: '11px',
                      fontFamily: 'monospace'
                    }}>
                      {addressInfo.transactions.slice(0, 10).map((txid, idx) => (
                        <div 
                          key={idx}
                          style={{
                            padding: '6px 8px',
                            background: 'rgba(100, 181, 246, 0.1)',
                            marginBottom: '4px',
                            borderRadius: '4px',
                            wordBreak: 'break-all'
                          }}
                          title={txid}
                        >
                          {txid.substring(0, 16)}...{txid.substring(txid.length - 16)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
            
            {/* Show change explanation if this address is marked as change */}
            {metadata.is_change && (
              <div style={{
                marginTop: '16px',
                padding: '14px',
                background: 'rgba(255, 152, 0, 0.15)',
                borderRadius: '8px',
                borderLeft: '3px solid var(--accent-orange)'
              }}>
                <div style={{ 
                  fontWeight: 'bold', 
                  marginBottom: '10px', 
                  color: '#ffa726',
                  fontSize: '13px'
                }}>
                  🏷️ Marked as Change Output
                </div>
                <div style={{
                  fontSize: '12px',
                  color: 'var(--text-primary)',
                  lineHeight: '1.6'
                }}>
                  <p style={{ margin: '0 0 10px 0' }}>
                    This address was identified as a <strong>change output</strong> based on blockchain heuristics.
                  </p>
                  <div style={{ 
                    fontSize: '11px',
                    color: 'var(--text-secondary)',
                    background: 'rgba(0, 0, 0, 0.3)',
                    padding: '10px',
                    borderRadius: '4px',
                    marginTop: '8px'
                  }}>
                    <strong>Common indicators:</strong>
                    <ul style={{ margin: '4px 0 0 0', paddingLeft: '20px' }}>
                      <li>Non-round amount (leftover after payment)</li>
                      <li>Smaller than other outputs</li>
                      <li>Script type matches transaction inputs</li>
                      <li>Positioned after main payment output</li>
                    </ul>
                  </div>
                  <div style={{ 
                    marginTop: '10px', 
                    fontSize: '11px', 
                    fontStyle: 'italic',
                    color: 'var(--text-secondary)',
                    borderTop: '1px solid rgba(255, 152, 0, 0.2)',
                    paddingTop: '8px'
                  }}>
                    ⓘ This is a <strong>probabilistic inference</strong>, not a certainty. Change detection heuristics can be incorrect, especially with CoinJoins or privacy wallets.
                  </div>
                </div>
              </div>
            )}
            
            {!metadata.is_change && (
              <div style={{
                marginTop: '16px',
                padding: '12px',
                background: 'rgba(76, 175, 80, 0.1)',
                borderRadius: '6px',
                fontSize: '12px',
                color: 'var(--text-secondary)'
              }}>
                ℹ️ This address appears to be a <strong>payment destination</strong>, not change.
              </div>
            )}
          </>
        )}

        <div className="panel-actions">
          <button onClick={onExpand} className="action-button">
            <Expand size={16} />
            Expand Node
          </button>
          
          <a
            href={`https://mempool.space/${isTransaction ? 'tx' : 'address'}/${data.txid || data.address || metadata.txid || metadata.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="action-button"
          >
            <ExternalLink size={16} />
            View on Mempool
          </a>
        </div>
      </div>
    </div>
  );
}

