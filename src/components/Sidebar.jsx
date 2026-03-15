import { useState } from 'react'

const STATUS_COLORS = {
  running: 'bg-green-500',
  idle: 'bg-hive-500'
}

const NAV_GROUPS = [
  {
    label: null, // no header — always visible
    items: [
      { key: 'mission', icon: '\uD83C\uDFAF', label: 'Mission Control' },
      { key: 'proposals', icon: '\uD83D\uDCA1', label: 'Proposals' },
      { key: 'intel', icon: '\uD83D\uDD0D', label: 'Intel Feed' },
    ]
  },
  {
    label: 'Work',
    items: [
      { key: 'deliverables', icon: '\uD83D\uDCE6', label: 'Deliverables' },
      { key: 'projects', icon: '\uD83D\uDCC1', label: 'Projects' },
      { key: 'pipelines', icon: '\uD83D\uDD17', label: 'Pipelines' },
      { key: 'schedule', icon: '\u23F0', label: 'Schedule' },
    ]
  },
  {
    label: 'Insights',
    items: [
      { key: 'analytics', icon: '\uD83D\uDCCA', label: 'Analytics' },
      { key: 'revenue', icon: '\uD83D\uDCB5', label: 'Revenue' },
      { key: 'trading', icon: '\uD83D\uDCC8', label: 'Trading' },
      { key: 'graph', icon: '\uD83D\uDD78\uFE0F', label: 'Agent Graph' },
    ]
  },
  {
    label: 'Tools',
    collapsed: true,
    items: [
      { key: 'skillsV2', icon: '\uD83E\uDDE9', label: 'Skills' },
      { key: 'knowledge', icon: '\uD83D\uDCDA', label: 'Knowledge' },
      { key: 'memory', icon: '\uD83E\uDDE0', label: 'Memory' },
      { key: 'triggers', icon: '\u26A1', label: 'Triggers' },
      { key: 'botGen', icon: '\u2692\uFE0F', label: 'Bot Generator' },
    ]
  },
  {
    label: 'Developer',
    collapsed: true,
    items: [
      { key: 'trace', icon: '\uD83D\uDCE1', label: 'Live Trace' },
      { key: 'sandbox', icon: '\uD83E\uDDEB', label: 'Sandbox' },
      { key: 'eval', icon: '\uD83E\uDDEA', label: 'Eval Harness' },
      { key: 'history', icon: '\uD83D\uDCDC', label: 'History' },
      { key: 'spend', icon: '\uD83D\uDCB0', label: 'Spend Limits' },
      { key: 'chat', icon: '\uD83D\uDCAC', label: 'Chat' },
    ]
  }
]

