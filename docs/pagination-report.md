# Mempool Endpoint Pagination Test (200 TX Target)

**Address tested:** `1P8hzUnQn1VYbDwsGkNmbiHXLJWS6v9JEs`

**Method:** Each endpoint was queried directly via HTTP using `limit=25` (matching the backend behavior at the time). Moving forward, the backend now requests **50 per page by default** via `mempool_default_page_size`, so future tests can start at 50 for faster coverage. Raw results were captured on 2025-11-15 and stored in `pagination_results.json`.

## Summary Table

| Endpoint | Base URL | Result | Page Size Pattern | Max Offset Reached | Notes |
| --- | --- | --- | --- | --- | --- |
| local | http://192.168.8.234:3006/api | ❌ Timeout | n/a | 0 | Server not reachable from test host (connect timeout at offset 0) |
| mempool.jaonoctus.dev | https://mempool.jaonoctus.dev/api | ✅ 200 TX | 10 per page | 190 | Steady 10-tx pages, needed 20 requests |
| mempool.emzy.de | https://mempool.emzy.de/api | ✅ 200 TX | 50 per page | 150 | Very fast; four requests reached 200 |
| iu1b96e.glddns.com | http://iu1b96e.glddns.com:3006/api | ✅ 200 TX | 10 per page | 190 | No cap observed; continued past previous 70 limit |
| mempool.visvirial.com | https://mempool.visvirial.com/api | ❌ Empty page | 0 | 0 | API returned empty list starting at offset 0 |
| mempool.nixbitcoin.org | https://mempool.nixbitcoin.org/api | ✅ 200 TX | 10 per page | 190 | Stable pagination through 200 |
| mempool.learnbitcoin.com | https://mempool.learnbitcoin.com/api | ✅ 200 TX | 10 per page | 190 | Stable pagination |
| memepool.space | https://memepool.space/api | ✅ 200 TX | 50 per page | 150 | Large pages (50) so only four requests |
| 51.159.70.154 | http://51.159.70.154:8081/api | ❌ Empty page | 0 | 0 | Returned empty list at offset 0 |
| 54.39.8.22 | http://54.39.8.22:8139/api | ✅ 200 TX | 50 per page | 150 | 4 requests of 50 each |
| 34.84.66.29 | http://34.84.66.29:8889/api | ❌ Empty page | 0 | 0 | Returned empty list at offset 0 |
| 62.171.130.134 | http://62.171.130.134:8081/api | ✅ 200 TX | 10 per page | 190 | Consistent pagination |

Legend: ✅=collected full 200 TX, ❌=blocked by timeout/empty response.

## Observations

1. **High-capacity servers** – `mempool.emzy.de`, `memepool.space`, and `54.39.8.22` expose 50 transactions per page, letting us reach 200 TX with four requests.
2. **10-tx servers** – `iu1b96e.glddns.com`, `mempool.jaonoctus.dev`, `mempool.nixbitcoin.org`, `mempool.learnbitcoin.com`, and `62.171.130.134` all paginate at 10 transactions per page but allow deep pagination (≥200).
3. **Non-responsive / limited servers** – `local`, `mempool.visvirial.com`, `51.159.70.154`, and `34.84.66.29` either timed out or returned empty data on the first page.
4. **Backend aggregation still capped at 50** – After tests, the backend `/api/address/...` endpoint continues to return only 50 transactions because the multiplexer stops when every server tried at a given offset returns empty. Even though some servers can paginate further, they may not be selected during runtime due to round-robin ordering or initial empty responses from other servers.

## Raw Data

See `pagination_results.json` for the full per-request log, including URLs, offsets, and error strings.

## Recommendations

1. **Prioritize deep servers** – When paginating inside the backend, prefer the proven deep endpoints (`mempool.emzy.de`, `memepool.jaonoctus.dev`, `iu1b96e.glddns.com`, etc.) before declaring an offset exhausted.
2. **Endpoint health checks** – Flag or temporarily disable servers that return empty responses at offset 0 to avoid capping future pagination.
3. **Backend multiplexer improvement** – Multiplexer now asks for up to **50 transactions per page** by default (configurable via `mempool_default_page_size`). This reduces the number of requests against high-capacity servers while still working with 10/25-capped endpoints.
4. **Early termination using tx_count** – The backend now uses the `tx_count` from the address summary (`/address/{addr}`) to stop pagination early. Once the expected number of unique transaction IDs is collected, pagination stops immediately, avoiding unnecessary requests and preventing offsets from exceeding the actual transaction count. This is especially beneficial for addresses with known transaction counts (e.g., 96 transactions) where pagination would previously continue to offset 530+ unnecessarily.
5. **Monitoring** – Keep monitoring `local` node availability; it timed out in this test.

