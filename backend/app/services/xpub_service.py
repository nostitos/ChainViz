"""xpub service for deriving addresses and fetching transaction history"""

from typing import List, Dict, Any
import logging
from bip_utils import Bip84, Bip49, Bip44, Bip84Coins, Bip49Coins, Bip44Coins, Bip44Changes

logger = logging.getLogger(__name__)


class XpubService:
    """Service for deriving addresses from xpub and fetching transaction history"""
    
    @staticmethod
    def derive_addresses(
        xpub: str,
        derivation_path: str,
        count: int = 100,
        change: int = 0
    ) -> List[str]:
        """
        Derive addresses from xpub
        
        Args:
            xpub: Extended public key (zpub for native segwit, ypub for nested segwit, xpub for legacy)
            derivation_path: Base path (e.g., "m/84h/0h/0h")
            count: Number of addresses to derive
            change: 0 for receive, 1 for change addresses
            
        Returns:
            List of Bitcoin addresses
        """
        addresses = []
        
        try:
            # Determine address type from xpub prefix
            if xpub.startswith("zpub"):
                # Native SegWit (BIP84) - bc1q addresses
                ctx = Bip84.FromExtendedKey(xpub, Bip84Coins.BITCOIN)
            elif xpub.startswith("ypub"):
                # Nested SegWit (BIP49) - 3... addresses
                ctx = Bip49.FromExtendedKey(xpub, Bip49Coins.BITCOIN)
            elif xpub.startswith("xpub"):
                # Legacy (BIP44) - 1... addresses
                ctx = Bip44.FromExtendedKey(xpub, Bip44Coins.BITCOIN)
            else:
                logger.error(f"Unsupported xpub format: {xpub[:4]}")
                return []
            
            # Derive addresses from account-level xpub
            # Path: m/change/address_index
            # Use Bip44Changes enum: CHAIN_EXT (0) for receive, CHAIN_INT (1) for change
            change_enum = Bip44Changes.CHAIN_EXT if change == 0 else Bip44Changes.CHAIN_INT
            
            for i in range(count):
                # Derive m/change/i from account level
                addr_ctx = ctx.Change(change_enum).AddressIndex(i)
                # Get the address
                address = addr_ctx.PublicKey().ToAddress()
                addresses.append(address)
            
            logger.info(f"Derived {len(addresses)} addresses from {xpub[:20]}...")
            return addresses
            
        except Exception as e:
            logger.error(f"Failed to derive addresses from xpub: {e}", exc_info=True)
            return []
    
    @staticmethod
    async def get_addresses_with_history(
        addresses: List[str],
        mempool_client
    ) -> List[Dict[str, Any]]:
        """
        Get transaction history for multiple addresses
        
        Args:
            addresses: List of Bitcoin addresses
            mempool_client: MempoolSpaceClient instance
            
        Returns:
            List of {address, txids, tx_count}
        """
        results = []
        
        for address in addresses:
            txids = await mempool_client.get_address_txids(address)
            if txids:
                results.append({
                    "address": address,
                    "txids": txids,
                    "tx_count": len(txids)
                })
                logger.debug(f"Address {address}: {len(txids)} transactions")
        
        return results

