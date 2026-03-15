export default function MobileNav({ view, onChangeView, activeCount, onNewTask }) {
  const tabs = [
    { id: 'board', label: 'Tasks', icon: '\u25A6' },
    { id: 'agents', label: 'Agents', icon: '\u25CE', badge: activeCount > 0 ? activeCount : null },
    { id: 'trace', label: 'Trace', icon: '\u25C8' },
    { id: 'chat', label: 'Chat', icon: '\u25EF' },
  ]

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 glass-heavy safe-bottom z-40" style={{ borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
      <div className="flex items-center justify-around px-2 py-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onChangeView(tab.id)}
            className={`flex flex-col items-center gap-0.5 py-2 px-4 rounded-xl transition-colors relative ${
              view === tab.id
                ? 'text-t1'
                : 'text-t4 active:text-t2'
            }`}
          >
            <span className="text-xl">{tab.icon}</span>
            <span className="text-[10px] font-medium">{tab.label}</span>
            {tab.badge && (
              <span className="absolute -top-0.5 right-2 w-4 h-4 bg-success text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>
    </nav>
  )
}
