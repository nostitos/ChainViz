"""xpub API endpoints for address derivation and transaction history"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
from app.services.xpub_service import XpubService
from app.services.mempool_client import get_mempool_client
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


class XpubHistoryRequest(BaseModel):
    """Request model for xpub history endpoint"""
    xpub: str = Field(..., description="Extended public key (zpub/ypub/xpub)")
    derivation_path: str = Field(default="m/84h/0h/0h", description="Base derivation path")
    count: int = Field(default=100, ge=1, le=1000, description="Number of addresses to derive")
    change: int = Field(default=0, ge=0, le=1, description="0 for receive, 1 for change")
    root_fingerprint: Optional[str] = Field(default=None, description="Root fingerprint (optional)")


class XpubHistoryResponse(BaseModel):
    """Response model for xpub history endpoint"""
    xpub: str
    total_addresses: int
    addresses_with_history: int
    total_transactions: int
    addresses: List[dict]


@router.post("/history", response_model=XpubHistoryResponse)
async def get_xpub_history(request: XpubHistoryRequest):
    """
    Generate transaction history for first N addresses from xpub
    
    Example:
        xpub: zpub6qyBNaAYEgDZtiW6cMnFNnTNwTwcJ9ovgyXDrMWXb2ZFHmgY5pjA1aH6n6z7ykpXBE2HN4vwrnomMFwGfqXdb3odnqZQagG2gE8LdfHof31
        derivation_path: m/84h/0h/0h
        count: 100
        root_fingerprint: 8a4de3d6
    """
    logger.info(f"Deriving {request.count} addresses from {request.xpub[:20]}...")
    
    # Derive addresses
    xpub_service = XpubService()
    addresses = xpub_service.derive_addresses(
        xpub=request.xpub,
        derivation_path=request.derivation_path,
        count=request.count,
        change=request.change
    )
    
    if not addresses:
        raise HTTPException(status_code=400, detail="Failed to derive addresses from xpub")
    
    logger.info(f"Derived {len(addresses)} addresses, fetching transaction history...")
    
    # Get transaction history for each address
    mempool = get_mempool_client()
    addresses_with_history = await xpub_service.get_addresses_with_history(addresses, mempool)
    
    total_transactions = sum(addr["tx_count"] for addr in addresses_with_history)
    
    logger.info(f"Found {total_transactions} transactions across {len(addresses_with_history)} addresses")
    
    return XpubHistoryResponse(
        xpub=request.xpub[:20] + "...",
        total_addresses=len(addresses),
        addresses_with_history=len(addresses_with_history),
        total_transactions=total_transactions,
        addresses=addresses_with_history
    )
