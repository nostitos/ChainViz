import argparse
import asyncio
import json
import logging
import sys
import time
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Sequence

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.config import settings  # noqa: E402
from app.services.datasource.mempool.multiplexer import get_mempool_datasource  # noqa: E402
from app.services.xpub_service import XpubService  # noqa: E402

DEFAULT_XPUB = (
    "zpub6qyBNaAYEgDZtiW6cMnFNnTNwTwcJ9ovgyXDrMWXb2ZFHmgY5pjA1aH6n6z7ykpXBE2HN4vwrnomMFwGfqXdb3odnqZQagG2gE8LdfHof31"
)

logger = logging.getLogger(__name__)


async def _probe_addresses(addresses: Sequence[str], max_results: int) -> dict:
    datasource = get_mempool_datasource()
    started = time.perf_counter()

    queue: asyncio.Queue[str] = asyncio.Queue()
    for addr in addresses:
        queue.put_nowait(addr)

    total = len(addresses)
    completed = 0
    successes = 0
    failures = 0
    lock = asyncio.Lock()
    concurrency = min(settings.mempool_global_max_inflight, total or 1)
    outcomes: List[bool] = []
    attempts: Dict[str, int] = defaultdict(int)
    max_requeues = 2

    inflight: Dict[int, tuple[str, float]] = {}
    stop_monitor = asyncio.Event()

    async def monitor() -> None:
        while not stop_monitor.is_set():
            await asyncio.sleep(5)
            now = time.perf_counter()
            slow = [
                (wid, addr, now - started_at)
                for wid, (addr, started_at) in inflight.items()
                if now - started_at > settings.mempool_request_timeout
            ]
            if slow:
                details = ", ".join(
                    f"worker {wid} addr={addr} age={age:.1f}s" for wid, addr, age in slow
                )
                logger.warning("Watchdog: %d in-flight requests over timeout: %s", len(slow), details)

    async def worker(worker_id: int) -> None:
        nonlocal completed, successes, failures
        while True:
            try:
                address = queue.get_nowait()
            except asyncio.QueueEmpty:
                return

            attempts[address] += 1
            inflight[worker_id] = (address, time.perf_counter())
            timeout = False
            result = False
            try:
                summary = await datasource.get_address_summary(address)
                result = summary is not None
            except asyncio.TimeoutError:
                timeout = True
                result = False
                logger.warning(
                    "Timeout fetching %s on attempt %d; will requeue",
                    address,
                    attempts[address],
                )
            except Exception as exc:
                result = False
                logger.warning(
                    "Error fetching %s on attempt %d: %s",
                    address,
                    attempts[address],
                    exc,
                )
            finally:
                inflight.pop(worker_id, None)

            requeued = False
            if timeout and attempts[address] <= max_requeues:
                queue.put_nowait(address)
                requeued = True

            async with lock:
                if requeued:
                    failures += 1
                    outcomes.append(False)
                else:
                    completed += 1
                    if result:
                        successes += 1
                    else:
                        failures += 1
                    outcomes.append(result)
                    if completed % 10 == 0 or completed == total:
                        logger.info(
                            "✅ progress %d/%d (succ=%d fail=%d)",
                            completed,
                            total,
                            successes,
                            failures,
                        )

            queue.task_done()

    workers = [asyncio.create_task(worker(i)) for i in range(concurrency)]
    monitor_task = asyncio.create_task(monitor())
    await asyncio.gather(*workers)
    stop_monitor.set()
    await monitor_task
    elapsed = time.perf_counter() - started

    metrics = await datasource.get_endpoint_metrics()
    await datasource.close()

    return {
        "elapsed_seconds": elapsed,
        "addresses": total,
        "success_count": successes,
        "failure_count": failures,
        "endpoint_metrics": metrics,
    }


def derive_addresses(xpub: str, count: int, change: int) -> List[str]:
    addresses = XpubService.derive_addresses(
        xpub=xpub,
        derivation_path="m/84h/0h/0h",
        count=count,
        change=change,
    )
    if not addresses:
        raise RuntimeError("Failed to derive any addresses from provided xpub.")
    return addresses


async def run_benchmark(args: argparse.Namespace) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("asyncio").setLevel(logging.WARNING)
    addresses = derive_addresses(args.xpub, args.count, args.change)
    if args.count < len(addresses):
        addresses = addresses[: args.count]

    result = await _probe_addresses(addresses, args.max_results)
    throughput = (
        result["addresses"] / result["elapsed_seconds"] if result["elapsed_seconds"] > 0 else 0.0
    )

    print("\n=== Mempool Multiplexer Benchmark ===")
    print(f"Addresses tested : {result['addresses']}")
    print(f"Successes        : {result['success_count']}")
    print(f"Failures         : {result['failure_count']}")
    print(f"Elapsed (s)      : {result['elapsed_seconds']:.2f}")
    print(f"Throughput (req/s): {throughput:.2f}")

    metrics = sorted(
        result["endpoint_metrics"],
        key=lambda item: item.get("requests", 0),
        reverse=True,
    )

    print("\nPer-endpoint contribution:")
    header = f"{'Endpoint':22} {'Req':>7} {'Succ':>7} {'Fail':>7} {'Avg Latency (s)':>16} {'Slots':>9}"
    print(header)
    print("-" * len(header))
    for item in metrics:
        slot_state = f"{item['active_slots']}/{item['concurrency_limit']}"
        print(
            f"  {item['name']:<22} "
            f"{item['requests']:7d} "
            f"{item['successes']:7d} "
            f"{item['failures']:7d} "
            f"{item['avg_latency']:16.3f} "
            f"{slot_state:>9}"
        )

    if args.json:
        print("\nJSON metrics:")
        print(json.dumps(result, indent=2))


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Benchmark mempool multiplexer throughput.")
    parser.add_argument("--xpub", default=DEFAULT_XPUB, help="Extended public key to derive addresses from.")
    parser.add_argument("--count", type=int, default=1000, help="Number of addresses to probe.")
    parser.add_argument("--change", type=int, default=0, choices=[0, 1], help="Change chain (0 receive, 1 change).")
    parser.add_argument(
        "--max-results",
        type=int,
        default=5,
        help="Number of transactions to fetch per address when deriving history (unused for summary).",
    )
    parser.add_argument("--json", action="store_true", help="Print JSON summary in addition to human output.")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> None:
    args = parse_args(argv if argv is not None else sys.argv[1:])
    asyncio.run(run_benchmark(args))


if __name__ == "__main__":
    main()

