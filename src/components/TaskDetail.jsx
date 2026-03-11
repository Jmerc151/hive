import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'
import TraceView from './TraceView'

const STATUS_OPTIONS = ['backlog', 'todo', 'awaiting_approval', 'in_progress', 'in_review', 'done']
const STATUS_LABELS = { backlog: 'Backlog', todo: 'To Do', awaiting_approval: 'Awaiting Approval', in_progress: 'In Progress', in_review: 'Review', done: 'Done', failed: 'Failed' }
const STATUS_COLORS = { backlog: 'text-hive-400', todo: 'text-blue-400', awaiting_approval: 'text-amber-400', in_progress: 'text-honey', in_review: 'text-prism', done: 'text-honey', failed: 'text-red-400' }
const LOG_COLORS = { info: 'text-blue-400', success: 'text-green-400', error: 'text-red-400', warning: 'text-yellow-400', output: 'text-hive-300' }

export default function TaskDetail({ task, agent, agents, onClose, onRun, onUpdate, onDelete, onAbTest }) {
  const [logs, setLogs] = useState([])
  const [tab, setTab] = useState('details')
  const [downloading, setDownloading] = useState(false)
  const logsEndRef = useRef(null)

  const handleDownload = async () => {
    setDownloading(true)
    try {
      await api.downloadBot(task.id)
    } catch (err) {
      alert(err.message)
    }
    setDownloading(false)
  }

  useEffect(() => {
    if (!task) return
    const fetchLogs = async () => {
      const data = await api.getTaskLogs(task.id)
      setLogs(data)
    }
    fetchLogs()
    const interval = setInterval(fetchLogs, 2000)
    return () => clearInterval(interval)
  }, [task?.id])

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  if (!task) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-2xl bg-hive-800 border-l border-hive-700 shadow-2xl flex flex-col h-full" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-5 border-b border-hive-700 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {agent && <span className="text-lg">{agent.avatar}</span>}
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${STATUS_COLORS[task.status]} bg-hive-700`}>
                {STATUS_LABELS[task.status]}
              </span>
            </div>
            <h2 className="text-lg font-semibold">{task.title}</h2>
          </div>
          <button onClick={onClose} className="text-hive-400 hover:text-hive-200 text-xl shrink-0">&times;</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-hive-700">
          {['details', 'logs', 'output', 'trace'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors ${
                tab === t ? 'text-honey border-b-2 border-honey' : 'text-hive-400 hover:text-hive-200'
              }`}
            >
              {t}
              {t === 'logs' && logs.length > 0 && (
                <span className="ml-1.5 text-xs bg-hive-700 rounded-full px-1.5">{logs.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'details' && (
            <div className="space-y-5">
              {/* Description */}
              <div>
                <h3 className="text-sm font-medium text-hive-300 mb-2">Description</h3>
                <p className="text-sm text-hive-200 whitespace-pre-wrap">
                  {task.description || 'No description provided.'}
                </p>
              </div>

              {/* Agent */}
              {agent && (
                <div>
                  <h3 className="text-sm font-medium text-hive-300 mb-2">Assigned Agent</h3>
                  <div className="flex items-center gap-3 p-3 bg-hive-700/30 rounded-lg border border-hive-700">
                    <span className="text-2xl">{agent.avatar}</span>
                    <div>
                      <div className="font-medium text-sm" style={{ color: agent.color }}>{agent.name}</div>
                      <div className="text-xs text-hive-400">{agent.role} — {agent.description}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Status change */}
              <div>
                <h3 className="text-sm font-medium text-hive-300 mb-2">Status</h3>
                <div className="flex gap-2 flex-wrap">
                  {STATUS_OPTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => onUpdate(task.id, { status: s })}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                        task.status === s
                          ? 'border-honey bg-honey/20 text-honey'
                          : 'border-hive-600 text-hive-400 hover:border-hive-500 hover:text-hive-200'
                      }`}
                    >
                      {STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Token Budget */}
              {task.token_budget > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-hive-300 mb-2">Token Budget</h3>
                  <div className="p-3 bg-hive-700/30 rounded-lg border border-hive-700">
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-hive-400">Used: {(task.tokens_used || 0).toLocaleString()}</span>
                      <span className="text-hive-400">Budget: {task.token_budget.toLocaleString()}</span>
                    </div>
                    <div className="w-full bg-hive-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${(task.tokens_used || 0) / task.token_budget > 0.9 ? 'bg-red-500' : 'bg-honey'}`}
                        style={{ width: `${Math.min(100, ((task.tokens_used || 0) / task.token_budget) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Pipeline indicator */}
              {task.pipeline_id && (
                <div className="flex items-center gap-2 p-2 bg-hive-700/30 rounded-lg border border-hive-700 text-xs text-hive-400">
                  🔗 Pipeline step {task.pipeline_step || '?'}
                </div>
              )}

              {/* Timestamps */}
              <div className="text-xs text-hive-500 space-y-1">
                <div>Created: {new Date(task.created_at).toLocaleString()}</div>
                {task.started_at && <div>Started: {new Date(task.started_at).toLocaleString()}</div>}
                {task.completed_at && <div>Completed: {new Date(task.completed_at).toLocaleString()}</div>}
              </div>
            </div>
          )}

          {tab === 'logs' && (
            <div className="space-y-1.5 font-mono text-xs">
              {logs.length === 0 ? (
                <div className="text-center text-hive-500 py-8">No logs yet. Run the task to see output.</div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-hive-600 shrink-0 w-16 text-right">
                      {new Date(log.created_at).toLocaleTimeString()}
                    </span>
                    <span className={`${LOG_COLORS[log.type]}`}>
                      {log.message}
                    </span>
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          )}

          {tab === 'output' && (
            <div className="font-mono text-xs text-hive-200 whitespace-pre-wrap bg-hive-900 rounded-lg p-4 border border-hive-700">
              {task.output || 'No output yet.'}
            </div>
          )}

          {tab === 'trace' && (
            <TraceView taskId={task.id} agents={agents} />
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-hive-700 flex items-center justify-between">
          <button
            onClick={() => onDelete(task.id)}
            className="text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            Delete Task
          </button>
          <div className="flex gap-2">
            {task.status === 'awaiting_approval' && (
              <>
                <button
                  onClick={async () => { await api.rejectTask(task.id) }}
                  className="px-4 py-2 text-sm text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10 transition-colors"
                >
                  Reject
                </button>
                <button
                  onClick={async () => { await api.approveTask(task.id) }}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium text-sm hover:bg-green-700 transition-colors"
                >
                  Approve & Run
                </button>
              </>
            )}
            {task.status === 'done' && task.agent_id === 'forge' && task.output && (
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="px-4 py-2 bg-forge text-white rounded-lg font-medium text-sm hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                {downloading ? 'Preparing...' : '📦 Download ZIP'}
              </button>
            )}
            {(task.status === 'todo' || task.status === 'backlog' || task.status === 'failed') && task.agent_id && (
              <>
                <button
                  onClick={() => onAbTest(task)}
                  className="px-3 py-2 text-sm text-hive-400 border border-hive-600 rounded-lg hover:text-hive-200 hover:border-hive-500 transition-colors"
                >
                  🔬 A/B Test
                </button>
                <button
                  onClick={() => onRun(task.id)}
                  className="px-4 py-2 bg-honey text-white rounded-lg font-medium text-sm hover:bg-honey-dim transition-colors"
                >
                  Run Agent ▶
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
