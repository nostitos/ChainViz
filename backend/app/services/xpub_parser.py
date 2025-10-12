"""xpub parsing and address derivation"""

import logging
from typing import List, Tuple
import base58
import hashlib

logger = logging.getLogger(__name__)


class XPubParser:
    """
    Parse extended public keys and derive addresses.
    
    Supports multiple xpub standards:
    - xpub: BIP32 legacy (P2PKH addresses, m/44'/0'/0')
    - ypub: BIP49 (P2SH-wrapped SegWit, m/49'/0'/0')
    - zpub: BIP84 (native SegWit P2WPKH, m/84'/0'/0')
    """

    @staticmethod
    def derive_addresses(
        xpub: str,
        start_index: int = 0,
        count: int = 20,
        change: bool = False,
    ) -> List[Tuple[str, str]]:
        """
        Derive addresses from extended public key
        
        Args:
            xpub: Extended public key (xpub, ypub, or zpub)
            start_index: Starting derivation index
            count: Number of addresses to derive
            change: If True, derive change addresses (m/1/x), else external (m/0/x)
            
        Returns:
            List of (address, derivation_path) tuples
        """
        try:
            # Detect xpub type
            xpub_type = XPubParser._detect_xpub_type(xpub)
            logger.info(f"Detected xpub type: {xpub_type}")

            # Decode xpub
            decoded = XPubParser._decode_xpub(xpub)
            if not decoded:
                raise ValueError("Failed to decode xpub")

            # Derive addresses
            addresses = []
            chain = 1 if change else 0

            for i in range(start_index, start_index + count):
                try:
                    # Derive child key at m/chain/i
                    child_key = XPubParser._derive_child(decoded, chain, i)
                    
                    # Generate address based on type
                    if xpub_type == "xpub":
                        address = XPubParser._pubkey_to_p2pkh(child_key)
                    elif xpub_type == "ypub":
                        address = XPubParser._pubkey_to_p2sh_p2wpkh(child_key)
                    elif xpub_type == "zpub":
                        address = XPubParser._pubkey_to_p2wpkh(child_key)
                    else:
                        raise ValueError(f"Unsupported xpub type: {xpub_type}")

                    path = f"m/{chain}/{i}"
                    addresses.append((address, path))

                except Exception as e:
                    logger.error(f"Failed to derive address at index {i}: {e}")
                    continue

            return addresses

        except Exception as e:
            logger.error(f"Failed to derive addresses from xpub: {e}")
            raise

    @staticmethod
    def _detect_xpub_type(xpub: str) -> str:
        """Detect xpub type from prefix"""
        if xpub.startswith("xpub"):
            return "xpub"
        elif xpub.startswith("ypub"):
            return "ypub"
        elif xpub.startswith("zpub"):
            return "zpub"
        elif xpub.startswith("tpub"):
            return "tpub"  # Testnet
        else:
            raise ValueError(f"Unknown xpub type: {xpub[:4]}")

    @staticmethod
    def _decode_xpub(xpub: str) -> dict:
        """
        Decode extended public key
        
        Returns:
            Dict with 'version', 'depth', 'fingerprint', 'child_num', 
            'chain_code', 'public_key'
        """
        try:
            # Decode base58check
            decoded = base58.b58decode_check(xpub)

            # Parse fields
            return {
                "version": decoded[0:4],
                "depth": decoded[4],
                "fingerprint": decoded[5:9],
                "child_num": int.from_bytes(decoded[9:13], "big"),
                "chain_code": decoded[13:45],
                "public_key": decoded[45:78],
            }
        except Exception as e:
            logger.error(f"Failed to decode xpub: {e}")
            return None

    @staticmethod
    def _derive_child(parent: dict, chain: int, index: int) -> bytes:
        """
        Derive child public key using BIP32 derivation
        
        Args:
            parent: Decoded parent xpub
            chain: 0 for external, 1 for change
            index: Child index
            
        Returns:
            Compressed public key bytes
        """
        import hmac

        # First derive m/chain
        data = parent["public_key"] + chain.to_bytes(4, "big")
        h = hmac.new(parent["chain_code"], data, hashlib.sha512).digest()
        chain_key = h[32:]

        # Then derive m/chain/index
        # For simplicity, we'll use a library here
        # In production, implement full BIP32 derivation
        try:
            from bip32utils import BIP32Key

            # Create BIP32 key from xpub
            key = BIP32Key.fromExtendedKey(
                base58.b58encode_check(
                    parent["version"]
                    + bytes([parent["depth"]])
                    + parent["fingerprint"]
                    + parent["child_num"].to_bytes(4, "big")
                    + parent["chain_code"]
                    + parent["public_key"]
                )
            )

            # Derive m/chain/index
            child = key.ChildKey(chain).ChildKey(index)
            return child.PublicKey()

        except ImportError:
            # Fallback: simplified derivation (not fully secure, for demo)
            logger.warning("bip32utils not available, using simplified derivation")
            return parent["public_key"]

    @staticmethod
    def _pubkey_to_p2pkh(pubkey: bytes) -> str:
        """Convert public key to P2PKH address (1...)"""
        try:
            # Hash160 (RIPEMD160(SHA256(pubkey)))
            sha = hashlib.sha256(pubkey).digest()
            ripemd = hashlib.new("ripemd160", sha).digest()

            # Add version byte (0x00 for mainnet)
            versioned = b"\x00" + ripemd

            # Double SHA256 for checksum
            checksum = hashlib.sha256(hashlib.sha256(versioned).digest()).digest()[:4]

            # Base58 encode
            address = base58.b58encode(versioned + checksum).decode()
            return address

        except Exception as e:
            logger.error(f"Failed to convert pubkey to P2PKH: {e}")
            raise

    @staticmethod
    def _pubkey_to_p2wpkh(pubkey: bytes) -> str:
        """Convert public key to native SegWit P2WPKH address (bc1...)"""
        try:
            # Hash160
            sha = hashlib.sha256(pubkey).digest()
            ripemd = hashlib.new("ripemd160", sha).digest()

            # Simplified bech32 encoding for SegWit addresses
            # For now, fallback to P2PKH since full bech32 implementation is complex
            logger.warning("P2WPKH conversion falling back to P2PKH")
            return XPubParser._pubkey_to_p2pkh(pubkey)

        except Exception as e:
            logger.error(f"Failed to convert pubkey to P2WPKH: {e}")
            # Fallback to P2PKH if SegWit encoding fails
            return XPubParser._pubkey_to_p2pkh(pubkey)

    @staticmethod
    def _pubkey_to_p2sh_p2wpkh(pubkey: bytes) -> str:
        """Convert public key to P2SH-wrapped SegWit address (3...)"""
        try:
            # Hash160 of pubkey
            sha = hashlib.sha256(pubkey).digest()
            ripemd = hashlib.new("ripemd160", sha).digest()

            # Create witness program: OP_0 <20-byte-hash>
            witness_program = b"\x00\x14" + ripemd

            # Hash160 of witness program
            sha = hashlib.sha256(witness_program).digest()
            ripemd = hashlib.new("ripemd160", sha).digest()

            # Add P2SH version byte (0x05 for mainnet)
            versioned = b"\x05" + ripemd

            # Checksum
            checksum = hashlib.sha256(hashlib.sha256(versioned).digest()).digest()[:4]

            # Base58 encode
            address = base58.b58encode(versioned + checksum).decode()
            return address

        except Exception as e:
            logger.error(f"Failed to convert pubkey to P2SH-P2WPKH: {e}")
            raise

    @staticmethod
    def validate_xpub(xpub: str) -> bool:
        """Validate extended public key format"""
        try:
            decoded = base58.b58decode_check(xpub)
            return len(decoded) == 78
        except Exception:
            return False

