import { useState, useEffect, useRef, useMemo } from 'react'
import { api } from '../lib/api'
import TraceView from './TraceView'
import MarkdownRenderer from './MarkdownRenderer'
import ConfirmDialog from './ConfirmDialog'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'

const AGENT_TILES = {
  scout:  { letter: 'S', class: 'tile-scout' },
  forge:  { letter: 'F', class: 'tile-forge' },
  quill:  { letter: 'Q', class: 'tile-quill' },
  dealer: { letter: 'D', class: 'tile-dealer' },
  oracle: { letter: 'O', class: 'tile-oracle' },
  nexus:  { letter: 'N', class: 'tile-nexus' },
}

const STATUS_OPTIONS = ['backlog', 'todo', 'awaiting_approval', 'in_progress', 'in_review', 'done']
const STATUS_LABELS = { backlog: 'Backlog', todo: 'To Do', awaiting_approval: 'Awaiting Approval', in_progress: 'In Progress', in_review: 'Review', done: 'Done', failed: 'Failed', paused: 'Paused' }
const STATUS_COLORS = { backlog: 'text-t4', todo: 'text-blue-500', awaiting_approval: 'text-amber-500', in_progress: 'text-t1', in_review: 'text-purple-500', done: 'text-success', failed: 'text-red-500', paused: 'text-orange-500' }
const LOG_COLORS = { info: 'text-blue-500', success: 'text-green-500', error: 'text-red-500', warning: 'text-yellow-600', output: 'text-t2' }

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

const thinBorder = { border: '0.5px solid rgba(0,0,0,0.08)' }

