import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'

const AGENTS = {
  scout: { emoji: '\uD83D\uDD0D', label: 'Scout', verb: 'Researching', color: '#06b6d4' },
  forge: { emoji: '\uD83D\uDD28', label: 'Forge', verb: 'Building', color: '#3b82f6' },
  quill: { emoji: '\u270D\uFE0F', label: 'Quill', verb: 'Writing', color: '#8b5cf6' },
  dealer: { emoji: '\uD83E\uDD1D', label: 'Dealer', verb: 'Selling', color: '#3BB273' },
  oracle: { emoji: '\uD83D\uDD2E', label: 'Oracle', verb: 'Analyzing', color: '#E8C547' },
  nexus: { emoji: '\uD83E\uDDE0', label: 'Nexus', verb: 'Managing', color: '#ec4899' },
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

// Simplify task titles for non-technical users
function simplifyTitle(title) {
  if (!title) return ''
  return title
    .replace(/^(Research|Build|Write|Create|Initialize|Implement|Deploy|Audit|Review|Send|Apply|Pitch|Monitor)\s+/i, '')
    .replace(/\s*—\s*.*/g, '')
    .replace(/\s*\(.*\)/g, '')
    .replace(/SEO-optimized\s*/gi, '')
    .replace(/repo\s*/gi, 'project ')
    .replace(/README/gi, 'docs')
    .replace(/Gumroad\s*/gi, '')
    .replace(/agentforge/gi, 'new product')
    .slice(0, 80)
}

export default function MissionControl({ agents, onClose, onSelectTask }) {
  const [recentTasks, setRecentTasks] = useState([])
  const [activeTasks, setActiveTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedAgent, setSelectedAgent] = useState(null)
  const intervalRef = useRef(null)

  const fetchData = async () => {
    try {
      const tasksRes = await api.getTasks()
      const allTasks = tasksRes || []
      const sorted = [...allTasks].sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
      setActiveTasks(sorted.filter(t => t.status === 'in_progress'))
      setRecentTasks(sorted.slice(0, 50))
      setLoading(false)
    } catch (e) {
      console.error('Mission Control fetch error:', e)
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    intervalRef.current = setInterval(fetchData, 8000)
    return () => clearInterval(intervalRef.current)
  }, [])

  const todayTasks = recentTasks.filter(t => new Date(t.created_at).toDateString() === new Date().toDateString())
  const todayDone = todayTasks.filter(t => t.status === 'done').length

  // Per-agent data
  const agentData = Object.keys(AGENTS).map(id => {
    const info = AGENTS[id]
    const active = activeTasks.filter(t => t.agent_id === id)
    const completed = recentTasks.filter(t => t.agent_id === id && t.status === 'done')
    const recent = recentTasks.filter(t => t.agent_id === id).slice(0, 5)
    return { id, ...info, active, completed, recent, busy: active.length > 0 }
  })

  const selectedAgentData = selectedAgent ? agentData.find(a => a.id === selectedAgent) : null

  return (
    <div className="fixed inset-0 z-50 bg-black/90" onClick={onClose}>
      <div className="h-full w-full max-w-lg mx-auto flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header — simple and clean */}
        <div className="pt-12 pb-6 px-6 text-center shrink-0">
          <button onClick={onClose} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/20 transition-all text-lg">
            &times;
          </button>
          <p className="text-white/40 text-xs uppercase tracking-[0.2em] mb-3">Mission Control</p>

          {/* Big status */}
          <div className="flex items-center justify-center gap-8 mb-4">
            <div className="text-center">
              <p className="text-5xl font-light text-white tabular-nums">{activeTasks.length}</p>
              <p className="text-xs text-white/40 mt-1">working</p>
            </div>
            <div className="w-px h-12 bg-white/10" />
            <div className="text-center">
              <p className="text-5xl font-light text-green-400 tabular-nums">{todayDone}</p>
              <p className="text-xs text-white/40 mt-1">done today</p>
            </div>
          </div>
        </div>

        {/* Agent list */}
        <div className="flex-1 overflow-y-auto px-4 pb-8">

          {/* Back button when agent is selected */}
          {selectedAgent && (
            <button onClick={() => setSelectedAgent(null)}
              className="flex items-center gap-2 text-white/40 hover:text-white/70 text-sm mb-4 px-2 transition-colors">
              <span>&larr;</span> All agents
            </button>
          )}

          {/* Agent detail view */}
          {selectedAgent && selectedAgentData ? (
            <div className="space-y-3">
              {/* Agent header */}
              <div className="text-center py-4">
                <div className="text-4xl mb-2">{selectedAgentData.emoji}</div>
                <p className="text-xl font-medium text-white">{selectedAgentData.label}</p>
                <p className="text-sm text-white/40">
                  {selectedAgentData.busy
                    ? <span className="text-green-400">{selectedAgentData.verb}...</span>
                    : 'Standing by'}
                </p>
              </div>

              {/* Active tasks */}
              {selectedAgentData.active.length > 0 && (
                <div>
                  <p className="text-xs text-white/30 uppercase tracking-wider px-2 mb-2">Working on</p>
                  {selectedAgentData.active.map(task => (
                    <div key={task.id}
                      className="bg-white/[0.05] rounded-2xl p-4 mb-2 active:scale-[0.98] transition-transform cursor-pointer"
                      onClick={() => onSelectTask?.(task)}>
                      <div className="flex items-start gap-3">
                        <span className="text-green-400 text-lg mt-0.5 animate-pulse">&#x25CF;</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm leading-relaxed">{simplifyTitle(task.title)}</p>
                          <p className="text-white/30 text-xs mt-1">{timeAgo(task.updated_at || task.created_at)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Recent tasks */}
              {selectedAgentData.recent.length > 0 && (
                <div>
                  <p className="text-xs text-white/30 uppercase tracking-wider px-2 mb-2 mt-4">Recent</p>
                  {selectedAgentData.recent.filter(t => t.status !== 'in_progress').slice(0, 8).map(task => (
                    <div key={task.id}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/[0.03] cursor-pointer transition-colors"
                      onClick={() => onSelectTask?.(task)}>
                      <span className="text-sm shrink-0">
                        {task.status === 'done' ? '\u2705' : task.status === 'failed' ? '\u274C' : '\u23F8\uFE0F'}
                      </span>
                      <p className="text-sm text-white/60 flex-1 truncate">{simplifyTitle(task.title)}</p>
                      <span className="text-xs text-white/20 shrink-0">{timeAgo(task.updated_at || task.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (

            /* Main agent list */
            <div className="space-y-2">
              {loading ? (
                <div className="text-center py-20 text-white/30 text-sm">Loading...</div>
              ) : (
                agentData.map(agent => (
                  <div key={agent.id}
                    className="bg-white/[0.04] hover:bg-white/[0.07] rounded-2xl p-4 cursor-pointer transition-all active:scale-[0.98]"
                    onClick={() => setSelectedAgent(agent.id)}>
                    <div className="flex items-center gap-4">
                      {/* Avatar */}
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0"
                        style={{ background: agent.color + '15' }}>
                        {agent.emoji}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-white font-medium text-[15px]">{agent.label}</p>
                          {agent.busy && (
                            <span className="flex items-center gap-1 text-green-400 text-xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                              {agent.verb}
                            </span>
                          )}
                        </div>
                        {agent.busy ? (
                          <p className="text-white/40 text-sm truncate mt-0.5">
                            {simplifyTitle(agent.active[0]?.title)}
                          </p>
                        ) : (
                          <p className="text-white/20 text-sm mt-0.5">
                            {agent.completed.length > 0
                              ? `${agent.completed.length} tasks completed`
                              : 'Standing by'}
                          </p>
                        )}
                      </div>

                      {/* Chevron */}
                      <span className="text-white/20 text-sm shrink-0">&rsaquo;</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
