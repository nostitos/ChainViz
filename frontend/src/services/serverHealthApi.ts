import { API_BASE_URL } from '../App';

export interface ServerInfo {
    name: string;
    base_url: string;
    priority: number;
}

export interface ServerListResponse {
    servers: ServerInfo[];
}

export interface ServerTestRequest {
    server_name: string;
    test_type: 'address_summary' | 'address_txs' | 'tx' | 'utxo' | 'tip_height';
    address?: string;
    txid?: string;
}

export interface ServerTestResponse {
    server_name: string;
    test_type: string;
    status: 'success' | 'failure' | 'timeout';
    http_code?: number;
    latency_ms: number;
    response_data?: any;
    error_message?: string;
}

export const serverHealthApi = {
    async listServers(): Promise<ServerListResponse> {
        const response = await fetch(`${API_BASE_URL}/servers/list`);
        if (!response.ok) {
            throw new Error(`Failed to fetch server list: ${response.statusText}`);
        }
        return response.json();
    },

    async testServer(request: ServerTestRequest): Promise<ServerTestResponse> {
        const response = await fetch(`${API_BASE_URL}/servers/test`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(request),
        });

        if (!response.ok) {
            // Even if HTTP error, we might get a structured error response from backend
            try {
                return await response.json();
            } catch {
                throw new Error(`Failed to test server: ${response.statusText}`);
            }
        }

        return response.json();
    }
};
