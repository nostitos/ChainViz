## Mempool Endpoint XPUB Sweep

- **Run date:** 2025-11-13
- **Command:** Sequentially fetched `/address/{addr}/txs?limit=5` for the first 200 receive addresses derived from `zpub6qyBNaAYEgDZtiW6cMnFNnTNwTwcJ9ovgyXDrMWXb2ZFHmgY5pjA1aH6n6z7ykpXBE2HN4vwrnomMFwGfqXdb3odnqZQagG2gE8LdfHof31`.
- **Headers:** Browser-style `User-Agent`, `Accept`, and `Accept-Language` to mimic real clients.

### Results

| Endpoint | Requests Completed | Status | Notes |
| --- | ---: | --- | --- |
| `https://mempool.jaonoctus.dev/api` | 0 | ❌ | HTTP 530 on the first request. |
| `https://mempool.emzy.de/api` | 113 | ⚠️ | Reached 113, then HTTP 503 (`Service Temporarily Unavailable`). |
| `http://iu1b96e.glddns.com:3006/api` | 200* | ✅ | Initial 200-address sweep timed out when using HTTPS. Retest over HTTP completed 200/200 and an extended 1,000-address run finished in ~220 s. |
| `https://mempool.visvirial.com/api` | 200 | ✅ | Completed the full sweep (≈134s total). |
| `https://mempool.lyberry.com/api` | 0 | ❌ | HTTP 500 on the first request. |
| `https://mempool.nixbitcoin.org/api` | 15 | ⚠️ | Connection aborted after 15 requests. |
| `https://mempool.learnbitcoin.com/api` | 200 | ✅ | Completed the full sweep (≈22s total). |
| `http://185.216.75.208:3006/api` | 0 | ❌ | Connection failed on first request (likely HTTPS required). |
| `https://memepool.space/api` | 21 | ⚠️ | HTTP 429 rate limit at request 22. |
| `https://mempool.space/api` | 21 | ⚠️ | HTTP 429 rate limit at request 22. |

> Times shown in the console logs: `visvirial` ≈134s, `learnbitcoin` ≈22s, `emzy` ≈13.7s before failure.

### Additional Stress Tests (iu1b96e.glddns.com)

- **Sequential 1,000-address sweep:** ~220 s, 0 failures.
- **Concurrency 5:** ~65.7 s total, 0 failures, steady ~15 req/s.
- **Concurrency 10:** ~66.4 s, 0 failures (similar throughput to concurrency 5).
- **Concurrency 20:** ~67.1 s with 23 connection resets (empty exception strings), showing the first signs of throttling/drop.
- **Concurrency 100:** ~52.5 s but 223 connection resets, confirming aggressive throttling at high burst rates.


### Observations

- The Cloudflare-protected host (`mempool.learnbitcoin.com`) accepts 200 sequential calls when supplied with browser-like headers.
- Public mempool.space instances (`mempool.space` and `memepool.space`) enforce a low rate limit (~20 requests).
- Several community instances either reject requests immediately or enforce very low thresholds; only `visvirial` handled the entire sweep.

### Adaptive Multiplexer Defaults

- **Global concurrency cap:** 50 in-flight requests. With ~16 active endpoints this aligns to ~3 slots each, preventing runaway bursts while leaving headroom to upweight reliable peers.
- **Per-endpoint concurrency band:** Each node starts between 2–6 slots (tier dependent) and can float between 1 and 6 based on rolling latency/success metrics. Consecutive failures trigger cooldowns and immediate throttling.
- **Timeouts:** httpx clients run with a 1.5 s request deadline (floor 0.5 s), tightened relative to Electrum defaults to surface sluggish servers quickly.
- **Telemetry:** Every request contributes to per-endpoint counters (requests, successes, failures, mean latency, active slots) exposed via `MempoolDataSource.get_endpoint_metrics()`.

Run `python backend/scripts/mempool_benchmark.py --count 1000` to stress the multiplexer and print aggregate throughput alongside the per-server contribution snapshot (optionally `--json` for machine-readable output).


