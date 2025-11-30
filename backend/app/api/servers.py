from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Literal, Any
import httpx
import time
from app.services.datasource.mempool.multiplexer import get_mempool_datasource

router = APIRouter(prefix="/servers", tags=["servers"])


class ServerInfo(BaseModel):
    name: str
    base_url: str
    priority: int


class ServerListResponse(BaseModel):
    servers: List[ServerInfo]


class ServerTestRequest(BaseModel):
    server_name: str
    test_type: Literal["address_summary", "address_txs", "tx", "utxo", "tip_height"]
    address: Optional[str] = None
    txid: Optional[str] = None


class ServerTestResponse(BaseModel):
    server_name: str
    test_type: str
    status: str  # "success", "failure", "timeout"
    http_code: Optional[int] = None
    latency_ms: float
    response_data: Optional[Any] = None
    error_message: Optional[str] = None


@router.get("/list", response_model=ServerListResponse)
async def list_servers():
    """Get list of all configured mempool servers."""
    datasource = get_mempool_datasource()
    endpoints = await datasource.get_endpoints()
    
    servers = [
        ServerInfo(
            name=ep.name,
            base_url=ep.config.base_url,
            priority=ep.priority
        )
        for ep in endpoints
    ]
    
    return ServerListResponse(servers=servers)


@router.post("/test", response_model=ServerTestResponse)
async def test_server(request: ServerTestRequest):
    """Test a specific server endpoint."""
    datasource = get_mempool_datasource()
    endpoints = await datasource.get_endpoints()
    
    # Find the requested server
    endpoint = None
    for ep in endpoints:
        if ep.name == request.server_name:
            endpoint = ep
            break
    
    if not endpoint:
        raise HTTPException(status_code=404, detail=f"Server {request.server_name} not found")
    
    # Build the test path based on test type
    if request.test_type == "address_summary":
        if not request.address:
            raise HTTPException(status_code=400, detail="Address required for this test type")
        path = f"/address/{request.address}"
    elif request.test_type == "address_txs":
        if not request.address:
            raise HTTPException(status_code=400, detail="Address required for this test type")
        path = f"/address/{request.address}/txs?limit=10"
    elif request.test_type == "tx":
        if not request.txid:
            raise HTTPException(status_code=400, detail="Transaction ID required for this test type")
        path = f"/tx/{request.txid}"
    elif request.test_type == "utxo":
        if not request.address:
            raise HTTPException(status_code=400, detail="Address required for this test type")
        path = f"/address/{request.address}/utxo"
    elif request.test_type == "tip_height":
        path = "/blocks/tip/height"
    else:
        raise HTTPException(status_code=400, detail="Invalid test type")
    
    # Perform the test
    url = f"{endpoint.config.base_url}{path}"
    start_time = time.perf_counter()
    
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(url, headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                "Accept": "application/json",
            })
            latency_ms = (time.perf_counter() - start_time) * 1000
            
            # Try to parse JSON response
            try:
                response_data = response.json()
            except Exception:
                # If it's a simple value (like tip height), try to parse it as int
                if response.text.isdigit():
                    response_data = int(response.text)
                else:
                    response_data = {"raw": response.text[:500]}  # Truncate long text responses
            
            if response.status_code == 200:
                status = "success"
            else:
                status = "failure"
            
            return ServerTestResponse(
                server_name=request.server_name,
                test_type=request.test_type,
                status=status,
                http_code=response.status_code,
                latency_ms=round(latency_ms, 2),
                response_data=response_data,
                error_message=None if status == "success" else f"HTTP {response.status_code}"
            )
    
    except httpx.TimeoutException:
        latency_ms = (time.perf_counter() - start_time) * 1000
        return ServerTestResponse(
            server_name=request.server_name,
            test_type=request.test_type,
            status="timeout",
            http_code=None,
            latency_ms=round(latency_ms, 2),
            response_data=None,
            error_message="Request timed out after 5 seconds"
        )
    
    except Exception as e:
        latency_ms = (time.perf_counter() - start_time) * 1000
        return ServerTestResponse(
            server_name=request.server_name,
            test_type=request.test_type,
            status="failure",
            http_code=None,
            latency_ms=round(latency_ms, 2),
            response_data=None,
            error_message=str(e)
        )
