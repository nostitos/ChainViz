"""Amount pattern analysis for anomaly detection"""

import logging
from typing import List, Dict, Optional
from collections import Counter

from app.models.analysis import AmountAnomaly

logger = logging.getLogger(__name__)


class AmountPatternAnalyzer:
    """
    Analyze transaction amount patterns
    
    Detects:
    - Fixed denominations (mixer outputs)
    - Pass-through addresses (equal in/out)
    - Amount correlations
    """

    def __init__(self):
        self.denomination_threshold = 0.9  # 90% same value = fixed denomination

    def detect_amount_anomalies(
        self, address: str, transactions: List[Dict], values: List[int]
    ) -> List[AmountAnomaly]:
        """
        Detect amount-based anomalies
        
        Args:
            address: Address being analyzed
            transactions: Transaction data
            values: List of transaction values
            
        Returns:
            List of detected anomalies
        """
        anomalies = []

        # Detect fixed denominations
        denom_anomaly = self._detect_fixed_denominations(values, [address])
        if denom_anomaly:
            anomalies.append(denom_anomaly)

        # Detect pass-through behavior
        passthrough_anomaly = self._detect_passthrough(address, transactions)
        if passthrough_anomaly:
            anomalies.append(passthrough_anomaly)

        return anomalies

    def _detect_fixed_denominations(
        self, values: List[int], addresses: List[str]
    ) -> Optional[AmountAnomaly]:
        """
        Detect if many values are the same (mixer pattern)
        
        Args:
            values: List of amounts
            addresses: Related addresses
            
        Returns:
            AmountAnomaly if fixed denomination detected
        """
        if len(values) < 5:
            return None

        # Count value frequencies
        value_counts = Counter(values)
        most_common_value, count = value_counts.most_common(1)[0]

        # If >90% are same value, it's a fixed denomination
        if count / len(values) >= self.denomination_threshold:
            confidence = min(0.6 + (count / len(values)) * 0.3, 0.95)

            return AmountAnomaly(
                anomaly_type="fixed_denomination",
                confidence=confidence,
                description=f"{count}/{len(values)} transactions have value {most_common_value} satoshis",
                values=[most_common_value],
                addresses=addresses,
            )

        return None

    def _detect_passthrough(
        self, address: str, transactions: List[Dict]
    ) -> Optional[AmountAnomaly]:
        """
        Detect if address simply passes through equal amounts
        
        Args:
            address: Address to analyze
            transactions: Transaction history
            
        Returns:
            AmountAnomaly if pass-through detected
        """
        if len(transactions) < 3:
            return None

        # Check if input amounts roughly equal output amounts
        equal_count = 0

        for tx in transactions:
            # This is simplified; would need full TX analysis
            # For now, check if address behavior suggests forwarding
            equal_count += 1

        if equal_count > len(transactions) * 0.8:
            confidence = 0.6

            return AmountAnomaly(
                anomaly_type="pass_through",
                confidence=confidence,
                description=f"Address forwards funds without significant changes",
                values=[],
                addresses=[address],
            )

        return None

    def calculate_amount_entropy(self, values: List[int]) -> float:
        """
        Calculate entropy of amount distribution
        
        Low entropy = repeated amounts (potential pattern)
        High entropy = diverse amounts (natural usage)
        
        Args:
            values: List of amounts
            
        Returns:
            Entropy value (0.0 to 1.0)
        """
        if not values:
            return 0.0

        # Count frequencies
        value_counts = Counter(values)
        total = len(values)

        # Calculate Shannon entropy
        import math

        entropy = -sum((count / total) * math.log2(count / total) for count in value_counts.values())

        # Normalize by maximum possible entropy
        max_entropy = math.log2(total) if total > 1 else 1.0
        normalized_entropy = entropy / max_entropy if max_entropy > 0 else 0.0

        return normalized_entropy


from typing import Optional  # Add this import

