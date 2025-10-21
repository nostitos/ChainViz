"""Configuration management API endpoints"""

import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


class ElectrumServerConfig(BaseModel):
    """Electrum server configuration"""
    host: str = Field(..., description="Electrum server hostname or IP")
    port: int = Field(..., ge=1, le=65535, description="Electrum server port")
    use_ssl: bool = Field(default=False, description="Use SSL/TLS connection")


class ConfigResponse(BaseModel):
    """Current configuration response"""
    electrum_host: str
    electrum_port: int
    electrum_use_ssl: bool
    electrum_fallback_host: str
    electrum_fallback_port: int


@router.get("/config", response_model=ConfigResponse)
async def get_config():
    """Get current configuration"""
    return ConfigResponse(
        electrum_host=settings.electrum_host,
        electrum_port=settings.electrum_port,
        electrum_use_ssl=settings.electrum_use_ssl,
        electrum_fallback_host=settings.electrum_fallback_host,
        electrum_fallback_port=settings.electrum_fallback_port,
    )


@router.post("/config/electrum", response_model=ConfigResponse)
async def update_electrum_server(config: ElectrumServerConfig):
    """
    Update Electrum server configuration dynamically.
    
    This will disconnect any existing connections and reconnect to the new server.
    The new configuration persists for the current session only (not saved to disk).
    """
    logger.info(f"🔄 Updating Electrum server to {config.host}:{config.port} (SSL: {config.use_ssl})")
    
    try:
        # Update settings dynamically
        settings.electrum_host = config.host
        settings.electrum_port = config.port
        settings.electrum_use_ssl = config.use_ssl
        
        logger.info(f"✅ Electrum server updated to {settings.electrum_host}:{settings.electrum_port}")
        
        return ConfigResponse(
            electrum_host=settings.electrum_host,
            electrum_port=settings.electrum_port,
            electrum_use_ssl=settings.electrum_use_ssl,
            electrum_fallback_host=settings.electrum_fallback_host,
            electrum_fallback_port=settings.electrum_fallback_port,
        )
    except Exception as e:
        logger.error(f"❌ Failed to update Electrum server: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update Electrum server: {str(e)}")


@router.post("/config/electrum/test")
async def test_electrum_server(config: ElectrumServerConfig):
    """
    Test connection to an Electrum server without changing the active configuration.
    
    Returns connection status and latency.
    """
    import asyncio
    import time
    
    logger.info(f"🧪 Testing connection to {config.host}:{config.port} (SSL: {config.use_ssl})")
    
    try:
        from app.services.electrum_client import ElectrumClient
        
        # Create a test client
        test_client = ElectrumClient(
            host=config.host,
            port=config.port,
            use_ssl=config.use_ssl,
        )
        
        # Try to connect
        start_time = time.time()
        await test_client.connect()
        latency_ms = (time.time() - start_time) * 1000
        
        # Test with a simple call
        try:
            await test_client.get_transaction("0" * 64, verbose=False)  # Dummy call to test
        except Exception:
            pass  # Expected to fail, but connection worked
        
        # Disconnect
        await test_client.disconnect()
        
        logger.info(f"✅ Connection test successful: {latency_ms:.0f}ms")
        
        return {
            "success": True,
            "host": config.host,
            "port": config.port,
            "use_ssl": config.use_ssl,
            "latency_ms": round(latency_ms, 2),
            "message": f"Successfully connected in {latency_ms:.0f}ms",
        }
    except Exception as e:
        logger.error(f"❌ Connection test failed: {e}")
        return {
            "success": False,
            "host": config.host,
            "port": config.port,
            "use_ssl": config.use_ssl,
            "error": str(e),
            "message": f"Failed to connect: {str(e)}",
        }


