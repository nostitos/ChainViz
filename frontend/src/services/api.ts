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

export async function traceFromAddress(address: string, hopsBefore: number = 1, hopsAfter: number = 1, maxTransactions: number = 100): Promise<TraceResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300000); // 300s (5 min) timeout for complex transactions with many large inputs

  try {
    const response = await fetch(
      `${API_BASE_URL}/trace/address?address=${encodeURIComponent(address)}&hops_before=${hopsBefore}&hops_after=${hopsAfter}&max_transactions=${maxTransactions}`,
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
      throw new Error('Request timed out - try fewer hops or lower max transactions');
    }
    throw err;
  }
}

export async function traceFromAddressWithStats(address: string, hopsBefore: number = 1, hopsAfter: number = 1): Promise<{ data: TraceResponse; bytes: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300000); // 300s (5 min) timeout for complex transactions with many large inputs

  try {
    const response = await fetch(
      `${API_BASE_URL}/trace/address?address=${encodeURIComponent(address)}&hops_before=${hopsBefore}&hops_after=${hopsAfter}`,
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
      throw new Error('Request timed out - try fewer hops or lower max transactions');
    }
    throw err;
  }
}

export async function traceFromUTXO(txid: string, vout: number, hopsBefore: number = 5, hopsAfter: number = 5, maxAddressesPerTx: number = 100): Promise<TraceResponse> {
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
      max_addresses_per_tx: maxAddressesPerTx,
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

export async function traceFromUTXOWithStats(txid: string, vout: number, hopsBefore: number = 5, hopsAfter: number = 5, maxAddressesPerTx: number = 100): Promise<{ data: TraceResponse; bytes: number }> {
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
      max_addresses_per_tx: maxAddressesPerTx,
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

export interface AddressInfo {
  address: string;
  balance: number;
  total_received: number;
  total_sent: number;
  tx_count: number;
  utxos: any[];
  transactions: string[];
  cluster_id?: string | null;
  first_seen?: number | null;
  last_seen?: number | null;
  script_type?: string | null;
  receiving_count?: number | null;
  spending_count?: number | null;
  details_included: boolean;
}

export async function fetchAddressesBatch(addresses: string[]): Promise<AddressInfo[]> {
  const response = await fetch(`${API_BASE_URL}/address/batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      addresses,
      include_details: true,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

export interface RuntimeConfigResponse {
  data_source: string;
  electrum_enabled: boolean;
}

export async function getConfig(): Promise<RuntimeConfigResponse> {
  const response = await fetch(`${API_BASE_URL}/config`);
  if (!response.ok) {
    throw new Error(`Failed to get config: ${response.status}`);
  }
  return response.json();
}
