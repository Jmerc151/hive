import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../lib/api'
import MarkdownRenderer from './MarkdownRenderer'

const AGENT_TILES = {
  scout:  { letter: 'S', class: 'tile-scout' },
  forge:  { letter: 'F', class: 'tile-forge' },
  quill:  { letter: 'Q', class: 'tile-quill' },
  dealer: { letter: 'D', class: 'tile-dealer' },
  oracle: { letter: 'O', class: 'tile-oracle' },
  nexus:  { letter: 'N', class: 'tile-nexus' },
}

const QUALITY_FILTERS = [
  { key: 'substantive', label: 'Best', desc: 'Tool use + real output' },
  { key: '', label: 'All', desc: 'Everything' },
  { key: 'low-only', label: 'Low', desc: 'Needs review' },
]

function timeAgo(d) {
  if (!d) return ''
  const diff = Date.now() - new Date(d).getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
  if (diff < 172800000) return '1d'
  return `${Math.floor(diff / 86400000)}d`
}

function dateGroup(d) {
  if (!d) return 'Unknown'
  const date = new Date(d)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  if (diff < 86400000 && date.getDate() === now.getDate()) return 'Today'
  if (diff < 172800000) return 'Yesterday'
  if (diff < 604800000) return 'This week'
  if (diff < 2592000000) return 'This month'
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function qualityDot(tier) {
  if (tier === 'high') return 'bg-success'
  if (tier === 'medium') return 'bg-warning'
  return 'bg-t5'
}

function truncateClean(text, max = 140) {
  if (!text) return ''
  const clean = text.replace(/[#*`\[\]]/g, '').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()
  return clean.length > max ? clean.slice(0, max) + '…' : clean
}

const PAGE_SIZE = 20

export default function DeliverablesFeed({ agents = [], tasks = [], filterAgent, onSelectTask }) {
  const [items, setItems] = useState([])
  const [stats, setStats] = useState({})
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [qualityFilter, setQualityFilter] = useState('substantive')
  const [expanded, setExpanded] = useState(null)
  const [page, setPage] = useState(0)
  const [estRevenue, setEstRevenue] = useState(0)
  const scrollRef = useRef(null)

  const fetchDeliverables = useCallback(() => {
    setLoading(true)
    const params = { limit: PAGE_SIZE, offset: page * PAGE_SIZE }
    if (filterAgent) params.agent = filterAgent
    if (qualityFilter === 'substantive') params.quality = 'substantive'
    else if (qualityFilter === 'low-only') params.quality = 'low'
    api.getDeliverables(params)
      .then(d => {
        setItems(d.deliverables || [])
        setTotal(d.total || 0)
        if (d.stats) setStats(d.stats)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filterAgent, qualityFilter, page])

  useEffect(() => { fetchDeliverables() }, [fetchDeliverables])

  useEffect(() => {
    api.getRevenueSummary()
      .then(d => setEstRevenue(d.total_revenue || d.totalRevenue || 0))
      .catch(() => {})
  }, [])

  // Reset page when filter changes
  useEffect(() => { setPage(0) }, [qualityFilter, filterAgent])

  // Active tasks
  const activeTasks = tasks.filter(t => t.status === 'in_progress')

  // Group items by date
  const grouped = []
  let currentGroup = null
  items.forEach(item => {
    const group = dateGroup(item.completed_at)
    if (group !== currentGroup) {
      currentGroup = group
      grouped.push({ type: 'header', label: group })
    }
    grouped.push({ type: 'item', data: item })
  })

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="flex flex-1 overflow-hidden min-h-0">
      {/* Main feed */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Quality filter bar */}
        <div className="flex items-center gap-2 px-5 py-[9px] bg-s2 flex-shrink-0 overflow-x-auto" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.07)' }}>
          {QUALITY_FILTERS.map(f => {
            const isActive = qualityFilter === f.key
            let count = ''
            if (f.key === 'substantive') count = stats.high ? `${stats.high + (stats.medium || 0)}` : ''
            else if (f.key === '') count = stats.total ? `${stats.total}` : ''
            else if (f.key === 'low-only') count = stats.low ? `${stats.low}` : ''
            return (
              <button
                key={f.key}
                onClick={() => setQualityFilter(f.key)}
                className={`flex items-center gap-[5px] px-[11px] py-[5px] rounded-[10px] text-xs whitespace-nowrap transition-all cursor-pointer ${
                  isActive ? 'bg-t1 text-white font-medium' : 'bg-s3 text-t3 hover:text-t1 hover:bg-card'
                }`}
                style={{ border: isActive ? '0.5px solid var(--color-t1)' : '0.5px solid rgba(0,0,0,0.07)' }}
              >
                {f.label}
                {count && <span className={`text-[10px] ${isActive ? 'text-white/60' : 'text-t4'}`}>{count}</span>}
              </button>
            )
          })}

          <div className="flex-1" />

          {/* Page indicator */}
          {totalPages > 1 && (
            <span className="text-[10px] text-t4 tabular-nums whitespace-nowrap">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
            </span>
          )}
        </div>

        {/* Feed content */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-3">
          {/* Active generating cards */}
          {page === 0 && activeTasks.length > 0 && (
            <div className="mb-3">
              {activeTasks.slice(0, 3).map(task => {
                const tile = AGENT_TILES[task.agent_id] || { letter: '?', class: 'tile-nexus' }
                const agentName = agents.find(a => a.id === task.agent_id)?.name || task.agent_id
                return (
                  <div key={task.id} className="hive-card mb-[7px] px-[13px] py-[11px] relative overflow-hidden gen-shimmer-top" style={{ borderColor: 'rgba(40,167,69,0.22)' }}>
                    <div className="flex items-center gap-[7px]">
                      <div className={`agent-tile w-[23px] h-[23px] rounded-[7px] text-[10px] ${tile.class}`}>{tile.letter}</div>
                      <span className="text-xs font-semibold text-t1">{agentName}</span>
                      <span className="text-[11px] text-t3 flex-1 truncate">{task.title}</span>
                      <div className="flex items-center gap-1 text-[10px] font-medium text-success px-[7px] py-[2px] rounded-[7px]" style={{ background: 'rgba(40,167,69,0.09)', border: '0.5px solid rgba(40,167,69,0.18)' }}>
                        <span className="w-[5px] h-[5px] rounded-full bg-success dot-pulse" />
                        Working
                      </div>
                    </div>
                    <div className="flex gap-[6px] mt-[7px] ml-[30px]">
                      <div className="shimmer-line w-[65%]" />
                      <div className="shimmer-line w-[30%]" />
                    </div>
                  </div>
                )
              })}
              {activeTasks.length > 3 && (
                <div className="text-center text-t4 text-[10px] py-1">+{activeTasks.length - 3} more</div>
              )}
            </div>
          )}

          {/* Loading */}
          {loading && <div className="text-center text-t4 py-12 text-sm">Loading…</div>}

          {/* Empty */}
          {!loading && items.length === 0 && (
            <div className="text-center py-16">
              <div className="text-t4 text-2xl mb-2">∅</div>
              <p className="text-t3 text-sm">
                {qualityFilter === 'substantive' ? 'No high-quality deliverables yet' : 'No deliverables found'}
              </p>
              <p className="text-t4 text-xs mt-1">
                {qualityFilter === 'substantive' && 'Try switching to "All" to see everything'}
              </p>
            </div>
          )}

          {/* Grouped items */}
          {!loading && grouped.map((entry, i) => {
            if (entry.type === 'header') {
              return (
                <div key={`h-${entry.label}`} className="flex items-center gap-2 mt-4 mb-[6px] first:mt-0">
                  <span className="font-display text-[11px] tracking-[2px] text-t5">{entry.label.toUpperCase()}</span>
                  <div className="flex-1 h-[0.5px]" style={{ background: 'rgba(0,0,0,0.06)' }} />
                </div>
              )
            }

            const item = entry.data
            const tile = AGENT_TILES[item.agent_id] || { letter: '?', class: 'tile-nexus' }
            const agentName = agents.find(a => a.id === item.agent_id)?.name || item.agent_id
            const isExpanded = expanded === item.id
            const toolCount = item.evidence?.tools_used || 0

            return (
              <div
                key={item.id}
                className="hive-card mb-[7px] cursor-pointer transition-all"
                onClick={() => setExpanded(isExpanded ? null : item.id)}
              >
                {/* Compact card — single row */}
                <div className="flex items-center gap-[8px] px-[12px] py-[10px]">
                  {/* Agent tile */}
                  <div className={`agent-tile w-[23px] h-[23px] rounded-[7px] text-[10px] ${tile.class}`}>{tile.letter}</div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-[6px]">
                      <span className="text-[12px] font-semibold text-t1 truncate">{item.title}</span>
                    </div>
                    {!isExpanded && (
                      <div className="text-[11px] text-t3 truncate mt-[1px] leading-snug">
                        {truncateClean(item.output)}
                      </div>
                    )}
                  </div>

                  {/* Meta badges */}
                  <div className="flex items-center gap-[5px] flex-shrink-0">
                    {/* Quality dot */}
                    <span className={`w-[6px] h-[6px] rounded-full ${qualityDot(item.quality_tier)}`} title={`Quality: ${item.quality_tier}`} />

                    {/* Tool count */}
                    {toolCount > 0 && (
                      <span className="text-[9px] text-t4 tabular-nums bg-s3 px-[5px] py-[1px] rounded-[5px]" style={{ border: '0.5px solid rgba(0,0,0,0.06)' }}>
                        {toolCount}⚡
                      </span>
                    )}

                    {/* Score */}
                    {item.score != null && item.score > 0 && (
                      <span className={`text-[9px] font-bold px-[5px] py-[1px] rounded-[5px] ${
                        item.score >= 7 ? 'bg-[rgba(40,167,69,0.09)] text-success' :
                        item.score >= 4 ? 'bg-[rgba(212,121,10,0.1)] text-scout' : 'bg-[rgba(192,41,42,0.09)] text-danger'
                      }`}>{item.score}</span>
                    )}

                    {/* Time */}
                    <span className="text-[10px] text-t5 tabular-nums w-[22px] text-right">{timeAgo(item.completed_at)}</span>
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-[12px] pb-[12px]">
                    <div className="h-[0.5px] mb-[10px]" style={{ background: 'rgba(0,0,0,0.06)' }} />

                    {/* Evidence strip */}
                    {(toolCount > 0 || item.has_code || item.has_urls) && (
                      <div className="flex flex-wrap gap-[5px] mb-[10px]">
                        {toolCount > 0 && (
                          <span className="text-[10px] text-t3 px-[7px] py-[2px] rounded-[6px] bg-s3" style={{ border: '0.5px solid rgba(0,0,0,0.06)' }}>
                            ⚡ {toolCount} tools
                          </span>
                        )}
                        {item.has_code && (
                          <span className="text-[10px] text-oracle px-[7px] py-[2px] rounded-[6px]" style={{ background: 'rgba(128,64,184,0.08)', border: '0.5px solid rgba(128,64,184,0.12)' }}>
                            {'<>'} Code
                          </span>
                        )}
                        {item.has_urls && (
                          <span className="text-[10px] text-scout px-[7px] py-[2px] rounded-[6px]" style={{ background: 'rgba(212,121,10,0.08)', border: '0.5px solid rgba(212,121,10,0.12)' }}>
                            🔗 Links
                          </span>
                        )}
                        {item.evidence?.files_created > 0 && (
                          <span className="text-[10px] text-t3 px-[7px] py-[2px] rounded-[6px] bg-s3" style={{ border: '0.5px solid rgba(0,0,0,0.06)' }}>
                            📄 {item.evidence.files_created} files
                          </span>
                        )}
                      </div>
                    )}

                    {/* Output */}
                    <div className="prose prose-sm max-w-none max-h-[45vh] overflow-y-auto text-sm text-t2 leading-relaxed rounded-lg bg-s1 p-3" style={{ border: '0.5px solid rgba(0,0,0,0.06)' }}>
                      <MarkdownRenderer content={item.output} />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-[6px] mt-[8px]">
                      <button
                        onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(item.output) }}
                        className="text-[11px] py-[5px] px-[10px] rounded-[8px] bg-t1 text-white transition-opacity hover:opacity-80"
                      >Copy</button>
                      {item.task_id && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onSelectTask?.(item.task_id) }}
                          className="text-[11px] py-[5px] px-[10px] rounded-[8px] bg-s3 text-t2 transition-colors hover:bg-s4"
                          style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}
                        >View task ↗</button>
                      )}
                      <div className="flex-1" />
                      <span className="text-[10px] text-t5">{agentName} · {item.tokens_used ? `${(item.tokens_used / 1000).toFixed(1)}k tok` : ''}{item.cost ? ` · $${item.cost.toFixed(3)}` : ''}</span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 py-4">
              <button
                onClick={() => { setPage(p => Math.max(0, p - 1)); scrollRef.current?.scrollTo(0, 0) }}
                disabled={page === 0}
                className="text-[11px] px-[10px] py-[5px] rounded-[8px] bg-s3 text-t2 transition-colors hover:bg-card disabled:opacity-30 disabled:cursor-default"
                style={{ border: '0.5px solid rgba(0,0,0,0.07)' }}
              >← Prev</button>
              <span className="text-[11px] text-t4 tabular-nums">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => { setPage(p => Math.min(totalPages - 1, p + 1)); scrollRef.current?.scrollTo(0, 0) }}
                disabled={page >= totalPages - 1}
                className="text-[11px] px-[10px] py-[5px] rounded-[8px] bg-s3 text-t2 transition-colors hover:bg-card disabled:opacity-30 disabled:cursor-default"
                style={{ border: '0.5px solid rgba(0,0,0,0.07)' }}
              >Next →</button>
            </div>
          )}
        </div>
      </div>

      {/* Right sidebar — stats */}
      <div className="hidden lg:flex w-[200px] flex-shrink-0 bg-s1 flex-col overflow-y-auto" style={{ borderLeft: '0.5px solid rgba(0,0,0,0.07)' }}>
        {/* Quality breakdown */}
        <div className="p-[13px]" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.07)' }}>
          <div className="font-display text-[11px] tracking-[2px] text-t5 mb-[9px]">QUALITY</div>
          <div className="space-y-[5px]">
            {[
              { label: 'High quality', count: stats.high || 0, color: 'bg-success', pct: ((stats.high || 0) / Math.max(stats.total || 1, 1)) * 100 },
              { label: 'Medium', count: stats.medium || 0, color: 'bg-warning', pct: ((stats.medium || 0) / Math.max(stats.total || 1, 1)) * 100 },
              { label: 'Low / empty', count: stats.low || 0, color: 'bg-t5', pct: ((stats.low || 0) / Math.max(stats.total || 1, 1)) * 100 },
            ].map(q => (
              <div key={q.label}>
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-[5px]">
                    <span className={`w-[5px] h-[5px] rounded-full ${q.color}`} />
                    <span className="text-t3">{q.label}</span>
                  </div>
                  <span className="text-t4 tabular-nums">{q.count}</span>
                </div>
                <div className="h-[2px] bg-page rounded-[1px] mt-[3px]">
                  <div className={`h-full rounded-[1px] ${q.color}`} style={{ width: `${q.pct}%`, opacity: 0.6 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* By agent */}
        <div className="p-[13px]" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.07)' }}>
          <div className="font-display text-[11px] tracking-[2px] text-t5 mb-[9px]">BY AGENT</div>
          {agents.map(a => {
            const tile = AGENT_TILES[a.id] || { letter: '?', class: 'tile-nexus' }
            const count = stats.byAgent?.[a.id] || 0
            const maxCount = Math.max(...Object.values(stats.byAgent || { _: 1 }), 1)
            const pct = (count / maxCount) * 100
            const colorMap = { scout: 'var(--color-scout)', forge: 'var(--color-forge)', quill: 'var(--color-quill)', dealer: 'var(--color-dealer)', oracle: 'var(--color-oracle)', nexus: 'var(--color-nexus)' }
            return (
              <div key={a.id} className="mb-[5px]">
                <div className="flex items-center gap-[6px] py-[2px]">
                  <div className={`agent-tile w-[18px] h-[18px] rounded-[5px] text-[9px] ${tile.class}`}>{tile.letter}</div>
                  <span className="text-[11px] text-t2 flex-1">{a.name}</span>
                  <span className="text-[10px] text-t4 tabular-nums">{count}</span>
                </div>
                <div className="h-[2px] bg-page rounded-[1px] my-[2px]">
                  <div className="h-full rounded-[1px]" style={{ width: `${pct}%`, background: colorMap[a.id] || 'var(--color-t4)' }} />
                </div>
              </div>
            )
          })}
        </div>

        {/* Revenue */}
        <div className="p-[13px]">
          <div className="font-display text-[11px] tracking-[2px] text-t5 mb-[6px]">REVENUE</div>
          <div className="font-display text-[28px] tracking-[1px] leading-none text-t1">${Math.round(estRevenue)}</div>
          <div className="text-[10px] text-t4 mt-[2px]">Estimated total</div>
        </div>
      </div>
    </div>
  )
}
