"""xpub derivation API endpoints"""

import logging
from fastapi import APIRouter, HTTPException, Depends

from app.models.api import XPubDeriveRequest, XPubDeriveResponse, AddressResponse
from app.services.xpub_parser import XPubParser
from app.services.blockchain_data import get_blockchain_service, BlockchainDataService
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/derive", response_model=XPubDeriveResponse)
async def derive_from_xpub(
    request: XPubDeriveRequest,
    blockchain_service: BlockchainDataService = Depends(get_blockchain_service),
):
    """
    Derive addresses from extended public key (xpub/ypub/zpub)
    
    Supports multiple xpub standards:
    - xpub: BIP32 legacy (P2PKH addresses)
    - ypub: BIP49 (P2SH-wrapped SegWit)
    - zpub: BIP84 (native SegWit P2WPKH)
    
    Example:
    ```json
    {
      "xpub": "xpub6CUGRUo...",
      "derivation_path": "m/0/0",
      "start_index": 0,
      "count": 20,
      "include_change": false
    }
    ```
    
    Maximum 10,000 addresses per request.
    """
    try:
        logger.info(f"Deriving addresses from xpub: {request.xpub[:20]}...")

        if request.count > settings.max_xpub_derivation:
            raise HTTPException(
                status_code=400,
                detail=f"Maximum {settings.max_xpub_derivation} addresses per request",
            )

        # Validate xpub
        if not XPubParser.validate_xpub(request.xpub):
            raise HTTPException(status_code=400, detail="Invalid xpub format")

        # Derive external addresses
        external_addresses = XPubParser.derive_addresses(
            request.xpub,
            start_index=request.start_index,
            count=request.count,
            change=False,
        )

        all_addresses = external_addresses

        # Derive change addresses if requested
        if request.include_change:
            change_addresses = XPubParser.derive_addresses(
                request.xpub,
                start_index=request.start_index,
                count=request.count,
                change=True,
            )
            all_addresses += change_addresses

        # Extract just addresses and paths
        addresses = [addr for addr, path in all_addresses]
        paths = [path for addr, path in all_addresses]

        # Optionally fetch address info (can be expensive for many addresses)
        address_info = None
        # Uncomment to enable:
        # if len(addresses) <= 100:
        #     histories = await blockchain_service.fetch_address_histories_batch(addresses)
        #     address_info = []
        #     for addr in addresses:
        #         info = await blockchain_service.fetch_address_info(addr)
        #         txids = histories.get(addr, [])
        #         address_info.append(AddressResponse(...))

        return XPubDeriveResponse(
            xpub=request.xpub,
            addresses=addresses,
            derivation_paths=paths,
            address_info=address_info,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to derive from xpub: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to derive addresses: {str(e)}")


@router.post("/validate")
async def validate_xpub(xpub: str):
    """
    Validate xpub format
    
    Example: POST /api/xpub/validate?xpub=xpub6CUGRUo...
    """
    try:
        is_valid = XPubParser.validate_xpub(xpub)

        if is_valid:
            xpub_type = XPubParser._detect_xpub_type(xpub)
            return {
                "valid": True,
                "type": xpub_type,
                "message": f"Valid {xpub_type}",
            }
        else:
            return {
                "valid": False,
                "message": "Invalid xpub format",
            }

    except Exception as e:
        return {
            "valid": False,
            "message": f"Validation error: {str(e)}",
        }




