export default function AgentCards({ agents, tasks, filterAgent, onFilterAgent, onStopAgent }) {
  return (
    <div className="p-4 space-y-3 pb-24">
      <h2 className="text-sm font-semibold text-hive-400 uppercase tracking-wider px-1">Agent Team</h2>

      {agents.map(agent => {
        const agentTasks = tasks.filter(t => t.agent_id === agent.id)
        const activeTasks = agentTasks.filter(t => t.status === 'in_progress')
        const doneTasks = agentTasks.filter(t => t.status === 'done')
        const todoTasks = agentTasks.filter(t => t.status === 'todo')
        const isActive = filterAgent === agent.id

        return (
          <button
            key={agent.id}
            onClick={() => onFilterAgent(isActive ? null : agent.id)}
            className={`w-full text-left rounded-2xl p-4 transition-all active:scale-[0.98] ${
              isActive
                ? 'bg-hive-700/80 ring-2 ring-honey/30 shadow-lg'
                : 'bg-hive-800/80 border border-hive-700/50 hover:bg-hive-700/50'
            }`}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="text-3xl">{agent.avatar}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold" style={{ color: agent.color }}>{agent.name}</span>
                  {agent.isRunning && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 bg-honey/15 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-honey animate-pulse" />
                      <span className="text-[10px] font-medium text-honey">Active</span>
                    </span>
                  )}
                </div>
                <p className="text-xs text-hive-400 truncate">{agent.role} — {agent.description}</p>
              </div>
            </div>

            {/* Stats row */}
            <div className="flex gap-2">
              <div className="flex-1 bg-hive-900/50 rounded-lg p-2 text-center">
                <div className="text-sm font-bold text-hive-200">{todoTasks.length}</div>
                <div className="text-[10px] text-hive-500">Queued</div>
              </div>
              <div className="flex-1 bg-hive-900/50 rounded-lg p-2 text-center">
                <div className="text-sm font-bold text-honey">{activeTasks.length}</div>
                <div className="text-[10px] text-hive-500">Active</div>
              </div>
              <div className="flex-1 bg-hive-900/50 rounded-lg p-2 text-center">
                <div className="text-sm font-bold text-honey">{doneTasks.length}</div>
                <div className="text-[10px] text-hive-500">Done</div>
              </div>
            </div>

            {/* Progress bar for running agent */}
            {agent.isRunning && (
              <div className="mt-3 flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-hive-700 rounded-full overflow-hidden">
                  <div className="h-full rounded-full animate-pulse" style={{ background: agent.color, width: '60%' }} />
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onStopAgent(agent.id) }}
                  className="text-xs text-red-400 hover:text-red-300 font-medium px-2 py-1 rounded-lg bg-red-400/10 active:bg-red-400/20"
                >
                  Stop
                </button>
              </div>
            )}
          </button>
        )
      })}

      {filterAgent && (
        <button
          onClick={() => onFilterAgent(null)}
          className="w-full text-center text-sm text-hive-400 py-3 active:text-hive-200"
        >
          Clear filter — Show all tasks
        </button>
      )}
    </div>
  )
}
