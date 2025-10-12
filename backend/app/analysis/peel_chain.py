"""Peel chain detection and analysis"""

import logging
from typing import List, Optional

from app.models.blockchain import Transaction
from app.models.analysis import PeelChainHop, HeuristicType
from app.analysis.change_detection import ChangeDetector

logger = logging.getLogger(__name__)


class PeelChainDetector:
    """
    Detect peel chain patterns
    
    A peel chain is a sequence of transactions where:
    - Large UTXO is spent
    - Small amount goes to payment address
    - Large remainder goes to change address
    - Pattern repeats with the change output
    
    Common in money laundering and large wallet management.
    """

    def __init__(self, change_detector: Optional[ChangeDetector] = None):
        self.change_detector = change_detector or ChangeDetector()
        self.min_peel_ratio = 0.05  # Payment must be <5% of total for clear peel
        self.max_peel_ratio = 0.95  # Change must be >95% of total

    async def detect_peel_chain(
        self,
        start_transaction: Transaction,
        fetch_transaction_func,
        max_hops: int = 100,
        min_confidence: float = 0.7,
    ) -> List[PeelChainHop]:
        """
        Detect and follow a peel chain from starting transaction
        
        Args:
            start_transaction: Initial transaction
            fetch_transaction_func: Async function to fetch transaction by ID
            max_hops: Maximum number of hops to follow
            min_confidence: Minimum confidence to continue chain
            
        Returns:
            List of PeelChainHop objects representing the chain
        """
        chain = []
        current_tx = start_transaction
        hop_number = 0

        while hop_number < max_hops:
            # Check if this transaction fits peel pattern
            peel_hop = self._analyze_peel_hop(current_tx, hop_number)

            if not peel_hop or peel_hop.confidence < min_confidence:
                # Chain broken
                break

            chain.append(peel_hop)
            hop_number += 1

            # Find the transaction that spends the change output
            change_output = current_tx.outputs[peel_hop.change_output_index]

            if not change_output.spent or not change_output.spending_txid:
                # Change not yet spent, end of chain
                break

            # Fetch next transaction in chain
            try:
                current_tx = await fetch_transaction_func(change_output.spending_txid)
            except Exception as e:
                logger.warning(f"Failed to fetch next transaction in peel chain: {e}")
                break

        logger.info(f"Detected peel chain with {len(chain)} hops")
        return chain

    def _analyze_peel_hop(self, transaction: Transaction, hop_number: int) -> Optional[PeelChainHop]:
        """
        Analyze if a single transaction is a peel hop
        
        Args:
            transaction: Transaction to analyze
            hop_number: Sequential hop number
            
        Returns:
            PeelChainHop if transaction fits pattern, None otherwise
        """
        # Peel chains typically have exactly 2 outputs
        if len(transaction.outputs) != 2:
            return None

        # Need at least one input
        if not transaction.inputs:
            return None

        output0 = transaction.outputs[0]
        output1 = transaction.outputs[1]

        # Calculate peel ratio
        total_out = output0.value + output1.value
        if total_out == 0:
            return None

        ratio0 = output0.value / total_out
        ratio1 = output1.value / total_out

        # Determine which is payment and which is change
        # Payment is smaller, change is larger
        if ratio0 < ratio1:
            # Output 0 is payment (smaller)
            payment_idx = 0
            change_idx = 1
            payment_ratio = ratio0
            change_ratio = ratio1
        else:
            # Output 1 is payment (smaller)
            payment_idx = 1
            change_idx = 0
            payment_ratio = ratio1
            change_ratio = ratio0

        # Check if ratios fit peel pattern
        # Strong peel: payment < 5%, change > 95%
        # Weak peel: payment < 50%, change > 50%
        if payment_ratio > 0.5:
            return None  # Not a peel

        # Calculate confidence based on ratio
        # Higher confidence for more extreme ratios
        if payment_ratio < self.min_peel_ratio and change_ratio > self.max_peel_ratio:
            confidence = 0.95  # Very strong peel
        elif payment_ratio < 0.1:
            confidence = 0.85
        elif payment_ratio < 0.2:
            confidence = 0.75
        else:
            confidence = 0.65

        # Use change detector to validate
        change_result = self.change_detector.identify_change_output(transaction)
        if change_result and change_result.output_index == change_idx:
            # Change detector agrees, boost confidence
            confidence = min(confidence * 1.1, 0.99)

        payment_output = transaction.outputs[payment_idx]
        change_output = transaction.outputs[change_idx]

        return PeelChainHop(
            hop_number=hop_number,
            txid=transaction.txid,
            payment_output_index=payment_idx,
            payment_value=payment_output.value,
            payment_address=payment_output.address,
            change_output_index=change_idx,
            change_value=change_output.value,
            change_address=change_output.address,
            confidence=confidence,
            timestamp=transaction.timestamp,
        )

    def calculate_chain_statistics(self, chain: List[PeelChainHop]) -> dict:
        """
        Calculate statistics for a peel chain
        
        Returns:
            Dict with statistics
        """
        if not chain:
            return {}

        total_peeled = sum(hop.payment_value for hop in chain)
        remaining = chain[-1].change_value if chain else 0

        # Calculate average time between hops
        timestamps = [hop.timestamp for hop in chain if hop.timestamp]
        avg_hop_time = None
        if len(timestamps) > 1:
            time_diffs = [timestamps[i + 1] - timestamps[i] for i in range(len(timestamps) - 1)]
            avg_hop_time = sum(time_diffs) / len(time_diffs)

        return {
            "total_hops": len(chain),
            "total_peeled": total_peeled,
            "remaining_value": remaining,
            "average_hop_time": avg_hop_time,
            "average_confidence": sum(hop.confidence for hop in chain) / len(chain),
            "pattern_type": self._classify_pattern(chain),
        }

    def _classify_pattern(self, chain: List[PeelChainHop]) -> str:
        """Classify the type of peel chain pattern"""
        if not chain:
            return "unknown"

        # Check if payments are roughly equal (systematic peeling)
        payment_values = [hop.payment_value for hop in chain]
        if len(payment_values) > 2:
            avg_payment = sum(payment_values) / len(payment_values)
            variance = sum((v - avg_payment) ** 2 for v in payment_values) / len(payment_values)
            relative_variance = variance / (avg_payment ** 2) if avg_payment > 0 else 0

            if relative_variance < 0.1:
                return "systematic"  # Equal payments
            elif relative_variance < 0.5:
                return "semi-systematic"  # Similar payments
            else:
                return "variable"  # Varying payments

        return "short_chain"