export default function TaskDetail({ task, agent, agents, onClose, onRun, onUpdate, onDelete, onAbTest }) {
  const [logs, setLogs] = useState([])
  const [tab, setTab] = useState('details')
  const [downloading, setDownloading] = useState(false)
  const [files, setFiles] = useState([])
  const [selectedFile, setSelectedFile] = useState(null)
  const [filesLoading, setFilesLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
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
  const tile = agent ? AGENT_TILES[agent.id] : null

  const tabs = ['details', 'logs', 'output']
  if (hasFiles) tabs.push('files')
  tabs.push('trace')

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-backdrop" />
      <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-s1 shadow-2xl flex flex-col h-full z-50" style={{ borderLeft: '0.5px solid rgba(0,0,0,0.08)' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-5 flex items-start justify-between gap-4" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {tile && <div className={`agent-tile w-7 h-7 rounded-lg text-xs ${tile.class}`}>{tile.letter}</div>}
              <span className={`text-xs font-medium px-2 py-0.5 rounded bg-s3 ${STATUS_COLORS[task.status]}`}>
                {STATUS_LABELS[task.status]}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-display tracking-wider text-t1">{task.title}</h2>
              {task.nexus_score != null && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                  task.nexus_score >= 7 ? 'bg-green-500/10 text-green-600' :
                  task.nexus_score >= 4 ? 'bg-yellow-500/10 text-yellow-600' : 'bg-red-500/10 text-red-500'
                }`}>{task.nexus_score}/10</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-t4 hover:text-t1 text-xl shrink-0 transition-colors" aria-label="Close task detail">&times;</button>
        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto scrollbar-none" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
          {tabs.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors shrink-0 ${
                tab === t ? 'text-t1 border-b-2 border-t1' : 'text-t4 hover:text-t2'
              }`}
            >
              {t === 'files' ? `Files (${fileCount})` : t}
              {t === 'logs' && logs.length > 0 && (
                <span className="ml-1.5 text-xs bg-s3 rounded-full px-1.5">{logs.length}</span>
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
                <div className={`rounded-xl p-4 ${task.status === 'failed' ? 'bg-red-50' : 'bg-green-50'}`} style={{ border: `0.5px solid ${task.status === 'failed' ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)'}` }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-sm font-semibold ${task.status === 'failed' ? 'text-red-500' : 'text-success'}`}>
                      {task.status === 'failed' ? 'Failed' : 'Completed'}
                    </span>
                    <div className="flex items-center gap-3 text-xs text-t4">
                      {duration && <span>{duration}</span>}
                      {(task.tokens_used || 0) > 0 && <span>{(task.tokens_used).toLocaleString()} tokens</span>}
                      {(task.estimated_cost || 0) > 0 && <span>${task.estimated_cost.toFixed(4)}</span>}
                      {hasFiles && <span>{fileCount} files</span>}
                    </div>
                  </div>

                  {task.status === 'failed' && task.error && (
                    <p className="text-xs text-red-500 mb-2">{task.error}</p>
                  )}

                  {summaryText && (
                    <p className="text-xs text-t3 leading-relaxed mb-3">
                      {summaryText}{task.output && task.output.length > 200 ? '...' : ''}
                    </p>
                  )}

                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => setTab('output')} className="text-xs px-3 py-1.5 rounded-lg text-t3 hover:text-t1 transition-colors" style={thinBorder}>
                      View Output
                    </button>
                    {hasFiles && (
                      <button onClick={() => setTab('files')} className="text-xs px-3 py-1.5 rounded-lg text-t1 hover:bg-s3 transition-colors" style={thinBorder}>
                        View Files
                      </button>
                    )}
                    {hasFiles && (
                      <button onClick={handleDownload} disabled={downloading} className="text-xs px-3 py-1.5 rounded-lg bg-s3 text-t1 hover:bg-s2 transition-colors disabled:opacity-50" style={thinBorder}>
                        {downloading ? 'Preparing...' : 'Download ZIP'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Description */}
              <div>
                <h3 className="text-sm font-display tracking-wider text-t2 mb-2">DESCRIPTION</h3>
                <p className="text-sm text-t1 whitespace-pre-wrap">
                  {task.description || 'No description provided.'}
                </p>
              </div>

              {/* Agent */}
              {agent && (
                <div>
                  <h3 className="text-sm font-display tracking-wider text-t2 mb-2">ASSIGNED AGENT</h3>
                  <div className="flex items-center gap-3 p-3 bg-s2 rounded-xl" style={thinBorder}>
                    {tile && <div className={`agent-tile w-9 h-9 rounded-lg text-sm ${tile.class}`}>{tile.letter}</div>}
                    <div>
                      <div className="font-medium text-sm text-t1">{agent.name}</div>
                      <div className="text-xs text-t3">{agent.role} — {agent.description}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Status change */}
              <div>
                <h3 className="text-sm font-display tracking-wider text-t2 mb-2">STATUS</h3>
                <div className="flex gap-2 flex-wrap">
                  {STATUS_OPTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => onUpdate(task.id, { status: s })}
                      className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                        task.status === s
                          ? 'bg-t1 text-white'
                          : 'text-t4 hover:text-t2 hover:bg-s3'
                      }`}
                      style={task.status === s ? undefined : thinBorder}
                    >
                      {STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Token Budget */}
              {task.token_budget > 0 && (
                <div>
                  <h3 className="text-sm font-display tracking-wider text-t2 mb-2">TOKEN BUDGET</h3>
                  <div className="p-3 bg-s2 rounded-xl" style={thinBorder}>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-t4">Used: {(task.tokens_used || 0).toLocaleString()}</span>
                      <span className="text-t4">Budget: {task.token_budget.toLocaleString()}</span>
                    </div>
                    <div className="w-full bg-s3 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${(task.tokens_used || 0) / task.token_budget > 0.9 ? 'bg-red-500' : 'bg-t1'}`}
                        style={{ width: `${Math.min(100, ((task.tokens_used || 0) / task.token_budget) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Pipeline indicator */}
              {task.pipeline_id && (
                <div className="flex items-center gap-2 p-2 bg-s2 rounded-xl text-xs text-t4" style={thinBorder}>
                  Pipeline step {task.pipeline_step || '?'}
                </div>
              )}

              {/* Nexus Score */}
              {task.nexus_score != null && (
                <div>
                  <h3 className="text-sm font-display tracking-wider text-t2 mb-2">NEXUS QUALITY SCORE</h3>
                  <div className="flex items-center gap-3 p-3 bg-s2 rounded-xl" style={thinBorder}>
                    <span className={`text-2xl font-bold ${
                      task.nexus_score >= 7 ? 'text-green-500' :
                      task.nexus_score >= 4 ? 'text-yellow-500' : 'text-red-500'
                    }`}>{task.nexus_score}</span>
                    <div>
                      <div className="text-sm text-t1">/10 Quality Rating</div>
                      <div className="text-xs text-t4">
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
                  <h3 className="text-sm font-display tracking-wider text-t2 mb-2">COST</h3>
                  <div className="text-sm text-t1">
                    ${task.estimated_cost.toFixed(4)} · {(task.tokens_used || 0).toLocaleString()} tokens
                  </div>
                </div>
              )}

              {/* Timestamps */}
              <div className="text-xs text-t5 space-y-1">
                <div>Created: {new Date(task.created_at).toLocaleString()}</div>
                {task.started_at && <div>Started: {new Date(task.started_at).toLocaleString()}</div>}
                {task.completed_at && <div>Completed: {new Date(task.completed_at).toLocaleString()}</div>}
              </div>
            </div>
          )}

          {tab === 'logs' && (
            <div className="space-y-1.5 font-mono text-xs">
              {logs.length === 0 ? (
                <div className="text-center text-t5 py-8">No logs yet. Run the task to see output.</div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-t5 shrink-0 w-16 text-right">
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
            <div className="bg-page rounded-xl p-4 overflow-x-auto" style={thinBorder}>
              {task.output ? (
                <MarkdownRenderer content={processedOutput} />
              ) : (
                <div className="text-center text-t5 py-8">No output yet. Run the task to see results.</div>
              )}
            </div>
          )}

          {tab === 'files' && (
            <div>
              {filesLoading ? (
                <div className="text-center text-t5 py-8">Loading files...</div>
              ) : files.length === 0 ? (
                <div className="text-center text-t5 py-8">No individual files detected in output.</div>
              ) : (
                <>
                  {/* Files header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-sm text-t2">
                      <span className="font-medium">{files.length} files</span>
                    </div>
                    <button
                      onClick={handleDownload}
                      disabled={downloading}
                      className="text-xs px-3 py-1.5 rounded-lg bg-s3 text-t1 hover:bg-s2 transition-colors disabled:opacity-50"
                      style={thinBorder}
                    >
                      {downloading ? 'Preparing...' : 'Download ZIP'}
                    </button>
                  </div>

                  {/* Two-panel file viewer */}
                  <div className="flex flex-col md:flex-row rounded-xl overflow-hidden bg-page" style={{ ...thinBorder, minHeight: '400px' }}>
                    {/* File tree */}
                    <div className="md:w-1/3 overflow-y-auto max-h-48 md:max-h-none" style={{ borderRight: '0.5px solid rgba(0,0,0,0.08)' }}>
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
                                ? 'bg-s3 text-t1'
                                : 'text-t3 hover:bg-s2 hover:text-t1'
                            }`}
                          >
                            <span className="text-t5 text-[10px]">{file.language}</span>
                            <span className="truncate">
                              {dir && <span className="text-t5">{dir}</span>}
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
                          <div className="sticky top-0 flex items-center justify-between px-3 py-2 bg-s1/90 backdrop-blur z-10" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
                            <span className="text-xs text-t3 font-mono">{selectedFile.filename}</span>
                            <button
                              onClick={() => handleCopy(selectedFile.content)}
                              className="text-[10px] px-2 py-1 rounded text-t4 hover:text-t1 transition-colors"
                              style={thinBorder}
                            >
                              {copied ? 'Copied' : 'Copy'}
                            </button>
                          </div>
                          <SyntaxHighlighter
                            language={selectedFile.language}
                            style={oneLight}
                            customStyle={{
                              margin: 0,
                              padding: '1rem',
                              background: 'transparent',
                              fontSize: '0.7rem',
                              lineHeight: '1.5',
                            }}
                            showLineNumbers
                            lineNumberStyle={{ color: '#c0c0c0', fontSize: '0.65rem' }}
                          >
                            {selectedFile.content}
                          </SyntaxHighlighter>
                        </>
                      ) : (
                        <div className="text-center text-t5 py-8 text-sm">Select a file to view</div>
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
        <div className="p-4 flex items-center justify-between" style={{ borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
          <button
            onClick={() => setConfirmDelete({ id: task.id, name: task.title })}
            className="text-xs text-red-500 hover:text-red-400 transition-colors"
          >
            Delete Task
          </button>
          <div className="flex gap-2">
            {task.status === 'awaiting_approval' && (
              <>
                <button
                  onClick={async () => { await api.rejectTask(task.id) }}
                  className="px-4 py-2 text-sm text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                  style={{ border: '0.5px solid rgba(239,68,68,0.2)' }}
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
                  className="px-4 py-2 text-sm text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                  style={{ border: '0.5px solid rgba(239,68,68,0.2)' }}
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
                className="px-4 py-2 bg-s3 text-t1 rounded-lg font-medium text-sm hover:bg-s2 transition-colors"
                style={thinBorder}
              >
                Resume from Checkpoint
              </button>
            )}
            {task.status === 'done' && hasFiles && (
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="px-4 py-2 bg-t1 text-white rounded-lg font-medium text-sm hover:opacity-90 transition-colors disabled:opacity-50"
              >
                {downloading ? 'Preparing...' : 'Download ZIP'}
              </button>
            )}
            {(task.status === 'todo' || task.status === 'backlog' || task.status === 'failed') && task.agent_id && (
              <>
                <button
                  onClick={() => onAbTest(task)}
                  className="px-3 py-2 text-sm text-t4 rounded-lg hover:text-t2 hover:bg-s3 transition-colors"
                  style={thinBorder}
                >
                  A/B Test
                </button>
                <button
                  onClick={() => onRun(task.id)}
                  className="px-4 py-2 bg-t1 text-white rounded-lg font-medium text-sm hover:opacity-90 transition-colors"
                >
                  Run Agent
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      <ConfirmDialog
        isOpen={!!confirmDelete}
        title="Delete Task?"
        message={`Are you sure you want to delete "${confirmDelete?.name}"? This action cannot be undone.`}
        onConfirm={() => { onDelete(confirmDelete.id); setConfirmDelete(null) }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
