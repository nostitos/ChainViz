import Graph from 'graphology'
import type { TraceGraphResponse, GraphNode, GraphEdge } from '@/types'
import forceAtlas2 from 'graphology-layout-forceatlas2'

/**
 * Convert API response to Graphology graph format
 */
export function buildGraphFromTrace(data: TraceGraphResponse): Graph {
  const graph = new Graph({ multi: false })

  // Add nodes
  data.nodes.forEach((node) => {
    const nodeType = node.type
    const isChange = node.metadata?.is_change
    const clusterId = node.metadata?.cluster_id

    // Color based on type
    let color = '#94a3b8' // Default gray

    if (nodeType === 'address') {
      if (isChange) {
        color = '#fbbf24' // Amber for change addresses
      } else if (clusterId) {
        color = '#3b82f6' // Blue for clustered addresses
      } else {
        color = '#10b981' // Green for external addresses
      }
    } else if (nodeType === 'transaction') {
      color = '#8b5cf6' // Purple for transactions
    }

    // Size based on value or depth
    const size = nodeType === 'transaction' ? 8 : 12
    const depth = node.metadata?.depth || 0

    graph.addNode(node.id, {
      label: node.label,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size,
      color,
      type: nodeType,
      originalData: node.metadata,
      depth,
    })
  })

  // Add edges
  data.edges.forEach((edge, index) => {
    const confidence = edge.confidence

    // Edge color based on confidence
    let edgeColor = '#64748b' // Default gray
    if (confidence > 0.8) {
      edgeColor = '#10b981' // Green for high confidence
    } else if (confidence > 0.6) {
      edgeColor = '#fbbf24' // Amber for medium confidence
    } else {
      edgeColor = '#ef4444' // Red for low confidence
    }

    // Edge type based on confidence (solid vs dashed)
    const edgeType = confidence > 0.6 ? 'line' : 'dashed'

    // Edge size based on amount
    const amount = edge.amount
    const edgeSize = Math.max(1, Math.min(5, Math.log10(amount / 100000) + 2))

    try {
      if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
        graph.addEdge(edge.source, edge.target, {
          size: edgeSize,
          color: edgeColor,
          type: edgeType,
          label: edge.txid ? edge.txid.substring(0, 8) + '...' : '',
          confidence,
          amount: edge.amount,
          heuristic: edge.heuristic,
          originalData: edge.metadata,
        })
      }
    } catch (e) {
      console.warn(`Failed to add edge ${edge.source} -> ${edge.target}:`, e)
    }
  })

  // Apply layout algorithm
  try {
    const settings = forceAtlas2.inferSettings(graph)
    forceAtlas2.assign(graph, {
      iterations: 100,
      settings: {
        ...settings,
        gravity: 1,
        scalingRatio: 10,
        strongGravityMode: false,
        slowDown: 1,
      },
    })
  } catch (e) {
    console.warn('Layout algorithm failed, using random positions:', e)
  }

  return graph
}

/**
 * Get node color based on its properties
 */
export function getNodeColor(node: GraphNode): string {
  if (node.type === 'address') {
    if (node.metadata?.is_change) {
      return '#fbbf24'
    } else if (node.metadata?.cluster_id) {
      return '#3b82f6'
    }
    return '#10b981'
  } else if (node.type === 'transaction') {
    return '#8b5cf6'
  }
  return '#94a3b8'
}

/**
 * Get edge style based on confidence
 */
export function getEdgeStyle(confidence: number): {
  color: string
  type: string
  width: number
} {
  let color = '#64748b'
  let type = 'line'

  if (confidence > 0.8) {
    color = '#10b981'
    type = 'line'
  } else if (confidence > 0.6) {
    color = '#fbbf24'
    type = 'line'
  } else {
    color = '#ef4444'
    type = 'dashed'
  }

  return {
    color,
    type,
    width: confidence > 0.6 ? 2 : 1,
  }
}

/**
 * Format satoshis to BTC
 */
export function formatBTC(satoshis: number): string {
  const btc = satoshis / 100_000_000
  if (btc < 0.01) {
    return `${satoshis.toLocaleString()} sats`
  }
  return `${btc.toFixed(8)} BTC`
}

/**
 * Format confidence score as percentage
 */
export function formatConfidence(confidence: number): string {
  return `${(confidence * 100).toFixed(0)}%`
}




