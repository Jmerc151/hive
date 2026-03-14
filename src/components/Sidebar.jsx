import { useState } from 'react'

const STATUS_COLORS = {
  running: 'bg-green-500',
  idle: 'bg-hive-500'
}

const MODEL_SHORT = {
  'perplexity/sonar-pro': 'Sonar',
  'deepseek/deepseek-r1': 'R1',
  'anthropic/claude-haiku-4-5': 'Haiku',
  'anthropic/claude-sonnet-4-5': 'Sonnet',
}

const NAV_ITEMS = [
  { key: 'deliverables', icon: '📦', label: 'Deliverables' },
  { key: 'graph', icon: '🕸️', label: 'Agent Graph' },
  { key: 'analytics', icon: '📊', label: 'Analytics' },
  { key: 'intel', icon: '🔍', label: 'Intel Feed' },
  { key: 'trading', icon: '📈', label: 'Trading' },
  { key: 'skillsV2', icon: '🧩', label: 'Skills' },
  { key: 'projects', icon: '📁', label: 'Projects' },
  { key: 'pipelines', icon: '🔗', label: 'Pipelines' },
  { key: 'proposals', icon: '💡', label: 'Proposals' },
  { key: 'revenue', icon: '💵', label: 'Revenue' },
  { key: 'history', icon: '📜', label: 'History' },
  { key: 'trace', icon: '📡', label: 'Live Trace' },
  { key: 'knowledge', icon: '📚', label: 'Knowledge' },
  { key: 'sandbox', icon: '🧫', label: 'Sandbox' },
  { key: 'eval', icon: '🧪', label: 'Eval Harness' },
  { key: 'schedule', icon: '⏰', label: 'Schedule' },
  { key: 'memory', icon: '🧠', label: 'Memory' },
  { key: 'triggers', icon: '⚡', label: 'Triggers' },
  { key: 'botGen', icon: '⚒️', label: 'Bot Generator' },
  { key: 'spend', icon: '💰', label: 'Spend Limits' },
  { key: 'chat', icon: '💬', label: 'Chat' },
]

export default function Sidebar({ agents, filterAgent, onFilterAgent, onStopAgent, onNewTask, taskCount, onScorecard, onSkills, onNav, currentUser, onLogout }) {
  const [collapsed, setCollapsed] = useState(false)

  if (collapsed) {
    return (
      <aside className="w-16 bg-hive-800 border-r border-hive-700 flex flex-col items-center py-4 gap-3">
        <button onClick={() => setCollapsed(false)} className="text-xl mb-2 hover:text-honey transition-colors" aria-label="Expand sidebar">🔥</button>
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
        <div className="w-8 h-px bg-hive-700 my-1" />
        {[
          { key: 'graph', icon: '🕸️', label: 'Graph' },
          { key: 'analytics', icon: '📊', label: 'Analytics' },
          { key: 'trading', icon: '📈', label: 'Trading' },
          { key: 'intel', icon: '🔍', label: 'Intel' },
          { key: 'proposals', icon: '💡', label: 'Proposals' },
        ].map(item => (
          <button
            key={item.key}
            onClick={() => onNav?.(item.key)}
            className="w-10 h-10 rounded-lg flex items-center justify-center text-lg hover:bg-hive-700 transition-all"
            title={item.label}
          >
            {item.icon}
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
        <button onClick={() => setCollapsed(true)} className="text-hive-400 hover:text-hive-200 text-sm" aria-label="Collapse sidebar">
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
                  <div className="flex items-center gap-2 mt-0.5">
                    {agent.model && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-hive-700/80 text-hive-400 rounded font-mono">
                        {MODEL_SHORT[agent.model] || agent.model.split('/').pop()}
                      </span>
                    )}
                    {agent.todaySpend != null && (
                      <span className={`text-[10px] font-medium ${agent.todaySpend > 1 ? 'text-amber-400' : 'text-hive-500'}`}>
                        ${agent.todaySpend.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); onScorecard?.(agent) }}
                    className="text-xs text-hive-500 hover:text-honey transition-colors"
                    title="Scorecard"
                  >📊</button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onSkills?.(agent) }}
                    className="text-xs text-hive-500 hover:text-honey transition-colors"
                    title="Skills"
                  >⚙️</button>
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

      {/* Navigation */}
      <div className="border-t border-hive-700 p-3 overflow-y-auto" style={{ maxHeight: '40%' }}>
        <div className="text-xs font-medium text-hive-400 uppercase tracking-wider mb-2 px-1">Panels</div>
        <div className="grid grid-cols-2 gap-1">
          {NAV_ITEMS.map(item => (
            <button
              key={item.key}
              onClick={() => onNav?.(item.key)}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-hive-300 hover:bg-hive-700/50 hover:text-hive-100 transition-colors text-left"
            >
              <span>{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </button>
          ))}
          {currentUser?.role === 'admin' && (
            <button
              onClick={() => onNav?.('users')}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-hive-300 hover:bg-hive-700/50 hover:text-hive-100 transition-colors text-left"
            >
              <span>👥</span>
              <span className="truncate">Users</span>
            </button>
          )}
        </div>
      </div>

      {/* Current user */}
      {currentUser && currentUser.username !== 'api' && currentUser.username !== 'anonymous' && (
        <div className="border-t border-hive-700 p-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-hive-700 flex items-center justify-center text-xs font-bold text-hive-300">
              {(currentUser.display_name || currentUser.username).charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-hive-200 truncate">{currentUser.display_name || currentUser.username}</div>
              <div className="text-[10px] text-hive-500">{currentUser.role}</div>
            </div>
            {onLogout && (
              <button onClick={onLogout} className="text-[10px] text-hive-500 hover:text-hive-300" title="Sign out">
                Sign out
              </button>
            )}
          </div>
        </div>
      )}

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
