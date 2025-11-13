"""
TOP 10 QUALITY ELECTRUM SERVERS

Use this as FALLBACK_SERVERS for best performance.
Selected for reliability, speed, and uptime.
"""

from datetime import datetime
from app.services.electrum_servers import ElectrumServerInfo

TOP_10_SERVERS = [
    # Blockstream - Enterprise grade, highly reliable
    ElectrumServerInfo(
        host="electrum.blockstream.info",
        port=50002,
        protocol="ssl",
        version="Fulcrum 1.11.1",
        height=0,
        uptime_hour=1.0,
        uptime_day=1.0,
        uptime_month=1.0,
        last_seen=datetime.now(),
    ),
    
    # 1209k.com core servers - Tested and verified
    ElectrumServerInfo(
        host="fulcrum-core.1209k.com",
        port=50002,
        protocol="ssl",
        version="Fulcrum 1.11.1",
        height=0,
        uptime_hour=1.0,
        uptime_day=1.0,
        uptime_month=1.0,
        last_seen=datetime.now(),
    ),
    ElectrumServerInfo(
        host="hippo.1209k.com",
        port=50002,
        protocol="ssl",
        version="Fulcrum 1.11.1",
        height=0,
        uptime_hour=1.0,
        uptime_day=1.0,
        uptime_month=1.0,
        last_seen=datetime.now(),
    ),
    ElectrumServerInfo(
        host="b6.1209k.com",
        port=50002,
        protocol="ssl",
        version="Fulcrum 1.11.1",
        height=0,
        uptime_hour=1.0,
        uptime_day=1.0,
        uptime_month=1.0,
        last_seen=datetime.now(),
    ),
    
    # Other reliable servers
    ElectrumServerInfo(
        host="electrum.bitaroo.net",
        port=50002,
        protocol="ssl",
        version="Fulcrum 1.11.0",
        height=0,
        uptime_hour=1.0,
        uptime_day=1.0,
        uptime_month=1.0,
        last_seen=datetime.now(),
    ),
    ElectrumServerInfo(
        host="electrum1.bluewallet.io",
        port=50002,
        protocol="ssl",
        version="ElectrumX 1.16.0",
        height=0,
        uptime_hour=1.0,
        uptime_day=1.0,
        uptime_month=1.0,
        last_seen=datetime.now(),
    ),
    ElectrumServerInfo(
        host="bitcoin.aranguren.org",
        port=50002,
        protocol="ssl",
        version="Fulcrum 1.11.0",
        height=0,
        uptime_hour=1.0,
        uptime_day=1.0,
        uptime_month=1.0,
        last_seen=datetime.now(),
    ),
    ElectrumServerInfo(
        host="fortress.qtornado.com",
        port=443,
        protocol="ssl",
        version="Fulcrum 1.10.0",
        height=0,
        uptime_hour=1.0,
        uptime_day=1.0,
        uptime_month=1.0,
        last_seen=datetime.now(),
    ),
    ElectrumServerInfo(
        host="bitcoin3.h4x.group",
        port=50002,
        protocol="ssl",
        version="Fulcrum 1.11.0",
        height=0,
        uptime_hour=1.0,
        uptime_day=1.0,
        uptime_month=1.0,
        last_seen=datetime.now(),
    ),
    ElectrumServerInfo(
        host="electrum.hodlister.co",
        port=50002,
        protocol="ssl",
        version="Fulcrum 1.10.0",
        height=0,
        uptime_hour=1.0,
        uptime_day=1.0,
        uptime_month=1.0,
        last_seen=datetime.now(),
    ),
]

