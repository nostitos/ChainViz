#!/usr/bin/env python3
"""
Benchmark script for heavy transaction loading
Tests the 348-input transaction and identifies bottlenecks
"""

import asyncio
import time
import json
from app.services.blockchain_data import BlockchainDataService
from app.services.electrum_multiplexer import get_electrum_client

HEAVY_TX = "71f6598704c4e36487fbff004354bc30edf916c187d3ee354f9bdff8ca4c4320"

async def benchmark_single_tx():
    """Benchmark: Fetch single transaction"""
    print("\n1️⃣ Fetching main transaction...")
    electrum = get_electrum_client()
    await electrum.connect()
    
    start = time.time()
    tx_data = await electrum.get_transaction(HEAVY_TX, verbose=True)
    elapsed = time.time() - start
    
    inputs = len(tx_data.get('vin', []))
    outputs = len(tx_data.get('vout', []))
    
    print(f"   ✅ Fetched in {elapsed:.2f}s")
    print(f"   📊 {inputs} inputs, {outputs} outputs")
    return elapsed, inputs, outputs

async def benchmark_batch_inputs(num_inputs: int):
    """Benchmark: Fetch input transactions in batch"""
    print(f"\n2️⃣ Fetching {num_inputs} input transactions (batched)...")
    
    electrum = get_electrum_client()
    await electrum.connect()
    
    # First get the main TX
    tx_data = await electrum.get_transaction(HEAVY_TX, verbose=True)
    input_txids = [vin['txid'] for vin in tx_data.get('vin', [])[:num_inputs] if 'txid' in vin]
    
    print(f"   📦 Batching {len(input_txids)} unique input TXs...")
    
    start = time.time()
    input_txs = await electrum.get_transactions_batch(input_txids, verbose=True)
    elapsed = time.time() - start
    
    success_count = sum(1 for tx in input_txs if tx is not None)
    
    print(f"   ✅ Fetched in {elapsed:.2f}s")
    print(f"   📊 {success_count}/{len(input_txids)} successful ({success_count/len(input_txids)*100:.1f}%)")
    print(f"   ⚡ {len(input_txids)/elapsed:.1f} TXs/second")
    
    return elapsed, success_count, len(input_txids)

async def benchmark_full_trace(max_addresses: int = 100):
    """Benchmark: Full UTXO trace"""
    print(f"\n3️⃣ Full UTXO trace (hops_before=1, max_addresses={max_addresses})...")
    
    service = BlockchainDataService()
    await service.init_redis()
    
    start = time.time()
    
    # Fetch starting TX
    start_tx = await service.fetch_transaction(HEAVY_TX)
    
    # Fetch input TXs (limited)
    input_txids = [inp.txid for inp in start_tx.inputs if inp.txid][:max_addresses]
    input_txs = await service.fetch_transactions_batch(input_txids)
    
    elapsed = time.time() - start
    
    success_count = sum(1 for tx in input_txs if tx is not None)
    
    print(f"   ✅ Completed in {elapsed:.2f}s")
    print(f"   📊 Fetched {success_count}/{len(input_txids)} input TXs")
    print(f"   🎯 Would create ~{success_count + 1} nodes, ~{success_count} edges")
    
    await service.close_redis()
    return elapsed

async def main():
    print("=" * 60)
    print("HEAVY TRANSACTION BENCHMARK")
    print("=" * 60)
    print(f"Transaction: {HEAVY_TX[:20]}...")
    
    # Test 1: Single TX fetch
    tx_time, inputs, outputs = await benchmark_single_tx()
    
    # Test 2: Batch fetch various sizes
    for size in [10, 50, 100]:
        await benchmark_batch_inputs(size)
    
    # Test 3: Full trace
    trace_time = await benchmark_full_trace(100)
    
    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Main TX fetch:        {tx_time:.2f}s")
    print(f"100 input TXs batch:  ~{await benchmark_batch_inputs(100):.2f}s")
    print(f"Full trace (100):     {trace_time:.2f}s")
    print("=" * 60)
    
    # Calculate theoretical vs actual
    print("\n📊 ANALYSIS:")
    print(f"   Inputs to fetch: {inputs}")
    print(f"   Limited to: 100 (max_addresses_per_tx)")
    print(f"   Batch requests needed: 1 (main TX) + 1 (100 inputs) = 2")
    print(f"   Expected time: ~1-2s (with parallel batching)")
    print(f"   Actual time: {trace_time:.2f}s")
    
    if trace_time > 5:
        print(f"\n⚠️  BOTTLENECK DETECTED: {trace_time:.2f}s is too slow!")
        print("   Possible causes:")
        print("   - Server failures causing retries")
        print("   - Sequential processing instead of parallel")
        print("   - Network latency to Electrum servers")
        print("   - Not using batch methods")

if __name__ == "__main__":
    asyncio.run(main())

