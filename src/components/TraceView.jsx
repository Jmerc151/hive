import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'
import { useTraceStream } from '../hooks/useTraceStream'

const TYPE_ICONS = { llm_call: '🧠', consult: '💬', tool: '🔧', decision: '🎯', THOUGHT: '💭', CONSULT: '💬', TOOL_CALL: '🔧', TOOL_RESULT: '📦', DECISION: '🎯', ERROR: '❌' }

export default function TraceView({ task, agents }) {
  const taskId = task?.id
  const isRunning = task?.status === 'in_progress'
  const [dbTraces, setDbTraces] = useState([])
  const [expanded, setExpanded] = useState(null)
  const scrollRef = useRef(null)

  // Live SSE stream when task is running
  const { events: liveEvents, connected } = useTraceStream({
    agentId: task?.agent_id || 'all',
    taskId,
    enabled: isRunning,
  })

  // Fetch historical traces from DB
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

  // Auto-scroll when live events arrive
  useEffect(() => {
    if (isRunning && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [liveEvents.length, isRunning])

  // Merge DB traces with live SSE events (live events supplement DB data)
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

  if (traces.length === 0) {
    return <div className="text-center text-t4 py-8">No trace data yet. Run the task to see execution trace.</div>
  }

  const totalTokens = traces.reduce((sum, t) => sum + (t.tokens_in || 0) + (t.tokens_out || 0), 0)
  const totalCost = traces.reduce((sum, t) => sum + (t.cost || 0), 0)
  const totalDuration = traces.reduce((sum, t) => sum + (t.duration_ms || 0), 0)

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex gap-3 text-xs text-t3 bg-s2 rounded-lg p-2.5 items-center">
        {isRunning && connected && (
          <span className="flex items-center gap-1.5 text-success font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            LIVE
          </span>
        )}
        <span>{traces.length} steps</span>
        <span>·</span>
        <span>{totalTokens.toLocaleString()} tokens</span>
        <span>·</span>
        <span>${totalCost.toFixed(4)}</span>
        <span>·</span>
        <span>{(totalDuration / 1000).toFixed(1)}s</span>
      </div>

      {/* Timeline */}
      <div className="relative" ref={scrollRef}>
        {/* Vertical line */}
        <div className="absolute left-4 top-2 bottom-2 w-px bg-s4" style={{ background: 'rgba(0,0,0,0.08)' }} />

        {traces.map((trace, i) => (
          <div key={trace.id || i} className="relative pl-10 pb-3">
            {/* Node dot */}
            <div className={`absolute left-2.5 top-2 w-3 h-3 rounded-full bg-s1 ${trace._live ? 'animate-pulse' : ''}`} style={{ border: '2px solid rgba(0,0,0,0.15)' }} />

            <button
              onClick={() => setExpanded(expanded === i ? null : i)}
              className={`w-full text-left p-3 rounded-lg transition-all ${
                expanded === i ? 'bg-s2' : 'bg-s1 hover:bg-s2'
              }`}
              style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm">{TYPE_ICONS[trace.type] || '📌'}</span>
                  <span className="text-xs font-medium text-t1">Step {trace.step}</span>
                  <span className="text-[10px] text-t4 capitalize">{trace.type.replace('_', ' ')}</span>
                  {trace.agent_id && <span className="text-[10px] text-t4">({trace.agent_id})</span>}
                  {trace._live && <span className="text-[9px] text-success font-semibold">LIVE</span>}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-t4 shrink-0">
                  {(trace.tokens_in || 0) + (trace.tokens_out || 0) > 0 && (
                    <span>{((trace.tokens_in || 0) + (trace.tokens_out || 0)).toLocaleString()} tok</span>
                  )}
                  {trace.cost > 0 && <span>${trace.cost.toFixed(4)}</span>}
                  {trace.duration_ms > 0 && <span>{(trace.duration_ms / 1000).toFixed(1)}s</span>}
                  <span className="text-t5">{expanded === i ? '▲' : '▼'}</span>
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
        ))}
      </div>
    </div>
  )
}
