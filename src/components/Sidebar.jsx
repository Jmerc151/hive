import { useState } from 'react'

const AGENT_TILES = {
  scout:  { letter: 'S', class: 'tile-scout' },
  forge:  { letter: 'F', class: 'tile-forge' },
  quill:  { letter: 'Q', class: 'tile-quill' },
  dealer: { letter: 'D', class: 'tile-dealer' },
  oracle: { letter: 'O', class: 'tile-oracle' },
  nexus:  { letter: 'N', class: 'tile-nexus' },
}

const NAV_GROUPS = [
  {
    label: 'Agents',
    agentSection: true,
  },
  {
    label: 'Work',
    items: [
      { key: 'deliverables', icon: '\u25A6', label: 'Deliverables' },
      { key: 'projects',     icon: '\u25A4', label: 'Projects' },
      { key: 'pipelines',    icon: '\u22B6', label: 'Pipelines' },
      { key: 'schedule',     icon: '\u229E', label: 'Schedule' },
    ]
  },
  {
    label: 'Insights',
    items: [
      { key: 'analytics', icon: '\u25A3', label: 'Analytics' },
      { key: 'revenue',   icon: '\u25AB', label: 'Revenue' },
      { key: 'trading',   icon: '\u25AA', label: 'Trading' },
      { key: 'intel',     icon: '\u25C9', label: 'Intel Feed' },
    ]
  },
  {
    label: 'Tools',
    collapsed: true,
    items: [
      { key: 'skillsV2',   icon: '\u29C9', label: 'Skills' },
      { key: 'knowledge',  icon: '\u25C7', label: 'Knowledge' },
      { key: 'memory',     icon: '\u25CE', label: 'Memory' },
      { key: 'triggers',   icon: '\u26A1', label: 'Triggers' },
      { key: 'botGen',     icon: '\u2692', label: 'Bot Generator' },
    ]
  },
  {
    label: 'Developer',
    collapsed: true,
    items: [
      { key: 'trace',   icon: '\u25C8', label: 'Live Trace' },
      { key: 'sandbox', icon: '\u25A1', label: 'Sandbox' },
      { key: 'eval',    icon: '\u25A2', label: 'Eval Harness' },
      { key: 'history', icon: '\u25B7', label: 'History' },
      { key: 'spend',   icon: '\u25B3', label: 'Spend Limits' },
      { key: 'chat',    icon: '\u25EF', label: 'Chat' },
    ]
  }
]

