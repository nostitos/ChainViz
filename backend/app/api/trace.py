"""UTXO tracing API endpoints"""

import logging
from fastapi import APIRouter, HTTPException, Depends

from app.models.api import TraceUTXORequest, TraceGraphResponse, PeelChainRequest, PeelChainResponse, NodeData, EdgeData
from app.models.blockchain import TransactionInput
from app.services.blockchain_data import get_blockchain_service, BlockchainDataService
from app.analysis.orchestrator import TraceOrchestrator
from app.analysis.peel_chain import PeelChainDetector

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/utxo", response_model=TraceGraphResponse)
async def trace_utxo(
    request: TraceUTXORequest,
    blockchain_service: BlockchainDataService = Depends(get_blockchain_service),
):
    """
    Trace a UTXO backward and forward through transaction history
    
    This endpoint applies all heuristics (clustering, change detection, peel chains, 
    CoinJoin detection) to build a comprehensive graph of where the UTXO came from
    and where it went.
    
    Example:
    ```json
    {
      "txid": "abcd1234...",
      "vout": 0,
      "hops_before": 5,
      "hops_after": 5,
      "include_coinjoin": false,
      "confidence_threshold": 0.5
    }
    ```
    """
    try:
        logger.info(f"🔍 Tracing UTXO: {request.txid}:{request.vout}, hops_before={request.hops_before}, hops_after={request.hops_after}, max_addresses_per_tx={request.max_addresses_per_tx}")
        logger.info(f"📊 All RPC requests for this trace will be logged below with details")
        
        # FAST PATH: For hops_before <= 1, use simple non-recursive fetching
        # The orchestrator is TOO SLOW for large transactions (348 inputs = 348 recursive calls!)
        if request.hops_before <= 1 and request.hops_after <= 1:
            logger.info(f"🚀 Using FAST PATH for simple trace (hops <= 1, max_addresses_per_tx={request.max_addresses_per_tx})")
            
            # Fetch the starting transaction
            logger.info(f"📊 Request #1: Fetching starting transaction {request.txid[:20]}...")
            start_tx = await blockchain_service.fetch_transaction(request.txid)
            
            # Resolve inputs for starting TX (need to fetch previous TXs)
            input_txids = [inp.txid for inp in start_tx.inputs if inp.txid]
            logger.info(f"📊 Request #2: Fetching {len(input_txids)} input transactions to resolve addresses...")
            input_txs = await blockchain_service.fetch_transactions_batch(input_txids)
            input_tx_map = {tx.txid: tx for tx in input_txs if tx}
            
            # Build complete metadata for expansion
            inputs_data = []
            for inp in start_tx.inputs:
                if inp.txid and inp.txid in input_tx_map:
                    prev_tx = input_tx_map[inp.txid]
                    if inp.vout < len(prev_tx.outputs):
                        prev_output = prev_tx.outputs[inp.vout]
                        if prev_output.address:
                            inputs_data.append({"address": prev_output.address, "value": prev_output.value})
                        else:
                            # P2PK or non-standard - extract pubkey
                            from app.services.blockchain_data import _extract_pubkey_from_p2pk_script
                            script_type = prev_output.script_type
                            
                            if script_type == "p2pk":
                                pubkey = _extract_pubkey_from_p2pk_script(prev_output.script_pubkey)
                                logger.info(f"🔍 P2PK input: extracted pubkey={pubkey[:20] if pubkey else 'None'}...")
                                if pubkey:
                                    placeholder = f"P2PK: {pubkey[:40]}..." if len(pubkey) > 40 else f"P2PK: {pubkey}"
                                else:
                                    placeholder = "P2PK Script"
                            else:
                                placeholder = f"No Address ({script_type or 'unknown'})"
                            
                            inputs_data.append({"address": placeholder, "value": prev_output.value})
            
            outputs_data = []
            for out in start_tx.outputs:
                if out.address:
                    outputs_data.append({"address": out.address, "value": out.value})
                else:
                    # P2PK or non-standard - extract pubkey if possible
                    from app.services.blockchain_data import _extract_pubkey_from_p2pk_script
                    script_type = out.script_type
                    
                    if script_type == "p2pk":
                        pubkey = _extract_pubkey_from_p2pk_script(out.script_pubkey)
                        if pubkey:
                            placeholder = f"P2PK: {pubkey[:40]}..." if len(pubkey) > 40 else f"P2PK: {pubkey}"
                        else:
                            placeholder = "P2PK Script"
                    else:
                        placeholder = f"No Address ({script_type or 'unknown'})"
                    
                    outputs_data.append({"address": placeholder, "value": out.value})
            
            tx_node = NodeData(
                id=f"tx_{request.txid}",
                label=f"{request.txid[:16]}...",
                type="transaction",
                value=None,
                metadata={
                    "txid": request.txid,
                    "timestamp": start_tx.timestamp,
                    "is_starting_point": True,
                    "inputCount": len(start_tx.inputs),
                    "outputCount": len(start_tx.outputs),
                    "inputs": inputs_data,
                    "outputs": outputs_data,
                }
            )
            
            nodes = [tx_node]
            edges = []
            
            # If hops=0, return just the TX node
            if request.hops_before == 0 and request.hops_after == 0:
                logger.info(f"  ⏭️ Hops=0: returning TX node only (no addresses)")
                return TraceGraphResponse(
                    nodes=nodes, edges=edges, clusters=[], coinjoins=[], peel_chains=[],
                    start_txid=request.txid, start_vout=request.vout,
                    total_nodes=len(nodes), total_edges=len(edges),
                )
            
            # If hops=1, fetch LIMITED addresses
            logger.info(f"  📥 Hops=1: fetching limited addresses (max_addresses_per_tx={request.max_addresses_per_tx})")
            
            # Fetch input addresses (if hops_before > 0)
            if request.hops_before > 0:
                inputs_to_fetch = start_tx.inputs[:request.max_addresses_per_tx]
                input_txids = [inp.txid for inp in inputs_to_fetch if inp.txid]
                unique_input_txids = len(set(input_txids))
                logger.info(f"  ⚡ Fetching {len(input_txids)} input transactions ({unique_input_txids} unique) of {len(start_tx.inputs)} total")
                input_txs = await blockchain_service.fetch_transactions_batch(input_txids)
                input_tx_map = {tx.txid: tx for tx in input_txs if tx}
                logger.info(f"  ✅ Successfully fetched {len(input_tx_map)} unique input transactions")
                
                # Track statistics
                inputs_processed = 0
                inputs_no_txid = 0
                inputs_tx_not_fetched = 0
                inputs_invalid_vout = 0
                inputs_no_address = 0
                edges_created = 0
                
                for inp in inputs_to_fetch:
                    inputs_processed += 1
                    
                    if not inp.txid:
                        inputs_no_txid += 1
                        continue
                    
                    if inp.txid not in input_tx_map:
                        inputs_tx_not_fetched += 1
                        continue
                    
                    prev_tx = input_tx_map[inp.txid]
                    if not prev_tx or inp.vout >= len(prev_tx.outputs):
                        inputs_invalid_vout += 1
                        if inputs_invalid_vout <= 3:  # Log first 3 cases
                            logger.error(f"     ❌ DATA CORRUPTION: Input claims to spend {inp.txid[:16]}...:vout={inp.vout}")
                            logger.error(f"        But that TX only has {len(prev_tx.outputs) if prev_tx else 0} outputs!")
                            logger.error(f"        This is a critical Electrum server data issue.")
                        continue
                    
                    prev_output = prev_tx.outputs[inp.vout]
                    if not prev_output.address:
                        inputs_no_address += 1
                        continue
                    
                    # Create address node if doesn't exist
                    addr_id = f"addr_{prev_output.address}"
                    if not any(n.id == addr_id for n in nodes):
                        nodes.append(NodeData(
                            id=addr_id,
                            label=prev_output.address,
                            type="address",
                            value=None,
                            metadata={"address": prev_output.address, "is_change": False}
                        ))
                    
                    # Always create edge for this input
                    edges.append(EdgeData(
                        source=addr_id,
                        target=f"tx_{request.txid}",
                        amount=prev_output.value,
                        confidence=1.0,
                        metadata={"vout": inp.vout}
                    ))
                    edges_created += 1
                
                # Log statistics
                logger.info(f"  📊 Input processing: {edges_created} edges created from {inputs_processed} inputs")
                if inputs_no_txid > 0:
                    logger.warning(f"     {inputs_no_txid} inputs missing txid (coinbase)")
                if inputs_tx_not_fetched > 0:
                    logger.warning(f"     {inputs_tx_not_fetched} inputs reference unfetched transactions")
                if inputs_invalid_vout > 0:
                    logger.error(f"     ❌ {inputs_invalid_vout} inputs have invalid vout index")
                    logger.error(f"        This indicates Electrum batch fetch returned truncated transaction data")
                    logger.error(f"        💡 Solution: Switch to mempool.space API for input fetching (100% accurate)")
                if inputs_no_address > 0:
                    logger.warning(f"     {inputs_no_address} inputs have no address (OP_RETURN, P2PK, etc.)")
            
            # Add output addresses (if hops_after > 0)
            if request.hops_after > 0:
                outputs_to_fetch = start_tx.outputs[:request.max_addresses_per_tx]
                logger.info(f"  ⚡ Adding {len(outputs_to_fetch)} of {len(start_tx.outputs)} output addresses")
                for idx, out in enumerate(outputs_to_fetch):
                    if out.address:
                        addr_id = f"addr_{out.address}"
                        if not any(n.id == addr_id for n in nodes):
                            nodes.append(NodeData(
                                id=addr_id,
                                label=out.address,
                                type="address",
                                value=None,
                                metadata={"address": out.address, "is_change": False}
                            ))
                        edges.append(EdgeData(
                            source=f"tx_{request.txid}",
                            target=addr_id,
                            amount=out.value,
                            confidence=1.0,
                            metadata={"vout": idx}
                        ))
            
        logger.info(f"✅ FAST PATH complete: {len(nodes)} nodes, {len(edges)} edges")
        logger.info(f"📊 Check logs above for detailed RPC request count and types")
        
        return TraceGraphResponse(
                nodes=nodes, edges=edges, clusters=[], coinjoins=[], peel_chains=[],
                start_txid=request.txid, start_vout=request.vout,
                total_nodes=len(nodes), total_edges=len(edges),
            )
        
        # SLOW PATH: Use full recursive orchestrator for multi-hop traces (hops > 1)
        logger.info(f"🐌 Using RECURSIVE orchestrator for multi-hop trace (hops > 1)")
        orchestrator = TraceOrchestrator(blockchain_service)
        result = await orchestrator.trace_utxo_backward(
            txid=request.txid,
            vout=request.vout,
            max_depth=request.hops_before,
            include_coinjoin=request.include_coinjoin,
            confidence_threshold=request.confidence_threshold,
        )

        # Process orchestrator result (add metadata, etc.)
        tx_nodes = [n for n in result.nodes if n.type == 'transaction']
        logger.info(f"📥 Adding input/output addresses for {len(tx_nodes)} TXs in result")
        
        start_tx = None
        if not any(n.metadata.get('txid') == request.txid for n in tx_nodes if n.metadata):
            logger.info(f"➕ Starting TX not in orchestrator result, adding it...")
            start_tx = await blockchain_service.fetch_transaction(request.txid)
            if start_tx:
                result.nodes.append(NodeData(
                    id=f"tx_{request.txid}",
                    label=f"{request.txid[:16]}...",
                    type="transaction",
                    value=None,
                    metadata={
                        "txid": request.txid,
                        "timestamp": start_tx.timestamp,
                        "is_starting_point": True,
                        "inputCount": len(start_tx.inputs),
                        "outputCount": len(start_tx.outputs),
                    }
                ))
                tx_nodes.append(result.nodes[-1])
                logger.info(f"✅ Added starting TX node with {len(start_tx.inputs)} inputs, {len(start_tx.outputs)} outputs")
        
        # Step 1: Batch fetch all main transactions (skip starting TX if already fetched)
        main_txids = [n.metadata.get('txid') for n in tx_nodes if n.metadata and n.metadata.get('txid')]
        if not main_txids:
            logger.info("No TXs to process")
        else:
            logger.info(f"⚡ Batch fetching {len(main_txids)} transactions...")
            main_txs = await blockchain_service.fetch_transactions_batch(main_txids)
            main_tx_map = dict(zip(main_txids, main_txs))
            
            # If we already fetched the starting TX, add it to the map to avoid re-fetching
            if start_tx:
                main_tx_map[request.txid] = start_tx
                logger.info(f"  ♻️ Reusing already-fetched starting TX")
            
            # ADD inputCount/outputCount to ALL transaction nodes
            for tx_node_data in tx_nodes:
                txid = tx_node_data.metadata.get('txid') if tx_node_data.metadata else None
                if txid and txid in main_tx_map:
                    tx = main_tx_map[txid]
                    if tx and tx_node_data.metadata:
                        # Only add if not already set (starting TX already has these)
                        if "inputCount" not in tx_node_data.metadata:
                            tx_node_data.metadata["inputCount"] = len(tx.inputs)
                            tx_node_data.metadata["outputCount"] = len(tx.outputs)
                            logger.info(f"  ✅ TX {txid[:20]} metadata: {len(tx.inputs)} inputs, {len(tx.outputs)} outputs")
            
            # ONLY fetch input/output addresses if hops_before > 0 or hops_after > 0
            # For single transaction view (hops=0), we ONLY need the counts above
            if request.hops_before > 0 or request.hops_after > 0:
                logger.info(f"📥 Fetching addresses for multi-hop trace (hops_before={request.hops_before}, hops_after={request.hops_after})")
                
                # Step 2: Collect input TXIDs that need to be fetched (LIMITED by max_addresses_per_tx)
                input_txids = set()
                for tx in main_txs:
                    if tx:
                        # Limit inputs per transaction to avoid fetching hundreds of addresses
                        inputs_to_fetch = tx.inputs[:request.max_addresses_per_tx]
                        logger.info(f"  TX {tx.txid[:20]}: fetching {len(inputs_to_fetch)} of {len(tx.inputs)} inputs (max_addresses_per_tx={request.max_addresses_per_tx})")
                        for inp in inputs_to_fetch:
                            if inp.txid:
                                input_txids.add(inp.txid)
                
                logger.info(f"⚡ Batch fetching {len(input_txids)} input transactions (limited by max_addresses_per_tx)...")
                input_txs = await blockchain_service.fetch_transactions_batch(list(input_txids))
                input_tx_map = dict(zip(input_txids, input_txs))
                
                # Step 3: Process all transactions with pre-fetched data
                for tx_node_data in tx_nodes:
                    txid = tx_node_data.metadata.get('txid') if tx_node_data.metadata else None
                    if not txid or txid not in main_tx_map:
                        continue
                        
                    tx_node_id = tx_node_data.id
                    tx = main_tx_map[txid]
                    
                    if not tx:
                        logger.warning(f"⚠️ Failed to fetch TX {txid}")
                        continue
                    
                    # Limit input addresses processed (same limit as collection)
                    inputs_to_process = tx.inputs[:request.max_addresses_per_tx]
                    logger.info(f"📥 Processing inputs for TX {txid[:20]}: {len(inputs_to_process)} of {len(tx.inputs)} inputs (max_addresses_per_tx={request.max_addresses_per_tx})")
                    
                    # Add input addresses (LIMITED)
                    for inp_idx, inp in enumerate(inputs_to_process):
                        if inp.txid and inp.txid in input_tx_map:
                            prev_tx = input_tx_map[inp.txid]
                            if prev_tx and inp.vout < len(prev_tx.outputs):
                                prev_output = prev_tx.outputs[inp.vout]
                                if prev_output.address:
                                    inp_addr_id = f"addr_{prev_output.address}"
                                    # Add address node if not exists
                                    if not any(n.id == inp_addr_id for n in result.nodes):
                                        result.nodes.append(NodeData(
                                            id=inp_addr_id,
                                            label=prev_output.address,
                                            type="address",
                                            value=None,
                                            metadata={"address": prev_output.address, "is_change": False, "cluster_id": None}
                                        ))
                                        logger.info(f"  ➕ Added input address: {prev_output.address[:20]}...")
                                    # Edge from input address to TX
                                    if not any(e.source == inp_addr_id and e.target == tx_node_id for e in result.edges):
                                        result.edges.append(EdgeData(
                                            source=inp_addr_id,
                                            target=tx_node_id,
                                            amount=prev_output.value,
                                            confidence=1.0,
                                            metadata={"vout": inp.vout}
                                        ))
                                        logger.info(f"  ➕ Added input edge: {prev_output.address[:20]}... → TX {txid[:20]}")
                    
                    # ALSO add output addresses (LIMITED by max_addresses_per_tx)
                    outputs_to_fetch = tx.outputs[:request.max_addresses_per_tx]
                    logger.info(f"📤 Processing outputs for TX {txid[:20]}: {len(outputs_to_fetch)} of {len(tx.outputs)} outputs (max_addresses_per_tx={request.max_addresses_per_tx})")
                    for out_idx, out in enumerate(outputs_to_fetch):
                        if out.address:
                            out_addr_id = f"addr_{out.address}"
                            # Add address node if not exists
                            if not any(n.id == out_addr_id for n in result.nodes):
                                result.nodes.append(NodeData(
                                    id=out_addr_id,
                                    label=out.address,
                                    type="address",
                                    value=None,
                                    metadata={"address": out.address, "is_change": False, "cluster_id": None}
                                ))
                                logger.info(f"  ➕ Added output address: {out.address[:20]}...")
                            # Edge from TX to output address
                            if not any(e.source == tx_node_id and e.target == out_addr_id for e in result.edges):
                                result.edges.append(EdgeData(
                                    source=tx_node_id,
                                    target=out_addr_id,
                                    amount=out.value,
                                    confidence=1.0,
                                    metadata={"vout": out_idx}
                                ))
                                logger.info(f"  ➕ Added output edge: TX {txid[:20]} → {out.address[:20]}")
            else:
                logger.info(f"⏭️ Skipping address fetching for single transaction view (hops_before={request.hops_before}, hops_after={request.hops_after})")
        
        logger.info(f"✅ RECURSIVE PATH complete: {len(result.nodes)} nodes, {len(result.edges)} edges")
        logger.info(f"📊 Check logs above for detailed RPC request count and types")

        return result

    except Exception as e:
        logger.error(f"Failed to trace UTXO: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to trace UTXO: {str(e)}")


