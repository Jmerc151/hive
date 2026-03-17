import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'

const AGENTS = {
  scout:  { letter: 'S', label: 'Scout',  verb: 'Researching', tile: 'tile-scout',  color: '#ff9500' },
  forge:  { letter: 'F', label: 'Forge',  verb: 'Building',    tile: 'tile-forge',  color: '#636366' },
  quill:  { letter: 'Q', label: 'Quill',  verb: 'Writing',     tile: 'tile-quill',  color: '#34c759' },
  dealer: { letter: 'D', label: 'Dealer', verb: 'Selling',     tile: 'tile-dealer', color: '#ff2d55' },
  oracle: { letter: 'O', label: 'Oracle', verb: 'Analyzing',   tile: 'tile-oracle', color: '#af52de' },
  nexus:  { letter: 'N', label: 'Nexus',  verb: 'Managing',    tile: 'tile-nexus',  color: '#8e8e93' },
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

export default function MissionControl({ agents, onClose, onSelectTask, inline }) {
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

  const agentData = Object.keys(AGENTS).map(id => {
    const info = AGENTS[id]
    const active = activeTasks.filter(t => t.agent_id === id)
    const completed = recentTasks.filter(t => t.agent_id === id && t.status === 'done')
    const recent = recentTasks.filter(t => t.agent_id === id).slice(0, 5)
    return { id, ...info, active, completed, recent, busy: active.length > 0 }
  })

  const selectedAgentData = selectedAgent ? agentData.find(a => a.id === selectedAgent) : null

  const content = (
    <div className={inline ? "h-full flex flex-col overflow-y-auto" : "relative h-full w-full max-w-lg mx-auto flex flex-col"}
      onClick={inline ? undefined : e => e.stopPropagation()}>

      {/* Header */}
        <div className="pt-12 pb-6 px-6 text-center shrink-0">
          <button onClick={onClose} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-s4/80 flex items-center justify-center text-t3 hover:text-t1 hover:bg-s5 transition-all text-lg">
            &times;
          </button>
          <p className="font-display text-xs tracking-[3px] text-t4 mb-3">MISSION CONTROL</p>

          {/* Big status */}
          <div className="flex items-center justify-center gap-8 mb-4">
            <div className="text-center">
              <p className="font-display text-[52px] text-t1 leading-none tracking-wider">{activeTasks.length}</p>
              <p className="text-xs text-t4 mt-1">working</p>
            </div>
            <div className="w-px h-12 bg-s4" />
            <div className="text-center">
              <p className="font-display text-[52px] text-success leading-none tracking-wider">{todayDone}</p>
              <p className="text-xs text-t4 mt-1">done today</p>
            </div>
          </div>
        </div>

        {/* Agent list */}
        <div className="flex-1 overflow-y-auto px-4 pb-8">

          {selectedAgent && (
            <button onClick={() => setSelectedAgent(null)}
              className="flex items-center gap-2 text-t4 hover:text-t2 text-sm mb-4 px-2 transition-colors">
              <span>&larr;</span> All agents
            </button>
          )}

          {selectedAgent && selectedAgentData ? (
            <div className="space-y-3">
              <div className="text-center py-4">
                <div className={`agent-tile w-14 h-14 rounded-2xl text-2xl mx-auto mb-2 ${selectedAgentData.tile}`}>
                  {selectedAgentData.letter}
                </div>
                <p className="font-display text-2xl tracking-wider text-t1">{selectedAgentData.label.toUpperCase()}</p>
                <p className="text-sm text-t3">
                  {selectedAgentData.busy
                    ? <span className="text-success">{selectedAgentData.verb}...</span>
                    : 'Standing by'}
                </p>
              </div>

              {selectedAgentData.active.length > 0 && (
                <div>
                  <p className="font-display text-[10px] tracking-[2px] text-t4 px-2 mb-2">WORKING ON</p>
                  {selectedAgentData.active.map(task => (
                    <div key={task.id}
                      className="hive-card p-4 mb-2 active:scale-[0.98] transition-transform cursor-pointer"
                      onClick={() => onSelectTask?.(task)}>
                      <div className="flex items-start gap-3">
                        <span className="w-2 h-2 mt-1.5 bg-success rounded-full dot-pulse flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-t1 leading-relaxed">{simplifyTitle(task.title)}</p>
                          <p className="text-xs text-t4 mt-1">{timeAgo(task.updated_at || task.created_at)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {selectedAgentData.recent.length > 0 && (
                <div>
                  <p className="font-display text-[10px] tracking-[2px] text-t4 px-2 mb-2 mt-4">RECENT</p>
                  {selectedAgentData.recent.filter(t => t.status !== 'in_progress').slice(0, 8).map(task => (
                    <div key={task.id}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-s3 cursor-pointer transition-colors"
                      onClick={() => onSelectTask?.(task)}>
                      <span className="text-sm shrink-0">
                        {task.status === 'done' ? '\u2705' : task.status === 'failed' ? '\u274C' : '\u23F8\uFE0F'}
                      </span>
                      <p className="text-sm text-t3 flex-1 truncate">{simplifyTitle(task.title)}</p>
                      <span className="text-xs text-t5 shrink-0">{timeAgo(task.updated_at || task.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {loading ? (
                <div className="text-center py-20 text-t4 text-sm">Loading...</div>
              ) : (
                agentData.map(agent => (
                  <div key={agent.id}
                    className="hive-card p-4 cursor-pointer transition-all active:scale-[0.98]"
                    onClick={() => setSelectedAgent(agent.id)}>
                    <div className="flex items-center gap-4">
                      <div className={`agent-tile w-12 h-12 rounded-2xl text-xl flex-shrink-0 ${agent.tile}`}>
                        {agent.letter}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-[15px] font-medium text-t1">{agent.label}</p>
                          {agent.busy && (
                            <span className="flex items-center gap-1 text-success text-xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-success dot-pulse" />
                              {agent.verb}
                            </span>
                          )}
                        </div>
                        {agent.busy ? (
                          <p className="text-sm text-t3 truncate mt-0.5">{simplifyTitle(agent.active[0]?.title)}</p>
                        ) : (
                          <p className="text-sm text-t4 mt-0.5">
                            {agent.completed.length > 0 ? `${agent.completed.length} tasks completed` : 'Standing by'}
                          </p>
                        )}
                      </div>
                      <span className="text-t5 text-sm shrink-0">&rsaquo;</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
    </div>
  )

  if (inline) return content

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-backdrop" />
      {content}
    </div>
  )
}
