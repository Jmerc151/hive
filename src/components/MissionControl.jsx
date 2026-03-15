import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'

const AGENT_COLORS = {
  scout: '#06b6d4', forge: '#3b82f6', quill: '#8b5cf6',
  dealer: '#3BB273', oracle: '#E8C547', nexus: '#ec4899'
}

const STATUS_EMOJI = {
  done: '✅', failed: '❌', in_progress: '⚡', todo: '📋', paused: '⏸️'
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

function truncate(str, len = 200) {
  if (!str) return ''
  return str.length > len ? str.slice(0, len) + '...' : str
}

export default function MissionControl({ agents, onClose, onSelectTask }) {
  const [recentTasks, setRecentTasks] = useState([])
  const [activeTasks, setActiveTasks] = useState([])
  const [stats, setStats] = useState(null)
  const [expandedTask, setExpandedTask] = useState(null)
  const [taskOutputs, setTaskOutputs] = useState({})
  const [filter, setFilter] = useState('all') // all, active, completed, failed
  const [loading, setLoading] = useState(true)
  const intervalRef = useRef(null)

  const fetchData = async () => {
    try {
      const [tasksRes, statsRes] = await Promise.all([
        api.getTasks(),
        api.getStats()
      ])
      const allTasks = tasksRes || []

      // Sort by most recent
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
    if (taskOutputs[taskId]) return // already loaded
    try {
      const logs = await api.getTaskLogs(taskId)
      const output = logs?.find(l => l.type === 'output' || l.type === 'final_output')
      const traces = await api.getTraces(taskId)
      setTaskOutputs(prev => ({
        ...prev,
        [taskId]: {
          output: output?.content || logs?.[logs.length - 1]?.content || 'No output recorded',
          traces: traces || [],
          toolsUsed: [...new Set((traces || []).filter(t => t.event_type === 'tool_call').map(t => t.tool_name))],
          steps: (traces || []).filter(t => t.event_type === 'llm_call').length
        }
      }))
    } catch (e) {
      setTaskOutputs(prev => ({ ...prev, [taskId]: { output: 'Failed to load output', traces: [], toolsUsed: [], steps: 0 } }))
    }
  }

  useEffect(() => {
    fetchData()
    intervalRef.current = setInterval(fetchData, 10000) // refresh every 10s
    return () => clearInterval(intervalRef.current)
  }, [])

  const filteredTasks = recentTasks.filter(t => {
    if (filter === 'all') return true
    if (filter === 'active') return t.status === 'in_progress'
    if (filter === 'completed') return t.status === 'done'
    if (filter === 'failed') return t.status === 'failed'
    return true
  })

  const agentActivity = agents?.map(a => {
    const active = activeTasks.filter(t => t.agent_id === a.id)
    const recent = recentTasks.filter(t => t.agent_id === a.id && t.status === 'done').slice(0, 3)
    return { ...a, activeTasks: active, recentDone: recent }
  }) || []

  const todayTasks = recentTasks.filter(t => {
    const d = new Date(t.created_at)
    const today = new Date()
    return d.toDateString() === today.toDateString()
  })

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto p-4 md:p-8">
      <div className="bg-hive-900 border border-hive-700 rounded-2xl w-full max-w-5xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-hive-700 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-hive-100 flex items-center gap-2">
              🎯 Mission Control
            </h2>
            <p className="text-sm text-hive-400 mt-1">
              {activeTasks.length} active · {todayTasks.filter(t => t.status === 'done').length} completed today · {todayTasks.length} total today
            </p>
          </div>
          <button onClick={onClose} className="text-hive-400 hover:text-hive-100 text-2xl leading-none px-2">×</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-6">
          {/* Agent Status Strip */}
          <div>
            <h3 className="text-xs font-semibold text-hive-400 uppercase tracking-wider mb-3">Agent Status</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {agentActivity.map(agent => (
                <div key={agent.id} className="bg-hive-800 border border-hive-700 rounded-xl p-3 relative overflow-hidden">
                  {/* Active indicator */}
                  {agent.activeTasks.length > 0 && (
                    <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: AGENT_COLORS[agent.id] }} />
                  )}
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-2 h-2 rounded-full ${agent.activeTasks.length > 0 ? 'bg-green-500 animate-pulse' : 'bg-hive-500'}`} />
                    <span className="text-sm font-semibold text-hive-100 capitalize">{agent.id}</span>
                  </div>
                  {agent.activeTasks.length > 0 ? (
                    <p className="text-xs text-hive-300 leading-snug line-clamp-2">
                      {agent.activeTasks[0].title}
                    </p>
                  ) : (
                    <p className="text-xs text-hive-500 italic">Idle</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Currently Running */}
          {activeTasks.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-hive-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                Running Now ({activeTasks.length})
              </h3>
              <div className="space-y-2">
                {activeTasks.map(task => (
                  <div key={task.id} className="bg-hive-800/50 border border-green-500/20 rounded-lg p-3 cursor-pointer hover:bg-hive-800 transition-colors"
                    onClick={() => onSelectTask?.(task)}>
                    <div className="flex items-center gap-3">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: AGENT_COLORS[task.agent_id] + '22', color: AGENT_COLORS[task.agent_id] }}>
                        {task.agent_id}
                      </span>
                      <span className="text-sm font-medium text-hive-100 flex-1 truncate">{task.title}</span>
                      <span className="text-xs text-hive-400">{timeAgo(task.updated_at || task.created_at)}</span>
                    </div>
                    {task.description && (
                      <p className="text-xs text-hive-400 mt-1.5 line-clamp-1 pl-14">{task.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Activity Feed */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-hive-400 uppercase tracking-wider">Activity Feed</h3>
              <div className="flex gap-1">
                {['all', 'active', 'completed', 'failed'].map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`px-3 py-1 text-xs rounded-full transition-colors ${filter === f
                      ? 'bg-honey/20 text-honey border border-honey/30'
                      : 'bg-hive-800 text-hive-400 border border-hive-700 hover:text-hive-300'
                    }`}>
                    {f === 'all' ? 'All' : f === 'active' ? '⚡ Active' : f === 'completed' ? '✅ Done' : '❌ Failed'}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="text-center text-hive-400 py-12">Loading...</div>
            ) : filteredTasks.length === 0 ? (
              <div className="text-center text-hive-500 py-12">No tasks match this filter</div>
            ) : (
              <div className="space-y-1">
                {filteredTasks.slice(0, 50).map(task => {
                  const isExpanded = expandedTask === task.id
                  const output = taskOutputs[task.id]

                  return (
                    <div key={task.id} className="border border-hive-700/50 rounded-lg overflow-hidden">
                      <div
                        className="flex items-center gap-3 p-3 hover:bg-hive-800/50 cursor-pointer transition-colors"
                        onClick={() => {
                          if (isExpanded) {
                            setExpandedTask(null)
                          } else {
                            setExpandedTask(task.id)
                            fetchTaskOutput(task.id)
                          }
                        }}
                      >
                        <span className="text-base shrink-0">{STATUS_EMOJI[task.status] || '❓'}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
                          style={{ background: AGENT_COLORS[task.agent_id] + '22', color: AGENT_COLORS[task.agent_id] }}>
                          {task.agent_id}
                        </span>
                        <span className={`text-sm flex-1 truncate ${task.status === 'done' ? 'text-hive-300' : task.status === 'failed' ? 'text-red-400' : 'text-hive-100'}`}>
                          {task.title}
                        </span>
                        <span className="text-xs text-hive-500 shrink-0">{timeAgo(task.updated_at || task.created_at)}</span>
                        <span className="text-hive-500 text-xs shrink-0">{isExpanded ? '▾' : '›'}</span>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-hive-700/50 bg-hive-800/30 p-4 space-y-3">
                          {/* Task description */}
                          {task.description && (
                            <div>
                              <span className="text-xs font-semibold text-hive-400 uppercase">Task</span>
                              <p className="text-sm text-hive-300 mt-1">{truncate(task.description, 300)}</p>
                            </div>
                          )}

                          {/* Output */}
                          {output ? (
                            <>
                              {output.toolsUsed?.length > 0 && (
                                <div>
                                  <span className="text-xs font-semibold text-hive-400 uppercase">Tools Used</span>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {output.toolsUsed.map(t => (
                                      <span key={t} className="text-xs bg-hive-700 text-hive-300 px-2 py-0.5 rounded">{t}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div>
                                <span className="text-xs font-semibold text-hive-400 uppercase">
                                  Output {output.steps > 0 && `(${output.steps} steps)`}
                                </span>
                                <div className="mt-1 bg-hive-900 border border-hive-700 rounded-lg p-3 max-h-64 overflow-y-auto">
                                  <pre className="text-xs text-hive-300 whitespace-pre-wrap font-mono leading-relaxed">
                                    {truncate(output.output, 2000)}
                                  </pre>
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="text-xs text-hive-500 animate-pulse">Loading output...</div>
                          )}

                          {/* Actions */}
                          <div className="flex gap-2 pt-1">
                            <button onClick={() => onSelectTask?.(task)}
                              className="text-xs bg-hive-700 hover:bg-hive-600 text-hive-200 px-3 py-1.5 rounded-lg transition-colors">
                              Full Detail →
                            </button>
                            {task.status === 'done' && task.agent_id && (
                              <button onClick={async () => {
                                try {
                                  await api.runTask(task.id)
                                } catch (e) {}
                              }}
                                className="text-xs bg-hive-700 hover:bg-hive-600 text-hive-200 px-3 py-1.5 rounded-lg transition-colors">
                                🔄 Re-run
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