@router.post("/peel-chain", response_model=PeelChainResponse)
async def analyze_peel_chain(
    request: PeelChainRequest,
    blockchain_service: BlockchainDataService = Depends(get_blockchain_service),
):
    """
    Analyze and follow a peel chain from starting transaction
    
    A peel chain is a sequence of transactions where small amounts are 
    repeatedly "peeled off" from a large UTXO.
    
    Example:
    ```json
    {
      "start_txid": "abcd1234...",
      "max_hops": 100,
      "min_confidence": 0.7
    }
    ```
    """
    try:
        logger.info(f"Analyzing peel chain: {request.start_txid}")

        # Fetch starting transaction
        start_tx = await blockchain_service.fetch_transaction(request.start_txid)

        # Detect peel chain
        detector = PeelChainDetector()
        chain = await detector.detect_peel_chain(
            start_tx,
            blockchain_service.fetch_transaction,
            max_hops=request.max_hops,
            min_confidence=request.min_confidence,
        )

        # Calculate statistics
        stats = detector.calculate_chain_statistics(chain)

        return PeelChainResponse(
            chain=chain,
            total_hops=len(chain),
            total_peeled=stats.get("total_peeled", 0),
            average_hop_time=stats.get("average_hop_time"),
            pattern_confidence=stats.get("average_confidence", 0.0),
        )

    except Exception as e:
        logger.error(f"Failed to analyze peel chain: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to analyze peel chain: {str(e)}")


