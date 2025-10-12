import { X, Copy, ExternalLink } from 'lucide-react'
import { formatBTC, formatConfidence } from '@/services/graphBuilder'

interface InspectorProps {
  selectedNode: any
  onClose: () => void
}

export default function Inspector({ selectedNode, onClose }: InspectorProps) {
  if (!selectedNode) return null

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const openInExplorer = (address: string) => {
    window.open(`https://mempool.space/address/${address}`, '_blank')
  }

  return (
    <div className="w-96 h-full bg-slate-800 border-l border-slate-700 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-slate-800 border-b border-slate-700 p-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Inspector</h2>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-700 rounded transition-colors"
        >
          <X className="w-5 h-5 text-slate-400" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-6">
        {/* Node Type Badge */}
        <div>
          <span
            className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
              selectedNode.type === 'address'
                ? 'bg-blue-500/20 text-blue-400'
                : 'bg-purple-500/20 text-purple-400'
            }`}
          >
            {selectedNode.type}
          </span>
        </div>

        {/* Label */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Label</label>
          <div className="flex items-center gap-2">
            <span className="flex-1 text-sm text-white font-mono break-all">
              {selectedNode.label}
            </span>
            <button
              onClick={() => copyToClipboard(selectedNode.label)}
              className="p-1.5 hover:bg-slate-700 rounded transition-colors"
              title="Copy"
            >
              <Copy className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Address-specific info */}
        {selectedNode.type === 'address' && (
          <>
            <div>
              <button
                onClick={() => openInExplorer(selectedNode.label)}
                className="flex items-center gap-2 text-sm text-primary-400 hover:text-primary-300 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                View on Mempool.space
              </button>
            </div>

            {selectedNode.originalData?.is_change && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <div className="text-xs font-medium text-amber-400">Change Output</div>
                <div className="text-xs text-slate-300 mt-1">
                  This address was identified as a change output
                </div>
              </div>
            )}

            {selectedNode.originalData?.cluster_id && (
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Cluster ID
                </label>
                <span className="text-sm text-white font-mono">
                  {selectedNode.originalData.cluster_id}
                </span>
              </div>
            )}
          </>
        )}

        {/* Transaction-specific info */}
        {selectedNode.type === 'transaction' && (
          <>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Transaction ID
              </label>
              <div className="flex items-center gap-2">
                <span className="flex-1 text-sm text-white font-mono break-all">
                  {selectedNode.originalData?.txid}
                </span>
                <button
                  onClick={() => copyToClipboard(selectedNode.originalData?.txid)}
                  className="p-1.5 hover:bg-slate-700 rounded transition-colors"
                  title="Copy"
                >
                  <Copy className="w-4 h-4 text-slate-400" />
                </button>
              </div>
            </div>

            {selectedNode.originalData?.txid && (
              <div>
                <button
                  onClick={() =>
                    window.open(
                      `https://mempool.space/tx/${selectedNode.originalData.txid}`,
                      '_blank'
                    )
                  }
                  className="flex items-center gap-2 text-sm text-primary-400 hover:text-primary-300 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  View on Mempool.space
                </button>
              </div>
            )}

            {selectedNode.depth !== undefined && (
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Depth</label>
                <span className="text-sm text-white">{selectedNode.depth} hops</span>
              </div>
            )}
          </>
        )}

        {/* Additional metadata */}
        {selectedNode.originalData && Object.keys(selectedNode.originalData).length > 0 && (
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">
              Metadata
            </label>
            <div className="space-y-1 text-xs">
              {Object.entries(selectedNode.originalData).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-slate-400">{key}:</span>
                  <span className="text-white font-mono">{JSON.stringify(value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}




