export default function AgentCards({ agents, tasks, filterAgent, onFilterAgent, onStopAgent }) {
  return (
    <div className="p-4 space-y-3 pb-24">
      <h2 className="text-sm font-semibold text-t3 uppercase tracking-wider px-1">Agent Team</h2>

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
                ? 'bg-s4/80 ring-2 ring-t1/30 shadow-lg'
                : 'bg-s2 border border-s4 hover:bg-s3'
            }`}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="text-3xl">{agent.avatar}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold" style={{ color: agent.color }}>{agent.name}</span>
                  {agent.isRunning && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 bg-s3 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-t1 animate-pulse" />
                      <span className="text-[10px] font-medium text-t1">Active</span>
                    </span>
                  )}
                </div>
                <p className="text-xs text-t3 truncate">{agent.role} — {agent.description}</p>
              </div>
            </div>

            {/* Stats row */}
            <div className="flex gap-2">
              <div className="flex-1 bg-page/50 rounded-lg p-2 text-center">
                <div className="text-sm font-bold text-t1">{todoTasks.length}</div>
                <div className="text-[10px] text-t4">Queued</div>
              </div>
              <div className="flex-1 bg-page/50 rounded-lg p-2 text-center">
                <div className="text-sm font-bold text-t1">{activeTasks.length}</div>
                <div className="text-[10px] text-t4">Active</div>
              </div>
              <div className="flex-1 bg-page/50 rounded-lg p-2 text-center">
                <div className="text-sm font-bold text-t1">{doneTasks.length}</div>
                <div className="text-[10px] text-t4">Done</div>
              </div>
            </div>

            {/* Progress bar for running agent */}
            {agent.isRunning && (
              <div className="mt-3 flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-s4 rounded-full overflow-hidden">
                  <div className="h-full rounded-full animate-pulse" style={{ background: agent.color, width: '60%' }} />
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onStopAgent(agent.id) }}
                  className="text-xs text-danger hover:text-red-300 font-medium px-2 py-1 rounded-lg bg-danger/10 active:bg-danger/20"
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
          className="w-full text-center text-sm text-t3 py-3 active:text-t1"
        >
          Clear filter — Show all tasks
        </button>
      )}
    </div>
  )
}