export default function Sidebar({ agents, filterAgent, onFilterAgent, onStopAgent, onNewTask, taskCount, onScorecard, onSkills, onNav, currentUser, onLogout }) {
  const [collapsed, setCollapsed] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState({})
  const [activeNav, setActiveNav] = useState('deliverables')

  const toggleGroup = (label) => {
    setExpandedGroups(prev => ({ ...prev, [label]: !prev[label] }))
  }

  const handleNav = (key) => {
    setActiveNav(key)
    onNav?.(key)
  }

  if (collapsed) {
    return (
      <aside className="w-14 glass flex flex-col items-center py-4 gap-2" style={{ borderRight: '0.5px solid rgba(0,0,0,0.08)' }}>
        <button onClick={() => setCollapsed(false)} className="mb-1" aria-label="Expand">
          <div className="w-8 h-8 rounded-[9px] bg-t1 flex items-center justify-center">
            <span className="font-display text-white text-sm tracking-wider">H</span>
          </div>
        </button>
        <div className="w-7 h-px bg-s4 my-1" />
        {agents.map(agent => {
          const tile = AGENT_TILES[agent.id] || { letter: '?', class: 'tile-nexus' }
          return (
            <button
              key={agent.id}
              onClick={() => onFilterAgent(filterAgent === agent.id ? null : agent.id)}
              className={`agent-tile w-8 h-8 rounded-lg text-xs relative transition-all ${tile.class} ${
                filterAgent === agent.id ? 'ring-2 ring-t1 ring-offset-1' : ''
              }`}
              title={agent.name}
            >
              {tile.letter}
              {agent.isRunning && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-success rounded-full dot-pulse" />}
            </button>
          )
        })}
        <div className="flex-1" />
        <button onClick={onNewTask} className="w-8 h-8 rounded-lg bg-t1 text-white flex items-center justify-center text-base hover:opacity-80 transition-opacity" title="New Task">
          +
        </button>
      </aside>
    )
  }

  return (
    <aside className="w-[216px] bg-s1 flex flex-col overflow-hidden" style={{ borderRight: '0.5px solid rgba(0,0,0,0.07)' }}>
      {/* Logo area */}
      <div className="px-4 py-5 flex items-center gap-3" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
        <div className="w-8 h-8 rounded-[9px] bg-t1 flex items-center justify-center flex-shrink-0">
          <span className="font-display text-white text-lg tracking-wider leading-none">H</span>
        </div>
        <div className="min-w-0">
          <div className="font-display text-xl text-t1 tracking-[2px] leading-none">HIVE</div>
          <div className="text-[10px] text-t4 mt-0.5">Command Center</div>
        </div>
        <span className="ml-auto text-[11px] text-t4 bg-s3 px-2 py-0.5 rounded-lg" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
          {taskCount}
        </span>
        <button onClick={() => setCollapsed(true)} className="text-t4 hover:text-t2 text-xs ml-1 transition-colors">
          &#x2039;&#x2039;
        </button>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-2">
        {NAV_GROUPS.map((group, gi) => {
          const isCollapsible = !!group.collapsed
          const defaultOpen = !group.collapsed
          const isOpen = group.label ? (expandedGroups[group.label] ?? defaultOpen) : true

          return (
            <div key={gi} className="py-2">
              {/* Section label */}
              {group.label && (
                <button
                  onClick={() => isCollapsible && toggleGroup(group.label)}
                  className="flex items-center gap-1.5 w-full px-[15px] pb-[5px] font-display text-[11px] text-t5 tracking-[2px] hover:text-t4 transition-colors"
                >
                  {isCollapsible && (
                    <span className="text-[8px] transition-transform" style={{ transform: isOpen ? 'rotate(90deg)' : '' }}>&#x25B6;</span>
                  )}
                  {group.label}
                </button>
              )}

              {/* Agent section */}
              {group.agentSection && isOpen && (
                <div>
                  {agents.map(agent => {
                    const tile = AGENT_TILES[agent.id] || { letter: '?', class: 'tile-nexus' }
                    const isFiltered = filterAgent === agent.id
                    return (
                      <div
                        key={agent.id}
                        onClick={() => onFilterAgent(filterAgent === agent.id ? null : agent.id)}
                        className={`flex items-center gap-2.5 px-4 py-[6px] cursor-pointer transition-all relative text-[13px] ${
                          isFiltered
                            ? 'bg-[rgba(0,0,0,0.05)] text-t1 font-medium'
                            : 'text-t3 hover:bg-[rgba(0,0,0,0.04)] hover:text-t1'
                        }`}
                      >
                        {isFiltered && (
                          <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-t1 rounded-r-sm" />
                        )}
                        <div className={`agent-tile w-[26px] h-[26px] rounded-[7px] text-[12px] ${tile.class}`}>
                          {tile.letter}
                        </div>
                        <span className="flex-1 truncate">{agent.name}</span>
                        {agent.isRunning ? (
                          <div className="flex items-center gap-1.5">
                            <span className="w-[6px] h-[6px] bg-success rounded-full dot-pulse" />
                            <button
                              onClick={(e) => { e.stopPropagation(); onStopAgent(agent.id) }}
                              className="text-[10px] text-danger/70 hover:text-danger"
                            >Stop</button>
                          </div>
                        ) : (
                          <span className="w-[6px] h-[6px] bg-t5 rounded-full" />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Nav items */}
              {!group.agentSection && isOpen && group.items?.map(item => {
                const isActive = activeNav === item.key
                return (
                  <button
                    key={item.key}
                    onClick={() => handleNav(item.key)}
                    className={`flex items-center gap-2.5 w-full px-4 py-[6px] text-[13px] transition-all relative ${
                      isActive
                        ? 'bg-[rgba(0,0,0,0.05)] text-t1 font-medium'
                        : 'text-t3 hover:bg-[rgba(0,0,0,0.04)] hover:text-t1'
                    }`}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-t1 rounded-r-sm" />
                    )}
                    <div className="w-[26px] h-[26px] rounded-[7px] bg-[rgba(28,28,30,0.06)] flex items-center justify-center text-[12px] text-t3 flex-shrink-0">
                      {item.icon}
                    </div>
                    <span className="truncate">{item.label}</span>
                  </button>
                )
              })}
            </div>
          )
        })}

        {/* Admin users link */}
        {currentUser?.role === 'admin' && (
          <button
            onClick={() => handleNav('users')}
            className={`flex items-center gap-2.5 w-full px-4 py-[7px] text-[13px] transition-all relative ${
              activeNav === 'users'
                ? 'bg-[rgba(28,28,30,0.06)] text-t1 font-medium'
                : 'text-t2 hover:bg-[rgba(28,28,30,0.04)]'
            }`}
          >
            <div className="w-7 h-7 rounded-[7px] bg-[rgba(28,28,30,0.06)] flex items-center justify-center text-[13px] text-t3 flex-shrink-0">
              &#x25C8;
            </div>
            <span>Users</span>
          </button>
        )}
      </div>

      {/* + New Task button */}
      <div className="px-[13px] py-3 mt-auto" style={{ borderTop: '0.5px solid rgba(0,0,0,0.07)' }}>
        <button onClick={onNewTask} className="w-full py-[9px] rounded-[11px] bg-t1 text-white flex items-center justify-center transition-opacity hover:opacity-80">
          <span className="font-display text-[15px] tracking-[2px]">+ NEW TASK</span>
        </button>
      </div>

      {/* User */}
      {currentUser && currentUser.username !== 'api' && currentUser.username !== 'anonymous' && (
        <div className="px-4 py-3" style={{ borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-s3 flex items-center justify-center text-[10px] font-bold text-t3" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
              {(currentUser.display_name || currentUser.username).charAt(0).toUpperCase()}
            </div>
            <span className="text-xs text-t2 flex-1 truncate">{currentUser.display_name || currentUser.username}</span>
            {onLogout && (
              <button onClick={onLogout} className="text-[10px] text-t4 hover:text-t2 transition-colors">Sign out</button>
            )}
          </div>
        </div>
      )}

      {/* Filter indicator */}
      {filterAgent && (
        <div className="px-3 py-2" style={{ borderTop: '0.5px solid rgba(28,28,30,0.08)', background: 'rgba(28,28,30,0.03)' }}>
          <button onClick={() => onFilterAgent(null)} className="w-full text-center text-xs text-t3 hover:text-t1 py-0.5 transition-colors">
            &#x2715; Clear filter
          </button>
        </div>
      )}
    </aside>
  )
}
