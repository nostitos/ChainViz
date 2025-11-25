"""Streaming trace API endpoints using Server-Sent Events (SSE)"""

import logging
import json
import asyncio
from typing import AsyncGenerator, Optional
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from app.models.api import NodeData, EdgeData
from app.services.blockchain_data import get_blockchain_service, BlockchainDataService

logger = logging.getLogger(__name__)

router = APIRouter()


async def sse_event(event_type: str, data: dict) -> str:
    """Format data as Server-Sent Event"""
    return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"


async def stream_address_trace(
    address: str,
    hops_before: int,
    hops_after: int,
    max_transactions: int,
    blockchain_service: BlockchainDataService,
) -> AsyncGenerator[str, None]:
    """
    Stream address trace results progressively as transactions are fetched.
    
    Yields SSE events:
    - metadata: Initial info about expected transaction count
    - batch: Nodes and edges for a batch of transactions
    - progress: Progress updates
    - complete: Final completion event
    - error: Error events if something fails
    """
    try:
        # Send initial metadata
        yield await sse_event("metadata", {
            "address": address,
            "hops_before": hops_before,
            "hops_after": hops_after,
            "status": "starting"
        })
        
        # Get transaction IDs
        logger.info(f"Streaming trace for address {address[:20]}...")
        txids = await blockchain_service.fetch_address_history(address, max_results=max_transactions)
        
        total_txs = len(txids)
        yield await sse_event("metadata", {
            "total_transactions": total_txs,
            "status": "fetching"
        })
        
        if total_txs == 0:
            yield await sse_event("complete", {
                "total_nodes": 1,
                "total_edges": 0,
                "message": "No transactions found"
            })
            return
        
        # Create address node first
        addr_node_id = f"addr_{address}"
        initial_nodes = [NodeData(
            id=addr_node_id,
            label=address,
            type="address",
            value=None,
            metadata={
                "address": address,
                "is_change": False,
                "cluster_id": None,
                "is_starting_point": True
            }
        ).model_dump()]
        
        yield await sse_event("batch", {
            "nodes": initial_nodes,
            "edges": [],
            "batch_index": 0,
            "progress": 0
        })
        
        # Process transactions in batches
        batch_size = 20
        all_nodes = initial_nodes.copy()
        all_edges = []
        
        for batch_start in range(0, total_txs, batch_size):
            batch_end = min(batch_start + batch_size, total_txs)
            batch_txids = txids[batch_start:batch_end]
            
            logger.info(f"Fetching batch {batch_start//batch_size + 1}: txs {batch_start}-{batch_end} of {total_txs}")
            
            # Fetch this batch of transactions
            transactions_raw = await blockchain_service.fetch_transactions_batch(batch_txids)
            transactions = [tx for tx in transactions_raw if tx is not None]
            
            # Process transactions to create nodes and edges
            batch_nodes = []
            batch_edges = []
            
            for tx in transactions:
                # Check if this TX should be included based on hop direction
                has_output_to_addr = any(out.address == address for out in tx.outputs)
                has_input_from_addr = any(inp.address == address for inp in tx.inputs if inp.address)
                
                include_tx = False
                if has_output_to_addr and hops_before > 0:
                    include_tx = True
                if has_input_from_addr and hops_after > 0:
                    include_tx = True
                
                if not include_tx:
                    continue
                
                # Create transaction node
                tx_node_id = f"tx_{tx.txid}"
                tx_node = NodeData(
                    id=tx_node_id,
                    label=f"{tx.txid[:16]}...",
                    type="transaction",
                    value=None,
                    metadata={
                        "txid": tx.txid,
                        "timestamp": tx.timestamp,
                        "inputCount": len(tx.inputs),
                        "outputCount": len(tx.outputs),
                    }
                )
                batch_nodes.append(tx_node.model_dump())
                
                # Create edges based on direction
                if hops_before > 0:
                    # TX → Address (receiving)
                    for vout, output in enumerate(tx.outputs):
                        if output.address == address:
                            edge = EdgeData(
                                source=tx_node_id,
                                target=addr_node_id,
                                amount=output.value,
                                confidence=1.0,
                                metadata={"vout": vout}
                            )
                            batch_edges.append(edge.model_dump())
                
                if hops_after > 0 and has_input_from_addr:
                    # Address → TX (sending)
                    total_amount = sum(
                        inp.value for inp in tx.inputs 
                        if inp.address == address and inp.value is not None
                    )
                    edge = EdgeData(
                        source=addr_node_id,
                        target=tx_node_id,
                        amount=total_amount,
                        confidence=1.0,
                        metadata={}
                    )
                    batch_edges.append(edge.model_dump())
            
            # Send this batch
            all_nodes.extend(batch_nodes)
            all_edges.extend(batch_edges)
            
            progress = int((batch_end / total_txs) * 100)
            
            yield await sse_event("batch", {
                "nodes": batch_nodes,
                "edges": batch_edges,
                "batch_index": batch_start // batch_size + 1,
                "progress": progress
            })
            
            yield await sse_event("progress", {
                "processed": batch_end,
                "total": total_txs,
                "progress": progress,
                "nodes_count": len(all_nodes),
                "edges_count": len(all_edges)
            })
            
            # Small delay to prevent overwhelming the client
            await asyncio.sleep(0.1)
        
        # Send completion event
        yield await sse_event("complete", {
            "total_nodes": len(all_nodes),
            "total_edges": len(all_edges),
            "total_transactions": total_txs,
            "message": "Trace complete"
        })
        
    except Exception as e:
        logger.error(f"Error streaming address trace: {e}", exc_info=True)
        yield await sse_event("error", {
            "message": str(e),
            "type": type(e).__name__
        })


