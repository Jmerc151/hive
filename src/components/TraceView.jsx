import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../lib/api'
import { useTraceStream } from '../hooks/useTraceStream'

const TYPE_ICONS = { llm_call: '\u{1F9E0}', consult: '\u{1F4AC}', tool: '\u{1F527}', tool_call: '\u{1F527}', decision: '\u{1F3AF}', THOUGHT: '\u{1F4AD}', CONSULT: '\u{1F4AC}', TOOL_CALL: '\u{1F527}', TOOL_RESULT: '\u{1F4E6}', DECISION: '\u{1F3AF}', ERROR: '\u274C', tool_error: '\u274C' }

const TYPE_COLORS = {
  llm_call: { dot: 'bg-emerald-400', border: 'border-emerald-300', text: 'text-emerald-600', bg: 'bg-emerald-50' },
  THOUGHT:  { dot: 'bg-emerald-400', border: 'border-emerald-300', text: 'text-emerald-600', bg: 'bg-emerald-50' },
  consult:  { dot: 'bg-blue-400', border: 'border-blue-300', text: 'text-blue-600', bg: 'bg-blue-50' },
  CONSULT:  { dot: 'bg-blue-400', border: 'border-blue-300', text: 'text-blue-600', bg: 'bg-blue-50' },
  tool:     { dot: 'bg-amber-400', border: 'border-amber-300', text: 'text-amber-600', bg: 'bg-amber-50' },
  tool_call:{ dot: 'bg-amber-400', border: 'border-amber-300', text: 'text-amber-600', bg: 'bg-amber-50' },
  TOOL_CALL:{ dot: 'bg-amber-400', border: 'border-amber-300', text: 'text-amber-600', bg: 'bg-amber-50' },
  TOOL_RESULT:{ dot: 'bg-amber-300', border: 'border-amber-200', text: 'text-amber-500', bg: 'bg-amber-50' },
  decision: { dot: 'bg-purple-400', border: 'border-purple-300', text: 'text-purple-600', bg: 'bg-purple-50' },
  DECISION: { dot: 'bg-purple-400', border: 'border-purple-300', text: 'text-purple-600', bg: 'bg-purple-50' },
  ERROR:    { dot: 'bg-red-400', border: 'border-red-300', text: 'text-red-600', bg: 'bg-red-50' },
  tool_error:{ dot: 'bg-red-400', border: 'border-red-300', text: 'text-red-600', bg: 'bg-red-50' },
}

const DEFAULT_COLOR = { dot: 'bg-gray-300', border: 'border-gray-200', text: 'text-t4', bg: 'bg-s2' }

const FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'thought', label: 'LLM', match: ['llm_call', 'THOUGHT'] },
  { key: 'tool', label: 'Tool', match: ['tool', 'tool_call', 'TOOL_CALL', 'TOOL_RESULT', 'tool_error'] },
  { key: 'consult', label: 'Consult', match: ['consult', 'CONSULT'] },
  { key: 'decision', label: 'Decision', match: ['decision', 'DECISION'] },
  { key: 'error', label: 'Error', match: ['ERROR', 'tool_error'] },
]

