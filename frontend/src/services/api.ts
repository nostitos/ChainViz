const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

export interface TraceResponse {
  nodes: Array<{
    id: string;
    type: string;
    label: string;
    metadata?: any;
  }>;
  edges: Array<{
    source: string;
    target: string;
    amount?: number;
    confidence?: number;
  }>;
  clusters: any[];
  coinjoins: any[];
  peel_chains: any[];
  total_nodes: number;
  total_edges: number;
  depth_reached: number;
}

export async function traceFromAddress(address: string, maxDepth: number = 5, maxTransactions: number = 100): Promise<TraceResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000); // 60s timeout

  try {
    const response = await fetch(
      `${API_BASE_URL}/trace/address?address=${encodeURIComponent(address)}&max_depth=${maxDepth}&max_transactions=${maxTransactions}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Request timed out - try lower depth');
    }
    throw err;
  }
}

export async function traceFromAddressWithStats(address: string, maxDepth: number = 5): Promise<{ data: TraceResponse; bytes: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(
      `${API_BASE_URL}/trace/address?address=${encodeURIComponent(address)}&max_depth=${maxDepth}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    const text = await response.text();
    const bytes = new Blob([text]).size;
    const data = JSON.parse(text);
    return { data, bytes };
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Request timed out - try lower depth');
    }
    throw err;
  }
}

export async function traceFromUTXO(txid: string, vout: number, hopsBefore: number = 5, hopsAfter: number = 5): Promise<TraceResponse> {
  const response = await fetch(`${API_BASE_URL}/trace/utxo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      txid,
      vout,
      hops_before: hopsBefore,
      hops_after: hopsAfter,
      include_coinjoin: true,
      confidence_threshold: 0.5,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    console.error('❌ API Error:', error);
    throw new Error(error.detail || JSON.stringify(error) || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function traceFromUTXOWithStats(txid: string, vout: number, hopsBefore: number = 5, hopsAfter: number = 5): Promise<{ data: TraceResponse; bytes: number }> {
  const response = await fetch(`${API_BASE_URL}/trace/utxo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      txid,
      vout,
      hops_before: hopsBefore,
      hops_after: hopsAfter,
      include_coinjoin: true,
      confidence_threshold: 0.5,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  const text = await response.text();
  const bytes = new Blob([text]).size;
  const data = JSON.parse(text);
  return { data, bytes };
}

export interface ElectrumServerConfig {
  host: string;
  port: number;
  use_ssl: boolean;
}

export interface ConfigResponse {
  electrum_host: string;
  electrum_port: number;
  electrum_use_ssl: boolean;
  electrum_fallback_host: string;
  electrum_fallback_port: number;
}

export async function getConfig(): Promise<ConfigResponse> {
  const response = await fetch(`${API_BASE_URL}/config`);
  if (!response.ok) {
    throw new Error(`Failed to get config: ${response.status}`);
  }
  return response.json();
}

export async function updateElectrumServer(config: ElectrumServerConfig): Promise<ConfigResponse> {
  const response = await fetch(`${API_BASE_URL}/config/electrum`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `Failed to update server: ${response.status}`);
  }

  return response.json();
}

export async function testElectrumServer(config: ElectrumServerConfig): Promise<{ success: boolean; message: string; latency_ms?: number; error?: string }> {
  const response = await fetch(`${API_BASE_URL}/config/electrum/test`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `Failed to test server: ${response.status}`);
  }

  return response.json();
}
