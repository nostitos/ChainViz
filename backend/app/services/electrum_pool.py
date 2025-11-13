"""Electrum connection pool with health monitoring and smart routing"""

import asyncio
import logging
import time
import random
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime
from collections import deque
from enum import Enum

from app.services.electrum_client import ElectrumClient
from app.services.electrum_servers import ElectrumServerInfo, get_server_manager

logger = logging.getLogger(__name__)


class ConnectionState(Enum):
    """Connection state enum"""
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    UNHEALTHY = "unhealthy"


@dataclass
class ConnectionMetrics:
    """Metrics for a single connection"""
    request_count: int = 0
    success_count: int = 0
    failure_count: int = 0
    consecutive_failures: int = 0
    total_latency: float = 0.0  # Sum of all request latencies
    latency_samples: deque = field(default_factory=lambda: deque(maxlen=10))
    last_request_time: Optional[float] = None
    last_success_time: Optional[float] = None
    connection_time: Optional[float] = None
    in_flight_requests: int = 0
    
    @property
    def success_rate(self) -> float:
        """Success rate (0.0-1.0)"""
        if self.request_count == 0:
            return 1.0
        return self.success_count / self.request_count
    
    @property
    def avg_latency(self) -> float:
        """Average latency of recent requests in seconds"""
        if not self.latency_samples:
            return 0.0
        return sum(self.latency_samples) / len(self.latency_samples)
    
    @property
    def health_score(self) -> float:
        """
        Overall health score (0.0-1.0)
        
        Factors:
        - Success rate (60%)
        - Low consecutive failures (20%)
        - Recent activity (20%)
        """
        # Success rate component (60%)
        success_component = self.success_rate * 0.6
        
        # Consecutive failures penalty (20%)
        # Exponential decay: 3 failures = 0.5, 6 failures = 0.0
        failure_penalty = max(0.0, 1.0 - (self.consecutive_failures / 6.0))
        failure_component = failure_penalty * 0.2
        
        # Recency component (20%)
        if self.last_success_time:
            age = time.time() - self.last_success_time
            # Fresh if < 60s, stale if > 300s
            recency = max(0.0, 1.0 - (age / 300.0))
            recency_component = recency * 0.2
        else:
            recency_component = 0.0
        
        return success_component + failure_component + recency_component
    
    def to_dict(self) -> dict:
        """Convert to dictionary for serialization"""
        return {
            "request_count": self.request_count,
            "success_count": self.success_count,
            "failure_count": self.failure_count,
            "success_rate": self.success_rate,
            "consecutive_failures": self.consecutive_failures,
            "avg_latency": self.avg_latency,
            "health_score": self.health_score,
            "last_request_time": self.last_request_time,
            "last_success_time": self.last_success_time,
            "connection_time": self.connection_time,
            "in_flight_requests": self.in_flight_requests,
        }


@dataclass
class PooledConnection:
    """A connection in the pool with metadata"""
    server: ElectrumServerInfo
    client: ElectrumClient
    state: ConnectionState
    metrics: ConnectionMetrics
    reconnect_attempts: int = 0
    last_health_check: Optional[float] = None
    
    @property
    def id(self) -> str:
        """Unique identifier for this connection"""
        return f"{self.server.host}:{self.server.port}"
    
    def to_dict(self) -> dict:
        """Convert to dictionary for serialization"""
        return {
            "id": self.id,
            "server": self.server.to_dict(),
            "state": self.state.value,
            "metrics": self.metrics.to_dict(),
            "reconnect_attempts": self.reconnect_attempts,
            "last_health_check": self.last_health_check,
        }


