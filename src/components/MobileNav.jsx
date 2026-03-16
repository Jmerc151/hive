const TasksIcon = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? 'currentColor' : 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
)

const AgentsIcon = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4" />
    <path d="M5 20c0-3.87 3.13-7 7-7s7 3.13 7 7" />
  </svg>
)

const TraceIcon = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
)

const ChatIcon = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
  </svg>
)

const ICONS = { board: TasksIcon, agents: AgentsIcon, trace: TraceIcon, chat: ChatIcon }

export default function MobileNav({ view, onChangeView, activeCount, onNewTask }) {
  const tabs = [
    { id: 'board', label: 'Tasks' },
    { id: 'agents', label: 'Agents', badge: activeCount > 0 ? activeCount : null },
    { id: 'trace', label: 'Trace' },
    { id: 'chat', label: 'Chat' },
  ]

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-page/95 backdrop-blur-xl safe-bottom z-40" style={{ borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
      <div className="flex items-center justify-around px-1">
        {tabs.map(tab => {
          const isActive = view === tab.id
          const Icon = ICONS[tab.id]
          return (
            <button
              key={tab.id}
              onClick={() => onChangeView(tab.id)}
              className={`flex flex-col items-center gap-[2px] py-2 px-4 rounded-lg transition-colors relative ${
                isActive ? 'text-t1' : 'text-t4 active:text-t2'
              }`}
            >
              <Icon active={isActive} />
              <span className={`text-[9px] font-medium ${isActive ? 'text-t1' : 'text-t4'}`}>{tab.label}</span>
              {tab.badge && (
                <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-success text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                  {tab.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
