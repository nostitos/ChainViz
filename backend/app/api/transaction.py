"""Transaction lookup API endpoints"""

import logging
from fastapi import APIRouter, HTTPException, Depends

from app.models.api import TransactionResponse
from app.services.blockchain_data import get_blockchain_service, BlockchainDataService
from app.analysis.change_detection import ChangeDetector
from app.analysis.coinjoin import CoinJoinDetector

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/{txid}", response_model=TransactionResponse)
async def get_transaction(
    txid: str,
    blockchain_service: BlockchainDataService = Depends(get_blockchain_service),
):
    """
    Get transaction details with heuristic analysis
    
    Returns full transaction data plus:
    - Identified change output (if any)
    - CoinJoin detection (if applicable)
    - Input address clustering
    
    Example: GET /api/transaction/abcd1234...
    """
    try:
        logger.info(f"Looking up transaction: {txid}")

        # Fetch transaction
        transaction = await blockchain_service.fetch_transaction(txid)

        # Apply heuristics
        change_detector = ChangeDetector()
        change_result = change_detector.identify_change_output(transaction)

        coinjoin_detector = CoinJoinDetector()
        coinjoin_info = coinjoin_detector.detect_coinjoin(transaction)

        # Calculate fee rate (sat/vB)
        fee_rate = None
        if transaction.fee is not None and transaction.vsize > 0:
            fee_rate = round(transaction.fee / transaction.vsize, 2)
        
        return TransactionResponse(
            transaction=transaction,
            change_output=change_result.output_index if change_result else None,
            change_confidence=change_result.confidence if change_result else None,
            coinjoin_info=coinjoin_info,
            cluster_inputs=None,  # Would need full clustering
            fee_rate=fee_rate,
        )

    except Exception as e:
        logger.error(f"Failed to get transaction: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get transaction: {str(e)}")




