import { useState, useEffect, useRef, useCallback } from 'react'
import { useTraceStream } from '../hooks/useTraceStream'

const EVENT_CONFIG = {
  THOUGHT:     { border: 'border-emerald-500/50', bg: 'bg-emerald-500/10', text: 'text-emerald-400', icon: '💭' },
  TOOL_CALL:   { border: 'border-orange-500/50',  bg: 'bg-orange-500/10',  text: 'text-orange-400',  icon: '🔧' },
  TOOL_RESULT: { border: 'border-amber-500/50',   bg: 'bg-amber-500/10',   text: 'text-amber-400',   icon: '📦' },
  DECISION:    { border: 'border-honey/50',        bg: 'bg-honey/10',       text: 'text-honey',       icon: '🎯' },
  CONSULT:     { border: 'border-cyan-500/50',     bg: 'bg-cyan-500/10',    text: 'text-cyan-400',    icon: '💬' },
  ERROR:       { border: 'border-red-500/50',      bg: 'bg-red-500/10',     text: 'text-red-400',     icon: '❌' },
}

const ALL_TYPES = Object.keys(EVENT_CONFIG)

function TraceFilter({ activeTypes, onToggle }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto scrollbar-none py-2 px-1">
      {ALL_TYPES.map(type => {
        const active = activeTypes.has(type)
        const cfg = EVENT_CONFIG[type]
        return (
          <button
            key={type}
            onClick={() => onToggle(type)}
            className={`shrink-0 px-2.5 py-1.5 rounded-full text-[11px] font-semibold border transition-all min-h-[32px] ${
              active
                ? `${cfg.border} ${cfg.bg} ${cfg.text}`
                : 'border-hive-600 bg-hive-800 text-hive-500'
            }`}
          >
            {cfg.icon} {type}
          </button>
        )
      })}
    </div>
  )
}

