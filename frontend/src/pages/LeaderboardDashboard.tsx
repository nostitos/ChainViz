import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = 'http://localhost:8000';

interface ServerScore {
  rank: number;
  host: string;
  port: number;
  protocol: string;
  version: string;
  load_time: number;
  edge_count: number;
  input_count: number;
  uptime_score: number;
}

function LeaderboardDashboard() {
  const [leaderboard, setLeaderboard] = useState<ServerScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string>('');

  useEffect(() => {
    // For now, show static leaderboard from the benchmark
    // TODO: Create API endpoint to serve this data
    const staticData: ServerScore[] = [
      { rank: 1, host: 'fulcrum1.getsrt.net', port: 50002, protocol: 'ssl', version: 'Fulcrum 1.10.0', load_time: 0.02, edge_count: 83, input_count: 41, uptime_score: 1.0 },
      { rank: 2, host: 'electrum.loyce.club', port: 50002, protocol: 'ssl', version: 'Fulcrum 1.12.0', load_time: 0.03, edge_count: 83, input_count: 41, uptime_score: 1.0 },
      { rank: 3, host: 'guichet.centure.cc', port: 50001, protocol: 'tcp', version: 'ElectrumX 1.16.0', load_time: 0.03, edge_count: 83, input_count: 41, uptime_score: 1.0 },
      { rank: 4, host: 'guichet.centure.cc', port: 50002, protocol: 'ssl', version: 'ElectrumX 1.16.0', load_time: 0.04, edge_count: 83, input_count: 41, uptime_score: 1.0 },
      { rank: 5, host: 'electrum.loyce.club', port: 50001, protocol: 'tcp', version: 'Fulcrum 1.12.0', load_time: 0.04, edge_count: 83, input_count: 41, uptime_score: 1.0 },
      { rank: 6, host: '52.1.56.181', port: 50001, protocol: 'tcp', version: 'ElectrumX 1.16.0', load_time: 0.05, edge_count: 83, input_count: 41, uptime_score: 1.0 },
      { rank: 7, host: 'gods-of-rock.screaminglemur.net', port: 50001, protocol: 'tcp', version: 'ElectrumX 1.16.0', load_time: 0.05, edge_count: 83, input_count: 41, uptime_score: 1.0 },
      { rank: 8, host: 'electrumx-btc.cryptonermal.net', port: 50001, protocol: 'tcp', version: 'ElectrumX 1.16.0', load_time: 0.06, edge_count: 83, input_count: 41, uptime_score: 1.0 },
      { rank: 9, host: 'static.106.104.161.5.clients.your-server.de', port: 50002, protocol: 'ssl', version: 'ElectrumX 1.16.0', load_time: 0.06, edge_count: 83, input_count: 41, uptime_score: 1.0 },
      { rank: 10, host: '5.161.104.106', port: 50002, protocol: 'ssl', version: 'ElectrumX 1.16.0', load_time: 0.08, edge_count: 83, input_count: 41, uptime_score: 1.0 },
      { rank: 11, host: 'mainnet.foundationdevices.com', port: 50002, protocol: 'ssl', version: 'Fulcrum 1.11.1', load_time: 0.08, edge_count: 83, input_count: 41, uptime_score: 1.0 },
      { rank: 12, host: 'smmalis37.ddns.net', port: 50002, protocol: 'ssl', version: 'Fulcrum 2.0', load_time: 0.08, edge_count: 83, input_count: 41, uptime_score: 1.0 },
      { rank: 13, host: 'det.electrum.blockitall.us', port: 50002, protocol: 'ssl', version: 'Fulcrum 1.12.0', load_time: 0.08, edge_count: 83, input_count: 41, uptime_score: 1.0 },
      { rank: 14, host: 'fulcrum.sethforprivacy.com', port: 50002, protocol: 'ssl', version: 'Fulcrum 2.0', load_time: 0.09, edge_count: 83, input_count: 41, uptime_score: 1.0 },
      { rank: 15, host: 'electrum.labrie.ca', port: 50002, protocol: 'ssl', version: 'Fulcrum 1.12.0', load_time: 0.09, edge_count: 83, input_count: 41, uptime_score: 1.0 },
      { rank: 16, host: 'det.electrum.blockitall.us', port: 50001, protocol: 'tcp', version: 'Fulcrum 1.12.0', load_time: 0.09, edge_count: 83, input_count: 41, uptime_score: 1.0 },
      { rank: 17, host: 'electrum.degga.net', port: 50001, protocol: 'tcp', version: 'Fulcrum 1.12.0', load_time: 0.09, edge_count: 83, input_count: 41, uptime_score: 1.0 },
      { rank: 18, host: '34.138.250.15', port: 50002, protocol: 'ssl', version: 'ElectrumX 1.18.0', load_time: 0.10, edge_count: 83, input_count: 41, uptime_score: 1.0 },
      { rank: 19, host: 'electrum.cakewallet.com', port: 50002, protocol: 'ssl', version: 'Fulcrum 2.0', load_time: 0.10, edge_count: 83, input_count: 41, uptime_score: 1.0 },
      { rank: 20, host: 'fakenews.fiatfaucet.com', port: 50002, protocol: 'ssl', version: 'Fulcrum 2.0', load_time: 0.11, edge_count: 83, input_count: 41, uptime_score: 1.0 },
    ];
    
    setLeaderboard(staticData);
    setLastUpdate('300 servers tested');
    setLoading(false);
  }, []);

  const getMedal = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `${rank}.`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <div className="text-xl">Loading leaderboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="w-full max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">🏆 Electrum Server Leaderboard</h1>
            <p className="text-gray-400 mt-1">{lastUpdate}</p>
          </div>
          <a
            href="/index"
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
          >
            ← Back to Index
          </a>
        </div>

        <div className="bg-gray-800 rounded-lg shadow-xl border border-gray-700 p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">📊 Benchmark Results</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-gray-400 text-sm">Fastest Server</div>
              <div className="text-2xl font-bold text-green-400">0.02s</div>
              <div className="text-sm text-gray-500">fulcrum1.getsrt.net</div>
            </div>
            <div>
              <div className="text-gray-400 text-sm">Average Time</div>
              <div className="text-2xl font-bold">0.36s</div>
            </div>
            <div>
              <div className="text-gray-400 text-sm">Success Rate</div>
              <div className="text-2xl font-bold text-green-400">90%</div>
              <div className="text-sm text-gray-500">270/300 servers</div>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg shadow-xl border border-gray-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-700">
            <h2 className="text-xl font-bold">Top 20 Fastest Servers</h2>
            <p className="text-sm text-gray-400 mt-1">
              Test Transaction: 9d9ad930cf6a74d82f5b36770f4b8faa2bca085801101e06f9bab59bcd28ef89
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Rank
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Server
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Load Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Edges
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Version
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {leaderboard.map((server) => (
                  <tr key={server.rank} className="hover:bg-gray-750">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-2xl">{getMedal(server.rank)}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium">{server.host}</div>
                      <div className="text-xs text-gray-500">:{server.port} ({server.protocol})</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-lg font-bold ${
                        server.load_time < 0.05 ? 'text-green-400' :
                        server.load_time < 0.10 ? 'text-yellow-400' :
                        'text-gray-300'
                      }`}>
                        {server.load_time.toFixed(3)}s
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                      {server.edge_count} edges
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                      {server.version}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 text-center text-gray-500 text-sm">
          <p>Benchmark tested 300 servers from 1209k.com</p>
          <p className="mt-1">Transaction had 41 inputs, 42 outputs (83 edges total)</p>
        </div>
      </div>
    </div>
  );
};

export default LeaderboardDashboard;

