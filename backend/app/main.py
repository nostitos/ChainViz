"""FastAPI application for ChainViz backend"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.services.blockchain_data import get_blockchain_service
from app.api import trace, address, transaction, bulk, xpub, config, metrics, stream_trace

# Configure logging
log_level = getattr(logging, settings.log_level.upper(), logging.INFO)
logging.basicConfig(
    level=log_level,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
# Align key loggers with configured level
logging.getLogger("app").setLevel(log_level)
logging.getLogger("uvicorn").setLevel(log_level)
logging.getLogger("uvicorn.access").setLevel(log_level)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager for startup/shutdown"""
    # Startup
    logger.info("Starting ChainViz backend...")
    blockchain_service = await get_blockchain_service()
    logger.info("Blockchain service initialized")

    yield

    # Shutdown
    logger.info("Shutting down ChainViz backend...")
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
app.include_router(stream_trace.router, prefix="/api/trace", tags=["Trace-Streaming"])
app.include_router(address.router, prefix="/api/address", tags=["Address"])
app.include_router(transaction.router, prefix="/api/transaction", tags=["Transaction"])
app.include_router(bulk.router, prefix="/api/bulk", tags=["Bulk"])
app.include_router(xpub.router, prefix="/api/xpub", tags=["XPub"])
app.include_router(config.router, prefix="/api", tags=["Config"])
app.include_router(metrics.router, prefix="/api", tags=["Metrics"])
from app.api import servers
app.include_router(servers.router, prefix="/api", tags=["Servers"])


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": "ChainViz API",
        "version": settings.api_version,
        "status": "running",
        "data_source": "mempool-only",
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level=settings.log_level.lower(),
        access_log=True,
    )