function TraceEventRow({ event, isExpanded, onToggle }) {
  const cfg = EVENT_CONFIG[event.event_type] || EVENT_CONFIG.THOUGHT
  const time = new Date(event.timestamp).toLocaleTimeString('en-US', {
    hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
  })

  return (
    <div
      onClick={onToggle}
      className={`border-l-[3px] ${cfg.border} ${isExpanded ? cfg.bg : 'bg-transparent hover:bg-hive-700/30'} px-3 py-2.5 cursor-pointer border-b border-hive-700/30 transition-colors min-h-[44px] flex flex-col justify-center`}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm shrink-0">{cfg.icon}</span>
        <span className={`text-[10px] font-bold ${cfg.text} ${cfg.bg} px-1.5 py-0.5 rounded shrink-0 font-mono`}>
          {event.agent_id}
        </span>
        <span className="text-[13px] text-hive-200 flex-1 truncate">
          {event.payload?.content || event.payload?.tool || event.payload?.error || event.event_type}
        </span>
        <span className="text-[11px] text-hive-500 font-mono shrink-0">{time}</span>
      </div>

      {isExpanded && (
        <div className="mt-2 p-2 rounded-lg bg-hive-900/50 text-xs font-mono leading-relaxed text-hive-300 break-words">
          <div className="mb-1">
            <span className="text-hive-500">Type:</span> {event.event_type}
            {' '}<span className="text-hive-500">Agent:</span> {event.agent_id}
            {event.task_id && <>{' '}<span className="text-hive-500">Task:</span> #{event.task_id}</>}
          </div>
          {event.payload?.content && (
            <div className="mb-1"><span className="text-hive-500">Content:</span> {event.payload.content}</div>
          )}
          {event.payload?.tool && (
            <div className="mb-1">
              <span className="text-hive-500">Tool:</span> {event.payload.tool}
              {event.payload.args && (
                <div className="ml-3 text-hive-400">Args: {JSON.stringify(event.payload.args, null, 2)}</div>
              )}
            </div>
          )}
          {event.payload?.result && (
            <div className="mb-1">
              <span className="text-hive-500">Result:</span>{' '}
              {typeof event.payload.result === 'string'
                ? event.payload.result.slice(0, 300)
                : JSON.stringify(event.payload.result, null, 2).slice(0, 300)}
            </div>
          )}
          {event.payload?.error && (
            <div className="mb-1 text-red-400"><span className="text-hive-500">Error:</span> {event.payload.error}</div>
          )}
          <div className="text-hive-500 text-[11px]">
            {event.payload?.latency_ms && `${event.payload.latency_ms}ms`}
            {event.payload?.token_count && ` · ${event.payload.token_count} tokens`}
            {event.payload?.cost && ` · $${event.payload.cost.toFixed(4)}`}
            {event.payload?.step !== undefined && ` · Step ${event.payload.step}`}
            {event.payload?.model && ` · ${event.payload.model}`}
          </div>
        </div>
      )}
    </div>
  )
}

export default function LiveTraceStream({ onClose, embedded = false }) {
  const { events, connected, clear } = useTraceStream({ agentId: 'all' })
  const [activeTypes, setActiveTypes] = useState(new Set(ALL_TYPES))
  const [expandedId, setExpandedId] = useState(null)
  const [pinToLatest, setPinToLatest] = useState(true)
  const scrollRef = useRef(null)

  const filteredEvents = events.filter(e => activeTypes.has(e.event_type))

  // Auto-scroll
  useEffect(() => {
    if (pinToLatest && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [filteredEvents.length, pinToLatest])

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    const atBottom = scrollHeight - scrollTop - clientHeight < 50
    if (!atBottom && pinToLatest) setPinToLatest(false)
    if (atBottom && !pinToLatest) setPinToLatest(true)
  }, [pinToLatest])

  const toggleType = (type) => {
    setActiveTypes(prev => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  const containerClass = embedded
    ? 'flex flex-col h-full bg-hive-800'
    : 'fixed inset-0 z-50 bg-hive-900/95 backdrop-blur-xl flex flex-col'

  return (
    <div className={containerClass}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-hive-700/50 bg-hive-800/50 shrink-0">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`} />
          <span className="text-sm font-bold text-hive-100">Live Trace</span>
          <span className="text-xs text-hive-400">{filteredEvents.length} events</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { clear(); setExpandedId(null) }}
            className="px-2.5 py-1 text-xs rounded-lg border border-hive-600 bg-hive-700 text-hive-300 hover:bg-hive-600 transition-colors min-h-[32px]"
          >
            Clear
          </button>
          <button
            onClick={onClose}
            className="px-2.5 py-1 text-xs rounded-lg border border-hive-600 bg-hive-700 text-hive-300 hover:bg-hive-600 transition-colors min-h-[32px]"
          >
            Close
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="px-3 shrink-0">
        <TraceFilter activeTypes={activeTypes} onToggle={toggleType} />
      </div>

      {/* Event list */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden relative"
      >
        {filteredEvents.length === 0 ? (
          <div className="py-16 text-center text-hive-500 text-sm">
            {connected ? 'Waiting for agent activity...' : 'Connecting to trace stream...'}
          </div>
        ) : (
          filteredEvents.map((event, i) => {
            const key = `${event.timestamp}-${i}`
            return (
              <TraceEventRow
                key={key}
                event={event}
                isExpanded={expandedId === key}
                onToggle={() => setExpandedId(expandedId === key ? null : key)}
              />
            )
          })
        )}
      </div>

      {/* Jump to latest */}
      {!pinToLatest && filteredEvents.length > 0 && (
        <button
          onClick={() => {
            setPinToLatest(true)
            if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
          }}
          className="absolute bottom-20 right-4 px-4 py-2 rounded-full bg-hive-700 text-white border border-hive-600 text-xs font-semibold shadow-lg z-10 min-h-[44px] flex items-center gap-1 hover:bg-hive-600 transition-colors"
        >
          ↓ Jump to latest
        </button>
      )}
    </div>
  )
}