@router.get("/address/{address}/transactions")
async def get_address_transactions(
    address: str,
    blockchain_service: BlockchainDataService = Depends(get_blockchain_service),
):
    """
    Get all transactions for an address (simple view, no deep tracing)
    Shows all TXs that sent to this address
    """
    try:
        # Get transaction history
        txids = await blockchain_service.fetch_address_history(address)
        
        if not txids:
            return {"transactions": [], "address": address, "total": 0}
        
        # Fetch transaction details
        transactions = await blockchain_service.fetch_transactions_batch(txids[:10])
        
        # Build simple response
        tx_list = []
        for tx in transactions:
            # Check which outputs go to this address
            outputs_to_addr = [
                {"vout": idx, "amount": out.value}
                for idx, out in enumerate(tx.outputs)
                if out.address == address
            ]
            
            if outputs_to_addr:
                tx_list.append({
                    "txid": tx.txid,
                    "timestamp": tx.timestamp,
                    "outputs_to_address": outputs_to_addr,
                    "total_inputs": len(tx.inputs),
                    "total_outputs": len(tx.outputs),
                })
        
        return {"transactions": tx_list, "address": address, "total": len(tx_list)}
        
    except Exception as e:
        logger.error(f"Failed to get transactions for address: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/address", response_model=TraceGraphResponse)
