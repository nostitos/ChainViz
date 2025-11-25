"""Electrum server stress test / report generator."""

from __future__ import annotations

import asyncio
import os
import statistics
import time
from dataclasses import dataclass
from typing import List, Optional

import pytest

from tools.electrum_suite.services.electrum_client import ElectrumClient
from tools.electrum_suite.services.electrum_servers import (
    ElectrumServerInfo,
    FALLBACK_SERVERS,
    get_server_manager,
)


NETWORK_TESTS_ENABLED = os.getenv("RUN_ELECTRUM_NETWORK_TESTS") == "1"
MAX_SERVERS = int(os.getenv("ELECTRUM_TEST_MAX_SERVERS", "0"))
ATTEMPTS_PER_SERVER = int(os.getenv("ELECTRUM_TEST_ATTEMPTS", "3"))
MAX_CONCURRENCY = int(os.getenv("ELECTRUM_TEST_CONCURRENCY", "15"))
CONNECT_TIMEOUT = float(os.getenv("ELECTRUM_TEST_CONNECT_TIMEOUT", "12"))
CALL_TIMEOUT = float(os.getenv("ELECTRUM_TEST_CALL_TIMEOUT", "8"))


@dataclass
class ServerCheckResult:
    host: str
    port: int
    protocol: str
    attempts: int
    successes: int
    connect_latency_ms: Optional[float]
    avg_call_latency_ms: Optional[float]
    total_call_latency_ms: float
    status: str
    error: Optional[str]


async def _probe_server(server: ElectrumServerInfo) -> ServerCheckResult:
    client = ElectrumClient(
        host=server.host,
        port=server.port,
        use_ssl=server.use_ssl,
        timeout=max(CONNECT_TIMEOUT, CALL_TIMEOUT) + 5,
    )
    successes = 0
    call_latencies: List[float] = []
    connect_latency = None
    error: Optional[str] = None

    try:
        connect_start = time.perf_counter()
        await asyncio.wait_for(client.connect(), timeout=CONNECT_TIMEOUT)
        connect_latency = (time.perf_counter() - connect_start) * 1000

        for attempt in range(ATTEMPTS_PER_SERVER):
            method = "server.version" if attempt == 0 else "server.ping"
            params = ["ChainVizStress", "1.4"] if method == "server.version" else []
            call_start = time.perf_counter()
            try:
                await asyncio.wait_for(client._call(method, params), timeout=CALL_TIMEOUT)
            except Exception as exc:
                error = f"{method}: {exc}"
                break
            else:
                successes += 1
                call_latencies.append((time.perf_counter() - call_start) * 1000)
    except Exception as exc:
        error = f"connect: {exc}"
    finally:
        try:
            await asyncio.wait_for(client.disconnect(), timeout=5)
        except Exception:
            pass

    status = (
        "pass"
        if successes == ATTEMPTS_PER_SERVER
        else ("partial" if successes > 0 else "fail")
    )

    avg_latency = (
        statistics.mean(call_latencies) if call_latencies else None
    )

    return ServerCheckResult(
        host=server.host,
        port=server.port,
        protocol=server.protocol,
        attempts=ATTEMPTS_PER_SERVER,
        successes=successes,
        connect_latency_ms=connect_latency,
        avg_call_latency_ms=avg_latency,
        total_call_latency_ms=sum(call_latencies),
        status=status,
        error=error,
    )


async def _run_stress_test() -> List[ServerCheckResult]:
    server_manager = get_server_manager()
    servers = await server_manager.get_servers()
    if MAX_SERVERS > 0:
        servers = servers[:MAX_SERVERS]

    assert servers, "Server manager returned no Electrum servers"

    sem = asyncio.Semaphore(max(1, MAX_CONCURRENCY))

    async def runner(server: ElectrumServerInfo) -> ServerCheckResult:
        async with sem:
            return await _probe_server(server)

    return await asyncio.gather(*(runner(server) for server in servers))


def _summarize(results: List[ServerCheckResult]) -> str:
    total = len(results)
    passes = sum(1 for r in results if r.status == "pass")
    partial = sum(1 for r in results if r.status == "partial")
    failures = sum(1 for r in results if r.status == "fail")

    lines = [
        "",
        f"Electrum stress summary: total={total} pass={passes} partial={partial} fail={failures}",
        f"Attempts per server: {ATTEMPTS_PER_SERVER}, concurrency={MAX_CONCURRENCY}",
        "",
    ]

    slowest = sorted(
        [r for r in results if r.avg_call_latency_ms],
        key=lambda r: r.avg_call_latency_ms,
        reverse=True,
    )[:10]
    if slowest:
        lines.append("Top 10 slowest (avg call latency ms):")
        for r in slowest:
            lines.append(
                f"  {r.host}:{r.port} {r.avg_call_latency_ms:.1f}ms "
                f"(status={r.status}, connect={r.connect_latency_ms or 0:.0f}ms)"
            )
        lines.append("")

    failed = [r for r in results if r.status == "fail"]
    if failed:
        lines.append("Failures:")
        for r in failed[:20]:
            lines.append(f"  {r.host}:{r.port} -> {r.error}")
        if len(failed) > 20:
            lines.append(f"  ... {len(failed) - 20} more failures not shown ...")
        lines.append("")

    partials = [r for r in results if r.status == "partial"]
    if partials:
        lines.append("Partial successes:")
        for r in partials[:20]:
            lines.append(
                f"  {r.host}:{r.port} successes={r.successes}/{r.attempts} "
                f"error={r.error}"
            )
        if len(partials) > 20:
            lines.append(f"  ... {len(partials) - 20} more partials not shown ...")
        lines.append("")

    return "\n".join(lines)


@pytest.mark.asyncio
async def test_electrum_servers_stress():
    """Stress test every curated server and emit a detailed report."""
    if not NETWORK_TESTS_ENABLED:
        pytest.skip("Set RUN_ELECTRUM_NETWORK_TESTS=1 to run live Electrum checks")

    results = await _run_stress_test()
    summary = _summarize(results)
    print(summary)  # noqa: T201 - intentional report output

    passes = sum(1 for r in results if r.status == "pass")
    assert passes > 0, "No Electrum servers handled the stress test successfully"


@pytest.mark.asyncio
async def test_curated_fallback_servers_are_healthy():
    """Spot-check the baked-in fallback servers so we always have 5 good ones."""
    if not NETWORK_TESTS_ENABLED:
        pytest.skip("Set RUN_ELECTRUM_NETWORK_TESTS=1 to run live Electrum checks")

    results = await asyncio.gather(*(_probe_server(server) for server in FALLBACK_SERVERS))
    summary = _summarize(results)
    failing = [r for r in results if r.status != "pass"]
    assert not failing, f"Fallback server failed probe:\n{summary}"


if __name__ == "__main__":
    if not NETWORK_TESTS_ENABLED:
        raise SystemExit("RUN_ELECTRUM_NETWORK_TESTS=1 must be set for manual runs")
    _results = asyncio.run(_run_stress_test())
    print(_summarize(_results))
