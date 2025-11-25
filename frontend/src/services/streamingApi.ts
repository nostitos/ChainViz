/**
 * Streaming API client using Server-Sent Events (SSE)
 * Provides real-time progressive updates for trace operations
 */

export interface StreamEvent {
    type: 'metadata' | 'batch' | 'progress' | 'complete' | 'error';
    data: any;
}

export interface StreamCallbacks {
    onMetadata?: (data: any) => void;
    onBatch?: (data: { nodes: any[]; edges: any[] }) => void;
    onProgress?: (data: { processed: number; total: number; progress: number }) => void;
    onComplete?: (data: { total_nodes: number; total_edges: number }) => void;
    onError?: (error: string) => void;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

/**
 * Stream address trace results using SSE
 */
export function streamAddressTrace(
    address: string,
    hopsBefore: number = 1,
    hopsAfter: number = 1,
    maxTransactions: number = 1000,
    callbacks: StreamCallbacks
): () => void {
    const url = `${API_BASE_URL}/api/trace/address/stream?address=${encodeURIComponent(address)}&hops_before=${hopsBefore}&hops_after=${hopsAfter}&max_transactions=${maxTransactions}`;

    const eventSource = new EventSource(url);

    eventSource.addEventListener('metadata', (e) => {
        const data = JSON.parse(e.data);
        callbacks.onMetadata?.(data);
    });

    eventSource.addEventListener('batch', (e) => {
        const data = JSON.parse(e.data);
        callbacks.onBatch?.(data);
    });

    eventSource.addEventListener('progress', (e) => {
        const data = JSON.parse(e.data);
        callbacks.onProgress?.(data);
    });

    eventSource.addEventListener('complete', (e) => {
        const data = JSON.parse(e.data);
        callbacks.onComplete?.(data);
        eventSource.close();
    });

    eventSource.addEventListener('error', (e: any) => {
        const data = e.data ? JSON.parse(e.data) : { message: 'Stream error' };
        callbacks.onError?.(data.message || 'Unknown error');
        eventSource.close();
    });

    eventSource.onerror = (error) => {
        console.error('EventSource error:', error);
        callbacks.onError?.('Connection error');
        eventSource.close();
    };

    // Return cleanup function
    return () => {
        eventSource.close();
    };
}

/**
 * Stream UTXO trace results using SSE
 */
export function streamUTXOTrace(
    txid: string,
    vout: number,
    hopsBefore: number = 1,
    hopsAfter: number = 1,
    maxAddressesPerTx: number = 100,
    callbacks: StreamCallbacks
): () => void {
    const url = `${API_BASE_URL}/api/trace/utxo/stream?txid=${encodeURIComponent(txid)}&vout=${vout}&hops_before=${hopsBefore}&hops_after=${hopsAfter}&max_addresses_per_tx=${maxAddressesPerTx}`;

    const eventSource = new EventSource(url);

    eventSource.addEventListener('metadata', (e) => {
        const data = JSON.parse(e.data);
        callbacks.onMetadata?.(data);
    });

    eventSource.addEventListener('batch', (e) => {
        const data = JSON.parse(e.data);
        callbacks.onBatch?.(data);
    });

    eventSource.addEventListener('progress', (e) => {
        const data = JSON.parse(e.data);
        callbacks.onProgress?.(data);
    });

    eventSource.addEventListener('complete', (e) => {
        const data = JSON.parse(e.data);
        callbacks.onComplete?.(data);
        eventSource.close();
    });

    eventSource.addEventListener('error', (e: any) => {
        const data = e.data ? JSON.parse(e.data) : { message: 'Stream error' };
        callbacks.onError?.(data.message || 'Unknown error');
        eventSource.close();
    });

    eventSource.onerror = (error) => {
        console.error('EventSource error:', error);
        callbacks.onError?.('Connection error');
        eventSource.close();
    };

    // Return cleanup function
    return () => {
        eventSource.close();
    };
}