async def trace_from_address(
    address: str,
    hops_before: int = 1,  # Backward hops (show TXs that send TO address - appear LEFT)
    hops_after: int = 1,   # Forward hops (show TXs where address sends FROM - appear RIGHT)
    max_transactions: int = 100,
    include_coinjoin: bool = False,
    confidence_threshold: float = 0.5,
    blockchain_service: BlockchainDataService = Depends(get_blockchain_service),
):
    """
    Trace from a Bitcoin address with directional hop support
    
    This endpoint:
    1. Gets all transactions for the address
    2. Filters based on direction:
       - hops_before > 0: Include TXs that send TO address (appear LEFT of address)
       - hops_after > 0: Include TXs where address spends FROM (appear RIGHT of address)
    3. With hops_before=0 and hops_after=0: Returns only the origin address node
    
    Example: POST /api/trace/address?address=1A1z...&hops_before=1&hops_after=1
    """
    try:
        logger.info(f"Tracing from address: {address} with hops_before={hops_before}, hops_after={hops_after}")

        # Build graph based on hop level
        nodes = []
        edges = []
        
        # Add address node (mark as starting point)
        addr_node_id = f"addr_{address}"
        nodes.append(NodeData(
            id=addr_node_id,
            label=address,
            type="address",
            value=None,
            metadata={"address": address, "is_change": False, "cluster_id": None, "is_starting_point": True}
        ))
        
        # HOP 0,0: Only the address node, no transactions
        if hops_before == 0 and hops_after == 0:
            logger.info(f"✅ Hops 0,0: Returning only the address node")
            return TraceGraphResponse(
                nodes=nodes,
                edges=[],
                clusters=[],
                coinjoins=[],
                peel_chains=[],
                start_txid="",
                start_vout=0,
                total_nodes=len(nodes),
                total_edges=0,
            )
        
        # HOP 1+: Get transactions connected to this address
        logger.info(f"Fetching history for address: {address}")
        txids = await blockchain_service.fetch_address_history(address)
        logger.info(f"Got {len(txids)} transactions for address")
        
        if not txids:
            logger.warning(f"No transactions found for address: {address}")
            return TraceGraphResponse(
                nodes=nodes,
                edges=[],
                clusters=[],
                coinjoins=[],
                peel_chains=[],
                start_txid="",
                start_vout=0,
                total_nodes=len(nodes),
                total_edges=0,
            )

        # Get all transactions that output to this address (use BATCHING for speed!)
        txids_to_fetch = txids[:max_transactions]
        logger.info(f"⚡ Batch fetching {len(txids_to_fetch)} transactions (of {len(txids)} total)...")
        transactions_raw = await blockchain_service.fetch_transactions_batch(txids_to_fetch)
        transactions = [tx for tx in transactions_raw if tx is not None]  # Filter out None values
        
        logger.info(f"Successfully fetched {len(transactions)} of {len(txids_to_fetch)} transactions")
        
        # FIRST: Resolve ALL input addresses for ALL transactions (for frontend expansion - no extra fetching!)
        all_input_txids = set()
        for tx in transactions:
            for inp in tx.inputs:
                if inp.txid:
                    all_input_txids.add(inp.txid)
        
        logger.info(f"⚡ Batch fetching {len(all_input_txids)} input transactions to resolve ALL input addresses...")
        input_txs = await blockchain_service.fetch_transactions_batch(list(all_input_txids))
        input_tx_map = {tx.txid: tx for tx in input_txs if tx}
        
        # Build complete input/output data for each transaction
        tx_complete_data = {}
        for tx in transactions:
            # Resolve inputs
            resolved_inputs = []
            for inp in tx.inputs:
                if inp.txid and inp.txid in input_tx_map:
                    prev_tx = input_tx_map[inp.txid]
                    if inp.vout < len(prev_tx.outputs):
                        prev_output = prev_tx.outputs[inp.vout]
                        if prev_output.address:
                            resolved_inputs.append({
                                "address": prev_output.address,
                                "value": prev_output.value
                            })
                        else:
                            # No address (P2PK or other non-standard script)
                            # For P2PK, try to extract and show the public key
                            from app.services.blockchain_data import _extract_pubkey_from_p2pk_script
                            script_type = prev_output.script_type
                            
                            if script_type == "p2pk":
                                pubkey = _extract_pubkey_from_p2pk_script(prev_output.script_pubkey)
                                logger.info(f"🔍 P2PK input: extracted pubkey={pubkey[:20] if pubkey else 'None'}... from script_pubkey={prev_output.script_pubkey[:40] if prev_output.script_pubkey else 'None'}...")
                                if pubkey:
                                    placeholder = f"P2PK: {pubkey[:40]}..." if len(pubkey) > 40 else f"P2PK: {pubkey}"
                                else:
                                    placeholder = "P2PK Script"
                            else:
                                logger.info(f"🔍 Non-P2PK input: script_type={script_type}, has scriptPubKey={bool(prev_output.script_pubkey)}")
                                placeholder = f"No Address ({script_type or 'unknown'})"
                            
                            resolved_inputs.append({
                                "address": placeholder,
                                "value": prev_output.value
                            })
            
            # Outputs (include even without addresses - P2PK, OP_RETURN, etc.)
            outputs_data = []
            for out in tx.outputs:
                if out.address:
                    outputs_data.append({"address": out.address, "value": out.value})
                else:
                    # No address (P2PK, OP_RETURN, etc.)
                    from app.services.blockchain_data import _extract_pubkey_from_p2pk_script
                    script_type = out.script_type
                    
                    if script_type == "p2pk":
                        pubkey = _extract_pubkey_from_p2pk_script(out.script_pubkey)
                        if pubkey:
                            placeholder = f"P2PK: {pubkey[:40]}..." if len(pubkey) > 40 else f"P2PK: {pubkey}"
                        else:
                            placeholder = "P2PK Script"
                    else:
                        placeholder = f"No Address ({script_type or 'unknown'})"
                    
                    outputs_data.append({"address": placeholder, "value": out.value})
            
            tx_complete_data[tx.txid] = {
                "inputs": resolved_inputs,
                "outputs": outputs_data
            }
        
        # SECOND: Determine which TXs to include based on direction (using resolved data)
        logger.info(f"Processing {len(transactions)} transactions...")
        txs_to_include = set()
        tx_needs_input_check = set()  # For edge creation
        
        for tx in transactions:
            has_output_to_addr = any(out.address == address for out in tx.outputs)
            
            # Check if address is in inputs (now we can check the resolved data!)
            has_input_from_addr = any(
                inp["address"] == address 
                for inp in tx_complete_data[tx.txid]["inputs"]
            )
            
            # Include based on hop direction
            include_tx = False
            if has_output_to_addr and hops_before > 0:
                include_tx = True  # TX sends to address (appears LEFT)
            if has_input_from_addr and hops_after > 0:
                include_tx = True  # Address sends to TX (appears RIGHT)
                tx_needs_input_check.add(tx.txid)  # Need to check inputs for edge creation
            
            if include_tx:
                txs_to_include.add(tx.txid)
                tx_node_id = f"tx_{tx.txid}"
                
                # Include data for frontend expansion (limit to first 100 to prevent huge metadata)
                MAX_METADATA_ITEMS = 100
                inputs_data = tx_complete_data[tx.txid]["inputs"][:MAX_METADATA_ITEMS]
                outputs_data = tx_complete_data[tx.txid]["outputs"][:MAX_METADATA_ITEMS]
                
                nodes.append(NodeData(
                    id=tx_node_id,
                    label=f"{tx.txid[:16]}...",
                    type="transaction",
                    value=None,
                    metadata={
                        "txid": tx.txid,
                        "timestamp": tx.timestamp,
                        "inputCount": len(tx.inputs),
                        "outputCount": len(tx.outputs),
                        "inputs": inputs_data,  # Limited to prevent memory issues
                        "outputs": outputs_data,  # Limited to prevent memory issues
                    }
                ))
        
        logger.info(f"✅ Including {len(txs_to_include)} of {len(transactions)} TXs based on hop direction")
        
        # THIRD: Create edges (using complete resolved data)
        for tx in transactions:
            # Skip TXs that don't match hop direction criteria
            if tx.txid not in txs_to_include:
                continue
            
            tx_node_id = f"tx_{tx.txid}"
            
            # Check if any output goes to our address
            outputs_to_addr = [(idx, out) for idx, out in enumerate(tx.outputs) if out.address == address]
            
            # Check if any input comes from our address (using resolved data)
            inputs_from_addr = [
                inp for inp in tx_complete_data[tx.txid]["inputs"]
                if inp["address"] == address
            ]
            
            logger.info(f"TX {tx.txid[:20]}: {len(outputs_to_addr)} outputs to addr, {len(inputs_from_addr)} inputs from addr")
            
            # Directional filtering: Only add edges based on hop settings
            # TX → Address (receiving): Include if hops_before > 0
            if hops_before > 0:
                for vout, output in outputs_to_addr:
                    edges.append(EdgeData(
                        source=tx_node_id,
                        target=addr_node_id,
                        amount=output.value,
                        confidence=1.0,
                        metadata={"vout": vout}
                    ))
            
            # Address → TX (sending): Include if hops_after > 0
            if hops_after > 0 and inputs_from_addr:
                total_amount = sum(inp["value"] for inp in inputs_from_addr if inp["value"] is not None)
                edges.append(EdgeData(
                    source=addr_node_id,
                    target=tx_node_id,
                    amount=total_amount,
                    confidence=1.0,
                    metadata={}
                ))
            
            # REMOVED: Broken HOP 2+ logic
            # The old code was dumping ALL input/output addresses for all TXs
            # This needs to be reimplemented properly with RECURSIVE expansion
            # For now, hops > 1 will just show the same as hops = 1
            if hops_before > 1 or hops_after > 1:
                logger.warning(f"⚠️ Hops > 1 not yet implemented for address tracing (hops_before={hops_before}, hops_after={hops_after})")
                logger.warning(f"   Showing same result as hops=1 (only transactions directly connected to address)")
                logger.warning(f"   TODO: Implement proper recursive expansion")
        
        logger.info(f"✅ Address trace complete: {len(nodes)} nodes, {len(edges)} edges")
        
        return TraceGraphResponse(
            nodes=nodes,
            edges=edges,
            clusters=[],
            coinjoins=[],
            peel_chains=[],
            start_txid=transactions[0].txid if transactions else "",
            start_vout=0,
            total_nodes=len(nodes),
            total_edges=len(edges),
        )

    except Exception as e:
        logger.error(f"Failed to trace from address: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to trace from address: {str(e)}")


@router.get("/cluster/{cluster_id}")
async def get_cluster(
    cluster_id: str,
    blockchain_service: BlockchainDataService = Depends(get_blockchain_service),
):
    """
    Get information about an address cluster
    
    Returns all addresses in the cluster and related statistics.
    """
    try:
        # This would need to be stored/cached separately
        # For now, return a placeholder
        return {
            "cluster_id": cluster_id,
            "message": "Cluster lookup not yet implemented",
        }

    except Exception as e:
        logger.error(f"Failed to get cluster: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get cluster: {str(e)}")

