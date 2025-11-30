import React, { useState, useEffect } from 'react';
import { serverHealthApi, ServerInfo, ServerTestResponse } from '../services/serverHealthApi';
import './ServerHealthDashboard.css';

interface TestResult {
    [testType: string]: ServerTestResponse;
}

interface ServerState {
    info: ServerInfo;
    results: TestResult;
    isLoading: boolean;
}

const ServerHealthDashboard: React.FC = () => {
    const [servers, setServers] = useState<ServerState[]>([]);
    const [address, setAddress] = useState('bc1qqwmpdxys70qr08dwlx479eya9fjn3m3e0vrx7t');
    const [txid, setTxid] = useState('6b59ee43ced9c624069d44894baa0fc9cc09ce16a437bcf3d9a0d76b5cb9f561');
    const [isLoadingList, setIsLoadingList] = useState(true);

    useEffect(() => {
        loadServers();
    }, []);

    const loadServers = async () => {
        try {
            setIsLoadingList(true);
            const data = await serverHealthApi.listServers();
            setServers(data.servers.map(s => ({
                info: s,
                results: {},
                isLoading: false
            })));
        } catch (error) {
            console.error('Failed to load servers:', error);
        } finally {
            setIsLoadingList(false);
        }
    };

    const runTest = async (serverIndex: number, testType: 'address_summary' | 'address_txs' | 'tx' | 'utxo' | 'tip_height') => {
        const server = servers[serverIndex];

        // Update loading state
        const newServers = [...servers];
        newServers[serverIndex] = { ...server, isLoading: true };
        setServers(newServers);

        try {
            const result = await serverHealthApi.testServer({
                server_name: server.info.name,
                test_type: testType,
                address: address,
                txid: txid
            });

            // Update result
            const updatedServers = [...servers];
            updatedServers[serverIndex] = {
                ...server,
                isLoading: false,
                results: {
                    ...server.results,
                    [testType]: result
                }
            };
            setServers(updatedServers);
        } catch (error) {
            console.error(`Test failed for ${server.info.name}:`, error);
            const updatedServers = [...servers];
            updatedServers[serverIndex] = { ...server, isLoading: false };
            setServers(updatedServers);
        }
    };

    const runAllTests = async () => {
        // Run address summary test for all servers
        for (let i = 0; i < servers.length; i++) {
            runTest(i, 'address_summary');
            await new Promise(r => setTimeout(r, 100)); // Stagger requests slightly
        }
    };

    return (
        <div className="server-health-dashboard" style={{ paddingBottom: '100px' }}>
            <div className="dashboard-header">
                <h1>Server Health Dashboard</h1>
                <p>Monitor and test mempool server connectivity</p>
            </div>

            <div className="dashboard-controls">
                <div className="input-group">
                    <div className="input-field">
                        <label>Test Address</label>
                        <input
                            type="text"
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            placeholder="bc1q..."
                        />
                    </div>
                    <div className="input-field">
                        <label>Test Transaction ID</label>
                        <input
                            type="text"
                            value={txid}
                            onChange={(e) => setTxid(e.target.value)}
                            placeholder="64-char hex..."
                        />
                    </div>
                </div>

                <div className="action-buttons">
                    <button className="btn btn-primary" onClick={runAllTests}>
                        Test All Servers (Address Summary)
                    </button>
                    <button className="btn btn-secondary" onClick={loadServers}>
                        Refresh Server List
                    </button>
                </div>
            </div>

            {isLoadingList ? (
                <div className="loading">Loading servers...</div>
            ) : (
                <div className="server-grid">
                    {servers.map((server, index) => (
                        <ServerCard
                            key={server.info.name}
                            server={server}
                            onTest={(type) => runTest(index, type)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

interface ServerCardProps {
    server: ServerState;
    onTest: (type: 'address_summary' | 'address_txs' | 'tx' | 'utxo' | 'tip_height') => void;
}

const ServerCard: React.FC<ServerCardProps> = ({ server, onTest }) => {
    const [expandedResult, setExpandedResult] = useState<string | null>(null);

    const toggleExpand = (type: string) => {
        if (expandedResult === type) {
            setExpandedResult(null);
        } else {
            setExpandedResult(type);
        }
    };

    const getStatusClass = (result?: ServerTestResponse) => {
        if (!result) return '';
        if (result.status === 'success') return 'status-success';
        if (result.status === 'timeout') return 'status-timeout';
        return 'status-failure';
    };

    return (
        <div className="server-card">
            <div className="server-header">
                <div>
                    <div className="server-name">{server.info.name}</div>
                    <div className="server-url">{server.info.base_url}</div>
                </div>
                {server.isLoading && <div className="status-indicator status-loading"></div>}
            </div>

            <div className="server-body">
                <div className="test-grid">
                    <TestButton
                        label="Addr Summary"
                        result={server.results['address_summary']}
                        onClick={() => onTest('address_summary')}
                        onExpand={() => toggleExpand('address_summary')}
                    />
                    <TestButton
                        label="Addr Txs"
                        result={server.results['address_txs']}
                        onClick={() => onTest('address_txs')}
                        onExpand={() => toggleExpand('address_txs')}
                    />
                    <TestButton
                        label="Transaction"
                        result={server.results['tx']}
                        onClick={() => onTest('tx')}
                        onExpand={() => toggleExpand('tx')}
                    />
                    <TestButton
                        label="UTXO"
                        result={server.results['utxo']}
                        onClick={() => onTest('utxo')}
                        onExpand={() => toggleExpand('utxo')}
                    />
                    <TestButton
                        label="Tip Height"
                        result={server.results['tip_height']}
                        onClick={() => onTest('tip_height')}
                        onExpand={() => toggleExpand('tip_height')}
                    />
                </div>

                {expandedResult && server.results[expandedResult] && (
                    <div className="result-details">
                        <div className="result-summary">
                            <strong>{expandedResult}</strong>
                            <span className="latency">{server.results[expandedResult].latency_ms}ms</span>
                        </div>
                        <div className="json-viewer">
                            {JSON.stringify(server.results[expandedResult].response_data, null, 2)}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

interface TestButtonProps {
    label: string;
    result?: ServerTestResponse;
    onClick: () => void;
    onExpand: () => void;
}

const TestButton: React.FC<TestButtonProps> = ({ label, result, onClick, onExpand }) => {
    const statusClass = result
        ? (result.status === 'success' ? 'status-success' : (result.status === 'timeout' ? 'status-timeout' : 'status-failure'))
        : '';

    // Generate a short summary string
    let summary = '';
    if (result && result.status === 'success' && result.response_data !== undefined) {
        if (Array.isArray(result.response_data)) {
            summary = `[${result.response_data.length}]`;
        } else if (typeof result.response_data === 'number') {
            summary = result.response_data.toString();
        } else if (typeof result.response_data === 'object' && result.response_data !== null) {
            summary = '{...}';
        } else {
            summary = String(result.response_data);
        }
    } else if (result && result.status !== 'success') {
        summary = 'Err';
    }

    return (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="test-btn" onClick={onClick} style={{ flex: 1, display: 'flex', justifyContent: 'space-between' }}>
                <span>{label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {summary && <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{summary}</span>}
                    {statusClass && <div className={`status-indicator ${statusClass}`}></div>}
                </div>
            </button>
            {result && (
                <button className="test-btn" onClick={onExpand} style={{ width: '30px', justifyContent: 'center', padding: 0 }}>
                    <span style={{ fontSize: '10px' }}>JSON</span>
                </button>
            )}
        </div>
    );
};

export default ServerHealthDashboard;
