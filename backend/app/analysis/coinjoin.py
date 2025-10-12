"""CoinJoin detection and classification"""

import logging
from typing import Optional, List
from collections import Counter

from app.models.blockchain import Transaction
from app.models.analysis import CoinJoinInfo, CoinJoinType

logger = logging.getLogger(__name__)


class CoinJoinDetector:
    """
    Detect CoinJoin transactions and classify by implementation
    
    CoinJoin characteristics:
    - Multiple inputs from different entities (5+)
    - Multiple equal-valued outputs (3+)
    - Breaks common-input ownership heuristic
    
    Implementations:
    - Wasabi: Coordinator patterns, ~0.1 BTC denominations
    - Whirlpool: Fixed pool sizes (0.001, 0.01, 0.05, 0.5 BTC)
    - JoinMarket: Variable amounts, fidelity bonds
    - Generic: Other mixing services
    """

    def __init__(self):
        # Known Whirlpool pool sizes (in satoshis)
        self.whirlpool_pools = [
            100_000,  # 0.001 BTC
            1_000_000,  # 0.01 BTC
            5_000_000,  # 0.05 BTC
            50_000_000,  # 0.5 BTC
        ]

        # Wasabi typical denominations
        self.wasabi_denominations = [
            10_000_000,  # 0.1 BTC (common)
        ]

    def detect_coinjoin(self, transaction: Transaction) -> Optional[CoinJoinInfo]:
        """
        Detect if transaction is a CoinJoin
        
        Args:
            transaction: Transaction to analyze
            
        Returns:
            CoinJoinInfo if CoinJoin detected, None otherwise
        """
        # Basic checks
        if len(transaction.inputs) < 5:
            return None

        if len(transaction.outputs) < 3:
            return None

        # Check for equal-valued outputs
        output_values = [out.value for out in transaction.outputs]
        value_counts = Counter(output_values)

        # Find most common output value
        most_common_value, equal_output_count = value_counts.most_common(1)[0]

        if equal_output_count < 3:
            return None  # Need at least 3 equal outputs

        # This looks like a CoinJoin, now classify type
        coinjoin_type, confidence = self._classify_coinjoin(
            transaction, most_common_value, equal_output_count
        )

        # Identify likely change outputs (unequal values)
        change_outputs = [
            i for i, out in enumerate(transaction.outputs) if out.value != most_common_value
        ]

        # Estimate participants (equal outputs typically = num participants)
        num_participants = equal_output_count

        return CoinJoinInfo(
            coinjoin_type=coinjoin_type,
            confidence=confidence,
            num_participants=num_participants,
            equal_output_value=most_common_value,
            equal_output_count=equal_output_count,
            change_outputs=change_outputs,
            metadata={
                "num_inputs": len(transaction.inputs),
                "num_outputs": len(transaction.outputs),
                "total_value": sum(output_values),
            },
        )

    def _classify_coinjoin(
        self, transaction: Transaction, equal_value: int, equal_count: int
    ) -> tuple[CoinJoinType, float]:
        """
        Classify CoinJoin implementation
        
        Returns:
            (CoinJoinType, confidence)
        """
        # Check Whirlpool (exact pool sizes)
        if equal_value in self.whirlpool_pools:
            # Whirlpool has very specific patterns
            if equal_count == 5:  # Standard Whirlpool mix
                return CoinJoinType.WHIRLPOOL, 0.95
            return CoinJoinType.WHIRLPOOL, 0.85

        # Check Wasabi patterns
        if self._is_wasabi_pattern(transaction, equal_value, equal_count):
            return CoinJoinType.WASABI, 0.9

        # Check JoinMarket patterns
        if self._is_joinmarket_pattern(transaction):
            return CoinJoinType.JOINMARKET, 0.8

        # Generic CoinJoin
        return CoinJoinType.GENERIC, 0.75

    def _is_wasabi_pattern(
        self, transaction: Transaction, equal_value: int, equal_count: int
    ) -> bool:
        """
        Check for Wasabi CoinJoin patterns
        
        Wasabi characteristics:
        - ~0.1 BTC denominations (or powers of 10)
        - Many participants (often 50-100+)
        - Coordinator fee outputs
        """
        # Check denomination
        if equal_value not in self.wasabi_denominations:
            # Check if it's a power of 10 around 0.1 BTC
            if not (5_000_000 <= equal_value <= 50_000_000):
                return False

        # Wasabi typically has many participants
        if equal_count < 10:
            return False

        # Check for coordinator fee pattern (small outputs)
        small_outputs = [
            out for out in transaction.outputs if out.value < equal_value * 0.01
        ]

        # Wasabi coordinator takes fees
        if small_outputs:
            return True

        return False

    def _is_joinmarket_pattern(self, transaction: Transaction) -> bool:
        """
        Check for JoinMarket patterns
        
        JoinMarket characteristics:
        - Variable amounts (not fixed denominations)
        - Fidelity bonds (time-locked outputs)
        - More diverse input/output structure
        """
        # JoinMarket is harder to detect definitively
        # Check for time-locked outputs (fidelity bonds)
        if transaction.locktime > 0:
            return True

        # Check for more varied output values (not just one denomination)
        output_values = [out.value for out in transaction.outputs]
        unique_values = len(set(output_values))

        if unique_values > len(output_values) * 0.5:
            # More than half are unique values
            return True

        return False

    def is_coinjoin(self, transaction: Transaction) -> bool:
        """
        Quick check if transaction is likely a CoinJoin
        
        Args:
            transaction: Transaction to check
            
        Returns:
            True if likely CoinJoin
        """
        result = self.detect_coinjoin(transaction)
        return result is not None

    def get_participating_addresses(
        self, transaction: Transaction, coinjoin_info: CoinJoinInfo
    ) -> List[str]:
        """
        Get addresses likely participating in the CoinJoin (equal outputs)
        
        Args:
            transaction: CoinJoin transaction
            coinjoin_info: CoinJoin detection result
            
        Returns:
            List of addresses receiving equal outputs
        """
        addresses = []

        for i, output in enumerate(transaction.outputs):
            if output.value == coinjoin_info.equal_output_value and output.address:
                addresses.append(output.address)

        return addresses




