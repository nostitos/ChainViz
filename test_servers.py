import asyncio
import sys
sys.path.insert(0, '/app')
from app.services.electrum_client import ElectrumClient

SERVERS = [
    {"name": "Seth's Fulcrum", "host": "fulcrum.sethforprivacy.com", "port": 50002, "ssl": True},
    {"name": "Custom (iu1b96e)", "host": "iu1b96e.glddns.com", "port": 50002, "ssl": False},
    {"name": "DIYNodes", "host": "electrum.diynodes.com", "port": 50002, "ssl": True},
    {"name": "Bitcoin.lu.ke", "host": "bitcoin.lu.ke", "port": 50002, "ssl": True},
    {"name": "Electrum Emzy", "host": "electrum.emzy.de", "port": 50002, "ssl": True},
    {"name": "Electrum Bitaroo", "host": "electrum.bitaroo.net", "port": 50002, "ssl": True},
]

TXID = "b1b980bb27f96f65a79f1ec027d970406f8a683e409e18564635ba7f3f2be096"

async def test_server(server):
    try:
        client = ElectrumClient(
            host=server["host"],
            port=server["port"],
            use_ssl=server["ssl"],
            timeout=10
        )
        await client.connect()
        
        # Get transaction
        tx = await client.get_transaction(TXID, verbose=True)
        num_inputs = len(tx.get("vin", []))
        
        # Get first 3 input txids
        first_inputs = [v.get("txid", "N/A")[:12] for v in tx.get("vin", [])[:3]]
        
        await client.disconnect()
        
        return {
            "name": server["name"],
            "status": "OK",
            "num_inputs": num_inputs,
            "first_inputs": first_inputs
        }
    except Exception as e:
        return {
            "name": server["name"],
            "status": f"FAILED: {str(e)[:50]}",
            "num_inputs": "N/A",
            "first_inputs": []
        }

async def main():
    print(f"Testing transaction: {TXID[:30]}...")
    print(f"Expected: 6 inputs (from Mempool.space)")
    print("\n" + "="*80)
    
    results = []
    for server in SERVERS:
        print(f"\nTesting {server['name']}...")
        result = await test_server(server)
        results.append(result)
        print(f"  Status: {result['status']}")
        print(f"  Inputs: {result['num_inputs']}")
    
    print("\n" + "="*80)
    print("\nRESULTS SUMMARY:")
    print("="*80)
    for r in results:
        status_icon = "OK" if r['status'] == "OK" else "FAIL"
        print(f"\n{r['name']:25} [{status_icon:4}] Inputs: {r['num_inputs']}")
        if r['first_inputs']:
            print(f"  First 3 input TXIDs: {', '.join(r['first_inputs'])}")

asyncio.run(main())

