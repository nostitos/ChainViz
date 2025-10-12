"""Address clustering using common-input heuristic"""

import logging
from typing import Set, Dict, List, Optional
import networkx as nx

from app.models.blockchain import Transaction
from app.models.analysis import ClusterInfo, HeuristicType

logger = logging.getLogger(__name__)


class AddressClusterer:
    """
    Cluster addresses using common-input ownership heuristic
    
    If multiple addresses appear as inputs in the same transaction,
    they likely belong to the same entity (confidence: 0.9).
    
    Exception: CoinJoin transactions break this heuristic.
    """

    def __init__(self):
        self.graph = nx.Graph()
        self.clusters: Dict[str, Set[str]] = {}
        self.address_to_cluster: Dict[str, str] = {}

    def cluster_from_transaction(
        self, transaction: Transaction, is_coinjoin: bool = False
    ) -> Optional[Set[str]]:
        """
        Extract address cluster from transaction inputs
        
        Args:
            transaction: Transaction to analyze
            is_coinjoin: If True, skip clustering (CoinJoins break this heuristic)
            
        Returns:
            Set of addresses that should be clustered together, or None if CoinJoin
        """
        if is_coinjoin:
            logger.debug(f"Skipping clustering for CoinJoin transaction: {transaction.txid}")
            return None

        # Get all input addresses
        input_addresses = set()
        for inp in transaction.inputs:
            if inp.address:
                input_addresses.add(inp.address)

        # Need at least 2 inputs to cluster
        if len(input_addresses) < 2:
            return None

        # Add edges between all input addresses
        addresses_list = list(input_addresses)
        for i in range(len(addresses_list)):
            for j in range(i + 1, len(addresses_list)):
                self.graph.add_edge(addresses_list[i], addresses_list[j])

        return input_addresses

    def build_clusters(self) -> Dict[str, ClusterInfo]:
        """
        Build clusters from the graph using connected components
        
        Returns:
            Dict mapping cluster_id to ClusterInfo
        """
        clusters = {}

        # Find connected components
        for component in nx.connected_components(self.graph):
            if len(component) < 2:
                continue

            cluster_id = self._generate_cluster_id(component)
            addresses = list(component)

            # Update mappings
            for address in addresses:
                self.address_to_cluster[address] = cluster_id

            clusters[cluster_id] = ClusterInfo(
                cluster_id=cluster_id,
                addresses=addresses,
                confidence=0.9,  # High confidence for common-input clustering
                heuristic=HeuristicType.COMMON_INPUT,
                tx_count=0,  # Would need to track this
            )

        self.clusters = {cid: set(info.addresses) for cid, info in clusters.items()}
        return clusters

    def get_cluster_id(self, address: str) -> Optional[str]:
        """
        Get cluster ID for an address
        
        Args:
            address: Bitcoin address
            
        Returns:
            Cluster ID if address is in a cluster, None otherwise
        """
        return self.address_to_cluster.get(address)

    def get_cluster_addresses(self, cluster_id: str) -> Set[str]:
        """
        Get all addresses in a cluster
        
        Args:
            cluster_id: Cluster identifier
            
        Returns:
            Set of addresses in the cluster
        """
        return self.clusters.get(cluster_id, set())

    def merge_clusters(self, cluster_id1: str, cluster_id2: str) -> str:
        """
        Merge two clusters
        
        Args:
            cluster_id1: First cluster ID
            cluster_id2: Second cluster ID
            
        Returns:
            ID of merged cluster
        """
        if cluster_id1 not in self.clusters or cluster_id2 not in self.clusters:
            return cluster_id1

        # Merge smaller into larger
        if len(self.clusters[cluster_id1]) >= len(self.clusters[cluster_id2]):
            main_id, merge_id = cluster_id1, cluster_id2
        else:
            main_id, merge_id = cluster_id2, cluster_id1

        # Merge addresses
        self.clusters[main_id].update(self.clusters[merge_id])
        del self.clusters[merge_id]

        # Update address mappings
        for address in self.clusters[main_id]:
            self.address_to_cluster[address] = main_id

        return main_id

    def is_clustered(self, address1: str, address2: str) -> bool:
        """
        Check if two addresses are in the same cluster
        
        Args:
            address1: First address
            address2: Second address
            
        Returns:
            True if addresses are clustered together
        """
        cluster1 = self.get_cluster_id(address1)
        cluster2 = self.get_cluster_id(address2)

        return cluster1 is not None and cluster1 == cluster2

    @staticmethod
    def _generate_cluster_id(addresses: Set[str]) -> str:
        """Generate unique cluster ID from addresses"""
        import hashlib

        # Sort addresses for consistent ID
        sorted_addresses = sorted(addresses)
        combined = "".join(sorted_addresses)
        hash_digest = hashlib.sha256(combined.encode()).hexdigest()

        return f"cluster_{hash_digest[:16]}"

    def get_statistics(self) -> Dict[str, int]:
        """
        Get clustering statistics
        
        Returns:
            Dict with statistics
        """
        return {
            "total_addresses": len(self.address_to_cluster),
            "total_clusters": len(self.clusters),
            "largest_cluster": max((len(addrs) for addrs in self.clusters.values()), default=0),
            "average_cluster_size": (
                sum(len(addrs) for addrs in self.clusters.values()) / len(self.clusters)
                if self.clusters
                else 0
            ),
        }




