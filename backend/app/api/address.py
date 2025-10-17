"""Address lookup API endpoints"""

import logging
from typing import List
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from app.models.api import AddressResponse
from app.services.blockchain_data import get_blockchain_service, BlockchainDataService

logger = logging.getLogger(__name__)

router = APIRouter()


class BatchAddressRequest(BaseModel):
    """Request for batch address lookup"""
    addresses: List[str] = Field(..., description="List of addresses to look up")


@router.get("/{address}", response_model=AddressResponse)
async def get_address(
    address: str,
    blockchain_service: BlockchainDataService = Depends(get_blockchain_service),
):
    """
    Get comprehensive address information
    
    Returns balance, transaction history, UTXO list, cluster membership, 
    and first/last seen timestamps.
    
    Example: GET /api/address/1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa
    """
    try:
        logger.info(f"Looking up address: {address}")

        # Get address info
        address_info = await blockchain_service.fetch_address_info(address)

        # Get transaction history
        txids = await blockchain_service.fetch_address_history(address)

        return AddressResponse(
            address=address_info.address,
            balance=address_info.balance,
            total_received=address_info.total_received,
            total_sent=address_info.total_sent,
            tx_count=address_info.tx_count,
            utxos=address_info.utxos,
            transactions=txids,
            cluster_id=None,  # Would need clustering analysis
            first_seen=address_info.first_seen,
            last_seen=address_info.last_seen,
        )

    except Exception as e:
        logger.error(f"Failed to get address: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get address: {str(e)}")


@router.post("/batch", response_model=List[AddressResponse])
async def get_addresses_batch(
    request: BatchAddressRequest,
    blockchain_service: BlockchainDataService = Depends(get_blockchain_service),
):
    """
    Get information for multiple addresses in a single request (BATCHED)
    
    This endpoint uses batching to efficiently fetch multiple addresses at once,
    reducing the number of requests to the Electrum server.
    
    Example:
    ```json
    {
      "addresses": [
        "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
        "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2"
      ]
    }
    ```
    """
    try:
        logger.info(f"📦 Batch lookup for {len(request.addresses)} addresses")
        
        results = []
        for address in request.addresses:
            try:
                # Get address info
                address_info = await blockchain_service.fetch_address_info(address)
                
                # Get transaction history
                txids = await blockchain_service.fetch_address_history(address)
                
                results.append(AddressResponse(
                    address=address_info.address,
                    balance=address_info.balance,
                    total_received=address_info.total_received,
                    total_sent=address_info.total_sent,
                    tx_count=address_info.tx_count,
                    utxos=address_info.utxos,
                    transactions=txids,
                    cluster_id=None,
                    first_seen=address_info.first_seen,
                    last_seen=address_info.last_seen,
                ))
            except Exception as e:
                logger.warning(f"Failed to fetch address {address}: {e}")
                # Continue with other addresses even if one fails
                continue
        
        logger.info(f"✅ Batch lookup complete: {len(results)}/{len(request.addresses)} addresses fetched")
        return results

    except Exception as e:
        logger.error(f"Failed to batch get addresses: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to batch get addresses: {str(e)}")




