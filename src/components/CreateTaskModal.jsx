import { useState } from 'react'

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

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-hive-800 border border-hive-700 rounded-xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-hive-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold">New Task</h2>
          <button onClick={onClose} className="text-hive-400 hover:text-hive-200 text-xl">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-hive-300 mb-1.5">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              autoFocus
              className="w-full bg-hive-900 border border-hive-600 rounded-lg px-3 py-2.5 text-sm text-hive-100 placeholder:text-hive-500 focus:outline-none focus:ring-2 focus:ring-honey/50 focus:border-honey"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-hive-300 mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Detailed instructions for the agent..."
              rows={4}
              className="w-full bg-hive-900 border border-hive-600 rounded-lg px-3 py-2.5 text-sm text-hive-100 placeholder:text-hive-500 focus:outline-none focus:ring-2 focus:ring-honey/50 focus:border-honey resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-hive-300 mb-1.5">Priority</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value)}
                className="w-full bg-hive-900 border border-hive-600 rounded-lg px-3 py-2.5 text-sm text-hive-100 focus:outline-none focus:ring-2 focus:ring-honey/50 focus:border-honey"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            {/* Assign Agent */}
            <div>
              <label className="block text-sm font-medium text-hive-300 mb-1.5">Assign Agent</label>
              <select
                value={agentId}
                onChange={e => setAgentId(e.target.value)}
                className="w-full bg-hive-900 border border-hive-600 rounded-lg px-3 py-2.5 text-sm text-hive-100 focus:outline-none focus:ring-2 focus:ring-honey/50 focus:border-honey"
              >
                <option value="">Unassigned</option>
                {agents.map(agent => (
                  <option key={agent.id} value={agent.id}>
                    {agent.avatar} {agent.name} — {agent.role}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Token Budget & Approval */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-hive-300 mb-1.5">Token Budget</label>
              <input
                type="number"
                value={tokenBudget}
                onChange={e => setTokenBudget(e.target.value)}
                placeholder="Default (from settings)"
                className="w-full bg-hive-900 border border-hive-600 rounded-lg px-3 py-2.5 text-sm text-hive-100 placeholder:text-hive-500 focus:outline-none focus:ring-2 focus:ring-honey/50 focus:border-honey"
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={requiresApproval}
                  onChange={e => setRequiresApproval(e.target.checked)}
                  className="w-4 h-4 rounded border-hive-600 bg-hive-900 accent-honey"
                />
                <span className="text-sm text-hive-300">Require approval before run</span>
              </label>
            </div>
          </div>

          {/* Selected agent info */}
          {agentId && (() => {
            const agent = agents.find(a => a.id === agentId)
            return agent ? (
              <div className="flex items-start gap-3 p-3 bg-hive-700/30 rounded-lg border border-hive-700">
                <span className="text-2xl">{agent.avatar}</span>
                <div>
                  <div className="font-medium text-sm" style={{ color: agent.color }}>{agent.name}</div>
                  <div className="text-xs text-hive-400 mt-0.5">{agent.description}</div>
                </div>
              </div>
            ) : null
          })()}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-hive-400 hover:text-hive-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="px-5 py-2 bg-honey text-white rounded-lg font-medium text-sm hover:bg-honey-dim transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Create Task
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
