import { useState, useEffect, useRef, useMemo } from 'react'
import { api } from '../lib/api'
import TraceView from './TraceView'
import MarkdownRenderer from './MarkdownRenderer'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

const STATUS_OPTIONS = ['backlog', 'todo', 'awaiting_approval', 'in_progress', 'in_review', 'done']
const STATUS_LABELS = { backlog: 'Backlog', todo: 'To Do', awaiting_approval: 'Awaiting Approval', in_progress: 'In Progress', in_review: 'Review', done: 'Done', failed: 'Failed', paused: 'Paused' }
const STATUS_COLORS = { backlog: 'text-hive-400', todo: 'text-blue-400', awaiting_approval: 'text-amber-400', in_progress: 'text-honey', in_review: 'text-prism', done: 'text-honey', failed: 'text-red-400', paused: 'text-orange-400' }
const LOG_COLORS = { info: 'text-blue-400', success: 'text-green-400', error: 'text-red-400', warning: 'text-yellow-400', output: 'text-hive-300' }

function formatDuration(start, end) {
  if (!start || !end) return null
  const ms = new Date(end) - new Date(start)
  if (ms < 0) return null
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}m ${rem}s`
}

function countFiles(output) {
  if (!output) return 0
  const regex = /(?:^#{1,3}\s+`?[a-zA-Z0-9_\-/.]+\.[a-zA-Z0-9]+`?\s*$|^\*\*[a-zA-Z0-9_\-/.]+\.[a-zA-Z0-9]+\*\*\s*$)\s*```/gm
  const matches = output.match(regex)
  return matches ? matches.length : 0
}

