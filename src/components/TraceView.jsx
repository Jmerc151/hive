import { useState, useEffect } from 'react'
import { api } from '../lib/api'

const TYPE_ICONS = { llm_call: '🧠', consult: '💬', tool: '🔧', decision: '🎯' }
const TYPE_COLORS = { llm_call: 'border-blue-500/30', consult: 'border-cyan-500/30', tool: 'border-green-500/30', decision: 'border-honey/30' }

export default function TraceView({ taskId }) {
  const [traces, setTraces] = useState([])
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    if (!taskId) return
    api.getTraces(taskId).then(setTraces).catch(() => {})
    const interval = setInterval(() => {
      api.getTraces(taskId).then(setTraces).catch(() => {})
    }, 3000)
    return () => clearInterval(interval)
  }, [taskId])

  if (traces.length === 0) {
    return <div className="text-center text-hive-500 py-8">No trace data yet. Run the task to see execution trace.</div>
  }

  const totalTokens = traces.reduce((sum, t) => sum + (t.tokens_in || 0) + (t.tokens_out || 0), 0)
  const totalCost = traces.reduce((sum, t) => sum + (t.cost || 0), 0)
  const totalDuration = traces.reduce((sum, t) => sum + (t.duration_ms || 0), 0)

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex gap-3 text-xs text-hive-400 bg-hive-700/30 rounded-lg p-2.5">
        <span>{traces.length} steps</span>
        <span>·</span>
        <span>{totalTokens.toLocaleString()} tokens</span>
        <span>·</span>
        <span>${totalCost.toFixed(4)}</span>
        <span>·</span>
        <span>{(totalDuration / 1000).toFixed(1)}s</span>
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-4 top-2 bottom-2 w-px bg-hive-600" />

        {traces.map((trace, i) => (
          <div key={trace.id} className="relative pl-10 pb-3">
            {/* Node dot */}
            <div className={`absolute left-2.5 top-2 w-3 h-3 rounded-full border-2 ${TYPE_COLORS[trace.type] || 'border-hive-500'} bg-hive-800`} />

            <button
              onClick={() => setExpanded(expanded === i ? null : i)}
              className={`w-full text-left p-3 rounded-lg border transition-all ${
                expanded === i ? 'border-hive-500 bg-hive-700/50' : 'border-hive-700/50 hover:border-hive-600 bg-hive-800/50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm">{TYPE_ICONS[trace.type] || '📌'}</span>
                  <span className="text-xs font-medium text-hive-200">Step {trace.step}</span>
                  <span className="text-[10px] text-hive-500 capitalize">{trace.type.replace('_', ' ')}</span>
                  {trace.agent_id && <span className="text-[10px] text-hive-500">({trace.agent_id})</span>}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-hive-500 shrink-0">
                  {trace.tokens_in + trace.tokens_out > 0 && (
                    <span>{(trace.tokens_in + trace.tokens_out).toLocaleString()} tok</span>
                  )}
                  {trace.cost > 0 && <span>${trace.cost.toFixed(4)}</span>}
                  {trace.duration_ms > 0 && <span>{(trace.duration_ms / 1000).toFixed(1)}s</span>}
                  <span className="text-hive-600">{expanded === i ? '▲' : '▼'}</span>
                </div>
              </div>

              {expanded === i && (
                <div className="mt-3 space-y-2" onClick={e => e.stopPropagation()}>
                  {trace.input_summary && (
                    <div>
                      <div className="text-[10px] font-medium text-hive-400 mb-1">Input</div>
                      <div className="text-xs text-hive-300 bg-hive-900 rounded p-2 whitespace-pre-wrap max-h-32 overflow-y-auto font-mono">
                        {trace.input_summary}
                      </div>
                    </div>
                  )}
                  {trace.output_summary && (
                    <div>
                      <div className="text-[10px] font-medium text-hive-400 mb-1">Output</div>
                      <div className="text-xs text-hive-300 bg-hive-900 rounded p-2 whitespace-pre-wrap max-h-32 overflow-y-auto font-mono">
                        {trace.output_summary}
                      </div>
                    </div>
                  )}
                  {trace.model && (
                    <div className="text-[10px] text-hive-500">Model: {trace.model}</div>
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
