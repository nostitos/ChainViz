"""Metrics API endpoints for Electrum multiplexer observability"""

import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import datetime

from app.services.electrum_multiplexer import get_electrum_client
from app.services.mempool_client import get_mempool_endpoints

logger = logging.getLogger(__name__)

router = APIRouter()


# Response models

class ServerMetrics(BaseModel):
    """Metrics for a single server"""
    id: str
    host: str
    port: int
    protocol: str
    version: str
    state: str
    request_count: int
    success_count: int
    failure_count: int
    success_rate: float
    consecutive_failures: int
    avg_latency: float
    health_score: float
    in_flight_requests: int
    last_request_time: Optional[float]
    last_success_time: Optional[float]
    connection_time: Optional[float]
    uptime_score: float


class PoolSummary(BaseModel):
    """Summary statistics for the entire pool"""
    pool_size: int
    connected: int
    healthy: int
    total_requests: int
    total_successes: int
    total_failures: int
    success_rate: float
    request_types: dict


class RequestLog(BaseModel):
    """Log entry for a single request"""
    timestamp: str
    server: str
    method: str
    status: str
    latency: float
    error: Optional[str] = None


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


# Endpoints

@router.get("/metrics/servers", response_model=List[ServerMetrics])
async def get_servers():
    """
    Get list of all servers with health and metrics
    
    Returns detailed information about each server in the connection pool
    """
    try:
        client = get_electrum_client()
        
        # Ensure pool is started
        if not client.connected:
            await client.connect()
        
        connections = client.get_connections()
        
        servers = []
        for conn in connections:
            server_data = conn["server"]
            metrics_data = conn["metrics"]
            
            servers.append(ServerMetrics(
                id=conn["id"],
                host=server_data["host"],
                port=server_data["port"],
                protocol=server_data["protocol"],
                version=server_data["version"],
                state=conn["state"],
                request_count=metrics_data["request_count"],
                success_count=metrics_data["success_count"],
                failure_count=metrics_data["failure_count"],
                success_rate=metrics_data["success_rate"],
                consecutive_failures=metrics_data["consecutive_failures"],
                avg_latency=metrics_data["avg_latency"],
                health_score=metrics_data["health_score"],
                in_flight_requests=metrics_data["in_flight_requests"],
                last_request_time=metrics_data.get("last_request_time"),
                last_success_time=metrics_data.get("last_success_time"),
                connection_time=metrics_data.get("connection_time"),
                uptime_score=server_data["uptime_score"],
            ))
        
        return servers
        
    except Exception as e:
        logger.error(f"Error fetching server metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/metrics/servers/{server_id}")
async def get_server(server_id: str):
    """
    Get detailed metrics for a specific server
    
    Args:
        server_id: Server identifier (host:port)
    """
    try:
        client = get_electrum_client()
        
        if not client.connected:
            await client.connect()
        
        connections = client.get_connections()
        
        for conn in connections:
            if conn["id"] == server_id:
                return conn
        
        raise HTTPException(status_code=404, detail=f"Server {server_id} not found")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching server {server_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/metrics/summary", response_model=PoolSummary)
async def get_summary():
    """
    Get aggregate metrics for the entire connection pool
    
    Returns summary statistics including total requests, success rate, etc.
    """
    try:
        client = get_electrum_client()
        
        if not client.connected:
            await client.connect()
        
        stats = client.get_pool_stats()
        
        return PoolSummary(
            pool_size=stats["pool_size"],
            connected=stats["connected"],
            healthy=stats["healthy"],
            total_requests=stats["total_requests"],
            total_successes=stats["total_successes"],
            total_failures=stats["total_failures"],
            success_rate=stats["success_rate"],
            request_types=stats["request_types"],
        )
        
    except Exception as e:
        logger.error(f"Error fetching pool summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/metrics/requests", response_model=List[RequestLog])
async def get_requests(limit: int = 100):
    """
    Get recent request log
    
    Args:
        limit: Maximum number of requests to return (default: 100, max: 1000)
        
    Returns list of recent requests with server, method, status, and latency
    """
    try:
        if limit > 1000:
            limit = 1000
        
        client = get_electrum_client()
        
        if not client.connected:
            await client.connect()
        
        requests = client.get_recent_requests(limit=limit)
        
        return [
            RequestLog(
                timestamp=req["timestamp"],
                server=req["server"],
                method=req["method"],
                status=req["status"],
                latency=req["latency"],
                error=req.get("error"),
            )
            for req in requests
        ]
        
    except Exception as e:
        logger.error(f"Error fetching request log: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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


@router.post("/metrics/refresh-servers")
async def refresh_servers():
    """
    Force refresh of server list from 1209k.com
    
    Fetches updated list of public Electrum servers
    """
    try:
        from app.services.electrum_servers import get_server_manager
        
        server_manager = get_server_manager()
        await server_manager.force_refresh()
        
        servers = await server_manager.get_servers()
        
        return {
            "status": "success",
            "server_count": len(servers),
            "message": f"Refreshed server list, found {len(servers)} servers"
        }
        
    except Exception as e:
        logger.error(f"Error refreshing servers: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/metrics/health")
async def health_check():
    """
    Health check endpoint for the multiplexer
    
    Returns health status and basic connectivity info
    """
    try:
        client = get_electrum_client()
        
        is_connected = client.connected
        if not is_connected:
            try:
                await client.connect()
                is_connected = True
            except:
                pass
        
        stats = client.get_pool_stats() if is_connected else None
        
        return {
            "status": "healthy" if is_connected else "unhealthy",
            "connected": is_connected,
            "pool_size": stats["pool_size"] if stats else 0,
            "active_connections": stats["connected"] if stats else 0,
        }
        
    except Exception as e:
        logger.error(f"Health check error: {e}")
        return {
            "status": "unhealthy",
            "connected": False,
            "error": str(e),
        }