class ElectrumConnectionPool:
    """
    Manages a pool of connections to multiple Electrum servers
    with health monitoring, smart routing, and automatic failover
    
    Uses lazy initialization - no connections until first request
    """
    
    def __init__(
        self,
        pool_size: int = 30,
        pool_min_size: int = 15,
        health_check_interval: int = 300,
        request_timeout: int = 10,
        max_retries: int = 3,
        max_consecutive_failures: int = 3,
        warmup_connections: int = 0,
        no_connection_backoff: float = 0.5,
    ):
        self.pool_size = pool_size  # Max pool size
        self.pool_min_size = pool_min_size  # Target size under normal load
        self.health_check_interval = health_check_interval
        self.request_timeout = request_timeout
        self.max_retries = max_retries
        self.max_consecutive_failures = max_consecutive_failures
        self.warmup_connections = max(0, warmup_connections)
        self.no_connection_backoff = max(0.1, no_connection_backoff)
        
        self.connections: List[PooledConnection] = []
        self.available_servers: List[ElectrumServerInfo] = []  # Server list for lazy connection
        self._lock = asyncio.Lock()
        self._health_check_task: Optional[asyncio.Task] = None
        self._running = False
        self._round_robin_index = 0  # For round-robin load balancing
        
        # Global metrics
        self.total_requests = 0
        self.total_successes = 0
        self.total_failures = 0
        self.request_types: Dict[str, int] = {}  # method -> count
        self.recent_requests: deque = deque(maxlen=100)  # Recent request log
        
    async def start(self) -> None:
        """
        Start the connection pool (lazy initialization)
        
        Loads server list but doesn't connect to anything yet.
        Connections are created on-demand when first request arrives.
        """
        if self._running:
            return
        
        logger.info(f"Starting Electrum connection pool (lazy mode, max {self.pool_size} servers)...")
        self._running = True
        
        # Get server list but don't connect yet
        server_manager = get_server_manager()
        self.available_servers = await server_manager.get_servers(count=self.pool_size)
        
        if not self.available_servers:
            logger.error("No servers available! Using fallback servers.")
            self.available_servers = await server_manager.get_servers(count=self.pool_size)
        
        logger.info(f"✅ Loaded {len(self.available_servers)} servers (connections will be created on-demand)")
        
        # Warm up a few connections so first requests don't wait on TLS handshakes
        if self.warmup_connections > 0 and self.available_servers:
            warmup_target = min(self.warmup_connections, len(self.available_servers), self.pool_size)
            if warmup_target:
                logger.info(f"⚡ Pre-warming {warmup_target} Electrum connections...")
                await self._ensure_min_connections(warmup_target, connect_now=True)
                logger.info("✅ Warmup complete")
        
        # Start health check background task
        self._health_check_task = asyncio.create_task(self._health_check_loop())
        
        logger.info("✅ Connection pool ready (0 active connections, will grow as needed)")
    
    async def stop(self) -> None:
        """Stop the connection pool and close all connections"""
        if not self._running:
            return
        
        logger.info("Stopping Electrum connection pool...")
        self._running = False
        
        # Stop health check task
        if self._health_check_task:
            self._health_check_task.cancel()
            try:
                await self._health_check_task
            except asyncio.CancelledError:
                pass
        
        # Close all connections
        for conn in self.connections:
            try:
                await conn.client.disconnect()
            except Exception as e:
                logger.debug(f"Error disconnecting {conn.id}: {e}")
        
        self.connections.clear()
        logger.info("Connection pool stopped")
    
    async def _create_connection(self, server: ElectrumServerInfo, connect_now: bool = False) -> PooledConnection:
        """
        Create a new pooled connection (lazy by default)
        
        Args:
            server: Server information
            connect_now: If True, connect immediately. If False, connection is lazy.
        """
        client = ElectrumClient(
            host=server.host,
            port=server.port,
            use_ssl=server.use_ssl,
            timeout=self.request_timeout,
        )
        
        conn = PooledConnection(
            server=server,
            client=client,
            state=ConnectionState.DISCONNECTED,
            metrics=ConnectionMetrics(),
        )
        
        # Only connect if explicitly requested
        if connect_now:
            try:
                await client.connect()
                conn.state = ConnectionState.CONNECTED
                conn.metrics.connection_time = time.time()
                logger.info(f"✅ Connected to {conn.id} ({server.version})")
            except Exception as e:
                logger.warning(f"Failed to connect to {conn.id}: {e}")
                conn.state = ConnectionState.DISCONNECTED
        
        return conn
    
    async def _ensure_connection(self, conn: PooledConnection) -> bool:
        """
        Ensure connection is established (connect if needed)
        
        Returns True if connected, False if connection failed
        """
        if conn.state == ConnectionState.CONNECTED and conn.client.connected:
            return True
        
        # Try to connect
        try:
            if conn.state == ConnectionState.CONNECTING:
                # Already connecting, wait briefly
                for _ in range(10):
                    await asyncio.sleep(0.1)
                    if conn.state == ConnectionState.CONNECTED:
                        return True
                return False
            
            conn.state = ConnectionState.CONNECTING
            await conn.client.connect()
            conn.state = ConnectionState.CONNECTED
            conn.metrics.connection_time = time.time()
            conn.metrics.consecutive_failures = 0
            logger.info(f"✅ Connected to {conn.id}")
            return True
            
        except Exception as e:
            logger.warning(f"Failed to connect to {conn.id}: {e}")
            conn.state = ConnectionState.DISCONNECTED
            return False
    
    async def _reconnect(self, conn: PooledConnection) -> bool:
        """Try to reconnect a disconnected connection"""
        try:
            if conn.client.connected:
                await conn.client.disconnect()
            
            await conn.client.connect()
            conn.state = ConnectionState.CONNECTED
            conn.metrics.connection_time = time.time()
            conn.reconnect_attempts = 0
            conn.metrics.consecutive_failures = 0
            logger.info(f"✅ Reconnected to {conn.id}")
            return True
            
        except Exception as e:
            conn.reconnect_attempts += 1
            logger.debug(f"Reconnect attempt {conn.reconnect_attempts} failed for {conn.id}: {e}")
            return False
    
    async def _maybe_grow_pool(self) -> None:
        """
        Grow pool based on load and request count
        
        Growth strategy:
        - First 5 requests: Add 1 server each (quick ramp-up to 5 servers)
        - Requests 5-100: Add 1 server every 10 requests (grow to 15 servers)
        - High load (>50 in-flight): Add 2 servers immediately (up to max pool_size)
        """
        current_size = len(self.connections)
        
        # Don't grow if at max
        if current_size >= self.pool_size:
            return
        
        # Calculate in-flight requests
        total_in_flight = sum(c.metrics.in_flight_requests for c in self.connections)
        
        # Growth triggers
        should_grow = False
        grow_count = 1
        
        # High load: grow by 2 immediately
        if total_in_flight > 50 and current_size < self.pool_size:
            should_grow = True
            grow_count = 2
            logger.info(f"High load detected ({total_in_flight} in-flight), growing pool")
        # Quick ramp: First 5 requests get 1 server each
        elif current_size < 5 and self.total_requests < 10:
            should_grow = True
            grow_count = 1
        # Steady growth: Every 10 requests until we reach min_size
        elif current_size < self.pool_min_size:
            # Use integer division to avoid exact modulo matching
            target_size = min(5 + (self.total_requests // 10), self.pool_min_size)
            if current_size < target_size:
                should_grow = True
                grow_count = 1
        
        if not should_grow:
            return
        
        # Grow pool (non-blocking)
        async with self._lock:
            # Check again after acquiring lock
            current_size = len(self.connections)
            if current_size >= self.pool_size:
                return
            
            # How many to add
            to_add = min(grow_count, self.pool_size - current_size)
            
            # Get servers we haven't used yet
            used_servers = {conn.id for conn in self.connections}
            available = [s for s in self.available_servers 
                        if f"{s.host}:{s.port}" not in used_servers]
            
            if not available:
                return
            
            # Add connections (lazy, will connect on first use)
            for i in range(min(to_add, len(available))):
                server = available[i]
                conn = await self._create_connection(server, connect_now=False)
                self.connections.append(conn)
                logger.info(f"📈 Added server {current_size + i + 1}/{self.pool_size}: {conn.id}")
    
    async def _ensure_min_connections(self, minimum: int, connect_now: bool = False) -> None:
        """Ensure at least `minimum` connections exist in the pool."""
        target = min(max(0, minimum), self.pool_size)
        if len(self.connections) >= target:
            return

        async with self._lock:
            if len(self.connections) >= target:
                return

            used_servers = {conn.id for conn in self.connections}
            added = 0

            for server in self.available_servers:
                if len(self.connections) >= target:
                    break

                server_id = f"{server.host}:{server.port}"
                if server_id in used_servers:
                    continue

                conn = await self._create_connection(server, connect_now=connect_now)
                self.connections.append(conn)
                used_servers.add(server_id)
                added += 1

                if connect_now:
                    logger.info(f"🔥 Warmed Electrum connection {conn.id}")
                else:
                    logger.info(f"📦 Prepared Electrum connection {conn.id}")

            if added == 0 and len(self.connections) < target:
                logger.warning(
                    "Unable to reach minimum connection count (%s/%s)",
                    len(self.connections),
                    target,
                )
    
    def _next_connection_rr(self) -> Optional[PooledConnection]:
        """
        Select next connection using round-robin load balancing
        
        Returns next healthy connection in rotation, or any healthy connection
        if current index is unhealthy.
        """
        # Get connected (or lazy) connections
        available = [
            c for c in self.connections
            if c.state in (ConnectionState.CONNECTED, ConnectionState.DISCONNECTED)
        ]
        
        if not available:
            logger.warning("No available connections!")
            return None
        
        # Round-robin selection
        if len(available) == 1:
            return available[0]
        
        # Try to use next in rotation
        self._round_robin_index = (self._round_robin_index + 1) % len(available)
        selected = available[self._round_robin_index]
        
        # If selected is unhealthy, try to find a better one
        if selected.state == ConnectionState.UNHEALTHY:
            for conn in available:
                if conn.state in (ConnectionState.CONNECTED, ConnectionState.DISCONNECTED):
                    return conn
        
        return selected
    
    async def execute_request(
        self,
        method: str,
        params: List[Any],
        max_retries: Optional[int] = None,
    ) -> Any:
        """
        Execute a single request through the pool
        
        Args:
            method: Electrum method name
            params: Method parameters
            max_retries: Maximum retry attempts (uses pool default if None)
            
        Returns:
            Request result
            
        Raises:
            Exception: If all retry attempts fail
        """
        if max_retries is None:
            max_retries = self.max_retries
        
        # Maybe grow pool based on load
        await self._maybe_grow_pool()
        
        # If no connections yet, create first one now
        if not self.connections and self.available_servers:
            async with self._lock:
                if not self.connections:  # Double-check after lock
                    first_server = self.available_servers[0]
                    conn = await self._create_connection(first_server, connect_now=False)
                    self.connections.append(conn)
                    logger.info(f"🚀 Creating first connection: {conn.id}")
        
        baseline_target = max(1, min(self.pool_min_size, self.warmup_connections or 1))
        await self._ensure_min_connections(baseline_target, connect_now=False)
        
        last_error = None
        tried_connections = set()
        
        for attempt in range(max_retries):
            # Select connection (round-robin)
            conn = self._next_connection_rr()
            if not conn:
                await self._maybe_grow_pool()
                await self._ensure_min_connections(baseline_target, connect_now=True)
                backoff = min(
                    self.no_connection_backoff * (attempt + 1),
                    float(self.request_timeout),
                )
                await asyncio.sleep(backoff)
                continue
            
            # Avoid retrying same connection immediately
            if conn.id in tried_connections and attempt > 0:
                # Try to find a different connection
                for _ in range(3):
                    alt_conn = self._next_connection_rr()
                    if alt_conn and alt_conn.id not in tried_connections:
                        conn = alt_conn
                        break
            
            tried_connections.add(conn.id)
            
            # Ensure connection is established
            if not await self._ensure_connection(conn):
                logger.debug(f"Failed to establish connection to {conn.id}")
                last_error = Exception(f"Connection failed: {conn.id}")
                continue
            
            # Execute request
            start_time = time.time()
            try:
                conn.metrics.in_flight_requests += 1
                conn.metrics.request_count += 1
                conn.metrics.last_request_time = start_time
                
                result = await conn.client._call(method, params)
                
                # Success
                latency = time.time() - start_time
                conn.metrics.success_count += 1
                conn.metrics.consecutive_failures = 0
                conn.metrics.last_success_time = time.time()
                conn.metrics.latency_samples.append(latency)
                conn.metrics.total_latency += latency
                
                # Update global metrics
                self.total_requests += 1
                self.total_successes += 1
                self.request_types[method] = self.request_types.get(method, 0) + 1
                
                # Log request
                self.recent_requests.append({
                    "timestamp": datetime.now().isoformat(),
                    "server": conn.id,
                    "method": method,
                    "status": "success",
                    "latency": latency,
                })
                
                logger.debug(f"✅ {method} -> {conn.id} ({latency:.3f}s)")
                
                return result
                
            except Exception as e:
                latency = time.time() - start_time
                conn.metrics.failure_count += 1
                conn.metrics.consecutive_failures += 1
                
                # Update global metrics
                self.total_requests += 1
                self.total_failures += 1
                self.request_types[method] = self.request_types.get(method, 0) + 1
                
                # Log request
                self.recent_requests.append({
                    "timestamp": datetime.now().isoformat(),
                    "server": conn.id,
                    "method": method,
                    "status": "failure",
                    "latency": latency,
                    "error": str(e),
                })
                
                logger.warning(f"❌ {method} -> {conn.id} failed: {e}")
                
                # Mark unhealthy if too many consecutive failures
                if conn.metrics.consecutive_failures >= self.max_consecutive_failures:
                    conn.state = ConnectionState.UNHEALTHY
                    logger.warning(f"Marking {conn.id} as UNHEALTHY after {conn.metrics.consecutive_failures} failures")
                
                last_error = e
                
                # Backoff before retry
                if attempt < max_retries - 1:
                    await asyncio.sleep(0.2 * (attempt + 1))
                
            finally:
                conn.metrics.in_flight_requests -= 1
        
        # All retries failed
        raise Exception(f"All {max_retries} retry attempts failed. Last error: {last_error}")
    
    async def execute_batch(
        self,
        requests: List[Tuple[str, List[Any]]],
        parallel: bool = False,
    ) -> List[Any]:
        """
        Execute multiple requests through the pool
        
        Args:
            requests: List of (method, params) tuples
            parallel: If True and batch is large, split across multiple servers
            
        Returns:
            List of results in same order as requests
        """
        if not requests:
            return []
        
        # Auto-enable parallel for medium/large batches (OPTIMIZATION)
        if not parallel and len(requests) > 10:
            parallel = True
            logger.debug(f"Auto-enabled parallel execution for batch of {len(requests)} requests")
        
        # For medium/large batches, split across multiple servers (LOWERED THRESHOLD: 50 → 10)
        if parallel and len(requests) > 10:
            return await self._execute_batch_parallel(requests)
        else:
            return await self._execute_batch_single(requests)
    
    async def _execute_batch_single(self, requests: List[Tuple[str, List[Any]]]) -> List[Any]:
        """Execute batch through a single connection"""
        # Select connection (round-robin)
        conn = self._next_connection_rr()
        if not conn:
            raise Exception("No healthy connections available")
        
        # Ensure connection is established
        if not await self._ensure_connection(conn):
            raise Exception(f"Failed to connect to {conn.id}")
        
        start_time = time.time()
        try:
            conn.metrics.in_flight_requests += len(requests)
            results = await conn.client._batch_call(requests)
            
            # Update metrics
            latency = time.time() - start_time
            success_count = sum(1 for r in results if r is not None)
            failure_count = len(results) - success_count
            
            conn.metrics.request_count += len(requests)
            conn.metrics.success_count += success_count
            conn.metrics.failure_count += failure_count
            conn.metrics.last_success_time = time.time()
            conn.metrics.latency_samples.append(latency)
            
            self.total_requests += len(requests)
            self.total_successes += success_count
            self.total_failures += failure_count
            
            logger.info(f"📦 Batch of {len(requests)} -> {conn.id} ({latency:.3f}s, {success_count} success)")
            
            return results
            
        finally:
            conn.metrics.in_flight_requests -= len(requests)
    
    async def _execute_batch_parallel(self, requests: List[Tuple[str, List[Any]]]) -> List[Any]:
        """
        Execute large batch in parallel across multiple servers (OPTIMIZED)
        
        Uses optimal batch size (20-30 per server) instead of splitting evenly
        """
        # Get healthy connections sorted by load (least loaded first)
        healthy = [c for c in self.connections if c.state == ConnectionState.CONNECTED]
        if not healthy:
            raise Exception("No healthy connections available")
        
        # Sort by current load (in-flight requests)
        healthy_sorted = sorted(healthy, key=lambda c: c.metrics.in_flight_requests)
        
        # Use optimal batch size (20-30 requests per server) - OPTIMIZATION
        OPTIMAL_BATCH_SIZE = 25
        num_servers_needed = min(
            len(healthy_sorted),
            (len(requests) + OPTIMAL_BATCH_SIZE - 1) // OPTIMAL_BATCH_SIZE
        )
        
        servers_to_use = healthy_sorted[:num_servers_needed]
        chunk_size = (len(requests) + num_servers_needed - 1) // num_servers_needed
        
        chunks = [requests[i:i + chunk_size] for i in range(0, len(requests), chunk_size)]
        
        logger.info(f"📦 Splitting {len(requests)} requests into {len(chunks)} chunks (~{chunk_size} each) across {len(servers_to_use)}/{len(healthy)} servers")
        
        # Execute chunks in parallel
        tasks = []
        for chunk in chunks:
            task = self._execute_batch_single(chunk)
            tasks.append(task)
        
        # Wait for all chunks
        chunk_results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Combine results
        results = []
        for i, chunk_result in enumerate(chunk_results):
            if isinstance(chunk_result, Exception):
                # If a chunk failed, pad with None
                logger.warning(f"Chunk {i+1}/{len(chunks)} failed: {chunk_result}")
                results.extend([None] * len(chunks[i]))
            else:
                results.extend(chunk_result)
        
        return results[:len(requests)]
    
    async def _health_check_loop(self) -> None:
        """Background task for periodic health checks"""
        logger.info("Health check loop started")
        
        while self._running:
            try:
                await asyncio.sleep(self.health_check_interval)
                await self._perform_health_checks()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Health check loop error: {e}")
    
    async def _perform_health_checks(self) -> None:
        """
        Perform health checks on idle connections only
        
        Only checks servers that have been idle for >2 minutes (spare time)
        Skips servers with recent successful requests
        """
        logger.debug("Performing health checks on idle servers...")
        
        current_time = time.time()
        idle_threshold = 120  # 2 minutes
        checked_count = 0
        
        for conn in self.connections:
            try:
                # Only check CONNECTED servers
                if conn.state != ConnectionState.CONNECTED:
                    continue
                
                # Skip if recently used (< 2 minutes ago)
                if conn.metrics.last_request_time:
                    idle_time = current_time - conn.metrics.last_request_time
                    if idle_time < idle_threshold:
                        continue
                
                # Skip if recently checked (< 2 minutes ago)
                if conn.last_health_check:
                    check_age = current_time - conn.last_health_check
                    if check_age < idle_threshold:
                        continue
                
                # Ping idle server
                start = time.time()
                try:
                    # Simple ping via server.version
                    await asyncio.wait_for(
                        conn.client._call("server.version", ["ChainViz", "1.4"]),
                        timeout=5.0
                    )
                    latency = time.time() - start
                    conn.last_health_check = current_time
                    checked_count += 1
                    logger.debug(f"Health check OK: {conn.id} ({latency:.3f}s, idle {idle_time:.0f}s)")
                except Exception as e:
                    logger.warning(f"Health check failed for idle server {conn.id}: {e}")
                    conn.state = ConnectionState.UNHEALTHY
                        
            except Exception as e:
                logger.error(f"Error checking {conn.id}: {e}")
        
        if checked_count > 0:
            logger.info(f"✓ Health checked {checked_count} idle servers")
    
    def get_stats(self) -> dict:
        """Get pool statistics"""
        connected_count = sum(1 for c in self.connections if c.state == ConnectionState.CONNECTED)
        healthy_count = sum(1 for c in self.connections if c.metrics.health_score > 0.7)
        
        return {
            "pool_size": len(self.connections),
            "connected": connected_count,
            "healthy": healthy_count,
            "total_requests": self.total_requests,
            "total_successes": self.total_successes,
            "total_failures": self.total_failures,
            "success_rate": self.total_successes / max(1, self.total_requests),
            "request_types": self.request_types,
        }
    
    def get_connections_info(self) -> List[dict]:
        """Get detailed info about all connections"""
        return [conn.to_dict() for conn in self.connections]


# Global pool instance
_pool: Optional[ElectrumConnectionPool] = None


def get_connection_pool() -> ElectrumConnectionPool:
    """Get or create global connection pool"""
    global _pool
    if _pool is None:
        from app.config import settings
        _pool = ElectrumConnectionPool(
            pool_size=getattr(settings, 'electrum_pool_size', 30),
            pool_min_size=getattr(settings, 'electrum_pool_min_size', 15),
            health_check_interval=getattr(settings, 'electrum_health_check_interval', 300),
            request_timeout=getattr(settings, 'electrum_request_timeout', 10),
            max_retries=getattr(settings, 'electrum_max_retries', 3),
            warmup_connections=getattr(settings, 'electrum_warmup_connections', 0),
            no_connection_backoff=getattr(settings, 'electrum_no_connection_backoff', 0.5),
        )
    return _pool