export default function Sidebar({ agents, filterAgent, onFilterAgent, onStopAgent, onNewTask, taskCount, onScorecard, onSkills, onNav, currentUser, onLogout }) {
  const [collapsed, setCollapsed] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState({})

  const toggleGroup = (label) => {
    setExpandedGroups(prev => ({ ...prev, [label]: !prev[label] }))
  }

  if (collapsed) {
    return (
      <aside className="w-14 bg-hive-800 border-r border-hive-700 flex flex-col items-center py-4 gap-2">
        <button onClick={() => setCollapsed(false)} className="text-lg mb-1 hover:text-honey transition-colors" aria-label="Expand">&#x1F41D;</button>
        <div className="w-7 h-px bg-hive-700" />
        {agents.map(agent => (
          <button
            key={agent.id}
            onClick={() => onFilterAgent(filterAgent === agent.id ? null : agent.id)}
            className={`w-9 h-9 rounded-lg flex items-center justify-center text-base transition-all relative ${
              filterAgent === agent.id ? 'ring-2 ring-honey bg-hive-700' : 'hover:bg-hive-700'
            }`}
            title={agent.name}
          >
            {agent.avatar}
            {agent.isRunning && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full" />}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={onNewTask} className="w-9 h-9 rounded-lg bg-honey text-white flex items-center justify-center text-base hover:bg-honey-dim transition-colors" title="New Task">
          +
        </button>
      </aside>
    )
  }

  return (
    <aside className="w-64 bg-hive-800 border-r border-hive-700 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-hive-700 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-lg">&#x1F41D;</span>
          <span className="font-semibold text-honey text-sm">Hive</span>
          <span className="text-xs text-hive-500 bg-hive-700/50 px-1.5 py-0.5 rounded">{taskCount}</span>
        </div>
        <button onClick={() => setCollapsed(true)} className="text-hive-500 hover:text-hive-300 text-xs">
          &#x2039;&#x2039;
        </button>
      </div>

      {/* Agents — compact */}
      <div className="px-3 py-2 border-b border-hive-700 shrink-0">
        <div className="space-y-0.5">
          {agents.map(agent => (
            <div
              key={agent.id}
              onClick={() => onFilterAgent(filterAgent === agent.id ? null : agent.id)}
              className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer transition-all ${
                filterAgent === agent.id
                  ? 'bg-hive-700 ring-1 ring-honey/30'
                  : 'hover:bg-hive-700/40'
              }`}
            >
              <span className="text-base">{agent.avatar}</span>
              <span className="text-sm text-hive-200 flex-1 truncate">{agent.name}</span>
              <div className="flex items-center gap-1.5">
                {agent.isRunning ? (
                  <>
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                    <button
                      onClick={(e) => { e.stopPropagation(); onStopAgent(agent.id) }}
                      className="text-[10px] text-red-400/70 hover:text-red-400 px-1"
                    >Stop</button>
                  </>
                ) : (
                  <span className="w-1.5 h-1.5 bg-hive-600 rounded-full" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Navigation — grouped */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {NAV_GROUPS.map((group, gi) => {
          const isCollapsible = !!group.label
          const defaultOpen = !group.collapsed
          const isOpen = group.label ? (expandedGroups[group.label] ?? defaultOpen) : true

          return (
            <div key={gi} className="mb-1">
              {group.label && (
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="flex items-center gap-1 w-full px-2 py-1.5 text-[10px] font-semibold text-hive-500 uppercase tracking-wider hover:text-hive-300 transition-colors"
                >
                  <span className="text-[9px] transition-transform" style={{ transform: isOpen ? 'rotate(90deg)' : '' }}>&#x25B6;</span>
                  {group.label}
                </button>
              )}
              {isOpen && (
                <div className="space-y-0.5">
                  {group.items.map(item => (
                    <button
                      key={item.key}
                      onClick={() => onNav?.(item.key)}
                      className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-sm text-hive-300 hover:bg-hive-700/50 hover:text-hive-100 transition-colors text-left"
                    >
                      <span className="text-sm w-5 text-center">{item.icon}</span>
                      <span className="truncate">{item.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {currentUser?.role === 'admin' && (
          <button
            onClick={() => onNav?.('users')}
            className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-sm text-hive-300 hover:bg-hive-700/50 hover:text-hive-100 transition-colors text-left"
          >
            <span className="text-sm w-5 text-center">&#x1F465;</span>
            <span>Users</span>
          </button>
        )}
      </div>

      {/* + New Task button */}
      <div className="px-3 py-2 border-t border-hive-700 shrink-0">
        <button onClick={onNewTask} className="w-full py-2 rounded-lg bg-honey hover:bg-honey-dim text-white text-sm font-medium transition-colors">
          + New Task
        </button>
      </div>

      {/* User */}
      {currentUser && currentUser.username !== 'api' && currentUser.username !== 'anonymous' && (
        <div className="px-3 py-2 border-t border-hive-700 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-hive-700 flex items-center justify-center text-[10px] font-bold text-hive-300">
              {(currentUser.display_name || currentUser.username).charAt(0).toUpperCase()}
            </div>
            <span className="text-xs text-hive-300 flex-1 truncate">{currentUser.display_name || currentUser.username}</span>
            {onLogout && (
              <button onClick={onLogout} className="text-[10px] text-hive-500 hover:text-hive-300">Sign out</button>
            )}
          </div>
        </div>
      )}

      {/* Filter indicator */}
      {filterAgent && (
        <div className="px-3 py-2 border-t border-honey/20 bg-honey/5 shrink-0">
          <button onClick={() => onFilterAgent(null)} className="w-full text-center text-xs text-honey/70 hover:text-honey py-0.5">
            &#x2715; Clear agent filter
          </button>
        </div>
      )}
    </aside>
  )
}
