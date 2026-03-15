import { useState } from 'react'

const AGENT_TILES = {
  scout:  { letter: 'S', class: 'tile-scout' },
  forge:  { letter: 'F', class: 'tile-forge' },
  quill:  { letter: 'Q', class: 'tile-quill' },
  dealer: { letter: 'D', class: 'tile-dealer' },
  oracle: { letter: 'O', class: 'tile-oracle' },
  nexus:  { letter: 'N', class: 'tile-nexus' },
}

export default function CreateTaskModal({ agents, onSubmit, onClose }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [agentId, setAgentId] = useState('')
  const [tokenBudget, setTokenBudget] = useState('')
  const [requiresApproval, setRequiresApproval] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!title.trim()) return
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      priority,
      agent_id: agentId || null,
      token_budget: tokenBudget ? parseInt(tokenBudget) : 0,
      requires_approval: requiresApproval
    })
  }

  const inputClass = "w-full bg-s3 rounded-xl px-3 py-2.5 text-sm text-t1 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-t1/20"
  const inputBorder = { border: '0.5px solid rgba(0,0,0,0.1)' }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-backdrop" />
      <div className="modal-content w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="p-5 flex items-center justify-between" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
          <h2 className="font-display text-xl tracking-wider text-t1">NEW TASK</h2>
          <button onClick={onClose} className="text-t4 hover:text-t1 text-xl transition-colors">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-t2 mb-1.5">Title</label>
            <input
              type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              autoFocus
              className={inputClass}
              style={inputBorder}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-t2 mb-1.5">Description</label>
            <textarea
              value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Detailed instructions for the agent..."
              rows={4}
              className={`${inputClass} resize-none`}
              style={inputBorder}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-t2 mb-1.5">Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value)}
                className={inputClass} style={inputBorder}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-t2 mb-1.5">Assign Agent</label>
              <select value={agentId} onChange={e => setAgentId(e.target.value)}
                className={inputClass} style={inputBorder}>
                <option value="">Unassigned</option>
                {agents.map(agent => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name} — {agent.role}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-t2 mb-1.5">Token Budget</label>
              <input type="number" value={tokenBudget} onChange={e => setTokenBudget(e.target.value)}
                placeholder="Default (from settings)"
                className={inputClass} style={inputBorder}
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={requiresApproval}
                  onChange={e => setRequiresApproval(e.target.checked)}
                  className="w-4 h-4 rounded accent-t1"
                />
                <span className="text-sm text-t2">Require approval</span>
              </label>
            </div>
          </div>

          {agentId && (() => {
            const agent = agents.find(a => a.id === agentId)
            const tile = agent ? AGENT_TILES[agent.id] : null
            return agent ? (
              <div className="flex items-start gap-3 p-3 bg-s3 rounded-xl" style={{ border: '0.5px solid rgba(0,0,0,0.06)' }}>
                {tile && <div className={`agent-tile w-8 h-8 rounded-lg text-sm ${tile.class}`}>{tile.letter}</div>}
                <div>
                  <div className="font-medium text-sm text-t1">{agent.name}</div>
                  <div className="text-xs text-t3 mt-0.5">{agent.description}</div>
                </div>
              </div>
            ) : null
          })()}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-t3 hover:text-t1 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={!title.trim()}
              className="btn-primary px-5 py-2 disabled:opacity-40 disabled:cursor-not-allowed">
              Create Task
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
