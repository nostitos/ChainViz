"""WebSocket API for real-time updates"""

import logging
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.electrum_client import get_electrum_client
from app.models.api import BlockNotification

logger = logging.getLogger(__name__)

router = APIRouter()


class ConnectionManager:
    """Manage WebSocket connections"""

    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        """Accept new connection"""
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket connected. Total connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        """Remove connection"""
        self.active_connections.remove(websocket)
        logger.info(f"WebSocket disconnected. Total connections: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        """Broadcast message to all connections"""
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Failed to send to WebSocket: {e}")


manager = ConnectionManager()


@router.websocket("/blocks")
async def websocket_blocks(websocket: WebSocket):
    """
    WebSocket endpoint for real-time block notifications
    
    Clients connect to ws://localhost:8000/ws/blocks and receive 
    notifications whenever a new block is found.
    
    Message format:
    ```json
    {
      "height": 800000,
      "hash": "00000000000000000001...",
      "timestamp": 1234567890,
      "tx_count": 2500
    }
    ```
    """
    await manager.connect(websocket)

    try:
        electrum = get_electrum_client()

        # Subscribe to block headers
        async def on_new_header(header):
            """Callback for new block headers"""
            notification = BlockNotification(
                height=header.get("height", 0),
                hash=header.get("hex", ""),
                timestamp=header.get("timestamp", 0),
                tx_count=0,  # Not available in header
            )

            await manager.broadcast(notification.model_dump())

        # Start subscription
        await electrum.subscribe_headers(on_new_header)

        # Keep connection alive
        while True:
            # Wait for any client messages (for connection keep-alive)
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                logger.debug(f"Received WebSocket message: {data}")
            except asyncio.TimeoutError:
                # Send ping to keep connection alive
                await websocket.send_json({"type": "ping"})

    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.info("Client disconnected")

    except Exception as e:
        logger.error(f"WebSocket error: {e}", exc_info=True)
        manager.disconnect(websocket)




