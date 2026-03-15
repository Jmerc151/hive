import { useState, useEffect, useRef, useCallback } from 'react'
import { useTraceStream } from '../hooks/useTraceStream'

const EVENT_CONFIG = {
  THOUGHT:     { bg: 'bg-emerald-500/10', text: 'text-emerald-600', icon: '💭' },
  TOOL_CALL:   { bg: 'bg-orange-500/10',  text: 'text-orange-600',  icon: '🔧' },
  TOOL_RESULT: { bg: 'bg-amber-500/10',   text: 'text-amber-600',   icon: '📦' },
  DECISION:    { bg: 'bg-t1/10',           text: 'text-t1',          icon: '🎯' },
  CONSULT:     { bg: 'bg-cyan-500/10',     text: 'text-cyan-600',    icon: '💬' },
  ERROR:       { bg: 'bg-red-500/10',      text: 'text-danger',      icon: '❌' },
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
            className={`shrink-0 px-2.5 py-1.5 rounded-full text-[11px] font-semibold transition-all min-h-[32px] ${
              active
                ? `${cfg.bg} ${cfg.text}`
                : 'bg-s2 text-t4'
            }`}
            style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}
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
      className={`border-l-[3px] ${isExpanded ? cfg.bg : 'bg-transparent hover:bg-s3'} px-3 py-2.5 cursor-pointer transition-colors min-h-[44px] flex flex-col justify-center`}
      style={{ borderLeftColor: 'currentColor', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm shrink-0">{cfg.icon}</span>
        <span className={`text-[10px] font-bold ${cfg.text} ${cfg.bg} px-1.5 py-0.5 rounded shrink-0 font-mono`}>
          {event.agent_id}
        </span>
        <span className="text-[13px] text-t1 flex-1 truncate">
          {event.payload?.content || event.payload?.tool || event.payload?.error || event.event_type}
        </span>
        <span className="text-[11px] text-t4 font-mono shrink-0">{time}</span>
      </div>

      {isExpanded && (
        <div className="mt-2 p-2 rounded-lg bg-s2 text-xs font-mono leading-relaxed text-t2 break-words">
          <div className="mb-1">
            <span className="text-t4">Type:</span> {event.event_type}
            {' '}<span className="text-t4">Agent:</span> {event.agent_id}
            {event.task_id && <>{' '}<span className="text-t4">Task:</span> #{event.task_id}</>}
          </div>
          {event.payload?.content && (
            <div className="mb-1"><span className="text-t4">Content:</span> {event.payload.content}</div>
          )}
          {event.payload?.tool && (
            <div className="mb-1">
              <span className="text-t4">Tool:</span> {event.payload.tool}
              {event.payload.args && (
                <div className="ml-3 text-t3">Args: {JSON.stringify(event.payload.args, null, 2)}</div>
              )}
            </div>
          )}
          {event.payload?.result && (
            <div className="mb-1">
              <span className="text-t4">Result:</span>{' '}
              {typeof event.payload.result === 'string'
                ? event.payload.result.slice(0, 300)
                : JSON.stringify(event.payload.result, null, 2).slice(0, 300)}
            </div>
          )}
          {event.payload?.error && (
            <div className="mb-1 text-danger"><span className="text-t4">Error:</span> {event.payload.error}</div>
          )}
          <div className="text-t4 text-[11px]">
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
    ? 'flex flex-col h-full bg-s1'
    : 'fixed inset-0 z-50 bg-page flex flex-col'

  return (
    <div className={containerClass}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-s1 shrink-0" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-success' : 'bg-danger'}`} style={connected ? { boxShadow: '0 0 6px rgba(52,199,89,0.5)' } : {}} />
          <span className="text-sm font-bold text-t1">Live Trace</span>
          <span className="text-xs text-t3">{filteredEvents.length} events</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { clear(); setExpandedId(null) }}
            className="px-2.5 py-1 text-xs rounded-lg bg-s3 text-t2 hover:bg-s3 transition-colors min-h-[32px]"
            style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}
          >
            Clear
          </button>
          <button
            onClick={onClose}
            className="px-2.5 py-1 text-xs rounded-lg bg-s3 text-t2 hover:bg-s3 transition-colors min-h-[32px]"
            style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}
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
          <div className="py-16 text-center text-t4 text-sm">
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
          className="absolute bottom-20 right-4 px-4 py-2 rounded-full bg-s1 text-t1 text-xs font-semibold shadow-lg z-10 min-h-[44px] flex items-center gap-1 hover:bg-s3 transition-colors"
          style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}
        >
          ↓ Jump to latest
        </button>
      )}
    </div>
  )
}
