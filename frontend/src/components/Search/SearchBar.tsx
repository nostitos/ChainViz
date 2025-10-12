import { useState } from 'react'
import { Search, Settings } from 'lucide-react'

interface SearchBarProps {
  onSearch: (query: string, options: SearchOptions) => void
  loading?: boolean
}

export interface SearchOptions {
  maxDepth: number
  includeCoinjoin: boolean
  confidenceThreshold: number
}

export default function SearchBar({ onSearch, loading }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [showOptions, setShowOptions] = useState(false)
  const [options, setOptions] = useState<SearchOptions>({
    maxDepth: 20,
    includeCoinjoin: false,
    confidenceThreshold: 0.5,
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      onSearch(query.trim(), options)
    }
  }

  return (
    <div className="w-full bg-slate-800 border-b border-slate-700">
      <form onSubmit={handleSubmit} className="p-4">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter Bitcoin address or transaction ID..."
              className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
              disabled={loading}
            />
          </div>
          <button
            type="button"
            onClick={() => setShowOptions(!showOptions)}
            className="p-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
            title="Search options"
          >
            <Settings className="w-5 h-5 text-white" />
          </button>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-6 py-3 bg-primary-500 hover:bg-primary-600 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg font-medium text-white transition-colors"
          >
            {loading ? 'Tracing...' : 'Trace'}
          </button>
        </div>

        {showOptions && (
          <div className="mt-4 p-4 bg-slate-900 rounded-lg space-y-4">
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Max Trace Depth: {options.maxDepth}
              </label>
              <input
                type="range"
                min="5"
                max="50"
                value={options.maxDepth}
                onChange={(e) =>
                  setOptions({ ...options, maxDepth: parseInt(e.target.value) })
                }
                className="w-full"
              />
              <div className="flex justify-between text-xs text-slate-400 mt-1">
                <span>5 hops</span>
                <span>50 hops</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Confidence Threshold: {(options.confidenceThreshold * 100).toFixed(0)}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={options.confidenceThreshold * 100}
                onChange={(e) =>
                  setOptions({
                    ...options,
                    confidenceThreshold: parseInt(e.target.value) / 100,
                  })
                }
                className="w-full"
              />
              <div className="flex justify-between text-xs text-slate-400 mt-1">
                <span>0%</span>
                <span>100%</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="includeCoinjoin"
                checked={options.includeCoinjoin}
                onChange={(e) =>
                  setOptions({ ...options, includeCoinjoin: e.target.checked })
                }
                className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-primary-500 focus:ring-primary-500"
              />
              <label htmlFor="includeCoinjoin" className="text-sm text-white">
                Trace through CoinJoin transactions (experimental)
              </label>
            </div>
          </div>
        )}
      </form>
    </div>
  )
}




