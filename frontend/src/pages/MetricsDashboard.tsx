import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = 'http://localhost:8000';

interface ServerMetrics {
  id: string;
  host: string;
  port: number;
  protocol: string;
  version: string;
  state: string;
  request_count: number;
  success_count: number;
  failure_count: number;
  success_rate: number;
  consecutive_failures: number;
  avg_latency: number;
  health_score: number;
  in_flight_requests: number;
  last_request_time: number | null;
  last_success_time: number | null;
  connection_time: number | null;
  uptime_score: number;
}

interface PoolSummary {
  pool_size: number;
  connected: number;
  healthy: number;
  total_requests: number;
  total_successes: number;
  total_failures: number;
  success_rate: number;
  request_types: Record<string, number>;
}

interface RequestLog {
  timestamp: string;
  server: string;
  method: string;
  status: string;
  latency: number;
  error?: string;
}

function MetricsDashboard() {
  const [servers, setServers] = useState<ServerMetrics[]>([]);
  const [summary, setSummary] = useState<PoolSummary | null>(null);
  const [requests, setRequests] = useState<RequestLog[]>([]);
  const [sortBy, setSortBy] = useState<'health_score' | 'latency' | 'success_rate' | 'requests'>('health_score');
  const [sortDesc, setSortDesc] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(true);

  // Force body to be scrollable
  useEffect(() => {
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, []);

  const fetchMetrics = async () => {
    try {
      const [serversRes, summaryRes, requestsRes] = await Promise.all([
        axios.get(`${API_BASE}/api/metrics/servers`),
        axios.get(`${API_BASE}/api/metrics/summary`),
        axios.get(`${API_BASE}/api/metrics/requests?limit=50`),
      ]);

      setServers(serversRes.data);
      setSummary(summaryRes.data);
      setRequests(requestsRes.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching metrics:', error);
      setLoading(false);
    }
  };

  const refreshServerList = async () => {
    try {
      await axios.post(`${API_BASE}/api/metrics/refresh-servers`);
      await fetchMetrics();
    } catch (error) {
      console.error('Error refreshing servers:', error);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchMetrics();
    }, 5000);

    return () => clearInterval(interval);
  }, [autoRefresh]);

  const sortedServers = [...servers].sort((a, b) => {
    let aVal: number, bVal: number;

    switch (sortBy) {
      case 'health_score':
        aVal = a.health_score;
        bVal = b.health_score;
        break;
      case 'latency':
        aVal = a.avg_latency;
        bVal = b.avg_latency;
        break;
      case 'success_rate':
        aVal = a.success_rate;
        bVal = b.success_rate;
        break;
      case 'requests':
        aVal = a.request_count;
        bVal = b.request_count;
        break;
      default:
        aVal = a.health_score;
        bVal = b.health_score;
    }

    return sortDesc ? bVal - aVal : aVal - bVal;
  });

  const getStateColor = (state: string) => {
    switch (state) {
      case 'connected':
        return 'bg-green-100 text-green-800';
      case 'unhealthy':
        return 'bg-red-100 text-red-800';
      case 'connecting':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getHealthColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600';
    if (score >= 0.5) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ fontSize: '20px' }}>Loading metrics...</div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: '#f9fafb', padding: '60px 150px' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontSize: '36px', fontWeight: 'bold', color: '#111827' }}>
            Electrum Multiplexer Metrics
          </h1>
          <div style={{ display: 'flex', gap: '12px' }}>
            <a
              href="/index"
              style={{
                padding: '10px 20px',
                backgroundColor: '#4b5563',
                color: 'white',
                borderRadius: '8px',
                textDecoration: 'none',
                fontWeight: '500'
              }}
            >
              ← Index
            </a>
            <button
              onClick={refreshServerList}
              style={{
                padding: '10px 20px',
                backgroundColor: '#2563eb',
                color: 'white',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: '500'
              }}
            >
              Refresh Server List
            </button>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              style={{
                padding: '10px 20px',
                backgroundColor: autoRefresh ? '#16a34a' : '#d1d5db',
                color: autoRefresh ? 'white' : '#374151',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: '500'
              }}
            >
              Auto-refresh: {autoRefresh ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px', marginBottom: '40px' }}>
            <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Active Servers</div>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#111827' }}>
                {summary.connected}/{summary.pool_size}
              </div>
              <div style={{ fontSize: '14px', color: '#16a34a', marginTop: '8px' }}>
                {summary.healthy} healthy
              </div>
            </div>

            <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Total Requests</div>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#111827' }}>
                {summary.total_requests.toLocaleString()}
              </div>
              <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '8px' }}>
                {summary.total_successes.toLocaleString()} success
              </div>
            </div>

            <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Success Rate</div>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#111827' }}>
                {(summary.success_rate * 100).toFixed(1)}%
              </div>
              <div style={{ fontSize: '14px', color: '#dc2626', marginTop: '8px' }}>
                {summary.total_failures} failures
              </div>
            </div>

            <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Avg Latency</div>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#111827' }}>
                {servers.length > 0
                  ? (
                      servers.reduce((sum, s) => sum + s.avg_latency, 0) / servers.length
                    ).toFixed(3)
                  : '0.000'}
                s
              </div>
            </div>
          </div>
        )}

        {/* Server Table */}
        <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '40px' }}>
          <div style={{ padding: '24px', borderBottom: '1px solid #e5e7eb' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#111827', marginBottom: '16px' }}>
              Server Pool ({servers.length} servers)
            </h2>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {['health_score', 'latency', 'success_rate', 'requests'].map((sort) => (
                <button
                  key={sort}
                  onClick={() => {
                    setSortBy(sort as any);
                    setSortDesc(sort !== 'latency');
                  }}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: sortBy === sort ? '#2563eb' : '#e5e7eb',
                    color: sortBy === sort ? 'white' : '#374151',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}
                >
                  Sort by {sort === 'health_score' ? 'Health' : sort === 'latency' ? 'Latency' : sort === 'success_rate' ? 'Success Rate' : 'Requests'}
                </button>
              ))}
            </div>
          </div>

          {/* SCROLLABLE TABLE */}
          <div style={{ padding: '24px' }}>
            <div
              style={{
                height: '600px',
                overflowY: 'scroll',
                overflowX: 'auto',
                border: '2px solid #d1d5db',
                borderRadius: '8px',
                backgroundColor: 'white'
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ backgroundColor: '#f3f4f6', position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr>
                    <th style={{ padding: '16px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: '#374151', borderBottom: '2px solid #d1d5db' }}>
                      Server
                    </th>
                    <th style={{ padding: '16px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: '#374151', borderBottom: '2px solid #d1d5db' }}>
                      Status
                    </th>
                    <th style={{ padding: '16px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: '#374151', borderBottom: '2px solid #d1d5db' }}>
                      Health
                    </th>
                    <th style={{ padding: '16px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: '#374151', borderBottom: '2px solid #d1d5db' }}>
                      Requests
                    </th>
                    <th style={{ padding: '16px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: '#374151', borderBottom: '2px solid #d1d5db' }}>
                      Success Rate
                    </th>
                    <th style={{ padding: '16px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: '#374151', borderBottom: '2px solid #d1d5db' }}>
                      Latency
                    </th>
                    <th style={{ padding: '16px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: '#374151', borderBottom: '2px solid #d1d5db' }}>
                      Version
                    </th>
                  </tr>
                </thead>
                <tbody style={{ backgroundColor: 'white' }}>
                  {sortedServers.map((server) => (
                    <tr key={server.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '16px' }}>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>{server.host}</div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>:{server.port} ({server.protocol})</div>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '4px 12px',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            borderRadius: '12px',
                            backgroundColor: server.state === 'connected' ? '#d1fae5' : server.state === 'unhealthy' ? '#fee2e2' : '#e5e7eb',
                            color: server.state === 'connected' ? '#065f46' : server.state === 'unhealthy' ? '#991b1b' : '#374151'
                          }}
                        >
                          {server.state}
                        </span>
                        {server.in_flight_requests > 0 && (
                          <div style={{ fontSize: '11px', color: '#ea580c', fontWeight: '500', marginTop: '4px' }}>
                            {server.in_flight_requests} active
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '16px' }}>
                        <div
                          style={{
                            fontSize: '18px',
                            fontWeight: 'bold',
                            color: server.health_score >= 0.8 ? '#16a34a' : server.health_score >= 0.5 ? '#ca8a04' : '#dc2626'
                          }}
                        >
                          {(server.health_score * 100).toFixed(0)}%
                        </div>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <div style={{ fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                          {server.request_count.toLocaleString()}
                        </div>
                        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                          ✓ {server.success_count} / ✗ {server.failure_count}
                        </div>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <div
                          style={{
                            fontSize: '16px',
                            fontWeight: 'bold',
                            color: server.success_rate >= 0.95 ? '#16a34a' : server.success_rate >= 0.8 ? '#ca8a04' : '#dc2626'
                          }}
                        >
                          {(server.success_rate * 100).toFixed(1)}%
                        </div>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <div style={{ fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                          {server.avg_latency > 0 ? `${(server.avg_latency * 1000).toFixed(0)}ms` : '-'}
                        </div>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <div style={{ fontSize: '13px', color: '#4b5563' }}>{server.version}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Request Types */}
        {summary && Object.keys(summary.request_types).length > 0 && (
          <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '32px', marginBottom: '40px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#111827', marginBottom: '24px' }}>
              Request Types
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              {Object.entries(summary.request_types)
                .sort(([, a], [, b]) => b - a)
                .map(([method, count]) => (
                  <div
                    key={method}
                    style={{
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px',
                      padding: '16px',
                      backgroundColor: '#f9fafb'
                    }}
                  >
                    <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500', marginBottom: '8px' }}>
                      {method}
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#111827' }}>{count}</div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Recent Requests - SCROLLABLE */}
        <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '60px' }}>
          <div style={{ padding: '24px', borderBottom: '1px solid #e5e7eb' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#111827' }}>Recent Requests</h2>
          </div>
          <div style={{ padding: '24px' }}>
            <div
              style={{
                height: '400px',
                overflowY: 'scroll',
                overflowX: 'auto',
                border: '2px solid #d1d5db',
                borderRadius: '8px',
                backgroundColor: 'white'
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ backgroundColor: '#f3f4f6', position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr>
                    <th style={{ padding: '16px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: '#374151', borderBottom: '2px solid #d1d5db' }}>
                      Time
                    </th>
                    <th style={{ padding: '16px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: '#374151', borderBottom: '2px solid #d1d5db' }}>
                      Server
                    </th>
                    <th style={{ padding: '16px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: '#374151', borderBottom: '2px solid #d1d5db' }}>
                      Method
                    </th>
                    <th style={{ padding: '16px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: '#374151', borderBottom: '2px solid #d1d5db' }}>
                      Status
                    </th>
                    <th style={{ padding: '16px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: '#374151', borderBottom: '2px solid #d1d5db' }}>
                      Latency
                    </th>
                  </tr>
                </thead>
                <tbody style={{ backgroundColor: 'white' }}>
                  {requests.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '48px', textAlign: 'center', fontSize: '16px', color: '#6b7280' }}>
                        No requests yet. Generate traffic to see metrics.
                      </td>
                    </tr>
                  ) : (
                    requests.map((req, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '12px', fontSize: '13px', color: '#6b7280' }}>
                          {new Date(req.timestamp).toLocaleTimeString()}
                        </td>
                        <td style={{ padding: '12px', fontSize: '13px', fontWeight: '500', color: '#111827' }}>
                          {req.server}
                        </td>
                        <td style={{ padding: '12px', fontSize: '13px', color: '#4b5563' }}>{req.method}</td>
                        <td style={{ padding: '12px' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '4px 12px',
                              fontSize: '11px',
                              fontWeight: 'bold',
                              borderRadius: '12px',
                              backgroundColor: req.status === 'success' ? '#d1fae5' : '#fee2e2',
                              color: req.status === 'success' ? '#065f46' : '#991b1b'
                            }}
                          >
                            {req.status}
                          </span>
                        </td>
                        <td style={{ padding: '12px', fontSize: '13px', fontWeight: '600', color: '#111827' }}>
                          {(req.latency * 1000).toFixed(0)}ms
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MetricsDashboard;
