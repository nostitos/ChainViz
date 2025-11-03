#!/usr/bin/env python3
"""
Test Electrum servers for verbose transaction support
Tests servers from 1209k.com monitoring list
"""
import asyncio
import ssl
import json
import time
from typing import Dict, List, Optional, Tuple

# Top servers from 1209k.com (OK status, 100% uptime)
SERVERS_TO_TEST = [
    # Format: (host, port, ssl_enabled, name)
    ("fulcrum.sethforprivacy.com", 50002, True, "Fulcrum 2.0"),
    ("electrum.blockstream.info", 50002, True, "Blockstream"),
    ("fulcrum.theuplink.net", 50002, True, "Fulcrum 2.0"),
    ("mainnet.foundationdevices.com", 50002, True, "Fulcrum 1.11.1"),
    ("b6.1209k.com", 50002, True, "Fulcrum 1.11.1"),
    ("hippo.1209k.com", 50002, True, "Fulcrum 1.11.1"),
    ("fulcrum-core.1209k.com", 50002, True, "Fulcrum 1.11.1"),
    ("det.electrum.blockitall.us", 50002, True, "Fulcrum 1.12.0"),
    ("blackie.c3-soft.com", 57002, True, "Fulcrum 2.0"),
    ("fulcrum2.not.fyi", 51002, True, "Fulcrum 2.0"),
    ("clownshow.fiatfaucet.com", 50002, True, "Fulcrum 2.0"),
    ("molten.tranquille.cc", 50002, True, "Fulcrum 1.12.0"),
    ("mempool.8333.mobi", 50002, True, "Fulcrum 1.11.1"),
    ("2ex.digitaleveryware.com", 50002, True, "Fulcrum 2.0"),
    ("electrum.kampfschnitzel.at", 50002, True, "electrs/0.10.9"),
    ("electrum.tjader.xyz", 50002, True, "electrs/0.10.8"),
    # Electrs servers (different implementation, may behave differently)
    ("electrum.emzy.de", 50002, True, "ElectrumX"),
    ("vps.hsmiths.com", 50002, True, "ElectrumX"),
]

# Test transaction: First Bitcoin transaction (Satoshi to Hal Finney)
TEST_TXID = "f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16"

class ServerTestResult:
    def __init__(self, host: str, port: int, name: str):
        self.host = host
        self.port = port
        self.name = name
        self.connect_success = False
        self.connect_time_ms = None
        self.verbose_supported = False
        self.response_time_ms = None
        self.error = None
        self.tx_size = None  # Size of response for verbose vs non-verbose
        
    def __str__(self):
        if not self.connect_success:
            return f"❌ {self.host}:{self.port} - Connection failed: {self.error}"
        
        status = "✅ VERBOSE" if self.verbose_supported else "❌ NO VERBOSE"
        return (f"{status} | {self.host:40} | "
                f"Connect: {self.connect_time_ms:>4}ms | "
                f"Response: {self.response_time_ms:>4}ms | "
                f"Size: {self.tx_size:>6} bytes | "
                f"{self.name}")

async def test_server(host: str, port: int, use_ssl: bool, name: str, 
                     timeout: int = 10) -> ServerTestResult:
    """Test a single Electrum server for verbose support"""
    result = ServerTestResult(host, port, name)
    
    try:
        # Connect
        start_connect = time.time()
        
        if use_ssl:
            ssl_context = ssl.create_default_context()
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(host, port, ssl=ssl_context),
                timeout=timeout
            )
        else:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(host, port),
                timeout=timeout
            )
        
        result.connect_success = True
        result.connect_time_ms = int((time.time() - start_connect) * 1000)
        
        # Test verbose transaction fetch
        request = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "blockchain.transaction.get",
            "params": [TEST_TXID, True]  # verbose=True
        }
        
        start_request = time.time()
        writer.write((json.dumps(request) + "\n").encode())
        await writer.drain()
        
        # Read response with timeout
        response_bytes = await asyncio.wait_for(
            reader.readline(),
            timeout=timeout
        )
        
        result.response_time_ms = int((time.time() - start_request) * 1000)
        result.tx_size = len(response_bytes)
        
        response = json.loads(response_bytes.decode())
        
        if "error" in response:
            result.error = response["error"].get("message", str(response["error"]))
            result.verbose_supported = False
        elif "result" in response:
            # Check if result is JSON (verbose) or hex string (non-verbose)
            if isinstance(response["result"], dict):
                result.verbose_supported = True
            else:
                result.verbose_supported = False
                result.error = "Returns hex instead of JSON"
        
        writer.close()
        await writer.wait_closed()
        
    except asyncio.TimeoutError:
        result.error = f"Timeout after {timeout}s"
    except Exception as e:
        result.error = str(e)
    
    return result

async def test_all_servers():
    """Test all servers concurrently"""
    print(f"🔍 Testing {len(SERVERS_TO_TEST)} Electrum servers for verbose support...\n")
    print(f"📝 Test transaction: {TEST_TXID}")
    print(f"   (First Bitcoin transaction - Satoshi to Hal Finney)\n")
    print("=" * 120)
    
    tasks = []
    for host, port, use_ssl, name in SERVERS_TO_TEST:
        tasks.append(test_server(host, port, use_ssl, name))
    
    results = await asyncio.gather(*tasks)
    
    # Sort results: verbose servers first, then by response time
    results.sort(key=lambda r: (not r.verbose_supported, r.response_time_ms or 9999))
    
    # Print results
    verbose_count = 0
    print("\n📊 RESULTS:\n")
    
    for result in results:
        print(result)
        if result.verbose_supported:
            verbose_count += 1
    
    # Summary
    print("\n" + "=" * 120)
    print(f"\n📈 SUMMARY:")
    print(f"   ✅ Verbose supported: {verbose_count}/{len(results)}")
    print(f"   ❌ No verbose support: {len(results) - verbose_count}/{len(results)}")
    
    if verbose_count > 0:
        print(f"\n🎯 RECOMMENDED SERVERS (fastest to slowest):\n")
        for result in results:
            if result.verbose_supported:
                print(f"   {result.host}:{result.port} - {result.response_time_ms}ms - {result.name}")
        
        # Generate docker-compose snippet
        best = results[0] if results[0].verbose_supported else None
        if best:
            print(f"\n📝 DOCKER-COMPOSE.YML CONFIG (fastest server):\n")
            print(f"    environment:")
            print(f"      - ELECTRUM_HOST={best.host}")
            print(f"      - ELECTRUM_PORT={best.port}")
            print(f"      - ELECTRUM_USE_SSL=true")
            print(f"      # {best.name} - {best.response_time_ms}ms response time")

if __name__ == "__main__":
    asyncio.run(test_all_servers())

