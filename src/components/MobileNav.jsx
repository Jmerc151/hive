export default function MobileNav({ view, onChangeView, activeCount, onNewTask }) {
  const tabs = [
    { id: 'board', label: 'Tasks', icon: '📋' },
    { id: 'agents', label: 'Agents', icon: '🤖', badge: activeCount > 0 ? activeCount : null },
    { id: 'trace', label: 'Trace', icon: '📡' },
    { id: 'chat', label: 'Chat', icon: '💬' },
  ]

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-hive-900/95 backdrop-blur-xl border-t border-hive-700/50 safe-bottom z-40">
      <div className="flex items-center justify-around px-2 py-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onChangeView(tab.id)}
            className={`flex flex-col items-center gap-0.5 py-2 px-4 rounded-xl transition-colors relative ${
              view === tab.id
                ? 'text-honey'
                : 'text-hive-500 active:text-hive-300'
            }`}
          >
            <span className="text-xl">{tab.icon}</span>
            <span className="text-[10px] font-medium">{tab.label}</span>
            {tab.badge && (
              <span className="absolute -top-0.5 right-2 w-4 h-4 bg-honey text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>
    </nav>
  )
}