@router.get("/address/stream")
async def stream_trace_address(
    address: str = Query(..., description="Bitcoin address to trace"),
    hops_before: int = Query(1, ge=0, le=10, description="Backward hops"),
    hops_after: int = Query(1, ge=0, le=10, description="Forward hops"),
    max_transactions: int = Query(1000, ge=1, le=10000, description="Max transactions to fetch"),
    blockchain_service: BlockchainDataService = Depends(get_blockchain_service),
):
    """
    Stream address trace results using Server-Sent Events (SSE).
    
    Returns a stream of events:
    - metadata: Initial information
    - batch: Nodes and edges for each batch
    - progress: Progress updates
    - complete: Completion event
    - error: Error events
    
    Example usage:
    ```javascript
    const eventSource = new EventSource('/api/trace/address/stream?address=bc1q...');
    eventSource.addEventListener('batch', (e) => {
        const data = JSON.parse(e.data);
        // Add nodes and edges to graph
    });
    ```
    """
    return StreamingResponse(
        stream_address_trace(
            address=address,
            hops_before=hops_before,
            hops_after=hops_after,
            max_transactions=max_transactions,
            blockchain_service=blockchain_service,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )


async def stream_utxo_trace(
    txid: str,
    vout: int,
    hops_before: int,
    hops_after: int,
    max_addresses_per_tx: int,
    blockchain_service: BlockchainDataService,
) -> AsyncGenerator[str, None]:
    """
    Stream UTXO trace results progressively.
    
    For simplicity, this uses the fast path (hops <= 1) with batched fetching.
    """
    try:
        yield await sse_event("metadata", {
            "txid": txid,
            "vout": vout,
            "hops_before": hops_before,
            "hops_after": hops_after,
            "status": "starting"
        })
        
        # Fetch starting transaction
        logger.info(f"Streaming UTXO trace for {txid}:{vout}")
        start_tx = await blockchain_service.fetch_transaction(txid)
        
        # Build transaction node with metadata
        inputs_data = []
        outputs_data = []
        
        # Fetch input transactions to resolve addresses
        if hops_before > 0:
            input_txids = [inp.txid for inp in start_tx.inputs if inp.txid]
            yield await sse_event("progress", {
                "status": "fetching_inputs",
                "count": len(input_txids)
            })
            
            input_txs = await blockchain_service.fetch_transactions_batch(input_txids)
            input_tx_map = {tx.txid: tx for tx in input_txs if tx}
            
            for inp in start_tx.inputs:
                if inp.txid and inp.txid in input_tx_map:
                    prev_tx = input_tx_map[inp.txid]
                    if inp.vout < len(prev_tx.outputs):
                        prev_output = prev_tx.outputs[inp.vout]
                        inputs_data.append({
                            "address": prev_output.address or "No Address",
                            "value": prev_output.value
                        })
        
        for out in start_tx.outputs:
            outputs_data.append({
                "address": out.address or "No Address",
                "value": out.value
            })
        
        # Create TX node
        tx_node = NodeData(
            id=f"tx_{txid}",
            label=f"{txid[:16]}...",
            type="transaction",
            value=None,
            metadata={
                "txid": txid,
                "timestamp": start_tx.timestamp,
                "is_starting_point": True,
                "inputCount": len(start_tx.inputs),
                "outputCount": len(start_tx.outputs),
                "inputs": inputs_data,
                "outputs": outputs_data,
            }
        )
        
        nodes = [tx_node.model_dump()]
        edges = []
        
        # Add input addresses and edges
        if hops_before > 0:
            inputs_to_fetch = start_tx.inputs[:max_addresses_per_tx]
            for inp in inputs_to_fetch:
                if inp.txid and inp.txid in input_tx_map:
                    prev_tx = input_tx_map[inp.txid]
                    if inp.vout < len(prev_tx.outputs):
                        prev_output = prev_tx.outputs[inp.vout]
                        if prev_output.address:
                            addr_id = f"addr_{prev_output.address}"
                            nodes.append(NodeData(
                                id=addr_id,
                                label=prev_output.address,
                                type="address",
                                value=None,
                                metadata={"address": prev_output.address, "is_change": False}
                            ).model_dump())
                            
                            edges.append(EdgeData(
                                source=addr_id,
                                target=f"tx_{txid}",
                                amount=prev_output.value,
                                confidence=1.0,
                                metadata={"vout": inp.vout}
                            ).model_dump())
        
        # Add output addresses and edges
        if hops_after > 0:
            outputs_to_fetch = start_tx.outputs[:max_addresses_per_tx]
            for idx, out in enumerate(outputs_to_fetch):
                if out.address:
                    addr_id = f"addr_{out.address}"
                    if not any(n["id"] == addr_id for n in nodes):
                        nodes.append(NodeData(
                            id=addr_id,
                            label=out.address,
                            type="address",
                            value=None,
                            metadata={"address": out.address, "is_change": False}
                        ).model_dump())
                    
                    edges.append(EdgeData(
                        source=f"tx_{txid}",
                        target=addr_id,
                        amount=out.value,
                        confidence=1.0,
                        metadata={"vout": idx}
                    ).model_dump())
        
        # Send all data as single batch for UTXO traces
        yield await sse_event("batch", {
            "nodes": nodes,
            "edges": edges,
            "batch_index": 0,
            "progress": 100
        })
        
        yield await sse_event("complete", {
            "total_nodes": len(nodes),
            "total_edges": len(edges),
            "message": "UTXO trace complete"
        })
        
    except Exception as e:
        logger.error(f"Error streaming UTXO trace: {e}", exc_info=True)
        yield await sse_event("error", {
            "message": str(e),
            "type": type(e).__name__
        })


@router.get("/utxo/stream")
async def stream_trace_utxo(
    txid: str = Query(..., description="Transaction ID"),
    vout: int = Query(0, ge=0, description="Output index"),
    hops_before: int = Query(1, ge=0, le=10, description="Backward hops"),
    hops_after: int = Query(1, ge=0, le=10, description="Forward hops"),
    max_addresses_per_tx: int = Query(100, ge=1, le=1000, description="Max addresses per transaction"),
    blockchain_service: BlockchainDataService = Depends(get_blockchain_service),
):
    """
    Stream UTXO trace results using Server-Sent Events (SSE).
    
    Similar to address streaming but starts from a specific UTXO.
    """
    return StreamingResponse(
        stream_utxo_trace(
            txid=txid,
            vout=vout,
            hops_before=hops_before,
            hops_after=hops_after,
            max_addresses_per_tx=max_addresses_per_tx,
            blockchain_service=blockchain_service,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
