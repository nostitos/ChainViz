import { useState } from 'react';
import axios from 'axios';

interface Transaction {
  txid: string;
  timestamp?: number;
  confirmations?: number;
}

interface AddressHistory {
  address: string;
  txids: string[];
  tx_count: number;
}

interface XpubHistoryResponse {
  xpub: string;
  total_addresses: number;
  addresses_with_history: number;
  total_transactions: number;
  addresses: AddressHistory[];
}

interface TxDetail {
  txid: string;
  address: string;
  timestamp: number | null;
  change: number; // positive for received, negative for sent
  balance: number; // running balance
}

function XpubHistoryPage() {
  const [xpub, setXpub] = useState(
    'zpub6qyBNaAYEgDZtiW6cMnFNnTNwTwcJ9ovgyXDrMWXb2ZFHmgY5pjA1aH6n6z7ykpXBE2HN4vwrnomMFwGfqXdb3odnqZQagG2gE8LdfHof31'
  );
  const [derivationPath, setDerivationPath] = useState('m/84h/0h/0h');
  const [addressCount, setAddressCount] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<XpubHistoryResponse | null>(null);
  const [transactions, setTransactions] = useState<TxDetail[]>([]);
  const [loadingTxDetails, setLoadingTxDetails] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setHistory(null);
    setTransactions([]);

    try {
      // Fetch xpub history
      const response = await axios.post<XpubHistoryResponse>(
        'http://localhost:8000/api/xpub/history',
        {
          xpub,
          derivation_path: derivationPath,
          count: addressCount,
          change: 0,
        }
      );

      setHistory(response.data);

      // Now fetch detailed transaction info
      await fetchTransactionDetails(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to fetch xpub history');
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactionDetails = async (historyData: XpubHistoryResponse) => {
    setLoadingTxDetails(true);

    try {
      // Get all unique txids
      const allTxids = new Set<string>();
      historyData.addresses.forEach((addr) => {
        addr.txids.forEach((txid) => allTxids.add(txid));
      });

      // Fetch all transactions
      const txPromises = Array.from(allTxids).map((txid) =>
        axios.get(`http://localhost:8000/api/transaction/${txid}`).catch(() => null)
      );

      const txResponses = await Promise.all(txPromises);
      const txMap = new Map<string, any>();
      
      txResponses.forEach((response, idx) => {
        if (response) {
          const txid = Array.from(allTxids)[idx];
          // Extract the transaction from the wrapper object
          const txData = response.data.transaction || response.data;
          txMap.set(txid, txData);
        }
      });

      // Build address set for quick lookup
      const myAddresses = new Set(historyData.addresses.map((a) => a.address));

      // Process transactions and calculate balances
      const txDetails: TxDetail[] = [];
      let runningBalance = 0;

      // Get all transactions with timestamps and sort by time
      const txWithTime: Array<{ txid: string; address: string; timestamp: number | null }> = [];
      
      historyData.addresses.forEach((addrHistory) => {
        addrHistory.txids.forEach((txid) => {
          const tx = txMap.get(txid);
          txWithTime.push({
            txid,
            address: addrHistory.address,
            timestamp: tx?.timestamp || null,
          });
        });
      });

      // Sort by timestamp (oldest first)
      txWithTime.sort((a, b) => {
        if (a.timestamp === null) return 1;
        if (b.timestamp === null) return -1;
        return a.timestamp - b.timestamp;
      });

      // Calculate balance changes
      txWithTime.forEach(({ txid, address, timestamp }) => {
        const tx = txMap.get(txid);
        if (!tx) return;

        let change = 0;

        // Calculate received (outputs to our addresses)
        tx.outputs?.forEach((output: any) => {
          if (myAddresses.has(output.address)) {
            change += output.value;
          }
        });

        // Calculate sent (inputs from our addresses)
        tx.inputs?.forEach((input: any) => {
          if (myAddresses.has(input.address)) {
            change -= input.value;
          }
        });

        runningBalance += change;

        txDetails.push({
          txid,
          address,
          timestamp,
          change,
          balance: runningBalance,
        });
      });

      setTransactions(txDetails);
    } catch (err) {
      console.error('Failed to fetch transaction details:', err);
    } finally {
      setLoadingTxDetails(false);
    }
  };

  const formatBTC = (satoshis: number) => {
    return (satoshis / 100_000_000).toFixed(8) + ' BTC';
  };

  const formatDate = (timestamp: number | null) => {
    if (!timestamp) return 'Pending';
    return new Date(timestamp * 1000).toLocaleString();
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui, sans-serif', maxWidth: '1400px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '10px' }}>📊 xpub Transaction History</h1>
      <p style={{ color: '#666', marginBottom: '30px' }}>
        Derive addresses from an extended public key and view complete transaction history with running balance
      </p>

      {/* Form */}
      <form onSubmit={handleSubmit} style={{ marginBottom: '30px', background: '#f5f5f5', padding: '20px', borderRadius: '8px' }}>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            Extended Public Key (xpub/ypub/zpub):
          </label>
          <input
            type="text"
            value={xpub}
            onChange={(e) => setXpub(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              fontSize: '14px',
              fontFamily: 'monospace',
              border: '1px solid #ccc',
              borderRadius: '4px',
            }}
            placeholder="zpub6..."
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Derivation Path:</label>
            <input
              type="text"
              value={derivationPath}
              onChange={(e) => setDerivationPath(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '14px',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
              placeholder="m/84h/0h/0h"
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Number of Addresses:</label>
            <input
              type="number"
              value={addressCount}
              onChange={(e) => setAddressCount(parseInt(e.target.value))}
              min="1"
              max="1000"
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '14px',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: '15px',
            padding: '10px 20px',
            fontSize: '16px',
            fontWeight: 'bold',
            background: loading ? '#ccc' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Loading...' : 'Generate History'}
        </button>
      </form>

      {/* Error */}
      {error && (
        <div style={{ padding: '15px', background: '#fee', border: '1px solid #fcc', borderRadius: '4px', marginBottom: '20px', color: '#c00' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Summary */}
      {history && (
        <div style={{ marginBottom: '30px', background: '#e8f4f8', padding: '20px', borderRadius: '8px' }}>
          <h2 style={{ marginTop: 0, marginBottom: '15px' }}>📈 Summary</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px' }}>
            <div>
              <div style={{ fontSize: '14px', color: '#666' }}>Total Addresses</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{history.total_addresses}</div>
            </div>
            <div>
              <div style={{ fontSize: '14px', color: '#666' }}>Addresses with History</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#007bff' }}>{history.addresses_with_history}</div>
            </div>
            <div>
              <div style={{ fontSize: '14px', color: '#666' }}>Total Transactions</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#28a745' }}>{history.total_transactions}</div>
            </div>
            <div>
              <div style={{ fontSize: '14px', color: '#666' }}>Final Balance</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ff6b6b' }}>
                {transactions.length > 0 ? formatBTC(transactions[transactions.length - 1].balance) : '0 BTC'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loading transaction details */}
      {loadingTxDetails && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          <div style={{ fontSize: '18px', marginBottom: '10px' }}>📥 Fetching transaction details...</div>
          <div>This may take a moment for wallets with many transactions</div>
        </div>
      )}

      {/* Transaction History Table */}
      {transactions.length > 0 && (
        <div>
          <h2 style={{ marginBottom: '15px' }}>📝 Transaction History ({transactions.length} transactions)</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <thead>
                <tr style={{ background: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold', color: '#495057' }}>Date & Time</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold', color: '#495057' }}>Transaction ID</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold', color: '#495057' }}>Address</th>
                  <th style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', color: '#495057' }}>Change</th>
                  <th style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', color: '#495057' }}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx, idx) => (
                  <tr
                    key={`${tx.txid}-${idx}`}
                    style={{
                      borderBottom: '1px solid #dee2e6',
                      background: idx % 2 === 0 ? 'white' : '#f8f9fa',
                    }}
                  >
                    <td style={{ padding: '12px', fontSize: '14px', color: '#495057' }}>
                      {formatDate(tx.timestamp)}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px' }}>
                      <a
                        href={`https://mempool.space/tx/${tx.txid}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#007bff', textDecoration: 'none', fontFamily: 'monospace', fontSize: '12px' }}
                      >
                        {tx.txid.slice(0, 16)}...
                      </a>
                    </td>
                    <td style={{ padding: '12px', fontSize: '12px', fontFamily: 'monospace', color: '#6c757d' }}>
                      {tx.address.slice(0, 20)}...
                    </td>
                    <td
                      style={{
                        padding: '12px',
                        textAlign: 'right',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        fontFamily: 'monospace',
                        color: tx.change >= 0 ? '#28a745' : '#dc3545',
                      }}
                    >
                      {tx.change >= 0 ? '+' : ''}
                      {formatBTC(tx.change)}
                    </td>
                    <td
                      style={{
                        padding: '12px',
                        textAlign: 'right',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        fontFamily: 'monospace',
                        color: '#495057',
                      }}
                    >
                      {formatBTC(tx.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {history && transactions.length === 0 && !loadingTxDetails && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#666' }}>
          <div style={{ fontSize: '48px', marginBottom: '15px' }}>📭</div>
          <div style={{ fontSize: '18px' }}>No transactions found for the derived addresses</div>
        </div>
      )}
    </div>
  );
}

export default XpubHistoryPage;

