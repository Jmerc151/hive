import { useState, useEffect } from 'react'
import { api } from '../lib/api'

const AGENT_TILES = {
  scout:  { letter: 'S', class: 'tile-scout' },
  forge:  { letter: 'F', class: 'tile-forge' },
  quill:  { letter: 'Q', class: 'tile-quill' },
  dealer: { letter: 'D', class: 'tile-dealer' },
  oracle: { letter: 'O', class: 'tile-oracle' },
  nexus:  { letter: 'N', class: 'tile-nexus' },
}

const thinBorder = { border: '0.5px solid rgba(0,0,0,0.08)' }

export default function GuardrailMonitor({ onClose, inline }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    api.getGuardrailEvents(200).then(data => {
      setEvents(Array.isArray(data) ? data : data.events || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const filtered = filter === 'all' ? events : events.filter(e => e.action === filter)

  const today = new Date().toISOString().slice(0, 10)
  const todayEvents = events.filter(e => e.created_at?.startsWith(today))
  const blockedToday = todayEvents.filter(e => e.action === 'blocked').length
  const warnedToday = todayEvents.filter(e => e.action === 'warned').length

  // Most blocked tool
  const toolCounts = {}
  events.filter(e => e.action === 'blocked').forEach(e => {
    const t = e.tool_name || 'unknown'
    toolCounts[t] = (toolCounts[t] || 0) + 1
  })
  const topTool = Object.entries(toolCounts).sort((a, b) => b[1] - a[1])[0]

  const content = (
    <div className={inline ? "h-full flex flex-col overflow-y-auto" : "modal-content w-full max-w-2xl max-h-[85vh] flex flex-col"}
      onClick={inline ? undefined : e => e.stopPropagation()}>
      {/* Header */}
        <div className="flex items-center justify-between p-5" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-s3 flex items-center justify-center text-sm" style={thinBorder}>&#x1F6E1;</div>
            <div>
              <h2 className="font-display text-lg tracking-wider text-t1">GUARDRAILS</h2>
              <p className="text-xs text-t4">{events.length} event{events.length !== 1 ? 's' : ''} recorded</p>
            </div>
          </div>
          <button onClick={onClose} className="text-t4 hover:text-t1 text-xl transition-colors">&times;</button>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-3 p-4" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
          <div className="bg-s2 rounded-xl p-3 text-center" style={thinBorder}>
            <div className="text-xl font-bold text-red-500">{blockedToday}</div>
            <div className="text-[10px] text-t4 mt-0.5">Blocked today</div>
          </div>
          <div className="bg-s2 rounded-xl p-3 text-center" style={thinBorder}>
            <div className="text-xl font-bold text-amber-500">{warnedToday}</div>
            <div className="text-[10px] text-t4 mt-0.5">Warned today</div>
          </div>
          <div className="bg-s2 rounded-xl p-3 text-center" style={thinBorder}>
            <div className="text-sm font-bold text-t2 truncate">{topTool ? topTool[0] : '—'}</div>
            <div className="text-[10px] text-t4 mt-0.5">{topTool ? `${topTool[1]}x blocked` : 'Most blocked'}</div>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 px-4 py-2" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
          {['all', 'blocked', 'warned'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-lg capitalize transition-colors ${
                filter === f ? 'bg-t1 text-white' : 'text-t4 hover:text-t2 hover:bg-s3'
              }`}
              style={filter === f ? undefined : thinBorder}
            >
              {f} {f !== 'all' && <span className="ml-1 opacity-60">{events.filter(e => f === 'all' || e.action === f).length}</span>}
            </button>
          ))}
        </div>

        {/* Event list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="text-center text-t5 py-12">Loading events...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-3xl mb-3">&#x2705;</div>
              <div className="text-t3 text-sm mb-1">No guardrail events</div>
              <div className="text-t5 text-xs">All agent actions are within safe boundaries</div>
            </div>
          ) : (
            filtered.map((event, i) => {
              const tile = AGENT_TILES[event.agent_id]
              const isExpanded = expanded === i
              return (
                <div
                  key={event.id || i}
                  className="bg-s2 rounded-xl overflow-hidden cursor-pointer hover:bg-s3/50 transition-colors"
                  style={thinBorder}
                  onClick={() => setExpanded(isExpanded ? null : i)}
                >
                  <div className="p-3 flex items-center gap-3">
                    {/* Agent tile */}
                    {tile ? (
                      <div className={`agent-tile w-6 h-6 rounded-md text-[10px] flex-shrink-0 ${tile.class}`}>{tile.letter}</div>
                    ) : (
                      <div className="w-6 h-6 rounded-md bg-s3 flex items-center justify-center text-[10px] text-t4 flex-shrink-0">?</div>
                    )}
                    {/* Tool + rule */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-t1 truncate">{event.tool_name || 'unknown'}</span>
                        <span className="text-[10px] text-t4 truncate">{event.rule || ''}</span>
                      </div>
                    </div>
                    {/* Action badge */}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                      event.action === 'blocked'
                        ? 'bg-red-500/10 text-red-500'
                        : 'bg-amber-500/10 text-amber-600'
                    }`}>
                      {event.action}
                    </span>
                    {/* Timestamp */}
                    <span className="text-[10px] text-t5 flex-shrink-0 hidden sm:block">
                      {event.created_at ? new Date(event.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="px-3 pb-3 pt-1 text-xs text-t3 space-y-1" style={{ borderTop: '0.5px solid rgba(0,0,0,0.06)' }}>
                      {event.agent_id && <div><span className="text-t5">Agent:</span> {event.agent_id}</div>}
                      {event.tool_name && <div><span className="text-t5">Tool:</span> {event.tool_name}</div>}
                      {event.rule && <div><span className="text-t5">Rule:</span> {event.rule}</div>}
                      {event.details && <div><span className="text-t5">Details:</span> {typeof event.details === 'string' ? event.details : JSON.stringify(event.details)}</div>}
                      {event.task_id && <div><span className="text-t5">Task:</span> {event.task_id}</div>}
                      <div><span className="text-t5">Time:</span> {event.created_at ? new Date(event.created_at).toLocaleString() : '—'}</div>
                    </div>
                  )}
                </div>
              )
            })
          )}
      </div>
    </div>
  )

  if (inline) return content

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-backdrop" />
      {content}
    </div>
  )
}
