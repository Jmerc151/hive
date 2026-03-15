import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'

const AGENTS = {
  scout: { emoji: '\uD83D\uDD0D', label: 'Scout', role: 'Researcher', color: '#06b6d4', bg: '#06b6d415' },
  forge: { emoji: '\uD83D\uDD28', label: 'Forge', role: 'Builder', color: '#3b82f6', bg: '#3b82f615' },
  quill: { emoji: '\u270D\uFE0F', label: 'Quill', role: 'Writer', color: '#8b5cf6', bg: '#8b5cf615' },
  dealer: { emoji: '\uD83E\uDD1D', label: 'Dealer', role: 'Seller', color: '#3BB273', bg: '#3BB27315' },
  oracle: { emoji: '\uD83D\uDD2E', label: 'Oracle', role: 'Analyst', color: '#E8C547', bg: '#E8C54715' },
  nexus: { emoji: '\uD83E\uDDE0', label: 'Nexus', role: 'Manager', color: '#ec4899', bg: '#ec489915' },
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

function friendlyStatus(status) {
  if (status === 'in_progress') return 'Working'
  if (status === 'done') return 'Done'
  if (status === 'failed') return 'Failed'
  if (status === 'paused') return 'Paused'
  return 'Queued'
}

function ProgressRing({ pct, size = 44, stroke = 4, color = '#E8C547' }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-white/[0.06]" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
    </svg>
  )
}

function PulsingDot({ color = '#22c55e' }) {
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-50" style={{ background: color }} />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: color }} />
    </span>
  )
}

