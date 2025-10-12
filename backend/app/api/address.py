"""Address lookup API endpoints"""

import logging
from fastapi import APIRouter, HTTPException, Depends

from app.models.api import AddressResponse
from app.services.blockchain_data import get_blockchain_service, BlockchainDataService

logger = logging.getLogger(__name__)

router = APIRouter()


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