export default function TraceView({ task, agents }) {
  const taskId = task?.id
  const isRunning = task?.status === 'in_progress'
  const [dbTraces, setDbTraces] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [typeFilter, setTypeFilter] = useState('all')
  const [fullscreen, setFullscreen] = useState(false)
  const [pinToLatest, setPinToLatest] = useState(true)
  const scrollRef = useRef(null)
  const bottomRef = useRef(null)

  const { events: liveEvents, connected } = useTraceStream({
    agentId: task?.agent_id || 'all',
    taskId,
    enabled: isRunning,
  })

  useEffect(() => {
    if (!taskId) return
    api.getTraces(taskId).then(setDbTraces).catch(() => {})
    if (!isRunning) {
      const interval = setInterval(() => {
        api.getTraces(taskId).then(setDbTraces).catch(() => {})
      }, 3000)
      return () => clearInterval(interval)
    }
  }, [taskId, isRunning])

  // Auto-scroll when pinned and live events arrive
  useEffect(() => {
    if (isRunning && pinToLatest && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [liveEvents.length, isRunning, pinToLatest])

  // Detect manual scroll-up to unpin
  const handleScroll = useCallback(() => {
    if (!scrollRef.current || !isRunning) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    const atBottom = scrollHeight - scrollTop - clientHeight < 60
    setPinToLatest(atBottom)
  }, [isRunning])

  const traces = isRunning && liveEvents.length > 0
    ? [...dbTraces, ...liveEvents.map(e => ({
        id: `live-${e.id}`,
        task_id: e.task_id,
        agent_id: e.agent_id,
        step: e.payload?.step || 0,
        type: e.event_type,
        input_summary: '',
        output_summary: e.payload?.content || e.payload?.error || e.event_type,
        tokens_in: 0,
        tokens_out: e.payload?.token_count || 0,
        cost: e.payload?.cost || 0,
        duration_ms: e.payload?.latency_ms || 0,
        model: e.payload?.model || '',
        created_at: e.timestamp,
        _live: true,
      }))]
    : dbTraces

  // Apply type filter
  const filtered = typeFilter === 'all'
    ? traces
    : traces.filter(t => {
        const opt = FILTER_OPTIONS.find(f => f.key === typeFilter)
        return opt?.match?.includes(t.type)
      })

  if (traces.length === 0) {
    return <div className="text-center text-t4 py-8">No trace data yet. Run the task to see execution trace.</div>
  }

  const totalTokens = traces.reduce((sum, t) => sum + (t.tokens_in || 0) + (t.tokens_out || 0), 0)
  const totalCost = traces.reduce((sum, t) => sum + (t.cost || 0), 0)
  const totalDuration = traces.reduce((sum, t) => sum + (t.duration_ms || 0), 0)

  // Count by type for filter badges
  const typeCounts = {}
  FILTER_OPTIONS.forEach(f => {
    if (f.key === 'all') { typeCounts.all = traces.length; return }
    typeCounts[f.key] = traces.filter(t => f.match?.includes(t.type)).length
  })

  const jumpToLatest = () => {
    setPinToLatest(true)
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const containerClass = fullscreen
    ? 'fixed inset-0 z-50 bg-s1 flex flex-col p-4 overflow-hidden'
    : 'space-y-3'

  return (
    <div className={containerClass}>
      {/* Summary bar */}
      <div className="flex gap-3 text-xs text-t3 bg-s2 rounded-lg p-2.5 items-center flex-wrap" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
        {isRunning && connected && (
          <span className="flex items-center gap-1.5 text-success font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            LIVE
          </span>
        )}
        <span>{traces.length} steps</span>
        <span className="text-t5">&middot;</span>
        <span>{totalTokens.toLocaleString()} tokens</span>
        <span className="text-t5">&middot;</span>
        <span>${totalCost.toFixed(4)}</span>
        <span className="text-t5">&middot;</span>
        <span>{(totalDuration / 1000).toFixed(1)}s</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setFullscreen(!fullscreen)}
            className="text-t4 hover:text-t1 px-1.5 py-0.5 rounded transition-colors"
            title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {fullscreen ? '\u2715' : '\u26F6'}
          </button>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
        {FILTER_OPTIONS.map(f => (
          <button
            key={f.key}
            onClick={() => setTypeFilter(f.key)}
            className={`flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg whitespace-nowrap transition-colors flex-shrink-0 ${
              typeFilter === f.key
                ? 'bg-t1 text-white'
                : 'text-t4 hover:text-t2 hover:bg-s3'
            }`}
            style={typeFilter === f.key ? undefined : { border: '0.5px solid rgba(0,0,0,0.08)' }}
          >
            {f.label}
            {typeCounts[f.key] > 0 && (
              <span className={`text-[9px] ${typeFilter === f.key ? 'opacity-70' : 'opacity-50'}`}>
                {typeCounts[f.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Timeline */}
      <div
        className={`relative overflow-y-auto ${fullscreen ? 'flex-1' : 'max-h-[60vh]'}`}
        ref={scrollRef}
        onScroll={handleScroll}
      >
        <div className="absolute left-4 top-2 bottom-2 w-px" style={{ background: 'rgba(0,0,0,0.08)' }} />

        {filtered.map((trace, i) => {
          const color = TYPE_COLORS[trace.type] || DEFAULT_COLOR
          return (
            <div key={trace.id || i} className="relative pl-10 pb-3">
              <div className={`absolute left-2.5 top-2 w-3 h-3 rounded-full ${color.dot} ${trace._live ? 'animate-pulse' : ''}`} style={{ border: '2px solid white' }} />

              <button
                onClick={() => setExpanded(expanded === i ? null : i)}
                className={`w-full text-left p-3 rounded-lg transition-all ${
                  expanded === i ? color.bg : 'bg-s1 hover:bg-s2'
                }`}
                style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm">{TYPE_ICONS[trace.type] || '\u{1F4CC}'}</span>
                    <span className="text-xs font-medium text-t1">Step {trace.step}</span>
                    <span className={`text-[10px] capitalize ${color.text}`}>{trace.type.replace('_', ' ')}</span>
                    {trace.agent_id && <span className="text-[10px] text-t4">({trace.agent_id})</span>}
                    {trace._live && <span className="text-[9px] text-success font-semibold">LIVE</span>}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-t4 shrink-0">
                    {(trace.tokens_in || 0) + (trace.tokens_out || 0) > 0 && (
                      <span>{((trace.tokens_in || 0) + (trace.tokens_out || 0)).toLocaleString()} tok</span>
                    )}
                    {trace.cost > 0 && <span>${trace.cost.toFixed(4)}</span>}
                    {trace.duration_ms > 0 && <span>{(trace.duration_ms / 1000).toFixed(1)}s</span>}
                    <span className="text-t5">{expanded === i ? '\u25B2' : '\u25BC'}</span>
                  </div>
                </div>

                {expanded === i && (
                  <div className="mt-3 space-y-2" onClick={e => e.stopPropagation()}>
                    {trace.input_summary && (
                      <div>
                        <div className="text-[10px] font-medium text-t3 mb-1">Input</div>
                        <div className="text-xs text-t2 bg-s2 rounded p-2 whitespace-pre-wrap max-h-32 overflow-y-auto font-mono">
                          {trace.input_summary}
                        </div>
                      </div>
                    )}
                    {trace.output_summary && (
                      <div>
                        <div className="text-[10px] font-medium text-t3 mb-1">Output</div>
                        <div className="text-xs text-t2 bg-s2 rounded p-2 whitespace-pre-wrap max-h-32 overflow-y-auto font-mono">
                          {trace.output_summary}
                        </div>
                      </div>
                    )}
                    {trace.model && (
                      <div className="text-[10px] text-t4">Model: {trace.model}</div>
                    )}
                  </div>
                )}
              </button>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Jump to latest button */}
      {isRunning && !pinToLatest && (
        <button
          onClick={jumpToLatest}
          className="sticky bottom-2 mx-auto flex items-center gap-1.5 text-xs bg-t1 text-white px-3 py-1.5 rounded-full shadow-lg hover:opacity-80 transition-opacity"
        >
          <span>\u2193</span> Jump to latest
        </button>
      )}
    </div>
  )
}
