import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'

function formatDuration(ms) {
  if (!ms) return '—'
  if (ms < 60000) return `${Math.round(ms / 1000)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

export default function HistoryPanel({ agents = [], onClose, onSelectTask, inline }) {
  const [data, setData] = useState({ tasks: [], total: 0 })
  const [search, setSearch] = useState('')
  const [filterAgent, setFilterAgent] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [offset, setOffset] = useState(0)
  const debounceRef = useRef(null)

  const fetchHistory = (s = search, a = filterAgent, st = filterStatus, o = offset) => {
    const params = { limit: 30, offset: o }
    if (s) params.search = s
    if (a) params.agent = a
    if (st) params.status = st
    api.getHistory(params).then(setData).catch(() => {})
  }

  useEffect(() => { fetchHistory('', '', '', 0) }, [])

  const handleSearch = (v) => {
    setSearch(v)
    setOffset(0)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchHistory(v, filterAgent, filterStatus, 0), 300)
  }

  const handleFilterAgent = (v) => { setFilterAgent(v); setOffset(0); fetchHistory(search, v, filterStatus, 0) }
  const handleFilterStatus = (v) => { setFilterStatus(v); setOffset(0); fetchHistory(search, filterAgent, v, 0) }

  const content = (
    <div className={inline ? "h-full flex flex-col overflow-y-auto" : "bg-s1 rounded-xl w-full max-w-3xl shadow-2xl max-h-[85vh] flex flex-col"}
      style={inline ? undefined : { border: '0.5px solid rgba(0,0,0,0.08)' }}
      onClick={inline ? undefined : e => e.stopPropagation()}>
      <div className="p-5 shrink-0" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">📜</span>
            <h2 className="text-lg font-semibold font-display text-t1">History</h2>
            <span className="text-xs bg-s3 text-t3 rounded-full px-2 py-0.5">{data.total}</span>
          </div>
          <button onClick={onClose} className="text-t3 hover:text-t1 text-xl">&times;</button>
        </div>
          <div className="flex gap-2">
            <input
              type="text" value={search} onChange={e => handleSearch(e.target.value)}
              placeholder="Search tasks, outputs, logs..."
              className="flex-1 bg-s2 rounded-lg px-3 py-2 text-sm text-t1 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-t1/50"
              style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}
            />
            <select value={filterAgent} onChange={e => handleFilterAgent(e.target.value)}
              className="bg-s2 rounded-lg px-2 py-2 text-sm text-t2 focus:outline-none"
              style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
              <option value="">All Agents</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.avatar} {a.name}</option>)}
            </select>
            <select value={filterStatus} onChange={e => handleFilterStatus(e.target.value)}
              className="bg-s2 rounded-lg px-2 py-2 text-sm text-t2 focus:outline-none"
              style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
              <option value="">All</option>
              <option value="done">Done</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {data.tasks.map(t => {
            const a = agents.find(x => x.id === t.agent_id)
            return (
              <div key={t.id} onClick={() => onSelectTask?.(t.id)}
                className="p-3 bg-s2 rounded-lg hover:bg-s3 cursor-pointer transition-all"
                style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${t.status === 'done' ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="text-sm font-medium text-t1 truncate">{t.title}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {t.nexus_score != null && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        t.nexus_score >= 7 ? 'bg-green-500/15 text-green-600' :
                        t.nexus_score >= 4 ? 'bg-yellow-500/15 text-yellow-600' : 'bg-red-500/15 text-red-600'
                      }`}>{t.nexus_score}/10</span>
                    )}
                    {a && <span title={a.name}>{a.avatar}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-t4">
                  <span>{formatDuration(t.duration_ms)}</span>
                  <span>{t.tokens_used?.toLocaleString()} tokens</span>
                  <span>${(t.estimated_cost || 0).toFixed(3)}</span>
                  {t.completed_at && <span>{new Date(t.completed_at).toLocaleDateString()}</span>}
                  {t.retries > 0 && <span className="text-amber-500">{t.retries} retries</span>}
                </div>
              </div>
            )
          })}

          {data.tasks.length === 0 && (
            <div className="text-center py-12 text-sm text-t4">No history entries found.</div>
          )}

          {data.total > offset + 30 && (
            <button onClick={() => { setOffset(offset + 30); fetchHistory(search, filterAgent, filterStatus, offset + 30) }}
              className="w-full py-2 text-sm text-t3 hover:text-t1 transition-colors">
              Load more ({data.total - offset - 30} remaining)
            </button>
          )}
      </div>
    </div>
  )

  if (inline) return content

  return (
    <div className="fixed inset-0 bg-page backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      {content}
    </div>
  )
}
