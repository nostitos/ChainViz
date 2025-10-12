"""API request and response models"""

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from .blockchain import Transaction, UTXO
from .analysis import (
    CoinJoinInfo,
    PeelChainHop,
    ClusterInfo,
    HeuristicType,
    TemporalPattern,
    AmountAnomaly,
)


# Request Models


class TraceUTXORequest(BaseModel):
    """Request to trace a UTXO backward"""

    txid: str = Field(..., description="Transaction ID")
    vout: int = Field(..., ge=0, description="Output index")
    max_depth: int = Field(default=20, ge=1, le=50, description="Maximum trace depth")
    include_coinjoin: bool = Field(
        default=False, description="Whether to trace through CoinJoin transactions"
    )
    confidence_threshold: float = Field(
        default=0.5, ge=0.0, le=1.0, description="Minimum confidence for links"
    )


class BulkAddressImportRequest(BaseModel):
    """Request to import multiple addresses"""

    addresses: List[str] = Field(..., min_length=1, max_length=1000, description="List of addresses")
    fetch_history: bool = Field(default=True, description="Fetch transaction history")


class XPubDeriveRequest(BaseModel):
    """Request to derive addresses from xpub"""

    xpub: str = Field(..., description="Extended public key")
    derivation_path: str = Field(
        default="m/0/0", description="Derivation path (e.g., m/0/0, m/1/0)"
    )
    start_index: int = Field(default=0, ge=0, description="Start index for derivation")
    count: int = Field(default=20, ge=1, le=10000, description="Number of addresses to derive")
    include_change: bool = Field(
        default=False, description="Include change addresses (m/1/x path)"
    )


class PeelChainRequest(BaseModel):
    """Request to analyze peel chain"""

    start_txid: str = Field(..., description="Starting transaction ID")
    max_hops: int = Field(default=100, ge=1, le=1000, description="Maximum number of hops")
    min_confidence: float = Field(
        default=0.7, ge=0.0, le=1.0, description="Minimum confidence per hop"
    )


# Response Models


class NodeData(BaseModel):
    """Graph node data"""

    id: str = Field(..., description="Unique node identifier")
    label: str = Field(..., description="Display label")
    type: str = Field(..., description="Node type (address, transaction, cluster)")
    value: Optional[int] = Field(None, description="Value in satoshis (if applicable)")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")


class EdgeData(BaseModel):
    """Graph edge data"""

    source: str = Field(..., description="Source node ID")
    target: str = Field(..., description="Target node ID")
    amount: int = Field(..., description="Amount transferred in satoshis")
    txid: Optional[str] = Field(None, description="Transaction ID")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Link confidence")
    heuristic: Optional[HeuristicType] = Field(None, description="Primary heuristic used")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")


class TraceGraphResponse(BaseModel):
    """Response for UTXO trace"""

    nodes: List[NodeData] = Field(..., description="Graph nodes")
    edges: List[EdgeData] = Field(..., description="Graph edges")
    clusters: List[ClusterInfo] = Field(default_factory=list, description="Identified clusters")
    coinjoins: List[CoinJoinInfo] = Field(
        default_factory=list, description="Detected CoinJoin transactions"
    )
    peel_chains: List[List[PeelChainHop]] = Field(
        default_factory=list, description="Detected peel chains"
    )
    start_txid: str = Field(..., description="Starting transaction ID")
    start_vout: int = Field(..., description="Starting output index")
    depth_reached: int = Field(..., description="Maximum depth reached")
    total_nodes: int = Field(..., description="Total number of nodes")
    total_edges: int = Field(..., description="Total number of edges")


class AddressResponse(BaseModel):
    """Response for address lookup"""

    address: str = Field(..., description="Bitcoin address")
    balance: int = Field(..., description="Current balance in satoshis")
    total_received: int = Field(..., description="Total received in satoshis")
    total_sent: int = Field(..., description="Total sent in satoshis")
    tx_count: int = Field(..., description="Number of transactions")
    utxos: List[UTXO] = Field(..., description="Unspent outputs")
    transactions: List[str] = Field(..., description="Transaction IDs")
    cluster_id: Optional[str] = Field(None, description="Cluster ID if clustered")
    first_seen: Optional[int] = Field(None, description="First transaction timestamp")
    last_seen: Optional[int] = Field(None, description="Last transaction timestamp")


class TransactionResponse(BaseModel):
    """Response for transaction lookup"""

    transaction: Transaction = Field(..., description="Transaction details")
    change_output: Optional[int] = Field(None, description="Identified change output index")
    change_confidence: Optional[float] = Field(None, description="Change detection confidence")
    coinjoin_info: Optional[CoinJoinInfo] = Field(None, description="CoinJoin information if detected")
    cluster_inputs: Optional[str] = Field(None, description="Cluster ID for input addresses")


class PeelChainResponse(BaseModel):
    """Response for peel chain analysis"""

    chain: List[PeelChainHop] = Field(..., description="Peel chain hops")
    total_hops: int = Field(..., description="Total number of hops")
    total_peeled: int = Field(..., description="Total amount peeled in satoshis")
    average_hop_time: Optional[float] = Field(None, description="Average time between hops (seconds)")
    pattern_confidence: float = Field(..., description="Overall pattern confidence")


class ClusterResponse(BaseModel):
    """Response for cluster lookup"""

    cluster: ClusterInfo = Field(..., description="Cluster information")
    total_balance: int = Field(..., description="Total balance across all addresses")
    total_received: int = Field(..., description="Total received across all addresses")
    total_sent: int = Field(..., description="Total sent across all addresses")


class BulkAddressResponse(BaseModel):
    """Response for bulk address import"""

    addresses: List[AddressResponse] = Field(..., description="Address information")
    total_balance: int = Field(..., description="Combined balance in satoshis")
    clusters_identified: int = Field(..., description="Number of clusters identified")


class XPubDeriveResponse(BaseModel):
    """Response for xpub derivation"""

    xpub: str = Field(..., description="Extended public key")
    addresses: List[str] = Field(..., description="Derived addresses")
    derivation_paths: List[str] = Field(..., description="Derivation path for each address")
    address_info: Optional[List[AddressResponse]] = Field(
        None, description="Address details if history fetched"
    )


class BlockNotification(BaseModel):
    """WebSocket notification for new block"""

    height: int = Field(..., description="Block height")
    hash: str = Field(..., description="Block hash")
    timestamp: int = Field(..., description="Block timestamp")
    tx_count: int = Field(..., description="Number of transactions")


