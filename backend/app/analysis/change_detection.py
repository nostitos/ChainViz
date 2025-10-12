"""Change output detection heuristics"""

import logging
from typing import Dict, Optional, List, Tuple
from decimal import Decimal

from app.models.blockchain import Transaction, ScriptType
from app.models.analysis import ChangeDetectionResult, HeuristicType

logger = logging.getLogger(__name__)


class ChangeDetector:
    """
    Detect change outputs in transactions using multiple heuristics
    
    Combines:
    - Address reuse (0.95)
    - Round amounts (0.7)
    - Script type matching (0.8)
    - Optimal change (0.75)
    - Wallet fingerprinting (0.6)
    """

    def __init__(self, address_history: Optional[Dict[str, List[str]]] = None):
        """
        Args:
            address_history: Dict mapping address to list of prior transaction IDs
        """
        self.address_history = address_history or {}

    def identify_change_output(self, transaction: Transaction) -> Optional[ChangeDetectionResult]:
        """
        Identify the change output in a transaction
        
        Args:
            transaction: Transaction to analyze
            
        Returns:
            ChangeDetectionResult with identified change output and confidence
        """
        if len(transaction.outputs) < 2:
            # Can't identify change in single-output transactions
            return None

        # Apply all heuristics
        heuristic_scores: Dict[int, Dict[HeuristicType, float]] = {}

        for i, output in enumerate(transaction.outputs):
            heuristic_scores[i] = {}

            # 1. Address reuse heuristic
            reuse_score = self._detect_reused_address(output.address)
            if reuse_score > 0:
                heuristic_scores[i][HeuristicType.ADDRESS_REUSE] = reuse_score

            # 2. Round amount heuristic
            round_score = self._detect_round_amount(output.value)
            if round_score > 0:
                heuristic_scores[i][HeuristicType.ROUND_AMOUNT] = round_score

        # 3. Script type matching (transaction-level)
        script_scores = self._detect_script_type_match(transaction)
        for output_idx, score in script_scores.items():
            if score > 0:
                heuristic_scores[output_idx][HeuristicType.SCRIPT_TYPE_MATCH] = score

        # 4. Optimal change heuristic
        optimal_scores = self._detect_optimal_change(transaction)
        for output_idx, score in optimal_scores.items():
            if score > 0:
                heuristic_scores[output_idx][HeuristicType.OPTIMAL_CHANGE] = score

        # 5. Wallet fingerprinting
        wallet_scores = self._detect_wallet_pattern(transaction)
        for output_idx, score in wallet_scores.items():
            if score > 0:
                heuristic_scores[output_idx][HeuristicType.WALLET_FINGERPRINT] = score

        # Combine heuristics using weighted average
        # Address reuse (0.95): payment if reused, so INVERSE for change
        # Round amount (0.7): payment if round, so INVERSE for change
        # Script match (0.8): change if matched
        # Optimal change (0.75): change if larger output
        # Wallet pattern (0.6): change based on pattern

        combined_scores = {}
        for output_idx in range(len(transaction.outputs)):
            scores = heuristic_scores.get(output_idx, {})

            # Calculate change probability
            change_prob = 0.5  # Start neutral

            # Address reuse DECREASES change probability (reused = payment)
            if HeuristicType.ADDRESS_REUSE in scores:
                change_prob *= (1.0 - scores[HeuristicType.ADDRESS_REUSE])

            # Round amount DECREASES change probability (round = payment)
            if HeuristicType.ROUND_AMOUNT in scores:
                change_prob *= (1.0 - scores[HeuristicType.ROUND_AMOUNT])

            # Script match INCREASES change probability
            if HeuristicType.SCRIPT_TYPE_MATCH in scores:
                change_prob += (1.0 - change_prob) * scores[HeuristicType.SCRIPT_TYPE_MATCH]

            # Optimal change INCREASES change probability
            if HeuristicType.OPTIMAL_CHANGE in scores:
                change_prob += (1.0 - change_prob) * scores[HeuristicType.OPTIMAL_CHANGE]

            # Wallet pattern adjusts probability
            if HeuristicType.WALLET_FINGERPRINT in scores:
                change_prob += (1.0 - change_prob) * scores[HeuristicType.WALLET_FINGERPRINT]

            combined_scores[output_idx] = change_prob

        # Select output with highest change probability
        if not combined_scores:
            return None

        change_output_idx = max(combined_scores, key=combined_scores.get)
        confidence = combined_scores[change_output_idx]

        # Build reasoning
        reasoning_parts = []
        for htype, score in heuristic_scores.get(change_output_idx, {}).items():
            reasoning_parts.append(f"{htype.value}: {score:.2f}")

        reasoning = "; ".join(reasoning_parts) if reasoning_parts else "No strong signals"

        return ChangeDetectionResult(
            output_index=change_output_idx,
            confidence=confidence,
            heuristics=heuristic_scores.get(change_output_idx, {}),
            reasoning=reasoning,
        )

    def _detect_reused_address(self, address: Optional[str]) -> float:
        """
        Check if output address has been seen before
        
        Reused address = likely payment (NOT change)
        Returns: 0.95 if reused, 0.0 otherwise
        """
        if not address:
            return 0.0

        if address in self.address_history and len(self.address_history[address]) > 1:
            return 0.95

        return 0.0

    def _detect_round_amount(self, value: int) -> float:
        """
        Check if amount is round (likely payment, NOT change)
        
        Returns: 0.7 if round, 0.0 otherwise
        """
        btc = value / 100_000_000

        # Check for round BTC amounts
        round_values = [0.001, 0.01, 0.1, 0.5, 1.0, 5.0, 10.0, 50.0, 100.0]

        for round_val in round_values:
            if abs(btc - round_val) < 0.000001:
                return 0.7

        # Check for round numbers with few decimals
        btc_str = f"{btc:.8f}".rstrip("0")
        decimal_places = len(btc_str.split(".")[-1]) if "." in btc_str else 0

        if decimal_places <= 2:
            return 0.6

        return 0.0

    def _detect_script_type_match(self, transaction: Transaction) -> Dict[int, float]:
        """
        Check if output script type matches input script types
        
        Matching script type = likely change
        Returns: Dict mapping output index to score (0.8 if matched)
        """
        scores = {}

        # Get input script types
        input_types = set()
        for inp in transaction.inputs:
            if inp.script_type:
                input_types.add(inp.script_type)

        if not input_types:
            return scores

        # Check each output
        for i, output in enumerate(transaction.outputs):
            if output.script_type in input_types:
                scores[i] = 0.8

        return scores

    def _detect_optimal_change(self, transaction: Transaction) -> Dict[int, float]:
        """
        Check if any input was unnecessary (optimal change heuristic)
        
        If removing an input still covers all outputs, the larger output is likely payment.
        Returns: Dict mapping output index to score
        """
        scores = {}

        if len(transaction.outputs) != 2:
            return scores

        # Calculate total input and output values
        total_in = sum(inp.value for inp in transaction.inputs if inp.value)
        total_out = sum(out.value for out in transaction.outputs)

        if total_in == 0:
            return scores

        # Check if any single input could be removed
        for inp in transaction.inputs:
            if inp.value and (total_in - inp.value) >= total_out:
                # This input was unnecessary
                # The larger output is likely the payment
                if transaction.outputs[0].value > transaction.outputs[1].value:
                    scores[1] = 0.75  # Smaller output is change
                else:
                    scores[0] = 0.75  # Smaller output is change
                break

        return scores

    def _detect_wallet_pattern(self, transaction: Transaction) -> Dict[int, float]:
        """
        Detect wallet-specific patterns
        
        Some wallets always put change in a specific position or use BIP69 ordering.
        Returns: Dict mapping output index to score
        """
        scores = {}

        # BIP69 detection: lexicographic ordering
        # If outputs are sorted by value then script, might indicate BIP69 compliance
        outputs_sorted_by_value = sorted(transaction.outputs, key=lambda o: (o.value, o.script_pubkey))
        is_bip69 = outputs_sorted_by_value == transaction.outputs

        if is_bip69 and len(transaction.outputs) == 2:
            # In BIP69, change position is not fixed, but we can use other clues
            # Give slight preference to second output as change (common pattern)
            scores[1] = 0.55

        # Other wallet patterns could be added here
        # For now, return low confidence

        return scores

    def update_address_history(self, address: str, txid: str) -> None:
        """Add transaction to address history"""
        if address not in self.address_history:
            self.address_history[address] = []
        self.address_history[address].append(txid)




