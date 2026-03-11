import { useState, useEffect } from 'react'
import { api } from '../lib/api'

const TYPE_ICONS = { feature: '✨', design: '🎨', code: '💻', prompt: '📝', workflow: '⚙️' }
const STATUS_COLORS = {
  pending: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  approved: 'bg-green-500/10 text-green-400 border-green-500/20',
  rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
  implemented: 'bg-blue-500/10 text-blue-400 border-blue-500/20'
}

export default function ProposalsPanel({ agents, onClose }) {
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

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-hive-800 border border-hive-700 rounded-xl w-full max-w-2xl shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="p-5 border-b border-hive-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">💡</span>
            <h2 className="text-lg font-semibold">Proposals</h2>
            {pendingCount > 0 && (
              <span className="bg-yellow-500/20 text-yellow-400 text-xs px-2 py-0.5 rounded-full font-medium">
                {pendingCount} pending
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-hive-400 hover:text-hive-200 text-xl">&times;</button>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1 p-3 border-b border-hive-700">
          {['pending', 'approved', 'rejected', 'implemented', 'all'].map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === s ? 'bg-honey-500/20 text-honey-400' : 'text-hive-400 hover:text-hive-200 hover:bg-hive-700/50'
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {/* Proposals List */}
        <div className="p-4 space-y-3">
          {proposals.length === 0 && (
            <div className="text-center text-hive-400 py-8">
              No {filter === 'all' ? '' : filter} proposals yet.
              {filter === 'pending' && <div className="text-xs mt-1">Self-improvement heartbeats will generate proposals automatically.</div>}
            </div>
          )}

          {proposals.map(p => {
            const agent = agents?.find(a => a.id === p.proposed_by)
            const isExpanded = expanded === p.id

            return (
              <div key={p.id} className="bg-hive-700/30 border border-hive-700 rounded-lg overflow-hidden">
                {/* Card Header */}
                <div
                  className="p-3 cursor-pointer hover:bg-hive-700/50 transition-colors"
                  onClick={() => setExpanded(isExpanded ? null : p.id)}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-lg">{TYPE_ICONS[p.type] || '💡'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-hive-200 truncate">{p.title}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_COLORS[p.status]}`}>
                          {p.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-hive-400">
                        {agent && <span>{agent.avatar} {agent.name}</span>}
                        <span>{p.type}</span>
                        <span>Priority: {p.priority}</span>
                        <span>Effort: {p.effort}</span>
                        <span>{new Date(p.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <span className="text-hive-500 text-xs">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="border-t border-hive-700 p-3 space-y-3">
                    {p.description && (
                      <div className="text-sm text-hive-300 whitespace-pre-wrap">{p.description}</div>
                    )}
                    {p.code_diff && (
                      <pre className="bg-hive-900 border border-hive-700 rounded-lg p-3 text-xs text-hive-300 overflow-x-auto font-mono whitespace-pre-wrap">
                        {p.code_diff}
                      </pre>
                    )}
                    {p.user_notes && (
                      <div className="text-xs text-hive-400 italic">Notes: {p.user_notes}</div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-1">
                      {p.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleAction(p.id, 'approved')}
                            className="px-3 py-1.5 bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg text-xs font-medium hover:bg-green-500/30 transition-colors"
                          >
                            ✓ Approve
                          </button>
                          <button
                            onClick={() => handleAction(p.id, 'rejected')}
                            className="px-3 py-1.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-xs font-medium hover:bg-red-500/30 transition-colors"
                          >
                            ✗ Reject
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="px-3 py-1.5 text-hive-400 hover:text-red-400 text-xs transition-colors ml-auto"
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
    </div>
  )
}
