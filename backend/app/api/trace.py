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
        logger.info(f"Tracing UTXO: {request.txid}:{request.vout}, hops_before={request.hops_before}, hops_after={request.hops_after}")

        # Get the base backward trace
        orchestrator = TraceOrchestrator(blockchain_service)
        result = await orchestrator.trace_utxo_backward(
            txid=request.txid,
            vout=request.vout,
            max_depth=request.hops_before,
            include_coinjoin=request.include_coinjoin,
            confidence_threshold=request.confidence_threshold,
        )

        # ALWAYS add INPUT and OUTPUT addresses for ALL transactions in the result
        # Use BATCHING for major performance improvement!
        tx_nodes = [n for n in result.nodes if n.type == 'transaction']
        logger.info(f"📥 Adding input/output addresses for {len(tx_nodes)} TXs in result")
        
        # ALWAYS include the starting transaction, even if it's not in the result yet
        # This is especially important for hops_before=0 where we want to show inputs/outputs
        start_tx = None
        if not any(n.metadata.get('txid') == request.txid for n in tx_nodes if n.metadata):
            logger.info(f"➕ Starting TX not in result, adding it...")
            # Fetch the starting transaction
            start_tx = await blockchain_service.fetch_transaction(request.txid)
            if start_tx:
                # Add the transaction node with INPUT/OUTPUT COUNTS (mark as starting point)
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
        
        # For hops_before=0 and hops_after=0, we're done! Just return the TX node with counts
        if request.hops_before == 0 and request.hops_after == 0:
            logger.info(f"✅ Single transaction view (hops=0): returning TX node with counts only")
            return result
        
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
                
                # Step 2: Collect all input TXIDs that need to be fetched
                input_txids = set()
                for tx in main_txs:
                    if tx:
                        for inp in tx.inputs:
                            if inp.txid:
                                input_txids.add(inp.txid)
                
                logger.info(f"⚡ Batch fetching {len(input_txids)} input transactions...")
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
                    
                    logger.info(f"📥 Processing inputs for TX {txid[:20]}... ({len(tx.inputs)} inputs)")
                    
                    # Add input addresses
                    for inp_idx, inp in enumerate(tx.inputs):
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
                    
                    # ALSO add output addresses for ALL transactions (especially important for starting TX)
                    logger.info(f"📤 Processing outputs for TX {txid[:20]}... ({len(tx.outputs)} outputs)")
                    for out_idx, out in enumerate(tx.outputs):
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
        
        logger.info(f"✅ Final result: {len(result.nodes)} nodes, {len(result.edges)} edges")

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
    max_hops: int = 1,
    max_transactions: int = 100,
    include_coinjoin: bool = False,
    confidence_threshold: float = 0.5,
    blockchain_service: BlockchainDataService = Depends(get_blockchain_service),
):
    """
    Trace from a Bitcoin address
    
    This endpoint:
    1. Gets all transactions for the address
    2. Returns the address and its connected transactions
    3. With max_hops=0, returns only the origin address
    4. With max_hops=1+, includes connected addresses
    
    Example: POST /api/trace/address?address=1A1z...&max_hops=1
    """
    try:
        logger.info(f"Tracing from address: {address} with max_hops={max_hops}")

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
        
        # HOP 0: Only the address node, no transactions
        if max_hops == 0:
            logger.info(f"✅ Hop 0: Returning only the address node")
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
        
        # Add ALL transaction nodes (both receiving and spending)
        logger.info(f"Processing {len(transactions)} transactions...")
        
        # First pass: Add all transaction nodes
        for tx in transactions:
            tx_node_id = f"tx_{tx.txid}"
            nodes.append(NodeData(
                id=tx_node_id,
                label=f"{tx.txid[:16]}...",
                type="transaction",
                value=None,
                metadata={"txid": tx.txid, "timestamp": tx.timestamp}
            ))
        
        # Collect input TXIDs ONLY for transactions that might spend from our address
        # (Optimization: Skip transactions where we know the address received funds, not spent)
        all_input_txids = set()
        tx_needs_input_check = set()  # Track which TXs need input address resolution
        
        for tx in transactions:
            # Quick check: Does this TX have any outputs TO our address?
            has_output_to_addr = any(out.address == address for out in tx.outputs)
            
            if not has_output_to_addr:
                # No outputs to our address, so our address MUST be in inputs (spending)
                # We need to fetch prev txs to verify
                tx_needs_input_check.add(tx.txid)
                for inp in tx.inputs:
                    if inp.txid:
                        all_input_txids.add(inp.txid)
            # else: TX sends TO our address, we don't need to check inputs
        
        logger.info(f"⚡ Batch fetching {len(all_input_txids)} input transactions (for {len(tx_needs_input_check)} TXs that might spend from address)...")
        input_txs = await blockchain_service.fetch_transactions_batch(list(all_input_txids))
        input_tx_map = {tx.txid: tx for tx in input_txs if tx}
        
        # Second pass: Add edges and addresses (using pre-fetched data)
        for tx in transactions:
            tx_node_id = f"tx_{tx.txid}"  # MUST be inside loop to capture correctly
            
            # Check if any output goes to our address (TX sending TO address)
            outputs_to_addr = [(idx, out) for idx, out in enumerate(tx.outputs) if out.address == address]
            
            # Check if any input spends from our address (TX spending FROM address)
            # OPTIMIZATION: Only check if this TX was flagged as needing input resolution
            inputs_from_addr = []
            if tx.txid in tx_needs_input_check:
                logger.info(f"  Checking {len(tx.inputs)} inputs for TX {tx.txid[:20]}...")
                for inp in tx.inputs:
                    if not inp.txid:
                        logger.debug(f"    Input has no txid (coinbase?), skipping")
                        continue
                    if inp.txid not in input_tx_map:
                        logger.warning(f"    ⚠️  Input {inp.txid[:12]}:{inp.vout} NOT IN input_tx_map!")
                        continue
                    prev_tx = input_tx_map[inp.txid]
                    if inp.vout >= len(prev_tx.outputs):
                        logger.warning(f"    ⚠️  Input {inp.txid[:12]}:{inp.vout} - vout {inp.vout} >= {len(prev_tx.outputs)} outputs!")
                        continue
                    prev_output = prev_tx.outputs[inp.vout]
                    logger.debug(f"    Input {inp.txid[:12]}:{inp.vout} -> address={prev_output.address[:15] if prev_output.address else 'None'}... (looking for {address[:15]}...)")
                    if prev_output.address == address:
                        # Create a new input object with the address and value populated
                        inp_with_data = TransactionInput(
                            txid=inp.txid,
                            vout=inp.vout,
                            script_sig=inp.script_sig,
                            sequence=inp.sequence,
                            witness=inp.witness,
                            address=prev_output.address,
                            value=prev_output.value
                        )
                        inputs_from_addr.append(inp_with_data)
                        logger.info(f"    ✅ FOUND INPUT from address: {prev_output.value} sats")
            else:
                logger.debug(f"  Skipping input check for TX {tx.txid[:20]} (has outputs to address)")
            
            logger.info(f"TX {tx.txid[:20]}: {len(outputs_to_addr)} outputs to addr, {len(inputs_from_addr)} inputs from addr")
                
            # Add edges for outputs TO our address (TX → Address)
            for vout, output in outputs_to_addr:
                edges.append(EdgeData(
                    source=tx_node_id,
                    target=addr_node_id,
                    amount=output.value,
                    confidence=1.0,
                    metadata={"vout": vout}
                ))
            
            # Add edges for inputs FROM our address (Address → TX)
            if inputs_from_addr:
                edges.append(EdgeData(
                    source=addr_node_id,
                    target=tx_node_id,
                    amount=sum(inp.value for inp in inputs_from_addr if inp.value is not None),
                    confidence=1.0,
                    metadata={}
                ))
            
            # If no clear connection but TX is in history, connect it anyway
            # (it must involve the address somehow - maybe input we can't see yet)
            if not outputs_to_addr and not inputs_from_addr:
                logger.warning(f"TX {tx.txid[:20]} in history but no clear connection - adding edge anyway")
                
                # Try to find the actual amount by checking inputs that match our address (using pre-fetched data)
                inferred_amount = 0
                for inp in tx.inputs:
                    if inp.txid and inp.txid in input_tx_map:
                        prev_tx = input_tx_map[inp.txid]
                        if inp.vout < len(prev_tx.outputs):
                            prev_output = prev_tx.outputs[inp.vout]
                            if prev_output.address == address:
                                inferred_amount = prev_output.value
                                logger.info(f"  Found inferred amount: {inferred_amount} from input {inp.vout}")
                                break
                
                # If still 0, use sum of all outputs as estimate
                if inferred_amount == 0:
                    inferred_amount = sum(o.value for o in tx.outputs if o.value)
                    logger.info(f"  Using total output as estimate: {inferred_amount}")
                
                # Assume it's spending from the address
                edges.append(EdgeData(
                    source=addr_node_id,
                    target=tx_node_id,
                    amount=inferred_amount,
                    confidence=0.5,
                    metadata={"inferred": True}
                ))
            
            # HOP 2+: Add input/output addresses (not at hop 1)
            if max_hops > 1:
                logger.info(f"Processing inputs for TX: {tx.txid[:20]}... (max_hops={max_hops})")
                logger.info(f"  tx_node_id = {tx_node_id[:30]}...")
                
                for inp in tx.inputs:
                    if inp.txid and inp.txid in input_tx_map:
                        prev_tx = input_tx_map[inp.txid]
                        if inp.vout < len(prev_tx.outputs):
                            prev_output = prev_tx.outputs[inp.vout]
                            logger.info(f"  Input {inp.vout} from prev TX {inp.txid[:15]}: address = {prev_output.address[:20] if prev_output.address else 'None'}...")
                            
                            # Only add if it's NOT the target address
                            if prev_output.address and prev_output.address != address:
                                inp_addr_id = f"addr_{prev_output.address}"
                                if not any(n.id == inp_addr_id for n in nodes):
                                    nodes.append(NodeData(
                                        id=inp_addr_id,
                                        label=prev_output.address,
                                        type="address",
                                        value=None,
                                        metadata={"address": prev_output.address, "is_change": False, "cluster_id": None}
                                    ))
                                # Edge from input address to THIS TX
                                logger.info(f"✅ Creating input edge: {prev_output.address[:20]}... → TX {tx.txid[:20]}")
                                edges.append(EdgeData(
                                    source=inp_addr_id,
                                    target=tx_node_id,
                                    amount=prev_output.value,
                                    confidence=1.0,
                                    metadata={}
                                ))
                            else:
                                logger.info(f"⏭️  Skipping (is target address or None)")
                
                # Add output addresses (determine change via improved heuristic)
                # Only mark ONE output as change if it clearly qualifies
                change_vout = None
                if len(tx.outputs) >= 2:
                    # Detect script type of inputs by fetching prev TXs
                    input_script_types = set()
                    for inp in tx.inputs:
                        if inp.txid:
                            try:
                                prev_tx = await blockchain_service.fetch_transaction(inp.txid)
                                if inp.vout < len(prev_tx.outputs):
                                    prev_out = prev_tx.outputs[inp.vout]
                                    if prev_out.script_type:
                                        input_script_types.add(prev_out.script_type)
                            except:
                                pass
                    
                    # Score each output
                    scored = []
                    for idx, out in enumerate(tx.outputs):
                        score = 0
                        reasons = []
                        
                        # Script type match (strongest signal)
                        if input_script_types and hasattr(out, 'script_type') and out.script_type in input_script_types:
                            score += 3
                            reasons.append(f"script matches input ({out.script_type})")
                        
                        # Non-round amount
                        is_round = (out.value % 1_000_000 == 0) or (out.value % 100_000 == 0)
                        if not is_round:
                            score += 1
                            reasons.append("non-round amount")
                        
                        # Not first output (weak signal)
                        if idx > 0:
                            score += 1
                            reasons.append("not first output")
                        
                        scored.append((idx, score, reasons))
                    
                    # Sort by score descending
                    scored.sort(key=lambda x: x[1], reverse=True)
                    
                    # Pick highest score if above threshold and unambiguous
                    change_reasons = []
                    if scored and scored[0][1] >= 3:
                        if len(scored) == 1 or scored[0][1] > scored[1][1]:
                            change_vout = scored[0][0]
                            change_reasons = scored[0][2]
                            logger.info(f"Change detected: vout={change_vout}, score={scored[0][1]}, reasons={change_reasons}")
                
                for idx, output in enumerate(tx.outputs):
                    if output.address and output.address != address:
                        out_addr_id = f"addr_{output.address}"
                        is_change = (idx == change_vout)
                        if not any(n.id == out_addr_id for n in nodes):
                            nodes.append(NodeData(
                                id=out_addr_id,
                                label=output.address,
                                type="address",
                                value=None,
                                metadata={
                                    "address": output.address, 
                                    "is_change": is_change, 
                                    "change_reasons": change_reasons if is_change else [],
                                    "cluster_id": None
                                }
                            ))
                        # Edge from THIS TX to output address
                        logger.info(f"Creating output edge: {tx_node_id[:25]}... (TX: {tx.txid[:20]}) → {output.address[:20]}...")
                        edges.append(EdgeData(
                            source=tx_node_id,
                            target=out_addr_id,
                            amount=output.value,
                            confidence=1.0,
                            metadata={"vout": idx}
                        ))
        
        # HOP 2+: ALSO add inputs for ALL TXs in this trace - using BATCH FETCHING for speed
        if max_hops > 1:
            tx_nodes_in_result = [n for n in nodes if n.type == 'transaction']
            logger.info(f"📥 Adding input addresses for {len(tx_nodes_in_result)} TXs from address trace (max_hops={max_hops}, using batch fetching)")
            
            # Collect all txids to fetch
            txids_to_fetch = [n.metadata.get('txid') for n in tx_nodes_in_result if n.metadata and n.metadata.get('txid')]
            
            if txids_to_fetch:
                # Batch fetch all transactions
                logger.info(f"📦 Batch fetching {len(txids_to_fetch)} transactions...")
                txs_map = {}
                try:
                    fetched_txs = await blockchain_service.fetch_transactions_batch(txids_to_fetch)
                    txs_map = {tx.txid: tx for tx in fetched_txs if tx}
                except Exception as e:
                    logger.error(f"Failed to batch fetch transactions: {e}")
                
                # Collect all previous txids from inputs
                prev_txids = set()
                for tx in txs_map.values():
                    for inp in tx.inputs:
                        if inp.txid:
                            prev_txids.add(inp.txid)
                
                # Batch fetch all previous transactions
                logger.info(f"📦 Batch fetching {len(prev_txids)} previous transactions for inputs...")
                prev_txs_map = {}
                try:
                    if prev_txids:
                        fetched_prev_txs = await blockchain_service.fetch_transactions_batch(list(prev_txids))
                        prev_txs_map = {tx.txid: tx for tx in fetched_prev_txs if tx}
                except Exception as e:
                    logger.error(f"Failed to batch fetch previous transactions: {e}")
                
                # Now process all inputs with cached data
                for tx_node_data in tx_nodes_in_result:
                    txid = tx_node_data.metadata.get('txid') if tx_node_data.metadata else None
                    if not txid or txid not in txs_map:
                        continue
                    
                    tx_node_id = tx_node_data.id
                    tx_full = txs_map[txid]
                    
                    for inp in tx_full.inputs:
                        if inp.txid and inp.txid in prev_txs_map:
                            prev_tx = prev_txs_map[inp.txid]
                            if inp.vout < len(prev_tx.outputs):
                                prev_output = prev_tx.outputs[inp.vout]
                                if prev_output.address and prev_output.address != address:
                                    inp_addr_id = f"addr_{prev_output.address}"
                                    if not any(n.id == inp_addr_id for n in nodes):
                                        nodes.append(NodeData(
                                            id=inp_addr_id,
                                            label=prev_output.address,
                                            type="address",
                                            value=None,
                                            metadata={"address": prev_output.address, "is_change": False, "cluster_id": None}
                                        ))
                                    if not any(e.source == inp_addr_id and e.target == tx_node_id for e in edges):
                                        edges.append(EdgeData(
                                            source=inp_addr_id,
                                            target=tx_node_id,
                                            amount=prev_output.value,
                                            confidence=1.0,
                                            metadata={"vout": inp.vout}
                                        ))
                
                logger.info(f"✅ Added input addresses using batch fetching")
        else:
            logger.info(f"✅ Hop 1: Showing only address and transactions (no other addresses)")
        
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

