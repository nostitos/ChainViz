import { useEffect, useRef, useState } from 'react'
import Graph from 'graphology'
import Sigma from 'sigma'
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'

interface GraphCanvasProps {
  graph: Graph
  onNodeClick?: (nodeId: string) => void
  onEdgeClick?: (edgeId: string) => void
}

export default function GraphCanvas({ graph, onNodeClick, onEdgeClick }: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sigmaRef = useRef<Sigma | null>(null)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)

  useEffect(() => {
    if (!containerRef.current || !graph) return

    // Create Sigma instance with WebGL renderer
    const sigma = new Sigma(graph, containerRef.current, {
      renderLabels: true,
      renderEdgeLabels: false,
      labelFont: 'system-ui, sans-serif',
      labelSize: 12,
      labelWeight: '600',
      labelColor: { color: '#ffffff' },
      defaultNodeColor: '#94a3b8',
      defaultEdgeColor: '#64748b',
      minCameraRatio: 0.1,
      maxCameraRatio: 10,
    })

    sigmaRef.current = sigma

    // Node hover events
    sigma.on('enterNode', ({ node }) => {
      setHoveredNode(node)
      // Highlight connected nodes
      const neighbors = new Set(graph.neighbors(node))
      graph.updateEachNodeAttributes((n, attr) => ({
        ...attr,
        highlighted: n === node || neighbors.has(n),
        dimmed: n !== node && !neighbors.has(n),
      }))
      sigma.refresh()
    })

    sigma.on('leaveNode', () => {
      setHoveredNode(null)
      // Reset highlighting
      graph.updateEachNodeAttributes((n, attr) => ({
        ...attr,
        highlighted: false,
        dimmed: false,
      }))
      sigma.refresh()
    })

    // Click events
    sigma.on('clickNode', ({ node }) => {
      onNodeClick?.(node)
    })

    sigma.on('clickEdge', ({ edge }) => {
      onEdgeClick?.(edge)
    })

    // Cleanup
    return () => {
      sigma.kill()
      sigmaRef.current = null
    }
  }, [graph, onNodeClick, onEdgeClick])

  const handleZoomIn = () => {
    const camera = sigmaRef.current?.getCamera()
    camera?.animatedZoom({ duration: 300 })
  }

  const handleZoomOut = () => {
    const camera = sigmaRef.current?.getCamera()
    camera?.animatedUnzoom({ duration: 300 })
  }

  const handleReset = () => {
    const camera = sigmaRef.current?.getCamera()
    camera?.animatedReset({ duration: 500 })
  }

  return (
    <div className="relative w-full h-full bg-slate-900">
      <div ref={containerRef} className="w-full h-full" />

      {/* Controls */}
      <div className="absolute top-4 right-4 flex flex-col gap-2">
        <button
          onClick={handleZoomIn}
          className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg shadow-lg transition-colors"
          title="Zoom in"
        >
          <ZoomIn className="w-5 h-5 text-white" />
        </button>
        <button
          onClick={handleZoomOut}
          className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg shadow-lg transition-colors"
          title="Zoom out"
        >
          <ZoomOut className="w-5 h-5 text-white" />
        </button>
        <button
          onClick={handleReset}
          className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg shadow-lg transition-colors"
          title="Reset view"
        >
          <Maximize2 className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Hovered node tooltip */}
      {hoveredNode && (
        <div className="absolute bottom-4 left-4 bg-slate-800 text-white px-4 py-2 rounded-lg shadow-lg">
          <div className="text-sm font-medium">{graph.getNodeAttribute(hoveredNode, 'label')}</div>
          <div className="text-xs text-slate-400">{graph.getNodeAttribute(hoveredNode, 'type')}</div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-4 right-4 bg-slate-800 text-white px-4 py-3 rounded-lg shadow-lg text-xs">
        <div className="font-semibold mb-2">Legend</div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <span>Clustered Address</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span>External Address</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-500"></div>
            <span>Change Address</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-purple-500"></div>
            <span>Transaction</span>
          </div>
        </div>
      </div>
    </div>
  )
}