export default function MissionControl({ agents, onClose, onSelectTask }) {
  const [recentTasks, setRecentTasks] = useState([])
  const [activeTasks, setActiveTasks] = useState([])
  const [stats, setStats] = useState(null)
  const [expandedAgent, setExpandedAgent] = useState(null)
  const [expandedTask, setExpandedTask] = useState(null)
  const [taskOutputs, setTaskOutputs] = useState({})
  const [tab, setTab] = useState('live') // live, history
  const [loading, setLoading] = useState(true)
  const intervalRef = useRef(null)

  const fetchData = async () => {
    try {
      const [tasksRes, statsRes] = await Promise.all([api.getTasks(), api.getStats()])
      const allTasks = tasksRes || []
      const sorted = [...allTasks].sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
      setActiveTasks(sorted.filter(t => t.status === 'in_progress'))
      setRecentTasks(sorted.slice(0, 100))
      setStats(statsRes)
      setLoading(false)
    } catch (e) {
      console.error('Mission Control fetch error:', e)
      setLoading(false)
    }
  }

  const fetchTaskOutput = async (taskId) => {
    if (taskOutputs[taskId]) return
    try {
      const logs = await api.getTaskLogs(taskId)
      const output = logs?.find(l => l.type === 'output' || l.type === 'final_output')
      const traces = await api.getTraces(taskId)
      setTaskOutputs(prev => ({
        ...prev,
        [taskId]: {
          output: output?.content || logs?.[logs.length - 1]?.content || 'No output recorded',
          toolsUsed: [...new Set((traces || []).filter(t => t.event_type === 'tool_call').map(t => t.tool_name))],
          steps: (traces || []).filter(t => t.event_type === 'llm_call').length
        }
      }))
    } catch {
      setTaskOutputs(prev => ({ ...prev, [taskId]: { output: 'Failed to load', toolsUsed: [], steps: 0 } }))
    }
  }

  useEffect(() => {
    fetchData()
    intervalRef.current = setInterval(fetchData, 8000)
    return () => clearInterval(intervalRef.current)
  }, [])

  const todayTasks = recentTasks.filter(t => new Date(t.created_at).toDateString() === new Date().toDateString())
  const todayDone = todayTasks.filter(t => t.status === 'done').length
  const todayFailed = todayTasks.filter(t => t.status === 'failed').length
  const completionPct = todayTasks.length > 0 ? Math.round((todayDone / todayTasks.length) * 100) : 0

  // Build agent summaries
  const agentSummaries = Object.keys(AGENTS).map(id => {
    const info = AGENTS[id]
    const active = activeTasks.filter(t => t.agent_id === id)
    const today = todayTasks.filter(t => t.agent_id === id)
    const done = today.filter(t => t.status === 'done').length
    const recent = recentTasks.filter(t => t.agent_id === id).slice(0, 5)
    return { id, ...info, active, today, done, recent, isWorking: active.length > 0 }
  })

  const completedTasks = recentTasks.filter(t => t.status === 'done' || t.status === 'failed')

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto"
      style={{ background: 'radial-gradient(ellipse at top, rgba(232,197,71,0.04) 0%, rgba(0,0,0,0.85) 70%)' }}>
      <div className="w-full max-w-4xl mx-auto py-6 px-4 md:px-0 animate-in fade-in slide-in-from-bottom-4 duration-300">

        {/* Top Bar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-honey/10 flex items-center justify-center text-xl">
              <span style={{ filter: 'drop-shadow(0 0 8px rgba(232,197,71,0.4))' }}>&#x2B21;</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-hive-100 tracking-tight">Mission Control</h1>
              <p className="text-xs text-hive-400">Live overview of your hive</p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] flex items-center justify-center text-hive-400 hover:text-hive-200 transition-all text-sm">
            &#x2715;
          </button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 flex items-center gap-3">
            <ProgressRing pct={completionPct} color="#E8C547" />
            <div>
              <p className="text-2xl font-bold text-hive-100">{completionPct}%</p>
              <p className="text-[11px] text-hive-400 uppercase tracking-wide">Today</p>
            </div>
          </div>
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4">
            <p className="text-2xl font-bold text-hive-100">{activeTasks.length}</p>
            <p className="text-[11px] text-hive-400 uppercase tracking-wide flex items-center gap-1.5">
              {activeTasks.length > 0 && <PulsingDot />} Running
            </p>
          </div>
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4">
            <p className="text-2xl font-bold text-green-400">{todayDone}</p>
            <p className="text-[11px] text-hive-400 uppercase tracking-wide">Completed</p>
          </div>
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4">
            <p className={`text-2xl font-bold ${todayFailed > 0 ? 'text-red-400' : 'text-hive-400'}`}>{todayFailed}</p>
            <p className="text-[11px] text-hive-400 uppercase tracking-wide">Failed</p>
          </div>
        </div>

        {/* Agent Cards */}
        <div className="mb-6">
          <h2 className="text-xs font-medium text-hive-400 uppercase tracking-wider mb-3 px-1">Your Agents</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {agentSummaries.map(agent => {
              const isOpen = expandedAgent === agent.id
              return (
                <div key={agent.id}
                  className={`rounded-2xl border transition-all cursor-pointer overflow-hidden ${
                    agent.isWorking
                      ? 'bg-white/[0.04] border-white/[0.1]'
                      : 'bg-white/[0.02] border-white/[0.05] opacity-60 hover:opacity-80'
                  }`}
                  onClick={() => setExpandedAgent(isOpen ? null : agent.id)}>

                  <div className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
                          style={{ background: agent.bg, boxShadow: agent.isWorking ? `0 0 20px ${agent.color}15` : 'none' }}>
                          {agent.emoji}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-hive-100">{agent.label}</p>
                          <p className="text-[11px] text-hive-400">{agent.role}</p>
                        </div>
                      </div>
                      {agent.isWorking && <PulsingDot color={agent.color} />}
                    </div>

                    {agent.isWorking ? (
                      <p className="text-xs text-hive-300 line-clamp-2 leading-relaxed mt-1">
                        {agent.active[0]?.title}
                      </p>
                    ) : (
                      <p className="text-xs text-hive-500 mt-1">
                        {agent.done > 0 ? `${agent.done} tasks done today` : 'Standing by'}
                      </p>
                    )}
                  </div>

                  {/* Expanded: recent tasks */}
                  {isOpen && agent.recent.length > 0 && (
                    <div className="border-t border-white/[0.05] px-4 py-3 space-y-1.5" onClick={e => e.stopPropagation()}>
                      {agent.recent.map(task => (
                        <div key={task.id}
                          className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-white/[0.04] cursor-pointer transition-colors"
                          onClick={() => onSelectTask?.(task)}>
                          <span className="text-xs shrink-0">
                            {task.status === 'done' ? '\u2705' : task.status === 'failed' ? '\u274C' : task.status === 'in_progress' ? '\u26A1' : '\uD83D\uDCCB'}
                          </span>
                          <span className="text-xs text-hive-300 truncate flex-1">{task.title}</span>
                          <span className="text-[10px] text-hive-500 shrink-0">{timeAgo(task.updated_at || task.created_at)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Tab Switch */}
        <div className="flex items-center gap-1 mb-4 px-1">
          {[
            { key: 'live', label: 'Live Activity', count: activeTasks.length },
            { key: 'history', label: 'Recent Work', count: completedTasks.length },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-xs font-medium rounded-xl transition-all ${
                tab === t.key
                  ? 'bg-honey/10 text-honey border border-honey/20'
                  : 'text-hive-400 hover:text-hive-300 border border-transparent'
              }`}>
              {t.label}
              {t.key === 'live' && t.count > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-md text-[10px] bg-green-500/15 text-green-400">{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-hive-400 text-sm">
              <span className="animate-spin mr-2">&#x25E0;</span> Loading...
            </div>
          ) : tab === 'live' ? (
            // Live Activity
            activeTasks.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-3xl mb-2">&#x1F389;</p>
                <p className="text-sm text-hive-400">All agents are idle</p>
                <p className="text-xs text-hive-500 mt-1">Create a task to get them working</p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {activeTasks.map(task => {
                  const agent = AGENTS[task.agent_id] || {}
                  return (
                    <div key={task.id}
                      className="p-4 hover:bg-white/[0.02] cursor-pointer transition-colors"
                      onClick={() => onSelectTask?.(task)}>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0 mt-0.5"
                          style={{ background: agent.bg }}>
                          {agent.emoji}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-hive-100 truncate">{task.title}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-hive-400">
                            <PulsingDot color={agent.color} />
                            <span style={{ color: agent.color }}>{agent.label}</span>
                            <span>is working on this</span>
                            <span className="text-hive-500">&middot; {timeAgo(task.updated_at || task.created_at)}</span>
                          </div>
                          {task.description && (
                            <p className="text-xs text-hive-500 mt-2 line-clamp-2 leading-relaxed">{task.description}</p>
                          )}
                        </div>
                        <span className="text-hive-500 text-xs shrink-0 mt-1">&#x2192;</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          ) : (
            // History
            completedTasks.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-sm text-hive-400">No completed tasks yet</p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {completedTasks.slice(0, 30).map(task => {
                  const agent = AGENTS[task.agent_id] || {}
                  const isExpanded = expandedTask === task.id
                  const output = taskOutputs[task.id]

                  return (
                    <div key={task.id} className="transition-colors">
                      <div className="p-4 hover:bg-white/[0.02] cursor-pointer flex items-start gap-3"
                        onClick={() => {
                          if (isExpanded) { setExpandedTask(null) }
                          else { setExpandedTask(task.id); fetchTaskOutput(task.id) }
                        }}>
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0 mt-0.5 ${
                          task.status === 'done' ? 'bg-green-500/10' : 'bg-red-500/10'
                        }`}>
                          {task.status === 'done' ? '\u2705' : '\u274C'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-hive-200 truncate">{task.title}</p>
                          <div className="flex items-center gap-2 text-xs text-hive-500 mt-0.5">
                            <span style={{ color: agent.color }}>{agent.label}</span>
                            <span>&middot;</span>
                            <span>{friendlyStatus(task.status)}</span>
                            <span>&middot;</span>
                            <span>{timeAgo(task.updated_at || task.created_at)}</span>
                          </div>
                        </div>
                        <span className="text-hive-500 text-xs shrink-0 mt-2 transition-transform" style={{ transform: isExpanded ? 'rotate(90deg)' : '' }}>
                          &#x203A;
                        </span>
                      </div>

                      {isExpanded && (
                        <div className="px-4 pb-4 pt-0 ml-11">
                          {output ? (
                            <div className="space-y-3">
                              {output.toolsUsed?.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {output.toolsUsed.map(t => (
                                    <span key={t} className="text-[10px] px-2 py-1 rounded-lg bg-white/[0.04] text-hive-400 border border-white/[0.06]">
                                      {t.replace(/_/g, ' ')}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 max-h-48 overflow-y-auto">
                                <pre className="text-xs text-hive-300 whitespace-pre-wrap font-mono leading-relaxed">
                                  {output.output?.length > 1500 ? output.output.slice(0, 1500) + '...' : output.output}
                                </pre>
                              </div>
                              <div className="flex gap-2">
                                <button onClick={(e) => { e.stopPropagation(); onSelectTask?.(task) }}
                                  className="text-xs px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-hive-300 border border-white/[0.06] transition-colors">
                                  View Details
                                </button>
                                {task.status === 'done' && (
                                  <button onClick={async (e) => { e.stopPropagation(); try { await api.runTask(task.id) } catch {} }}
                                    className="text-xs px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-hive-300 border border-white/[0.06] transition-colors">
                                    &#x1F504; Re-run
                                  </button>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-hive-500 animate-pulse py-2">Loading output...</div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          )}
        </div>

        {/* Bottom spacer for mobile scroll */}
        <div className="h-8" />
      </div>
    </div>
  )
}
