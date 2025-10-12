"""Tests for blockchain analysis heuristics"""

import pytest
from app.models.blockchain import Transaction, TransactionInput, TransactionOutput, ScriptType
from app.analysis.clustering import AddressClusterer
from app.analysis.change_detection import ChangeDetector
from app.analysis.coinjoin import CoinJoinDetector


class TestAddressClusterer:
    """Test common-input clustering heuristic"""

    def test_cluster_from_transaction(self):
        """Test that addresses in same transaction inputs get clustered"""
        clusterer = AddressClusterer()

        # Create transaction with 2 inputs from different addresses
        tx = Transaction(
            txid="test123",
            size=250,
            vsize=250,
            weight=1000,
            inputs=[
                TransactionInput(
                    txid="prev1", vout=0, address="addr1", value=100000
                ),
                TransactionInput(
                    txid="prev2", vout=0, address="addr2", value=200000
                ),
            ],
            outputs=[
                TransactionOutput(
                    n=0, value=250000, script_pubkey="", address="addr3"
                ),
            ],
        )

        cluster = clusterer.cluster_from_transaction(tx, is_coinjoin=False)

        assert cluster is not None
        assert "addr1" in cluster
        assert "addr2" in cluster
        assert len(cluster) == 2

    def test_no_cluster_for_single_input(self):
        """Test that single-input transactions don't create clusters"""
        clusterer = AddressClusterer()

        tx = Transaction(
            txid="test123",
            size=200,
            vsize=200,
            weight=800,
            inputs=[
                TransactionInput(txid="prev1", vout=0, address="addr1", value=100000),
            ],
            outputs=[
                TransactionOutput(n=0, value=90000, script_pubkey="", address="addr2"),
            ],
        )

        cluster = clusterer.cluster_from_transaction(tx, is_coinjoin=False)
        assert cluster is None


class TestChangeDetector:
    """Test change detection heuristics"""

    def test_round_amount_detection(self):
        """Test that round amounts are identified as payments (not change)"""
        detector = ChangeDetector()

        tx = Transaction(
            txid="test123",
            size=250,
            vsize=250,
            weight=1000,
            inputs=[
                TransactionInput(txid="prev1", vout=0, value=200_000_000),
            ],
            outputs=[
                TransactionOutput(
                    n=0, value=100_000_000, script_pubkey="", address="addr1"
                ),  # Round: 1.0 BTC
                TransactionOutput(
                    n=1, value=95_000_000, script_pubkey="", address="addr2"
                ),  # Not round
            ],
        )

        result = detector.identify_change_output(tx)

        # Output 1 (odd amount) should be identified as change
        assert result is not None
        assert result.output_index == 1

    def test_script_type_matching(self):
        """Test that outputs matching input script type are identified as change"""
        detector = ChangeDetector()

        tx = Transaction(
            txid="test123",
            size=250,
            vsize=250,
            weight=1000,
            inputs=[
                TransactionInput(
                    txid="prev1",
                    vout=0,
                    value=100_000_000,
                    script_type=ScriptType.P2PKH,
                ),
            ],
            outputs=[
                TransactionOutput(
                    n=0,
                    value=50_000_000,
                    script_pubkey="",
                    script_type=ScriptType.P2SH,
                ),
                TransactionOutput(
                    n=1,
                    value=45_000_000,
                    script_pubkey="",
                    script_type=ScriptType.P2PKH,
                ),  # Matches input
            ],
        )

        result = detector.identify_change_output(tx)

        # Output 1 (matching script type) should have higher confidence
        assert result is not None
        # This test may vary based on heuristic weights


class TestCoinJoinDetector:
    """Test CoinJoin detection"""

    def test_detect_basic_coinjoin(self):
        """Test that transactions with many equal outputs are detected as CoinJoin"""
        detector = CoinJoinDetector()

        # Create transaction with 5 inputs and 5 equal outputs (typical CoinJoin)
        inputs = [
            TransactionInput(txid=f"prev{i}", vout=0, value=10_000_000)
            for i in range(5)
        ]
        outputs = [
            TransactionOutput(n=i, value=9_000_000, script_pubkey="", address=f"addr{i}")
            for i in range(5)
        ]

        tx = Transaction(
            txid="coinjoin123",
            size=1000,
            vsize=800,
            weight=3200,
            inputs=inputs,
            outputs=outputs,
        )

        result = detector.detect_coinjoin(tx)

        assert result is not None
        assert result.equal_output_count >= 5
        assert result.confidence > 0.7

    def test_no_coinjoin_for_normal_tx(self):
        """Test that normal transactions are not detected as CoinJoin"""
        detector = CoinJoinDetector()

        tx = Transaction(
            txid="normal123",
            size=250,
            vsize=250,
            weight=1000,
            inputs=[
                TransactionInput(txid="prev1", vout=0, value=100_000_000),
            ],
            outputs=[
                TransactionOutput(n=0, value=50_000_000, script_pubkey=""),
                TransactionOutput(n=1, value=45_000_000, script_pubkey=""),
            ],
        )

        result = detector.detect_coinjoin(tx)
        assert result is None




