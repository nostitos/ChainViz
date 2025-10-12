"""Analysis models for heuristics and patterns"""

from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class HeuristicType(str, Enum):
    """Types of heuristics used in analysis"""

    COMMON_INPUT = "common_input"
    ADDRESS_REUSE = "address_reuse"
    ROUND_AMOUNT = "round_amount"
    SCRIPT_TYPE_MATCH = "script_type_match"
    OPTIMAL_CHANGE = "optimal_change"
    WALLET_FINGERPRINT = "wallet_fingerprint"
    COINJOIN = "coinjoin"
    PEEL_CHAIN = "peel_chain"
    TEMPORAL = "temporal"
    AMOUNT_PATTERN = "amount_pattern"


class ChangeDetectionResult(BaseModel):
    """Result of change detection analysis"""

    output_index: int = Field(..., description="Index of identified change output")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence score")
    heuristics: Dict[HeuristicType, float] = Field(
        ..., description="Individual heuristic scores"
    )
    reasoning: str = Field(..., description="Human-readable explanation")


class CoinJoinType(str, Enum):
    """Types of CoinJoin implementations"""

    WASABI = "wasabi"
    WHIRLPOOL = "whirlpool"
    JOINMARKET = "joinmarket"
    GENERIC = "generic"
    UNKNOWN = "unknown"


class CoinJoinInfo(BaseModel):
    """Information about detected CoinJoin transaction"""

    coinjoin_type: CoinJoinType = Field(..., description="Type of CoinJoin")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Detection confidence")
    num_participants: Optional[int] = Field(None, description="Estimated number of participants")
    equal_output_value: Optional[int] = Field(None, description="Equal output value in satoshis")
    equal_output_count: int = Field(..., description="Number of equal-valued outputs")
    change_outputs: List[int] = Field(
        default_factory=list, description="Indices of likely change outputs"
    )
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")


class PeelChainHop(BaseModel):
    """Single hop in a peel chain"""

    hop_number: int = Field(..., description="Sequential hop number")
    txid: str = Field(..., description="Transaction ID")
    payment_output_index: int = Field(..., description="Index of payment output")
    payment_value: int = Field(..., description="Payment value in satoshis")
    payment_address: Optional[str] = Field(None, description="Payment destination address")
    change_output_index: int = Field(..., description="Index of change output")
    change_value: int = Field(..., description="Change value in satoshis")
    change_address: Optional[str] = Field(None, description="Change address")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence this is a peel hop")
    timestamp: Optional[int] = Field(None, description="Transaction timestamp")


class ClusterInfo(BaseModel):
    """Information about an address cluster"""

    cluster_id: str = Field(..., description="Unique cluster identifier")
    addresses: List[str] = Field(..., description="Addresses in this cluster")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Clustering confidence")
    heuristic: HeuristicType = Field(..., description="Primary heuristic used")
    tx_count: int = Field(default=0, description="Number of transactions involving cluster")
    first_seen: Optional[int] = Field(None, description="First transaction timestamp")
    last_seen: Optional[int] = Field(None, description="Last transaction timestamp")


class TemporalPattern(BaseModel):
    """Temporal analysis pattern"""

    pattern_type: str = Field(..., description="Type of temporal pattern")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Pattern confidence")
    description: str = Field(..., description="Pattern description")
    timestamps: List[int] = Field(..., description="Related timestamps")


class AmountAnomaly(BaseModel):
    """Amount-based pattern anomaly"""

    anomaly_type: str = Field(..., description="Type of anomaly")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Detection confidence")
    description: str = Field(..., description="Anomaly description")
    values: List[int] = Field(..., description="Related values in satoshis")
    addresses: List[str] = Field(..., description="Related addresses")


