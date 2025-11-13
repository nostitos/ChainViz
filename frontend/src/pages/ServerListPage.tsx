import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = 'http://localhost:8000';

interface Server {
  host: string;
  port: number;
  ssl: boolean;
  version: any;
  connect_time: number;
  version_time: number;
  tx_time: number;
  total_latency: number;
  status: string;
}

function ServerListPage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Force body to be scrollable
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';
    
    fetchServers();
    
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, []);

  const fetchServers = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/all-servers`);
      setServers(res.data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch servers:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px' }}>Loading servers...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', backgroundColor: '#fff', color: '#111827' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '10px', color: '#111827' }}>
          All Electrum Servers ({servers.length} total)
        </h1>
        <a href="/index" style={{ color: '#2563eb', textDecoration: 'none' }}>
          ← Back to Index
        </a>
      </div>

      <table style={{ 
        width: '100%', 
        borderCollapse: 'collapse',
        border: '1px solid #e5e7eb'
      }}>
        <thead>
          <tr style={{ backgroundColor: '#f9fafb' }}>
            <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontWeight: '600', color: '#111827' }}>#</th>
            <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontWeight: '600', color: '#111827' }}>Host</th>
            <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontWeight: '600', color: '#111827' }}>Port</th>
            <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontWeight: '600', color: '#111827' }}>Protocol</th>
            <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #e5e7eb', fontWeight: '600', color: '#111827' }}>Connect</th>
            <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #e5e7eb', fontWeight: '600', color: '#111827' }}>Version Call</th>
            <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #e5e7eb', fontWeight: '600', color: '#111827' }}>TX Fetch</th>
            <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #e5e7eb', fontWeight: '600', color: '#111827' }}>Total Latency</th>
            <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontWeight: '600', color: '#111827' }}>Version</th>
            <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontWeight: '600', color: '#111827' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {servers.map((server, idx) => {
            const versionStr = Array.isArray(server.version) ? server.version[0] : server.version;
            const protocol = server.ssl ? 'ssl' : 'tcp';
            
            return (
              <tr key={idx} style={{ 
                borderBottom: '1px solid #e5e7eb',
                backgroundColor: idx % 2 === 0 ? '#fff' : '#f9fafb'
              }}>
                <td style={{ padding: '12px', color: '#111827' }}>{idx + 1}</td>
                <td style={{ padding: '12px', fontFamily: 'monospace', color: '#111827', fontSize: '14px' }}>{server.host}</td>
                <td style={{ padding: '12px', color: '#111827' }}>{server.port}</td>
                <td style={{ padding: '12px', textTransform: 'uppercase' }}>
                  <span style={{ 
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: '500',
                    backgroundColor: server.ssl ? '#dbeafe' : '#f3f4f6',
                    color: server.ssl ? '#1e40af' : '#374151'
                  }}>
                    {protocol}
                  </span>
                </td>
                <td style={{ padding: '12px', color: '#111827', textAlign: 'right', fontFamily: 'monospace', fontSize: '14px' }}>
                  {server.connect_time.toFixed(3)}s
                </td>
                <td style={{ padding: '12px', color: '#111827', textAlign: 'right', fontFamily: 'monospace', fontSize: '14px' }}>
                  {server.version_time.toFixed(3)}s
                </td>
                <td style={{ padding: '12px', color: '#111827', textAlign: 'right', fontFamily: 'monospace', fontSize: '14px' }}>
                  {server.tx_time.toFixed(3)}s
                </td>
                <td style={{ 
                  padding: '12px', 
                  textAlign: 'right', 
                  fontFamily: 'monospace', 
                  fontSize: '14px',
                  fontWeight: 'bold',
                  color: server.total_latency < 0.5 ? '#059669' : server.total_latency < 1.0 ? '#d97706' : '#dc2626'
                }}>
                  {server.total_latency.toFixed(3)}s
                </td>
                <td style={{ padding: '12px', fontSize: '13px', color: '#6b7280' }}>
                  {versionStr}
                </td>
                <td style={{ padding: '12px' }}>
                  <span style={{ 
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: '500',
                    backgroundColor: '#d1fae5',
                    color: '#065f46'
                  }}>
                    ✓ Tested
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ marginTop: '20px', padding: '12px', backgroundColor: '#f9fafb', borderRadius: '4px' }}>
        <div style={{ fontSize: '14px', color: '#111827' }}>
          <strong>Total Tested:</strong> {servers.length} servers • 
          <strong> SSL:</strong> {servers.filter(s => s.ssl).length} • 
          <strong> TCP:</strong> {servers.filter(s => !s.ssl).length} • 
          <strong> Avg Latency:</strong> {(servers.reduce((sum, s) => sum + s.total_latency, 0) / servers.length).toFixed(3)}s • 
          <strong> Fastest:</strong> {servers[0]?.host} ({servers[0]?.total_latency.toFixed(3)}s)
        </div>
      </div>
    </div>
  );
};

export default ServerListPage;

