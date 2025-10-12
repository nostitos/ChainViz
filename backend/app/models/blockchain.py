"""Blockchain data models"""

from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field


class ScriptType(str, Enum):
    """Bitcoin script types"""

    P2PKH = "p2pkh"  # Pay to Public Key Hash
    P2SH = "p2sh"  # Pay to Script Hash
    P2WPKH = "p2wpkh"  # Pay to Witness Public Key Hash
    P2WSH = "p2wsh"  # Pay to Witness Script Hash
    P2TR = "p2tr"  # Pay to Taproot
    UNKNOWN = "unknown"


class TransactionInput(BaseModel):
    """Transaction input"""

    txid: str = Field(..., description="Previous transaction ID")
    vout: int = Field(..., description="Output index in previous transaction")
    script_sig: str = Field(default="", description="Script signature (hex)")
    sequence: int = Field(default=0xFFFFFFFF, description="Sequence number")
    witness: List[str] = Field(default_factory=list, description="Witness data")
    address: Optional[str] = Field(None, description="Resolved address")
    value: Optional[int] = Field(None, description="Value in satoshis")
    script_type: Optional[ScriptType] = Field(None, description="Script type")


class TransactionOutput(BaseModel):
    """Transaction output"""

    n: int = Field(..., description="Output index")
    value: int = Field(..., description="Value in satoshis")
    script_pubkey: str = Field(..., description="Script public key (hex)")
    address: Optional[str] = Field(None, description="Recipient address")
    script_type: Optional[ScriptType] = Field(None, description="Script type")
    spent: bool = Field(default=False, description="Whether this output is spent")
    spending_txid: Optional[str] = Field(None, description="Transaction that spent this output")


class Transaction(BaseModel):
    """Bitcoin transaction"""

    txid: str = Field(..., description="Transaction ID")
    version: int = Field(default=1, description="Transaction version")
    locktime: int = Field(default=0, description="Lock time")
    size: int = Field(..., description="Transaction size in bytes")
    vsize: int = Field(..., description="Virtual transaction size")
    weight: int = Field(..., description="Transaction weight")
    inputs: List[TransactionInput] = Field(..., description="Transaction inputs")
    outputs: List[TransactionOutput] = Field(..., description="Transaction outputs")
    block_height: Optional[int] = Field(None, description="Block height (None if unconfirmed)")
    block_hash: Optional[str] = Field(None, description="Block hash")
    timestamp: Optional[int] = Field(None, description="Block timestamp")
    confirmations: int = Field(default=0, description="Number of confirmations")
    fee: Optional[int] = Field(None, description="Transaction fee in satoshis")


class UTXO(BaseModel):
    """Unspent Transaction Output"""

    txid: str = Field(..., description="Transaction ID")
    vout: int = Field(..., description="Output index")
    value: int = Field(..., description="Value in satoshis")
    address: str = Field(..., description="Address")
    script_type: Optional[ScriptType] = Field(None, description="Script type")
    height: Optional[int] = Field(None, description="Block height")
    confirmations: int = Field(default=0, description="Number of confirmations")


class Address(BaseModel):
    """Bitcoin address information"""

    address: str = Field(..., description="Bitcoin address")
    balance: int = Field(default=0, description="Current balance in satoshis")
    total_received: int = Field(default=0, description="Total received in satoshis")
    total_sent: int = Field(default=0, description="Total sent in satoshis")
    tx_count: int = Field(default=0, description="Number of transactions")
    utxos: List[UTXO] = Field(default_factory=list, description="Unspent outputs")
    first_seen: Optional[int] = Field(None, description="First transaction timestamp")
    last_seen: Optional[int] = Field(None, description="Last transaction timestamp")
    script_type: Optional[ScriptType] = Field(None, description="Address script type")


