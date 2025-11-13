"""Legacy import path kept for compatibility with new mempool datasource."""

from app.services.datasource.mempool.multiplexer import (
    MempoolDataSource,
    get_mempool_datasource,
)


async def get_mempool_endpoints():
    """Helper for metrics handlers to inspect endpoint health."""
    datasource = get_mempool_datasource()
    return await datasource.get_endpoints()


def get_mempool_client() -> MempoolDataSource:
    """
    Preserve the old helper name so existing imports keep working.
    Returns the new multiplexer-backed mempool datasource.
    """

    return get_mempool_datasource()

