"""
Fetch balances for the first N addresses derived from a known test XPUB
against the fallback Electrum servers.

Usage:
    PYTHONPATH=backend RUN_ELECTRUM_NETWORK_TESTS=1 \
        backend/venv/bin/python backend/scripts/fetch_xpub_balances.py
"""

from __future__ import annotations

import asyncio
from pathlib import Path
import sys
from typing import Dict, List, Tuple

SUITE_ROOT = Path(__file__).resolve().parents[1]
TOOLS_ROOT = SUITE_ROOT.parent
BACKEND_ROOT = TOOLS_ROOT.parent / "backend"

for path in (TOOLS_ROOT, BACKEND_ROOT):
    if str(path) not in sys.path:
        sys.path.append(str(path))

from tools.electrum_suite.services.electrum_client import ElectrumClient
from tools.electrum_suite.services.electrum_servers import FALLBACK_SERVERS
from app.services.xpub_service import XpubService

TEST_XPUB = (
    "zpub6qyBNaAYEgDZtiW6cMnFNnTNwTwcJ9ovgyXDrMWXb2ZFHmgY5pjA1aH6n6z7"
    "ykpXBE2HN4vwrnomMFwGfqXdb3odnqZQagG2gE8LdfHof31"
)
ADDRESS_COUNT = 50
CONNECT_TIMEOUT = 12
CALL_TIMEOUT = 8


async def _fetch_balance(client: ElectrumClient, address: str) -> Dict[str, int]:
    return await asyncio.wait_for(client.get_balance(address), timeout=CALL_TIMEOUT)


async def _probe_server(
    host: str, port: int, use_ssl: bool, addresses: List[str]
) -> Tuple[str, List[Tuple[str, Dict[str, int]]], str]:
    client = ElectrumClient(host=host, port=port, use_ssl=use_ssl, timeout=CALL_TIMEOUT + 5)
    records: List[Tuple[str, Dict[str, int]]] = []
    error = ""
    try:
        await asyncio.wait_for(client.connect(), timeout=CONNECT_TIMEOUT)
        for address in addresses:
            balance = await _fetch_balance(client, address)
            records.append((address, balance))
    except Exception as exc:  # pragma: no cover - network interaction
        error = str(exc)
    finally:
        try:
            await asyncio.wait_for(client.disconnect(), timeout=5)
        except Exception:
            pass
    return f"{host}:{port}", records, error


def _derive_addresses() -> List[str]:
    service = XpubService()
    return service.derive_addresses(
        xpub=TEST_XPUB,
        derivation_path="m/84h/0h/0h",
        count=ADDRESS_COUNT,
        change=0,
    )


def _format_sats(value: int) -> str:
    return f"{value / 1e8:.8f} BTC"


async def main() -> None:
    addresses = _derive_addresses()
    print(f"Derived {len(addresses)} addresses from test xpub {TEST_XPUB[:12]}...")
    print("")

    for server in FALLBACK_SERVERS:
        host_label, balances, error = await _probe_server(
            host=server.host,
            port=server.port,
            use_ssl=server.use_ssl,
            addresses=addresses,
        )
        print(f"=== {host_label} ({server.version}) ===")
        if error:
            print(f"  ERROR: {error}")
            print("")
            continue

        total_confirmed = sum(item[1].get("confirmed", 0) for item in balances)
        total_unconfirmed = sum(item[1].get("unconfirmed", 0) for item in balances)

        for address, balance in balances:
            confirmed = balance.get("confirmed", 0)
            unconfirmed = balance.get("unconfirmed", 0)
            if confirmed == 0 and unconfirmed == 0:
                continue
            print(
                f"  {address}: confirmed={_format_sats(confirmed)} "
                f"unconfirmed={_format_sats(unconfirmed)}"
            )

        print(
            f"  Totals: confirmed={_format_sats(total_confirmed)}, "
            f"unconfirmed={_format_sats(total_unconfirmed)}"
        )
        print("")


if __name__ == "__main__":
    asyncio.run(main())

