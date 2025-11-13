"""Electrum protocol proxy - acts as a transparent Electrum server"""

import json
import logging
from typing import Any, Dict, List, Union
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.services.electrum_multiplexer import get_electrum_client

logger = logging.getLogger(__name__)

router = APIRouter()


class ElectrumProxyHandler:
    """Handles Electrum JSON-RPC protocol requests"""
    
    def __init__(self):
        self.client = get_electrum_client()
        self.subscriptions: Dict[str, Any] = {}
    
    async def ensure_connected(self):
        """Ensure multiplexer is connected"""
        if not self.client.connected:
            await self.client.connect()
    
    async def handle_request(self, request: dict) -> dict:
        """
        Handle a single Electrum JSON-RPC request
        
        Args:
            request: JSON-RPC request object
            
        Returns:
            JSON-RPC response object
        """
        request_id = request.get("id")
        method = request.get("method")
        params = request.get("params", [])
        
        try:
            await self.ensure_connected()
            
            # Route to appropriate handler
            result = await self._route_method(method, params)
            
            return {
                "jsonrpc": "2.0",
                "id": request_id,
                "result": result,
            }
            
        except Exception as e:
            logger.error(f"Error handling {method}: {e}")
            return {
                "jsonrpc": "2.0",
                "id": request_id,
                "error": {
                    "code": -32603,
                    "message": str(e),
                },
            }
    
    async def handle_batch(self, requests: List[dict]) -> List[dict]:
        """
        Handle a batch of Electrum JSON-RPC requests
        
        Args:
            requests: List of JSON-RPC request objects
            
        Returns:
            List of JSON-RPC response objects
        """
        # Process each request
        responses = []
        for request in requests:
            response = await self.handle_request(request)
            responses.append(response)
        
        return responses
    
    async def _route_method(self, method: str, params: List[Any]) -> Any:
        """
        Route method to appropriate handler
        
        Supports all standard Electrum protocol methods
        """
        # Direct pass-through methods
        if method in [
            "blockchain.scripthash.get_balance",
            "blockchain.scripthash.get_history",
            "blockchain.scripthash.get_mempool",
            "blockchain.scripthash.listunspent",
            "blockchain.scripthash.subscribe",
            "blockchain.scripthash.unsubscribe",
            "blockchain.transaction.get",
            "blockchain.transaction.get_merkle",
            "blockchain.transaction.broadcast",
            "blockchain.block.header",
            "blockchain.block.headers",
            "blockchain.estimatefee",
            "blockchain.relayfee",
            "blockchain.headers.subscribe",
            "mempool.get_fee_histogram",
        ]:
            return await self.client._call(method, params)
        
        # Server info methods
        elif method == "server.version":
            # Return ChainViz as the server
            client_name = params[0] if params else "unknown"
            protocol_version = params[1] if len(params) > 1 else "1.4"
            return ["ChainViz Multiplexer 1.0", "1.4"]
        
        elif method == "server.banner":
            return "ChainViz Electrum Multiplexer - Resilient multi-server proxy"
        
        elif method == "server.donation_address":
            return ""  # No donation address
        
        elif method == "server.peers.subscribe":
            # Return empty list - we don't expose peer info
            return []
        
        elif method == "server.ping":
            return None  # Ping response
        
        elif method == "server.features":
            # Return server capabilities
            return {
                "genesis_hash": "000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f",
                "hosts": {},
                "protocol_max": "1.4",
                "protocol_min": "1.4",
                "pruning": None,
                "server_version": "ChainViz 1.0",
                "hash_function": "sha256",
            }
        
        # Subscription methods (stateful)
        elif method == "blockchain.headers.subscribe":
            # Subscribe to block headers
            result = await self.client._call(method, params)
            self.subscriptions["headers"] = True
            return result
        
        elif method == "blockchain.scripthash.subscribe":
            # Subscribe to scripthash updates
            scripthash = params[0] if params else None
            if scripthash:
                result = await self.client._call(method, params)
                self.subscriptions[f"scripthash:{scripthash}"] = True
                return result
            return None
        
        else:
            raise Exception(f"Unsupported method: {method}")


# Global handler instance
_handler = ElectrumProxyHandler()


@router.websocket("/electrum")
async def electrum_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for Electrum protocol
    
    Accepts Electrum JSON-RPC requests over WebSocket and proxies to multiplexer
    """
    await websocket.accept()
    logger.info("Electrum client connected via WebSocket")
    
    try:
        while True:
            # Receive message
            data = await websocket.receive_text()
            
            try:
                # Parse JSON-RPC request
                message = json.loads(data)
                
                # Handle batch or single request
                if isinstance(message, list):
                    # Batch request
                    responses = await _handler.handle_batch(message)
                    response_data = json.dumps(responses)
                else:
                    # Single request
                    response = await _handler.handle_request(message)
                    response_data = json.dumps(response)
                
                # Send response
                await websocket.send_text(response_data)
                
            except json.JSONDecodeError as e:
                # Invalid JSON
                error_response = {
                    "jsonrpc": "2.0",
                    "id": None,
                    "error": {
                        "code": -32700,
                        "message": "Parse error",
                    },
                }
                await websocket.send_text(json.dumps(error_response))
            
            except Exception as e:
                logger.error(f"Error processing request: {e}")
                error_response = {
                    "jsonrpc": "2.0",
                    "id": None,
                    "error": {
                        "code": -32603,
                        "message": str(e),
                    },
                }
                await websocket.send_text(json.dumps(error_response))
    
    except WebSocketDisconnect:
        logger.info("Electrum client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        try:
            await websocket.close()
        except:
            pass


@router.post("/electrum/rpc")
async def electrum_http_rpc(request: Union[dict, List[dict]]):
    """
    HTTP POST endpoint for Electrum JSON-RPC
    
    Accepts single or batch requests via HTTP POST
    """
    try:
        if isinstance(request, list):
            # Batch request
            return await _handler.handle_batch(request)
        else:
            # Single request
            return await _handler.handle_request(request)
    
    except Exception as e:
        logger.error(f"HTTP RPC error: {e}")
        return {
            "jsonrpc": "2.0",
            "id": None,
            "error": {
                "code": -32603,
                "message": str(e),
            },
        }

