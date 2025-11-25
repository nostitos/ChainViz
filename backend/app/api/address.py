"""Address lookup API endpoints"""

import logging
from typing import List, Optional, Dict
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from app.config import settings
from app.models.api import AddressResponse
from app.services.blockchain_data import get_blockchain_service, BlockchainDataService

logger = logging.getLogger(__name__)

router = APIRouter()


class BatchAddressRequest(BaseModel):
    """Request for batch address lookup"""

    addresses: List[str] = Field(..., description="List of addresses to look up")
    include_details: Optional[bool] = Field(
        default=None,
        description="Override auto-fetch behaviour for balances/UTXOs (default comes from backend config)",
    )


@router.get("/{address}", response_model=AddressResponse)
async def get_address(
    address: str,
    include_details: Optional[bool] = Query(
        default=None,
        description="Set true to force balance/UTXO fetch, false to skip. Defaults to backend setting.",
    ),
    max_transactions: Optional[int] = Query(
        default=None,
        description="Limit the number of transaction IDs returned. Counts are calculated from up to 500 transactions.",
    ),
    blockchain_service: BlockchainDataService = Depends(get_blockchain_service),
):
    """
    Get comprehensive address information

    Returns balance, transaction history, UTXO list, cluster membership,
    receiving/spending transaction counts, and first/last seen timestamps when detailed fetching is enabled.

    Example: GET /api/address/1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa?max_transactions=400
    """
    try:
        logger.info(f"Looking up address: {address}")

        fetch_details = (
            include_details if include_details is not None else settings.address_auto_fetch_balance
        )

        address_info = None
        txids: List[str] = []

        if fetch_details:
            # Fetch balance/utxos/summary-derived counts only; do NOT fetch txids
            address_info = await blockchain_service.fetch_address_info(address, max_transactions=max_transactions)
            txids = []
        else:
            logger.debug(
                "Skipping detailed fetch for %s (auto-fetch disabled, include_details=%s)",
                address,
                include_details,
            )

        base_address = address_info.address if address_info else address
        tx_count = address_info.tx_count if address_info else len(txids)

        return AddressResponse(
            address=base_address,
            balance=address_info.balance if address_info else 0,
            total_received=address_info.total_received if address_info else 0,
            total_sent=address_info.total_sent if address_info else 0,
            tx_count=tx_count,
            utxos=address_info.utxos if address_info else [],
            transactions=txids,
            cluster_id=None,  # Would need clustering analysis
            first_seen=address_info.first_seen if address_info else None,
            last_seen=address_info.last_seen if address_info else None,
            script_type=(
                str(address_info.script_type) if address_info and address_info.script_type else None
            ),
            receiving_count=address_info.receiving_count if address_info else None,
            spending_count=address_info.spending_count if address_info else None,
            details_included=fetch_details,
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
    Get information for multiple addresses in a single request (BATCHED & OPTIMIZED)

    This endpoint uses TRUE BATCHING to efficiently fetch multiple addresses at once.
    All addresses are fetched in parallel using the multiplexer's batch capabilities,
    significantly reducing latency compared to sequential requests.

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
        fetch_details = (
            request.include_details
            if request.include_details is not None
            else settings.address_auto_fetch_balance
        )
        
        logger.info(f"📦 Batch lookup: {len(request.addresses)} addresses (details={fetch_details})")

        # Skip transaction history for batch summaries to keep requests minimal
        histories_dict: Dict[str, List[str]] = {}

        results = []
        for address in request.addresses:
            try:
                address_info = None
                if fetch_details:
                    address_info = await blockchain_service.fetch_address_info(address)
                    logger.debug(f"Address {address[:12]}: receiving_count={address_info.receiving_count}, spending_count={address_info.spending_count}")

                # Get transaction history from batched results
                txids = histories_dict.get(address, [])

                results.append(
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
                        script_type=(
                            str(address_info.script_type)
                            if address_info and address_info.script_type
                            else None
                        ),
                        receiving_count=address_info.receiving_count if address_info else None,
                        spending_count=address_info.spending_count if address_info else None,
                        details_included=fetch_details,
                    )
                )

            except Exception as e:
                logger.warning(f"Failed to process address {address}: {e}")
                # Continue with other addresses even if one fails
                continue

        logger.info(f"✅ Batch complete: {len(results)}/{len(request.addresses)} addresses")
        return results

    except Exception as e:
        logger.error(f"Failed to batch get addresses: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to batch get addresses: {str(e)}")

