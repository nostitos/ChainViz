"""Bulk address import API endpoints"""

import logging
from fastapi import APIRouter, HTTPException, Depends

from app.config import settings
from app.models.api import BulkAddressImportRequest, BulkAddressResponse, AddressResponse
from app.services.blockchain_data import get_blockchain_service, BlockchainDataService
from app.analysis.clustering import AddressClusterer

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/addresses", response_model=BulkAddressResponse)
async def import_bulk_addresses(
    request: BulkAddressImportRequest,
    blockchain_service: BlockchainDataService = Depends(get_blockchain_service),
):
    """
    Import and analyze multiple addresses at once

    Useful for analyzing a list of addresses together, identifying clusters,
    and calculating combined statistics.

    Example:
    ```json
    {
      "addresses": ["1A1z...", "1BvBM..."],
      "fetch_history": true
    }
    ```

    Maximum 1000 addresses per request.
    """
    try:
        logger.info(f"Importing {len(request.addresses)} addresses")

        if len(request.addresses) > 1000:
            raise HTTPException(status_code=400, detail="Maximum 1000 addresses per request")

        address_responses = []
        total_balance = 0

        fetch_details = (
            request.include_details
            if request.include_details is not None
            else settings.address_auto_fetch_balance
        )

        histories = {}
        if request.fetch_history:
            # Use batching for performance
            histories = await blockchain_service.fetch_address_histories_batch(request.addresses)

        for address in request.addresses:
            try:
                address_info = None
                if fetch_details:
                    address_info = await blockchain_service.fetch_address_info(address)

                txids = histories.get(address, []) if request.fetch_history else []

                address_responses.append(
                    AddressResponse(
                        address=address_info.address if address_info else address,
                        balance=address_info.balance if address_info else 0,
                        total_received=address_info.total_received if address_info else 0,
                        total_sent=address_info.total_sent if address_info else 0,
                        tx_count=address_info.tx_count if address_info else len(txids),
                        utxos=address_info.utxos if address_info else [],
                        transactions=txids,
                        cluster_id=None,
                        first_seen=address_info.first_seen if address_info else None,
                        last_seen=address_info.last_seen if address_info else None,
                        details_included=fetch_details,
                    )
                )

                if address_info:
                    total_balance += address_info.balance

            except Exception as e:
                logger.warning(f"Failed to fetch address {address}: {e}")
                continue

        # Identify clusters
        # (Would need to analyze transactions to find clusters)
        clusters_identified = 0

        return BulkAddressResponse(
            addresses=address_responses,
            total_balance=total_balance,
            clusters_identified=clusters_identified,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to import bulk addresses: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to import addresses: {str(e)}")

