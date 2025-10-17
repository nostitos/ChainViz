"""Unified UTXO tracing orchestrator combining all heuristics"""

import logging
from typing import List, Dict, Set, Optional, Tuple
import networkx as nx

from app.models.blockchain import Transaction
from app.models.api import NodeData, EdgeData, TraceGraphResponse
from app.models.analysis import HeuristicType, ClusterInfo, CoinJoinInfo, PeelChainHop
from app.analysis.clustering import AddressClusterer
from app.analysis.change_detection import ChangeDetector
from app.analysis.peel_chain import PeelChainDetector
from app.analysis.coinjoin import CoinJoinDetector
from app.analysis.temporal import TemporalAnalyzer
from app.analysis.amount_patterns import AmountPatternAnalyzer

logger = logging.getLogger(__name__)


class TraceOrchestrator:
    """
    Orchestrate UTXO backward tracing with all heuristics
    
    This is the main analysis engine that:
    1. Fetches transactions recursively
    2. Applies all heuristics (clustering, change detection, peel chains, CoinJoin)
    3. Builds annotated graph with confidence scores
    4. Stops at CoinJoins or max depth
    """

    def __init__(self, blockchain_service):
        self.blockchain_service = blockchain_service
        self.clusterer = AddressClusterer()
        self.change_detector = ChangeDetector()
        self.peel_detector = PeelChainDetector(self.change_detector)
        self.coinjoin_detector = CoinJoinDetector()
        self.temporal_analyzer = TemporalAnalyzer()
        self.amount_analyzer = AmountPatternAnalyzer()

        self.graph = nx.DiGraph()
        self.visited_txids: Set[str] = set()
        self.visited_addresses: Set[str] = set()
        self.coinjoins: List[CoinJoinInfo] = []
        self.peel_chains: List[List[PeelChainHop]] = []

    async def trace_utxo_backward(
        self,
        txid: str,
        vout: int,
        max_depth: int = 20,
        include_coinjoin: bool = False,
        confidence_threshold: float = 0.5,
    ) -> TraceGraphResponse:
        """
        Trace a UTXO backward through transaction history
        
        Args:
            txid: Starting transaction ID
            vout: Output index
            max_depth: Maximum hops to trace
            include_coinjoin: Whether to continue tracing through CoinJoins
            confidence_threshold: Minimum confidence for links
            
        Returns:
            TraceGraphResponse with complete graph and analysis
        """
        logger.info(f"Starting UTXO trace: {txid}:{vout}, max_depth={max_depth}")

        # Reset state
        self.graph.clear()
        self.visited_txids.clear()
        self.visited_addresses.clear()
        self.coinjoins.clear()
        self.peel_chains.clear()

        # Fetch starting transaction
        start_tx = await self.blockchain_service.fetch_transaction(txid)

        # Trace recursively
        await self._trace_recursive(
            start_tx, vout, depth=0, max_depth=max_depth, include_coinjoin=include_coinjoin
        )

        # Build clusters from graph
        clusters = self.clusterer.build_clusters()

        # Detect peel chains
        await self._detect_peel_chains()

        # Convert graph to response format
        nodes, edges = self._build_graph_data(confidence_threshold)

        # Count hops reached (backward only in this function)
        hops_reached = self._calculate_max_depth()

        logger.info(
            f"Trace complete: {len(nodes)} nodes, {len(edges)} edges, {len(clusters)} clusters"
        )

        return TraceGraphResponse(
            nodes=nodes,
            edges=edges,
            clusters=list(clusters.values()),
            coinjoins=self.coinjoins,
            peel_chains=self.peel_chains,
            start_txid=txid,
            start_vout=vout,
            hops_before_reached=hops_reached,
            hops_after_reached=0,  # This function only traces backward
            total_nodes=len(nodes),
            total_edges=len(edges),
        )

    async def _trace_recursive(
        self,
        transaction: Transaction,
        output_index: Optional[int],
        depth: int,
        max_depth: int,
        include_coinjoin: bool,
    ) -> None:
        """
        Recursively trace transaction inputs
        
        Args:
            transaction: Current transaction
            output_index: Output we're tracing (None for full TX analysis)
            depth: Current depth
            max_depth: Maximum depth
            include_coinjoin: Continue through CoinJoins
        """
        if depth >= max_depth:
            logger.debug(f"Max depth reached: {depth}")
            return

        if transaction.txid in self.visited_txids:
            logger.debug(f"Already visited: {transaction.txid}")
            return

        self.visited_txids.add(transaction.txid)

        # Add transaction node
        self.graph.add_node(
            f"tx_{transaction.txid}",
            type="transaction",
            txid=transaction.txid,
            depth=depth,
            timestamp=transaction.timestamp,
        )

        # Check if CoinJoin
        coinjoin_info = self.coinjoin_detector.detect_coinjoin(transaction)
        is_coinjoin = coinjoin_info is not None

        if is_coinjoin:
            self.coinjoins.append(coinjoin_info)
            logger.info(f"CoinJoin detected: {transaction.txid} ({coinjoin_info.coinjoin_type})")

            if not include_coinjoin:
                logger.info("Stopping trace at CoinJoin (include_coinjoin=False)")
                return

        # Cluster input addresses (unless CoinJoin)
        if not is_coinjoin:
            self.clusterer.cluster_from_transaction(transaction, is_coinjoin=False)

        # Identify change output
        change_result = self.change_detector.identify_change_output(transaction)

        # Process outputs
        for i, output in enumerate(transaction.outputs):
            if output.address:
                self.visited_addresses.add(output.address)

                # Add address node
                address_node_id = f"addr_{output.address}"
                if not self.graph.has_node(address_node_id):
                    self.graph.add_node(
                        address_node_id,
                        type="address",
                        address=output.address,
                        is_change=(change_result and i == change_result.output_index),
                    )

                # Add edge from transaction to address
                self.graph.add_edge(
                    f"tx_{transaction.txid}",
                    address_node_id,
                    amount=output.value,
                    vout=i,
                    confidence=1.0,  # Output is certain
                )

        # Process inputs (trace backward)
        for inp in transaction.inputs:
            if not inp.txid or inp.txid == "0" * 64:
                # Coinbase transaction
                continue

            # Add edge from input address to transaction
            if inp.address:
                address_node_id = f"addr_{inp.address}"
                if not self.graph.has_node(address_node_id):
                    self.graph.add_node(
                        address_node_id, type="address", address=inp.address
                    )

                # Determine confidence based on clustering/heuristics
                confidence = 0.9 if not is_coinjoin else 0.3

                self.graph.add_edge(
                    address_node_id,
                    f"tx_{transaction.txid}",
                    amount=inp.value if inp.value else 0,
                    txid=inp.txid,
                    vout=inp.vout,
                    confidence=confidence,
                    heuristic=HeuristicType.COMMON_INPUT if not is_coinjoin else None,
                )

            # Fetch and trace input transaction
            try:
                input_tx = await self.blockchain_service.fetch_transaction(inp.txid)
                await self._trace_recursive(
                    input_tx,
                    inp.vout,
                    depth + 1,
                    max_depth,
                    include_coinjoin,
                )
            except Exception as e:
                logger.warning(f"Failed to fetch input transaction {inp.txid}: {e}")
                continue

    async def _detect_peel_chains(self) -> None:
        """Detect peel chains in the traced graph"""
        # Look for transactions that might start peel chains
        for node_id, data in self.graph.nodes(data=True):
            if data.get("type") != "transaction":
                continue

            txid = data.get("txid")
            if not txid:
                continue

            try:
                tx = await self.blockchain_service.fetch_transaction(txid)

                # Check if this could be a peel chain start
                if len(tx.outputs) == 2:
                    chain = await self.peel_detector.detect_peel_chain(
                        tx,
                        self.blockchain_service.fetch_transaction,
                        max_hops=50,
                        min_confidence=0.7,
                    )

                    if len(chain) >= 3:  # Minimum 3 hops to be interesting
                        self.peel_chains.append(chain)
                        logger.info(f"Peel chain detected: {len(chain)} hops from {txid}")

            except Exception as e:
                logger.debug(f"Failed to check peel chain for {txid}: {e}")
                continue

    def _build_graph_data(
        self, confidence_threshold: float
    ) -> Tuple[List[NodeData], List[EdgeData]]:
        """
        Convert NetworkX graph to API response format
        
        Args:
            confidence_threshold: Minimum confidence for edges
            
        Returns:
            (nodes, edges) lists
        """
        nodes = []
        edges = []

        # Build nodes
        for node_id, data in self.graph.nodes(data=True):
            node_type = data.get("type", "unknown")

            if node_type == "address":
                cluster_id = self.clusterer.get_cluster_id(data.get("address"))

                nodes.append(
                    NodeData(
                        id=node_id,
                        label=data.get("address", "Unknown"),
                        type="address",
                        metadata={
                            "address": data.get("address"),
                            "is_change": data.get("is_change", False),
                            "cluster_id": cluster_id,
                        },
                    )
                )

            elif node_type == "transaction":
                nodes.append(
                    NodeData(
                        id=node_id,
                        label=data.get("txid", "Unknown")[:16] + "...",
                        type="transaction",
                        metadata={
                            "txid": data.get("txid"),
                            "depth": data.get("depth", 0),
                            "timestamp": data.get("timestamp"),
                        },
                    )
                )

        # Build edges
        for source, target, data in self.graph.edges(data=True):
            confidence = data.get("confidence", 1.0)

            if confidence < confidence_threshold:
                continue  # Skip low-confidence edges

            edges.append(
                EdgeData(
                    source=source,
                    target=target,
                    amount=data.get("amount", 0),
                    txid=data.get("txid"),
                    confidence=confidence,
                    heuristic=data.get("heuristic"),
                    metadata={k: v for k, v in data.items() if k not in ["amount", "confidence"]},
                )
            )

        return nodes, edges

    def _calculate_max_depth(self) -> int:
        """Calculate maximum depth reached in trace"""
        max_depth = 0

        for node_id, data in self.graph.nodes(data=True):
            if data.get("type") == "transaction":
                depth = data.get("depth", 0)
                max_depth = max(max_depth, depth)

        return max_depth




