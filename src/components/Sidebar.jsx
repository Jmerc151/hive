import { useState } from 'react'

const STATUS_COLORS = {
  running: 'bg-green-500',
  idle: 'bg-hive-500'
}

export default function Sidebar({ agents, filterAgent, onFilterAgent, onStopAgent, onNewTask, taskCount }) {
  const [collapsed, setCollapsed] = useState(false)

  if (collapsed) {
    return (
      <aside className="w-16 bg-hive-800 border-r border-hive-700 flex flex-col items-center py-4 gap-3">
        <button onClick={() => setCollapsed(false)} className="text-xl mb-2 hover:text-honey transition-colors">🔥</button>
        <div className="w-8 h-px bg-hive-700" />
        {agents.map(agent => (
          <button
            key={agent.id}
            onClick={() => onFilterAgent(filterAgent === agent.id ? null : agent.id)}
            className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg transition-all ${
              filterAgent === agent.id ? 'ring-2 ring-honey bg-hive-700' : 'hover:bg-hive-700'
            }`}
            title={`${agent.name} — ${agent.role}`}
          >
            {agent.avatar}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={onNewTask} className="w-10 h-10 rounded-lg bg-honey text-white flex items-center justify-center text-lg hover:bg-honey-dim transition-colors" title="New Task">
          +
        </button>
      </aside>
    )
  }

  return (
    <aside className="w-72 bg-hive-800 border-r border-hive-700 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-hive-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🔥</span>
          <span className="font-semibold text-honey">Hive</span>
        </div>
        <button onClick={() => setCollapsed(true)} className="text-hive-400 hover:text-hive-200 text-sm">
          ‹‹
        </button>
      </div>

      {/* Stats */}
      <div className="p-4 border-b border-hive-700">
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="bg-hive-700/50 rounded-lg p-2">
            <div className="text-lg font-semibold">{taskCount}</div>
            <div className="text-xs text-hive-400">Tasks</div>
          </div>
          <div className="bg-hive-700/50 rounded-lg p-2">
            <div className="text-lg font-semibold">{agents.filter(a => a.isRunning).length}</div>
            <div className="text-xs text-hive-400">Active</div>
          </div>
        </div>
      </div>

      {/* Agent List */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="text-xs font-medium text-hive-400 uppercase tracking-wider mb-2 px-1">Agent Team</div>
        <div className="space-y-1">
          {agents.map(agent => (
            <div
              key={agent.id}
              onClick={() => onFilterAgent(filterAgent === agent.id ? null : agent.id)}
              className={`w-full text-left p-3 rounded-lg transition-all group cursor-pointer ${
                filterAgent === agent.id
                  ? 'bg-hive-700 ring-1 ring-honey/30'
                  : 'hover:bg-hive-700/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="text-2xl">{agent.avatar}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{agent.name}</span>
                    <span className={`w-2 h-2 rounded-full ${agent.isRunning ? STATUS_COLORS.running : STATUS_COLORS.idle}`} />
                  </div>
                  <div className="text-xs text-hive-400 truncate">{agent.role}</div>
                </div>
                <div className="text-xs text-hive-500 font-mono">
                  {agent.taskCounts?.completed || 0}
                </div>
              </div>
              {agent.isRunning && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1 bg-hive-600 rounded-full overflow-hidden">
                    <div className="h-full rounded-full animate-pulse" style={{ background: agent.color, width: '60%' }} />
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onStopAgent(agent.id) }}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Stop
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Filter indicator */}
      {filterAgent && (
        <div className="p-3 border-t border-hive-700">
          <button
            onClick={() => onFilterAgent(null)}
            className="w-full text-center text-xs text-hive-400 hover:text-hive-200 py-1"
          >
            Clear filter — Show all tasks
          </button>
        </div>
      )}
    </aside>
  )
}
