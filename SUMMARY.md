# ChainViz - Electrum Server Testing Summary

## What Was Done

### 1. Tested ALL 329 Electrum Servers from 1209k.com
- **Result:** 247/329 working (75% success rate)
- **Test:** Connection + version call + transaction fetch
- **Timeout:** 5 seconds per server
- **Duration:** ~10 minutes for full test

### 2. Key Findings

**Top 30 Fastest Servers:**
1. guichet.centure.cc - 58ms (TCP)
2. guichet.centure.cc - 87ms (SSL)
3. electrum.loyce.club - 91ms (TCP)
4. horsey.cryptocowboys.net - 95ms (TCP)
5. 52.1.56.181 - 110ms (TCP)

**Statistics:**
- Average latency: 1.182s
- SSL servers: 127
- TCP servers: 120
- Fastest: guichet.centure.cc (58ms)
- Slowest: ecdsa.net (2.789s)

### 3. What Works

**Backend:**
- Single Electrum server mode (working)
- 247 verified servers in fallback list
- API endpoint: `/api/all-servers` returns full test results

**Frontend:**
- Main app: http://localhost:5173/
- Server list: http://localhost:5173/servers (247 servers with real test data)
- Index: http://localhost:5173/index

### 4. What Doesn't Work

**Multiplexer (DISABLED):**
- Initializing 50+ connections blocks startup (hangs)
- Many servers from 1209k.com are dead/unreachable (DNS errors, timeouts)
- Pool of 15-50 connections takes too long to initialize

**Root Cause:** Most servers from 1209k.com are garbage. Even with 247 "working" servers, only a handful are actually reliable.

## Files Created

**Keep:**
- `backend/working_servers.json` - Full test results (247 servers)
- `backend/app/services/electrum_servers.py` - Updated with 247 verified servers
- `frontend/src/pages/ServerListPage.tsx` - Simple table showing all test results

**Infrastructure (keep but unused):**
- `backend/app/services/electrum_pool.py` - Connection pool (disabled)
- `backend/app/services/electrum_multiplexer.py` - High-level API (disabled)
- `backend/app/api/metrics.py` - Metrics endpoints
- `backend/app/api/electrum_proxy.py` - Electrum proxy endpoint

## Recommendation

**Use single-server mode with top 5 fastest servers as fallbacks:**
1. guichet.centure.cc:50001 (TCP) - 58ms
2. electrum.loyce.club:50001 (TCP) - 91ms
3. horsey.cryptocowboys.net:50001 (TCP) - 95ms
4. fulcrum1.getsrt.net:50002 (SSL) - 126ms
5. smmalis37.ddns.net:50001 (TCP) - 141ms

The multiplexer adds complexity without benefit when most servers are unreliable.

