"""Metrics API endpoints (mempool only)."""

import logging
from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.mempool_client import get_mempool_endpoints

logger = logging.getLogger(__name__)

router = APIRouter()


class MempoolEndpointMetrics(BaseModel):
    """Runtime metrics for a mempool endpoint"""

    name: str
    base_url: str
    priority: int
    healthy: bool
    success_count: int
    failure_count: int
    consecutive_failures: int
    max_concurrent: int
    request_delay: float
    last_success: Optional[str]
    last_failure: Optional[str]


@router.get("/metrics/mempool", response_model=List[MempoolEndpointMetrics])
async def get_mempool_metrics():
    """
    Return health metadata for all configured mempool endpoints.
    """

    try:
        endpoints = await get_mempool_endpoints()

        def _to_iso(dt: Optional[datetime]) -> Optional[str]:
            return dt.isoformat() if dt else None

        metrics = [
            MempoolEndpointMetrics(
                name=endpoint.name,
                base_url=endpoint.config.base_url,
                priority=endpoint.priority,
                healthy=endpoint.healthy,
                success_count=endpoint.success_count,
                failure_count=endpoint.failure_count,
                consecutive_failures=endpoint.consecutive_failures,
                max_concurrent=endpoint.config.max_concurrent,
                request_delay=endpoint.config.request_delay,
                last_success=_to_iso(endpoint.last_success),
                last_failure=_to_iso(endpoint.last_failure),
            )
            for endpoint in endpoints
        ]

        metrics.sort(key=lambda item: (item.priority, item.base_url))
        return metrics

    except Exception as exc:
        logger.error("Error collecting mempool metrics: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to collect mempool metrics") from exc

