"""FastAPI application for ChainViz backend"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.services.blockchain_data import get_blockchain_service
from app.api import trace, address, transaction, bulk, xpub, websocket, config, metrics, electrum_proxy, all_servers

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,  # Force DEBUG for now
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
# Set all app loggers to DEBUG
logging.getLogger("app").setLevel(logging.DEBUG)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager for startup/shutdown"""
    # Startup
    logger.info("Starting ChainViz backend...")
    blockchain_service = await get_blockchain_service()
    logger.info("Blockchain service initialized")
    
    # Initialize Electrum multiplexer if enabled
    if settings.electrum_multiplexer_enabled:
        logger.info("Initializing Electrum multiplexer...")
        from app.services.electrum_multiplexer import get_electrum_client
        client = get_electrum_client()
        try:
            await client.connect()
            logger.info("✅ Electrum multiplexer initialized")
        except Exception as e:
            logger.error(f"Failed to initialize multiplexer: {e}")

    yield

    # Shutdown
    logger.info("Shutting down ChainViz backend...")
    
    # Shutdown multiplexer
    if settings.electrum_multiplexer_enabled:
        try:
            from app.services.electrum_multiplexer import get_electrum_client
            client = get_electrum_client()
            await client.disconnect()
            logger.info("Multiplexer shutdown complete")
        except Exception as e:
            logger.error(f"Error shutting down multiplexer: {e}")
    
    await blockchain_service.close_redis()


# Create FastAPI app
app = FastAPI(
    title=settings.api_title,
    version=settings.api_version,
    description="Bitcoin blockchain analysis platform API",
    lifespan=lifespan,
)

# Configure CORS - Allow all origins for demo (including file://)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins including file://
    allow_credentials=False,  # Must be False when allow_origins is "*"
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(trace.router, prefix="/api/trace", tags=["Trace"])
app.include_router(address.router, prefix="/api/address", tags=["Address"])
app.include_router(transaction.router, prefix="/api/transaction", tags=["Transaction"])
app.include_router(bulk.router, prefix="/api/bulk", tags=["Bulk"])
app.include_router(xpub.router, prefix="/api/xpub", tags=["XPub"])
app.include_router(websocket.router, prefix="/ws", tags=["WebSocket"])
app.include_router(config.router, prefix="/api", tags=["Config"])
app.include_router(metrics.router, prefix="/api", tags=["Metrics"])
app.include_router(electrum_proxy.router, tags=["Electrum Proxy"])
app.include_router(all_servers.router, prefix="/api", tags=["All Servers"])


@app.get("/")
async def root():
    """Root endpoint"""
    electrum_info = "multiplexer" if settings.electrum_multiplexer_enabled else f"{settings.electrum_host}:{settings.electrum_port}"
    
    return {
        "name": "ChainViz API",
        "version": settings.api_version,
        "status": "running",
        "electrum_mode": electrum_info,
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)