function stripMarkdown(text) {
  return text.replace(/```[\s\S]*?```/g, '').replace(/#{1,3}\s+/g, '').replace(/\*\*/g, '').replace(/`/g, '').replace(/---/g, '').trim()
}

export default function TaskDetail({ task, agent, agents, onClose, onRun, onUpdate, onDelete, onAbTest }) {
  const [logs, setLogs] = useState([])
  const [tab, setTab] = useState('details')
  const [downloading, setDownloading] = useState(false)
  const [files, setFiles] = useState([])
  const [selectedFile, setSelectedFile] = useState(null)
  const [filesLoading, setFilesLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const logsEndRef = useRef(null)

  const fileCount = useMemo(() => countFiles(task?.output), [task?.output])
  const hasFiles = fileCount > 0

  const handleDownload = async () => {
    setDownloading(true)
    try {
      await api.downloadBot(task.id)
    } catch (err) {
      alert(err.message)
    }
    setDownloading(false)
  }

  const handleCopy = async (content) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
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

  // Fetch files when Files tab selected
  useEffect(() => {
    if (tab !== 'files' || !task?.id) return
    setFilesLoading(true)
    api.getTaskFiles(task.id).then(data => {
      setFiles(data.files || [])
      if (data.files?.length > 0 && !selectedFile) setSelectedFile(data.files[0])
    }).catch(() => {}).finally(() => setFilesLoading(false))
  }, [tab, task?.id])

  if (!task) return null

  const processedOutput = useMemo(() => {
    if (!task.output) return ''
    return task.output.replace(/^--- Step (\d+) ---$/gm, '\n---\n**Step $1**\n')
  }, [task.output])

  const isComplete = task.status === 'done' || task.status === 'failed'
  const duration = formatDuration(task.started_at, task.completed_at)
  const summaryText = task.output ? stripMarkdown(task.output).slice(0, 200) : ''

  const tabs = ['details', 'logs', 'output']
  if (hasFiles) tabs.push('files')
  tabs.push('trace')

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
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{task.title}</h2>
              {task.nexus_score != null && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                  task.nexus_score >= 7 ? 'bg-green-500/15 text-green-400' :
                  task.nexus_score >= 4 ? 'bg-yellow-500/15 text-yellow-400' : 'bg-red-500/15 text-red-400'
                }`}>{task.nexus_score}/10</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-hive-400 hover:text-hive-200 text-xl shrink-0">&times;</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-hive-700 overflow-x-auto scrollbar-none">
          {tabs.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors shrink-0 ${
                tab === t ? 'text-honey border-b-2 border-honey' : 'text-hive-400 hover:text-hive-200'
              }`}
            >
              {t === 'files' ? `Files (${fileCount})` : t}
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
              {/* Completion Summary Card */}
              {isComplete && (
                <div className={`rounded-lg border p-4 ${task.status === 'failed' ? 'bg-red-500/5 border-red-500/20' : 'bg-honey/5 border-honey/20'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-sm font-semibold ${task.status === 'failed' ? 'text-red-400' : 'text-honey'}`}>
                      {task.status === 'failed' ? '❌ Failed' : '✅ Completed'}
                    </span>
                    <div className="flex items-center gap-3 text-xs text-hive-400">
                      {duration && <span>{duration}</span>}
                      {(task.tokens_used || 0) > 0 && <span>{(task.tokens_used).toLocaleString()} tokens</span>}
                      {(task.estimated_cost || 0) > 0 && <span>${task.estimated_cost.toFixed(4)}</span>}
                      {hasFiles && <span>{fileCount} files</span>}
                    </div>
                  </div>

                  {task.status === 'failed' && task.error && (
                    <p className="text-xs text-red-300 mb-2">{task.error}</p>
                  )}

                  {summaryText && (
                    <p className="text-xs text-hive-300 leading-relaxed mb-3">
                      {summaryText}{task.output && task.output.length > 200 ? '...' : ''}
                    </p>
                  )}

                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => setTab('output')} className="text-xs px-3 py-1.5 rounded-lg border border-hive-600 text-hive-300 hover:text-hive-100 hover:border-hive-500 transition-colors">
                      View Output
                    </button>
                    {hasFiles && (
                      <button onClick={() => setTab('files')} className="text-xs px-3 py-1.5 rounded-lg border border-honey/30 text-honey hover:bg-honey/10 transition-colors">
                        View Files
                      </button>
                    )}
                    {hasFiles && (
                      <button onClick={handleDownload} disabled={downloading} className="text-xs px-3 py-1.5 rounded-lg bg-honey/10 border border-honey/30 text-honey hover:bg-honey/20 transition-colors disabled:opacity-50">
                        {downloading ? 'Preparing...' : '📦 Download ZIP'}
                      </button>
                    )}
                  </div>
                </div>
              )}

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

              {/* Nexus Score */}
              {task.nexus_score != null && (
                <div>
                  <h3 className="text-sm font-medium text-hive-300 mb-2">Nexus Quality Score</h3>
                  <div className="flex items-center gap-3 p-3 bg-hive-700/30 rounded-lg border border-hive-700">
                    <span className={`text-2xl font-bold ${
                      task.nexus_score >= 7 ? 'text-green-400' :
                      task.nexus_score >= 4 ? 'text-yellow-400' : 'text-red-400'
                    }`}>{task.nexus_score}</span>
                    <div>
                      <div className="text-sm text-hive-200">/10 Quality Rating</div>
                      <div className="text-xs text-hive-400">
                        {task.nexus_score >= 7 ? 'Auto-approved by Nexus' :
                         task.nexus_score >= 4 ? 'Held for manual review' : 'Needs attention'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Cost */}
              {task.estimated_cost > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-hive-300 mb-2">Cost</h3>
                  <div className="text-sm text-hive-200">
                    ${task.estimated_cost.toFixed(4)} · {(task.tokens_used || 0).toLocaleString()} tokens
                  </div>
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
            <div className="bg-hive-900 rounded-lg p-4 border border-hive-700 overflow-x-auto">
              {task.output ? (
                <MarkdownRenderer content={processedOutput} />
              ) : (
                <div className="text-center text-hive-500 py-8">No output yet. Run the task to see results.</div>
              )}
            </div>
          )}

          {tab === 'files' && (
            <div>
              {filesLoading ? (
                <div className="text-center text-hive-500 py-8">Loading files...</div>
              ) : files.length === 0 ? (
                <div className="text-center text-hive-500 py-8">No individual files detected in output.</div>
              ) : (
                <>
                  {/* Files header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-sm text-hive-300">
                      <span>📦</span>
                      <span className="font-medium">{files.length} files</span>
                    </div>
                    <button
                      onClick={handleDownload}
                      disabled={downloading}
                      className="text-xs px-3 py-1.5 rounded-lg bg-honey/10 border border-honey/30 text-honey hover:bg-honey/20 transition-colors disabled:opacity-50"
                    >
                      {downloading ? 'Preparing...' : '📦 Download ZIP'}
                    </button>
                  </div>

                  {/* Two-panel file viewer */}
                  <div className="flex flex-col md:flex-row border border-hive-700 rounded-lg overflow-hidden bg-hive-900" style={{ minHeight: '400px' }}>
                    {/* File tree */}
                    <div className="md:w-1/3 border-b md:border-b-0 md:border-r border-hive-700 overflow-y-auto max-h-48 md:max-h-none">
                      {files.map((file, i) => {
                        const parts = file.filename.split('/')
                        const name = parts[parts.length - 1]
                        const dir = parts.length > 1 ? parts.slice(0, -1).join('/') + '/' : ''
                        return (
                          <button
                            key={i}
                            onClick={() => setSelectedFile(file)}
                            className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${
                              selectedFile === file
                                ? 'bg-hive-700 text-honey'
                                : 'text-hive-300 hover:bg-hive-800 hover:text-hive-100'
                            }`}
                          >
                            <span className="text-hive-500 text-[10px]">{file.language}</span>
                            <span className="truncate">
                              {dir && <span className="text-hive-500">{dir}</span>}
                              {name}
                            </span>
                          </button>
                        )
                      })}
                    </div>

                    {/* Code viewer */}
                    <div className="flex-1 overflow-auto relative">
                      {selectedFile ? (
                        <>
                          <div className="sticky top-0 flex items-center justify-between px-3 py-2 bg-hive-800/90 backdrop-blur border-b border-hive-700 z-10">
                            <span className="text-xs text-hive-300 font-mono">{selectedFile.filename}</span>
                            <button
                              onClick={() => handleCopy(selectedFile.content)}
                              className="text-[10px] px-2 py-1 rounded border border-hive-600 text-hive-400 hover:text-hive-200 hover:border-hive-500 transition-colors"
                            >
                              {copied ? '✓ Copied' : '📋 Copy'}
                            </button>
                          </div>
                          <SyntaxHighlighter
                            language={selectedFile.language}
                            style={vscDarkPlus}
                            customStyle={{
                              margin: 0,
                              padding: '1rem',
                              background: 'transparent',
                              fontSize: '0.7rem',
                              lineHeight: '1.5',
                            }}
                            showLineNumbers
                            lineNumberStyle={{ color: '#2A3A5C', fontSize: '0.65rem' }}
                          >
                            {selectedFile.content}
                          </SyntaxHighlighter>
                        </>
                      ) : (
                        <div className="text-center text-hive-500 py-8 text-sm">Select a file to view</div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'trace' && (
            <TraceView task={task} agents={agents} />
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
            {task.status === 'paused' && (
              <>
                <button
                  onClick={async () => { await api.rejectContinue(task.id) }}
                  className="px-4 py-2 text-sm text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10 transition-colors"
                >
                  Reject & Stop
                </button>
                <button
                  onClick={async () => { await api.approveContinue(task.id) }}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium text-sm hover:bg-green-700 transition-colors"
                >
                  Approve & Continue
                </button>
              </>
            )}
            {task.status === 'failed' && task.agent_id && (
              <button
                onClick={async () => { try { await api.resumeTask(task.id) } catch {} }}
                className="px-4 py-2 bg-honey/20 text-honey rounded-lg font-medium text-sm hover:bg-honey/30 transition-colors"
              >
                ♻️ Resume from Checkpoint
              </button>
            )}
            {task.status === 'done' && hasFiles && (
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
