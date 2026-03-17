import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import MarkdownRenderer from './MarkdownRenderer'

const TYPE_ICONS = { content: '📝', code: '💻', analysis: '📊', research: '🔍', outreach: '📧', text: '📄' }
const TYPE_LABELS = { content: 'Content', code: 'Code', analysis: 'Analysis', research: 'Research', outreach: 'Outreach', text: 'Text' }

export default function DeliverablesPanel({ agents = [], onClose, inline }) {
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

  const content = (
    <div className={inline ? "h-full flex flex-col overflow-y-auto" : "w-full max-w-4xl bg-s1 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"}
      style={inline ? undefined : { border: '0.5px solid rgba(0,0,0,0.08)' }}
      onClick={inline ? undefined : e => e.stopPropagation()}>
      {/* Header */}
      <div className="p-5 flex items-center justify-between shrink-0" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
        <div>
          <h2 className="text-lg font-bold font-display text-t1">Deliverables</h2>
          <p className="text-xs text-t3">{total} completed outputs from your agents</p>
        </div>
        <button onClick={onClose} className="text-t3 hover:text-t1 text-xl">&times;</button>
      </div>

      {/* Filters */}
      <div className="px-5 py-3 flex gap-2 overflow-x-auto shrink-0" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
        <button
          onClick={() => setFilterAgent('')}
          className={`text-xs px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
            !filterAgent ? 'bg-t1/10 text-t1' : 'text-t3'
          }`}
          style={!filterAgent ? { border: '0.5px solid rgba(0,0,0,0.08)' } : { border: '0.5px solid rgba(0,0,0,0.08)' }}
        >All agents</button>
        {agents.map(a => (
          <button
            key={a.id}
            onClick={() => setFilterAgent(a.id)}
            className={`text-xs px-3 py-1.5 rounded-full whitespace-nowrap transition-colors flex items-center gap-1 ${
              filterAgent === a.id ? 'bg-t1/10 text-t1' : 'text-t3'
            }`}
            style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}
          >
            <span>{a.avatar}</span> {a.name}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        {loading ? (
          <div className="text-center text-t4 py-12">Loading deliverables...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-3xl mb-3">📭</div>
            <p className="text-t3">No deliverables yet</p>
            <p className="text-xs text-t5 mt-1">Completed tasks with real output will appear here</p>
          </div>
        ) : (
          items.map(item => {
            const a = agent(item.agent_id)
            const isExpanded = expanded === item.id
            return (
              <div key={item.id} className="bg-s2 rounded-xl overflow-hidden" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
                {/* Card header — always visible */}
                <button
                  onClick={() => setExpanded(isExpanded ? null : item.id)}
                  className="w-full text-left p-4 flex items-start gap-3 hover:bg-s3 transition-colors"
                >
                  <span className="text-xl shrink-0 mt-0.5">{TYPE_ICONS[item.type]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="text-sm font-semibold text-t1 truncate">{item.title}</h3>
                      {item.has_tools && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-600 border border-green-500/20 shrink-0">
                          {item.evidence?.tools_used ? `${item.evidence.tools_used} tools` : 'real tools'}
                        </span>
                      )}
                      {item.evidence?.files_created > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 border border-blue-500/20 shrink-0">
                          {item.evidence.files_created} files
                        </span>
                      )}
                      {item.evidence?.emails_sent > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 border border-purple-500/20 shrink-0">
                          {item.evidence.emails_sent} emails
                        </span>
                      )}
                      {item.evidence?.trades_placed > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-600 border border-yellow-500/20 shrink-0">
                          {item.evidence.trades_placed} trades
                        </span>
                      )}
                      {item.evidence?.tasks_created > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-600 border border-cyan-500/20 shrink-0">
                          {item.evidence.tasks_created} follow-ups
                        </span>
                      )}
                      {item.spawned_by && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-s3 text-t3 shrink-0">
                          chained
                        </span>
                      )}
                      {item.score != null && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                          item.score >= 7 ? 'bg-green-500/15 text-green-600' :
                          item.score >= 4 ? 'bg-yellow-500/15 text-yellow-600' : 'bg-red-500/15 text-red-600'
                        }`}>{item.score}/10</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-t4">
                      {a && <span style={{ color: a.color }}>{a.avatar} {a.name}</span>}
                      <span>{TYPE_LABELS[item.type]}</span>
                      <span>{Math.round(item.output_length / 1000)}k chars</span>
                      {item.cost > 0 && <span>${item.cost.toFixed(4)}</span>}
                      {item.completed_at && <span>{new Date(item.completed_at).toLocaleDateString()}</span>}
                    </div>
                    {/* Preview line when collapsed */}
                    {!isExpanded && (
                      <p className="text-xs text-t4 mt-2 line-clamp-2 leading-relaxed">
                        {item.output.replace(/[#*`\[\]]/g, '').slice(0, 200)}
                      </p>
                    )}
                  </div>
                  <span className="text-t5 text-xs shrink-0 mt-1">{isExpanded ? '▲' : '▼'}</span>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div style={{ borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
                    <div className="p-4 max-h-[60vh] overflow-y-auto bg-s2">
                      <div className="prose prose-sm max-w-none">
                        <MarkdownRenderer content={item.output} />
                      </div>
                    </div>
                    <div className="px-4 py-2 flex gap-2" style={{ borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
                      <button
                        onClick={() => { navigator.clipboard.writeText(item.output); }}
                        className="text-xs px-3 py-1.5 rounded-lg text-t3 hover:text-t1 transition-colors"
                        style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}
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
  )

  if (inline) return content

  return (
    <div className="fixed inset-0 bg-page backdrop-blur-sm z-50 flex justify-center items-start pt-8 pb-8 overflow-y-auto" onClick={onClose}>
      {content}
    </div>
  )
}
