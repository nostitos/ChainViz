import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

# Ensure suite + backend modules are importable when executed directly
SUITE_ROOT = Path(__file__).resolve().parents[1]
TOOLS_ROOT = SUITE_ROOT.parent
BACKEND_ROOT = TOOLS_ROOT.parent / "backend"

for path in (TOOLS_ROOT, BACKEND_ROOT):
    if str(path) not in sys.path:
        sys.path.append(str(path))

from tools.electrum_suite.services.electrum_client import ElectrumClient  # noqa: E402
from tools.electrum_suite.services.electrum_multiplexer import get_electrum_client  # noqa: E402
from app.services.mempool_client import get_mempool_client  # noqa: E402


DEFAULT_TXID = "1a6790ee7804b55399d64c96963d319a568311482bb9d9a26492999fcef21604"
DEFAULT_ADDRESS = "1G7CjxPHPFjNH9C86HNd78T87vjznq3wTn"
DEFAULT_LIMIT = 5


async def _fetch_mempool_address_txs(address: str, limit: int) -> Optional[List[Dict[str, Any]]]:
    """
    Fetch the first `limit` transactions for an address using the mempool.space endpoint.

    The public endpoint returns full transaction objects (not just txids) which helps
    illustrate the difference versus Electrum responses.
    """
    datasource = get_mempool_client()
    path = f"/address/{address}/txs?offset=0&limit={limit}"

    # The datasource already handles retries/timeouts and prioritisation.
    return await datasource._request_with_total_timeout(path, min_priority=2)  # type: ignore[attr-defined]


async def _fetch_electrum_transaction_and_history(
    txid: str,
    address: str,
) -> Dict[str, Any]:
    """
    Try the connection pool first, but fall back to a single direct Electrum client
    if the pool cannot establish connections (common when no servers are reachable).
    """
    multiplexer = get_electrum_client()
    try:
        tx = await multiplexer.get_transaction(txid, verbose=True)
        history = await multiplexer.get_history(address)
        return {"tx": tx, "history": history, "source": "pool"}
    except Exception as exc:
        print(f"[WARN] Electrum pool unavailable ({exc}); falling back to single client")
        client = ElectrumClient()
        try:
            tx = await client.get_transaction(txid, verbose=True)
            history = await client.get_history(address)
            return {"tx": tx, "history": history, "source": client.host}
        finally:
            if client.connected:
                try:
                    await client.disconnect()
                except Exception as disconnect_error:
                    print(f"[WARN] Failed to cleanly disconnect Electrum client: {disconnect_error}")


async def collect_samples(
    txid: str,
    address: str,
    limit: int,
) -> Dict[str, Any]:
    mempool = get_mempool_client()

    transaction_samples: Dict[str, Any] = {
        "mempool": None,
        "electrum": None,
    }
    address_samples: Dict[str, Any] = {
        "mempool": None,
        "electrum": None,
    }

    # Fetch transaction data
    transaction_samples["mempool"] = await mempool.get_transaction(txid, min_priority=2)
    electrum_data = await _fetch_electrum_transaction_and_history(txid, address)
    transaction_samples["electrum"] = electrum_data["tx"]

    # Fetch address data
    address_samples["mempool"] = {
        "summary": await mempool.get_address_summary(address, min_priority=2),
        "txs_page": await _fetch_mempool_address_txs(address, limit),
    }
    address_samples["electrum"] = electrum_data["history"]

    return {
        "txid": txid,
        "address": address,
        "limit": limit,
        "transactions": transaction_samples,
        "address_data": address_samples,
    }


def _dump_json(obj: Any, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, sort_keys=True))
    print(f"Saved {path}")


async def _async_main(args: argparse.Namespace) -> None:
    samples = await collect_samples(args.txid, args.address, args.limit)

    output_dir = Path(args.output).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    _dump_json(samples["transactions"]["mempool"], output_dir / "transaction_mempool.json")
    _dump_json(samples["transactions"]["electrum"], output_dir / "transaction_electrum.json")

    _dump_json(samples["address_data"]["mempool"], output_dir / "address_mempool.json")
    _dump_json(samples["address_data"]["electrum"], output_dir / "address_electrum.json")

    # Store metadata + pointers
    _dump_json(
        {
            "txid": samples["txid"],
            "address": samples["address"],
            "limit": samples["limit"],
            "files": {
                "transaction_mempool": "transaction_mempool.json",
                "transaction_electrum": "transaction_electrum.json",
                "address_mempool": "address_mempool.json",
                "address_electrum": "address_electrum.json",
            },
        },
        output_dir / "metadata.json",
    )


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Collect sample responses from mempool.space and Electrum for comparison.",
    )
    parser.add_argument(
        "--txid",
        default=DEFAULT_TXID,
        help=f"Transaction ID to fetch (default: {DEFAULT_TXID})",
    )
    parser.add_argument(
        "--address",
        default=DEFAULT_ADDRESS,
        help=f"Address to fetch (default: {DEFAULT_ADDRESS})",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=DEFAULT_LIMIT,
        help="Number of mempool transaction entries to fetch for the address (default: 5)",
    )
    parser.add_argument(
        "--output",
        default=str(Path(__file__).resolve().parents[2] / "docs" / "api-comparison-data"),
        help="Directory to store raw response files",
    )
    return parser.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> None:
    args = parse_args(argv)
    asyncio.run(_async_main(args))


if __name__ == "__main__":
    main()

