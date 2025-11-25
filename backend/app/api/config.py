"""Configuration management API endpoints (mempool only)."""

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter()


class RuntimeConfigResponse(BaseModel):
    """Current runtime configuration"""

    data_source: str = Field(default="mempool", description="Active blockchain data source")
    electrum_enabled: bool = Field(default=False, description="Whether Electrum fallback is available")


@router.get("/config", response_model=RuntimeConfigResponse)
async def get_config():
    """Return high-level runtime configuration."""

    return RuntimeConfigResponse()


