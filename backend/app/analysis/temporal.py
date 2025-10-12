"""Temporal pattern analysis"""

import logging
from typing import List, Dict, Optional
from collections import defaultdict
from datetime import datetime

from app.models.analysis import TemporalPattern

logger = logging.getLogger(__name__)


class TemporalAnalyzer:
    """
    Analyze timing patterns in transactions
    
    Detects:
    - Burst activity (many transactions in short time)
    - Recurring time-of-day patterns
    - Coordinated activity across addresses
    """

    def __init__(self):
        self.burst_threshold = 600  # 10 minutes
        self.min_burst_size = 5

    def analyze_timing_correlation(
        self, timestamps: List[int], addresses: List[str]
    ) -> List[TemporalPattern]:
        """
        Analyze timing patterns across transactions
        
        Args:
            timestamps: List of transaction timestamps
            addresses: List of associated addresses
            
        Returns:
            List of detected temporal patterns
        """
        patterns = []

        # Detect burst activity
        burst_pattern = self._detect_burst_activity(timestamps)
        if burst_pattern:
            patterns.append(burst_pattern)

        # Detect time-of-day patterns
        tod_pattern = self._detect_time_of_day_pattern(timestamps)
        if tod_pattern:
            patterns.append(tod_pattern)

        return patterns

    def _detect_burst_activity(self, timestamps: List[int]) -> Optional[TemporalPattern]:
        """
        Detect burst of transactions in short time window
        
        Args:
            timestamps: Sorted list of transaction timestamps
            
        Returns:
            TemporalPattern if burst detected
        """
        if len(timestamps) < self.min_burst_size:
            return None

        sorted_ts = sorted(timestamps)

        # Look for windows where many transactions occur
        for i in range(len(sorted_ts) - self.min_burst_size + 1):
            window_end = i + self.min_burst_size - 1
            time_diff = sorted_ts[window_end] - sorted_ts[i]

            if time_diff <= self.burst_threshold:
                # Found burst
                burst_size = window_end - i + 1
                confidence = min(0.5 + (burst_size / 20), 0.9)

                return TemporalPattern(
                    pattern_type="burst_activity",
                    confidence=confidence,
                    description=f"{burst_size} transactions within {time_diff} seconds",
                    timestamps=sorted_ts[i : window_end + 1],
                )

        return None

    def _detect_time_of_day_pattern(self, timestamps: List[int]) -> Optional[TemporalPattern]:
        """
        Detect if transactions occur at similar times of day
        
        Args:
            timestamps: List of transaction timestamps
            
        Returns:
            TemporalPattern if recurring pattern detected
        """
        if len(timestamps) < 5:
            return None

        # Extract hour of day for each timestamp
        hours = [datetime.fromtimestamp(ts).hour for ts in timestamps]

        # Count transactions by hour
        hour_counts = defaultdict(int)
        for hour in hours:
            hour_counts[hour] += 1

        # Find most common hour
        most_common_hour = max(hour_counts, key=hour_counts.get)
        count = hour_counts[most_common_hour]

        # If >50% of transactions happen in same 2-hour window
        adjacent_hours = [most_common_hour - 1, most_common_hour, most_common_hour + 1]
        adjacent_count = sum(hour_counts[h % 24] for h in adjacent_hours)

        if adjacent_count > len(timestamps) * 0.5:
            confidence = min(0.5 + (adjacent_count / len(timestamps)), 0.8)

            return TemporalPattern(
                pattern_type="time_of_day",
                confidence=confidence,
                description=f"{adjacent_count}/{len(timestamps)} transactions occur around {most_common_hour}:00",
                timestamps=timestamps,
            )

        return None

    def calculate_transaction_velocity(self, timestamps: List[int]) -> float:
        """
        Calculate average time between transactions
        
        Args:
            timestamps: List of transaction timestamps
            
        Returns:
            Average seconds between transactions
        """
        if len(timestamps) < 2:
            return 0.0

        sorted_ts = sorted(timestamps)
        diffs = [sorted_ts[i + 1] - sorted_ts[i] for i in range(len(sorted_ts) - 1)]

        return sum(diffs) / len(diffs)


from typing import Optional  # Add this import at the top

