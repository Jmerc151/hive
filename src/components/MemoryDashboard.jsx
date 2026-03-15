import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'

const AGENT_COLORS = {
  scout: '#f59e0b',
  forge: '#ef4444',
  quill: '#8b5cf6',
  dealer: '#10b981',
  oracle: '#3b82f6',
  nexus: '#ec4899',
}

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 60000) return 'Just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

export default function MemoryDashboard({ agents = [], onClose }) {
  const [entries, setEntries] = useState([])
  const [filter, setFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [loading, setLoading] = useState(false)

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.getMemoryEntries(filter || undefined, 100)
      setEntries(data)
      setSearchResults(null)
    } catch { /* ignore */ }
    setLoading(false)
  }, [filter])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  const handleSearch = async () => {
    if (!searchQuery.trim()) { setSearchResults(null); return }
    setLoading(true)
    try {
      const results = await api.searchMemory(searchQuery.trim(), filter || undefined, 20)
      setSearchResults(results)
    } catch { setSearchResults([]) }
    setLoading(false)
  }

  const handleDelete = async (id) => {
    if (deleting !== id) { setDeleting(id); return }
    await api.deleteMemoryEntry(id)
    setDeleting(null)
    setEntries(prev => prev.filter(e => e.id !== id))
    if (searchResults) setSearchResults(prev => prev.filter(e => e.id !== id))
  }

  const agentMap = {}
  agents.forEach(a => { agentMap[a.id] = a })

  // Count per agent
  const counts = {}
  entries.forEach(e => { counts[e.agent_id] = (counts[e.agent_id] || 0) + 1 })

  const displayEntries = searchResults || entries

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-s1 border border-s4 rounded-xl w-full max-w-2xl shadow-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>

        <div className="p-5 border-b border-s4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xl">&#129504;</span>
            <h2 className="text-lg font-semibold">Agent Memory</h2>
            <span className="text-xs bg-s4 px-2 py-0.5 rounded-full text-t3">{entries.length} entries</span>
          </div>
          <button onClick={onClose} className="text-t3 hover:text-t1 text-xl">&times;</button>
        </div>

        {/* Search bar */}
        <div className="px-5 pt-4 flex-shrink-0">
          <div className="flex gap-2">
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Search memory..."
              className="flex-1 bg-page border border-s4 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-t1/50"
            />
            <button onClick={handleSearch} className="px-3 py-2 bg-s4 hover:bg-s5 rounded-lg text-sm text-t2 transition-colors">Search</button>
            {searchResults && (
              <button onClick={() => { setSearchResults(null); setSearchQuery('') }} className="px-3 py-2 bg-s4 hover:bg-s5 rounded-lg text-xs text-t3 transition-colors">Clear</button>
            )}
          </div>
        </div>

        {/* Agent filter tabs */}
        <div className="px-5 pt-3 flex-shrink-0">
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setFilter('')}
              className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs transition-all ${!filter ? 'bg-s3 border border-t1/40 text-t1' : 'bg-s3 border border-s4 text-t3 hover:border-t4'}`}
            >
              All
              <span className="text-[10px] opacity-70">{entries.length}</span>
            </button>
            {agents.map(a => (
              <button
                key={a.id}
                onClick={() => setFilter(filter === a.id ? '' : a.id)}
                className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs transition-all ${filter === a.id ? 'bg-s3 border border-t1/40 text-t1' : 'bg-s3 border border-s4 text-t3 hover:border-t4'}`}
              >
                <span>{a.avatar}</span>
                <span>{a.name}</span>
                {counts[a.id] > 0 && <span className="text-[10px] opacity-70">{counts[a.id]}</span>}
              </button>
            ))}
          </div>
        </div>

        {searchResults && (
          <div className="px-5 pt-2 flex-shrink-0">
            <div className="text-xs text-t3">{searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "{searchQuery}"</div>
          </div>
        )}

        {/* Entries list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {loading && displayEntries.length === 0 && (
            <div className="text-center text-t4 py-8 text-sm">Loading...</div>
          )}

          {!loading && displayEntries.length === 0 && (
            <div className="text-center text-t4 py-8 text-sm">
              {searchResults !== null ? 'No matching memories found.' : 'No memories stored yet. Agents build memory as they complete tasks.'}
            </div>
          )}

          {displayEntries.map(entry => {
            const agent = agentMap[entry.agent_id]
            const isExpanded = expanded === entry.id
            const tags = (() => { try { return JSON.parse(entry.tags || '[]') } catch { return [] } })()
            const color = AGENT_COLORS[entry.agent_id] || '#6b7280'

            return (
              <div
                key={entry.id}
                className="p-3 bg-s3 rounded-lg border border-s4 hover:border-s4 transition-colors cursor-pointer"
                onClick={() => setExpanded(isExpanded ? null : entry.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {agent && <span className="text-sm flex-shrink-0">{agent.avatar}</span>}
                    <span className="text-xs font-medium" style={{ color }}>{agent?.name || entry.agent_id}</span>
                    <span className="text-[10px] text-t4">{timeAgo(entry.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {entry.source_task_id && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-s4 rounded text-t4 font-mono" title={entry.source_task_id}>
                        {entry.source_task_id.slice(0, 8)}
                      </span>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(entry.id) }}
                      className={`text-xs ${deleting === entry.id ? 'text-red-300 font-medium' : 'text-t4 hover:text-danger'}`}
                    >
                      {deleting === entry.id ? 'Confirm?' : 'x'}
                    </button>
                  </div>
                </div>

                <div className={`mt-1.5 text-sm text-t1 ${isExpanded ? '' : 'line-clamp-3'}`}>
                  {entry.content}
                </div>

                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {tags.map((tag, i) => (
                      <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-s4 text-t3">{tag}</span>
                    ))}
                  </div>
                )}

                {entry.score != null && (
                  <div className="mt-1 text-[10px] text-t4">Relevance: {(entry.score * 100).toFixed(0)}%</div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
