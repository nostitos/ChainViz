import React, { useEffect, useState } from 'react';

interface MempoolEndpoint {
  name: string;
  base_url: string;
  priority: number;
  healthy: boolean;
  success_count: number;
  failure_count: number;
  consecutive_failures: number;
  max_concurrent: number;
  request_delay: number;
  last_success: string | null;
  last_failure: string | null;
}

function IndexPage() {
  const [mempoolEndpoints, setMempoolEndpoints] = useState<MempoolEndpoint[]>([]);
  const [loadingMempool, setLoadingMempool] = useState(false);
  const [mempoolError, setMempoolError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMempool = async () => {
      setLoadingMempool(true);
      setMempoolError(null);
      try {
        const response = await fetch('http://localhost:8000/api/metrics/mempool');
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data: MempoolEndpoint[] = await response.json();
        setMempoolEndpoints(data);
      } catch (error) {
        console.error('Failed to load mempool metrics', error);
        setMempoolError('Unable to load mempool endpoint status.');
      } finally {
        setLoadingMempool(false);
      }
    };

    fetchMempool();
  }, []);

  const renderStatusBadge = (healthy: boolean) => (
    <span
      className={`px-2 py-1 rounded-full text-xs font-semibold ${
        healthy ? 'bg-green-600 text-green-100' : 'bg-red-600 text-red-100'
      }`}
    >
      {healthy ? 'Healthy' : 'Offline'}
    </span>
  );

  const priorityLabel = (priority: number) => {
    switch (priority) {
      case 0:
        return 'Local';
      case 1:
        return 'Additional';
      default:
        return 'Public';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4">⛓️ ChainViz</h1>
          <p className="text-xl text-gray-300">Bitcoin Blockchain Analysis Platform</p>
          <p className="text-sm text-gray-400 mt-2">247 Verified Electrum Servers</p>
        </div>

        {/* Main Application */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6 border border-gray-700">
          <h2 className="text-2xl font-bold mb-4">📊 Main Application</h2>
          <a
            href="/"
            className="block bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-lg text-center transition-colors"
          >
            Open ChainViz Graph Analyzer
          </a>
          <p className="text-gray-400 text-sm mt-2">
            Trace UTXOs, visualize transaction flows, analyze blockchain patterns
          </p>
        </div>

        {/* Wallet Tools */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6 border border-gray-700">
          <h2 className="text-2xl font-bold mb-4">💼 Wallet Tools</h2>
          <a
            href="/xpub-history"
            className="block bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-lg text-center transition-colors"
          >
            📊 xpub Transaction History
          </a>
          <p className="text-gray-400 text-sm mt-2">
            Generate complete transaction history from extended public keys (xpub/ypub/zpub) with running balance
          </p>
        </div>

        {/* Multiplexer Dashboards */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6 border border-gray-700">
          <h2 className="text-2xl font-bold mb-4">📊 Server Information</h2>
          
          <div className="grid grid-cols-1 gap-4">
            <a
              href="/servers"
              className="block bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-lg text-center transition-colors"
            >
              📋 All Servers (247 Tested)
            </a>
          </div>
          
          <p className="text-gray-400 text-sm mt-2">
            Complete list of 247 tested Electrum servers with performance metrics
          </p>
        </div>

        {/* Mempool Endpoints */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6 border border-gray-700">
          <h2 className="text-2xl font-bold mb-4">🌐 Mempool Endpoints</h2>
          {loadingMempool && <p className="text-gray-400 text-sm">Loading endpoint status…</p>}
          {mempoolError && (
            <p className="text-red-400 text-sm bg-red-800 bg-opacity-30 p-3 rounded">{mempoolError}</p>
          )}
          {!loadingMempool && !mempoolError && (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700">
                  <thead className="bg-gray-700 bg-opacity-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Endpoint</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Tier</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Success</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Failures</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Last Success</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {mempoolEndpoints.map((endpoint) => (
                      <tr key={endpoint.base_url} className="hover:bg-gray-700 hover:bg-opacity-30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-white">{endpoint.base_url}</div>
                          <div className="text-xs text-gray-400">Concurrency: {endpoint.max_concurrent}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-200">{priorityLabel(endpoint.priority)}</td>
                        <td className="px-4 py-3">{renderStatusBadge(endpoint.healthy)}</td>
                        <td className="px-4 py-3 text-sm text-green-400 font-mono">{endpoint.success_count}</td>
                        <td className="px-4 py-3 text-sm text-red-400 font-mono">
                          {endpoint.failure_count}
                          {endpoint.consecutive_failures > 0 && (
                            <span className="ml-2 text-xs text-orange-400">
                              ({endpoint.consecutive_failures} consecutive)
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-300">
                          {endpoint.last_success ? new Date(endpoint.last_success).toLocaleString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {mempoolEndpoints.length === 0 && (
                <p className="text-gray-400 text-sm mt-3">
                  No mempool endpoints are currently configured. Check backend configuration.
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-12 text-gray-500 text-sm">
          <p>ChainViz v0.1.0 | 247 Verified Servers</p>
        </div>
      </div>
    </div>
  );
};

export default IndexPage;

