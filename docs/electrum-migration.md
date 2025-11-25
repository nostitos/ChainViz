# Electrum Suite Migration Guide

ChainViz now runs entirely on mempool.space for blockchain data. The Electrum
connection pool, stress tests, and helper scripts have been moved out of the
runtime and live under `tools/electrum_suite/`. This folder is self-contained
and can be copied into a dedicated repository if you want to maintain a
standalone Electrum toolchain.

## Contents

```
tools/electrum_suite/
├── api/                 # FastAPI routers (proxy + websocket) for Electrum
├── services/            # Client, multiplexer, pool, and server list manager
├── scripts/             # Diagnostics & benchmarking helpers
├── tests/               # Live network stress tests (opt-in)
└── working_servers.json # Sample curated server list
```

## Runtime Dependencies

* Python ≥ 3.10
* Optional: `backend/venv` for a ready-to-use environment
* `PYTHONPATH` must include `backend` when a script needs ChainViz models
  (e.g., `XpubService`) or the mempool datasource

The suite ships with a lightweight settings shim (`tools/electrum_suite/settings.py`).
When run inside this repo it reuses `app.config.settings`. When copied elsewhere
it falls back to environment variables such as:

```
ELECTRUM_HOST=fulcrum.sethforprivacy.com
ELECTRUM_PORT=50002
ELECTRUM_USE_SSL=1
ELECTRUM_POOL_SIZE=10
ELECTRUM_HEALTH_CHECK_INTERVAL=300
...
```

## Running the Tests

Electrum tests are opt-in by default to avoid hammering public servers.

```
PYTHONPATH=backend RUN_ELECTRUM_NETWORK_TESTS=1 \
    backend/venv/bin/pytest tools/electrum_suite/tests/test_electrum_servers.py
```

Environment variables (all optional):

| Variable | Description | Default |
| --- | --- | --- |
| `RUN_ELECTRUM_NETWORK_TESTS` | Enable live checks | `0` |
| `ELECTRUM_TEST_MAX_SERVERS` | Cap number of servers to probe | `0` (all curated) |
| `ELECTRUM_TEST_CONCURRENCY` | Parallel probes | `15` |
| `ELECTRUM_TEST_CONNECT_TIMEOUT` | Seconds to wait for connect | `12` |
| `ELECTRUM_TEST_CALL_TIMEOUT` | Seconds to wait per RPC call | `8` |

## Useful Scripts

All scripts live under `tools/electrum_suite/scripts/`. Run them with the
backend on the Python path if they need ChainViz models:

```
PYTHONPATH=backend backend/venv/bin/python tools/electrum_suite/scripts/fetch_xpub_balances.py
PYTHONPATH=backend backend/venv/bin/python tools/electrum_suite/scripts/compare_api_responses.py
PYTHONPATH=backend backend/venv/bin/python tools/electrum_suite/scripts/benchmark_heavy_tx.py
```

## When to Use the Suite

* Stress testing curated Electrum servers
* Debugging multiplexed Electrum RPC traffic
* Running websocket / proxy endpoints outside of the main API
* Comparing mempool.space payloads to Electrum payloads

## Main Application Status

* ChainViz backend no longer initializes the Electrum multiplexer.
* Address / transaction endpoints use mempool.space exclusively.
* The Config API now reports `data_source = "mempool"` and `electrum_enabled = false`.
* WebSocket and Electrum proxy endpoints are not mounted in the FastAPI app.

If you need Electrum functionality in production, run the suite separately or
spin it out into its own repository, then point the UI/ops tooling to that
service. The backend remains focused on fast, on-chain-only mempool data.

