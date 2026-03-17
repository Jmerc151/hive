import { useState, useEffect } from 'react'
import { api } from '../lib/api'

const TYPE_ICONS = { feature: '✨', design: '🎨', code: '💻', prompt: '📝', workflow: '⚙️' }
const STATUS_COLORS = {
  pending: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  approved: 'bg-green-500/10 text-green-600 border-green-500/20',
  rejected: 'bg-red-500/10 text-red-600 border-red-500/20',
  implemented: 'bg-blue-500/10 text-blue-600 border-blue-500/20'
}

export default function ProposalsPanel({ agents, onClose, inline }) {
  const [proposals, setProposals] = useState([])
  const [filter, setFilter] = useState('pending')
  const [expanded, setExpanded] = useState(null)

  const refresh = () => {
    api.getProposals(filter === 'all' ? '' : filter).then(setProposals).catch(() => {})
  }

  useEffect(() => { refresh() }, [filter])

  const handleAction = async (id, status) => {
    await api.updateProposal(id, { status })
    refresh()
  }

  const handleDelete = async (id) => {
    await api.deleteProposal(id)
    refresh()
  }

  const pendingCount = proposals.filter(p => p.status === 'pending').length

  const content = (
    <div className={inline ? "h-full flex flex-col overflow-y-auto" : "bg-s1 rounded-xl w-full max-w-2xl shadow-2xl max-h-[85vh] overflow-y-auto"}
      style={inline ? undefined : { border: '0.5px solid rgba(0,0,0,0.08)' }}
      onClick={inline ? undefined : e => e.stopPropagation()}>

      {/* Header */}
        <div className="p-5 flex items-center justify-between" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
          <div className="flex items-center gap-2">
            <span className="text-xl">💡</span>
            <h2 className="text-lg font-semibold font-display text-t1">Proposals</h2>
            {pendingCount > 0 && (
              <span className="bg-yellow-500/20 text-yellow-600 text-xs px-2 py-0.5 rounded-full font-medium">
                {pendingCount} pending
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-t3 hover:text-t1 text-xl">&times;</button>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1 p-3" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
          {['pending', 'approved', 'rejected', 'implemented', 'all'].map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === s ? 'bg-t1/10 text-t1' : 'text-t3 hover:text-t1 hover:bg-s3'
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {/* Proposals List */}
        <div className="p-4 space-y-3">
          {proposals.length === 0 && (
            <div className="text-center text-t3 py-8">
              No {filter === 'all' ? '' : filter} proposals yet.
              {filter === 'pending' && <div className="text-xs mt-1">Self-improvement heartbeats will generate proposals automatically.</div>}
            </div>
          )}

          {proposals.map(p => {
            const agent = agents?.find(a => a.id === p.proposed_by)
            const isExpanded = expanded === p.id

            return (
              <div key={p.id} className="bg-s2 rounded-lg overflow-hidden" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
                {/* Card Header */}
                <div
                  className="p-3 cursor-pointer hover:bg-s3 transition-colors"
                  onClick={() => setExpanded(isExpanded ? null : p.id)}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-lg">{TYPE_ICONS[p.type] || '💡'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-t1 truncate">{p.title}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_COLORS[p.status]}`}>
                          {p.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-t3">
                        {agent && <span>{agent.avatar} {agent.name}</span>}
                        <span>{p.type}</span>
                        <span>Priority: {p.priority}</span>
                        <span>Effort: {p.effort}</span>
                        <span>{new Date(p.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <span className="text-t4 text-xs">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="p-3 space-y-3" style={{ borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
                    {p.description && (
                      <div className="text-sm text-t2 whitespace-pre-wrap">{p.description}</div>
                    )}
                    {p.code_diff && (
                      <pre className="bg-s2 rounded-lg p-3 text-xs text-t2 overflow-x-auto font-mono whitespace-pre-wrap" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
                        {p.code_diff}
                      </pre>
                    )}
                    {p.user_notes && (
                      <div className="text-xs text-t3 italic">Notes: {p.user_notes}</div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-1">
                      {p.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleAction(p.id, 'approved')}
                            className="px-3 py-1.5 bg-green-500/20 text-green-600 border border-green-500/30 rounded-lg text-xs font-medium hover:bg-green-500/30 transition-colors"
                          >
                            ✓ Approve
                          </button>
                          <button
                            onClick={() => handleAction(p.id, 'rejected')}
                            className="px-3 py-1.5 bg-red-500/20 text-red-600 border border-red-500/30 rounded-lg text-xs font-medium hover:bg-red-500/30 transition-colors"
                          >
                            ✗ Reject
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="px-3 py-1.5 text-t3 hover:text-red-500 text-xs transition-colors ml-auto"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
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
