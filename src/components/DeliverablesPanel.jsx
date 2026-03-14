import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import MarkdownRenderer from './MarkdownRenderer'

const TYPE_ICONS = { content: '📝', code: '💻', analysis: '📊', research: '🔍', outreach: '📧', text: '📄' }
const TYPE_LABELS = { content: 'Content', code: 'Code', analysis: 'Analysis', research: 'Research', outreach: 'Outreach', text: 'Text' }

export default function DeliverablesPanel({ agents = [], onClose }) {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [filterAgent, setFilterAgent] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params = { limit: 50 }
    if (filterAgent) params.agent = filterAgent
    api.getDeliverables(params)
      .then(d => { setItems(d.deliverables || []); setTotal(d.total || 0) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filterAgent])

  const agent = (id) => agents.find(a => a.id === id)

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-start pt-8 pb-8 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-4xl bg-hive-800 border border-hive-700 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-5 border-b border-hive-700 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold">Deliverables</h2>
            <p className="text-xs text-hive-400">{total} completed outputs from your agents</p>
          </div>
          <button onClick={onClose} className="text-hive-400 hover:text-hive-200 text-xl">&times;</button>
        </div>

        {/* Filters */}
        <div className="px-5 py-3 border-b border-hive-700/50 flex gap-2 overflow-x-auto shrink-0">
          <button
            onClick={() => setFilterAgent('')}
            className={`text-xs px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
              !filterAgent ? 'bg-honey/20 text-honey border border-honey/30' : 'text-hive-400 border border-hive-700 hover:border-hive-600'
            }`}
          >All agents</button>
          {agents.map(a => (
            <button
              key={a.id}
              onClick={() => setFilterAgent(a.id)}
              className={`text-xs px-3 py-1.5 rounded-full whitespace-nowrap transition-colors flex items-center gap-1 ${
                filterAgent === a.id ? 'bg-honey/20 text-honey border border-honey/30' : 'text-hive-400 border border-hive-700 hover:border-hive-600'
              }`}
            >
              <span>{a.avatar}</span> {a.name}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {loading ? (
            <div className="text-center text-hive-500 py-12">Loading deliverables...</div>
          ) : items.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-3xl mb-3">📭</div>
              <p className="text-hive-400">No deliverables yet</p>
              <p className="text-xs text-hive-600 mt-1">Completed tasks with real output will appear here</p>
            </div>
          ) : (
            items.map(item => {
              const a = agent(item.agent_id)
              const isExpanded = expanded === item.id
              return (
                <div key={item.id} className="bg-hive-900/50 border border-hive-700/50 rounded-xl overflow-hidden">
                  {/* Card header — always visible */}
                  <button
                    onClick={() => setExpanded(isExpanded ? null : item.id)}
                    className="w-full text-left p-4 flex items-start gap-3 hover:bg-hive-800/50 transition-colors"
                  >
                    <span className="text-xl shrink-0 mt-0.5">{TYPE_ICONS[item.type]}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="text-sm font-semibold truncate">{item.title}</h3>
                        {item.has_tools && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20 shrink-0">
                            real tools
                          </span>
                        )}
                        {item.score != null && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                            item.score >= 7 ? 'bg-green-500/15 text-green-400' :
                            item.score >= 4 ? 'bg-yellow-500/15 text-yellow-400' : 'bg-red-500/15 text-red-400'
                          }`}>{item.score}/10</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-hive-500">
                        {a && <span style={{ color: a.color }}>{a.avatar} {a.name}</span>}
                        <span>{TYPE_LABELS[item.type]}</span>
                        <span>{Math.round(item.output_length / 1000)}k chars</span>
                        {item.cost > 0 && <span>${item.cost.toFixed(4)}</span>}
                        {item.completed_at && <span>{new Date(item.completed_at).toLocaleDateString()}</span>}
                      </div>
                      {/* Preview line when collapsed */}
                      {!isExpanded && (
                        <p className="text-xs text-hive-500 mt-2 line-clamp-2 leading-relaxed">
                          {item.output.replace(/[#*`\[\]]/g, '').slice(0, 200)}
                        </p>
                      )}
                    </div>
                    <span className="text-hive-600 text-xs shrink-0 mt-1">{isExpanded ? '▲' : '▼'}</span>
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="border-t border-hive-700/50">
                      <div className="p-4 max-h-[60vh] overflow-y-auto bg-hive-900/80">
                        <div className="prose prose-invert prose-sm max-w-none">
                          <MarkdownRenderer content={item.output} />
                        </div>
                      </div>
                      <div className="px-4 py-2 border-t border-hive-700/30 flex gap-2">
                        <button
                          onClick={() => { navigator.clipboard.writeText(item.output); }}
                          className="text-xs px-3 py-1.5 rounded-lg border border-hive-600 text-hive-400 hover:text-hive-200 hover:border-hive-500 transition-colors"
                        >
                          Copy output
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
