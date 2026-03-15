import { useState, useEffect } from 'react'
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

const TYPE_BADGE = {
  outreach: { label: 'Email', class: 'bg-[rgba(192,41,42,0.09)] text-dealer' },
  research: { label: 'Report', class: 'bg-[rgba(40,167,69,0.09)] text-quill' },
  analysis: { label: 'Trade', class: 'bg-[rgba(212,121,10,0.1)] text-scout' },
  code:     { label: 'Code', class: 'bg-[rgba(128,64,184,0.09)] text-oracle' },
  content:  { label: 'Document', class: 'bg-[rgba(90,90,96,0.09)] text-forge' },
  text:     { label: 'Text', class: 'bg-[rgba(90,90,96,0.09)] text-forge' },
}

const TABS = [
  { key: '', label: 'All' },
  { key: 'outreach', label: 'Emails' },
  { key: 'content', label: 'Documents' },
  { key: 'analysis', label: 'Trades' },
  { key: 'code', label: 'Code' },
  { key: 'research', label: 'Reports' },
]

function timeAgo(d) {
  if (!d) return ''
  const diff = Date.now() - new Date(d).getTime()
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  if (diff < 172800000) return 'Yesterday'
  return `${Math.floor(diff / 86400000)}d ago`
}

export default function DeliverablesFeed({ agents = [], tasks = [], filterAgent, onSelectTask }) {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [sortNewest, setSortNewest] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params = { limit: 50 }
    if (filterAgent) params.agent = filterAgent
    api.getDeliverables(params)
      .then(d => { setItems(d.deliverables || []); setTotal(d.total || 0) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filterAgent])

  const filtered = typeFilter ? items.filter(i => i.type === typeFilter) : items

  // Count by type
  const typeCounts = {}
  items.forEach(i => { typeCounts[i.type] = (typeCounts[i.type] || 0) + 1 })

  // Count by agent
  const agentCounts = {}
  items.forEach(i => { agentCounts[i.agent_id] = (agentCounts[i.agent_id] || 0) + 1 })
  const maxAgentCount = Math.max(...Object.values(agentCounts), 1)

  // Active tasks (generating)
  const activeTasks = tasks.filter(t => t.status === 'in_progress')

  // Stats
  const thisWeek = items.filter(i => {
    const d = new Date(i.completed_at)
    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 86400000)
    return d > weekAgo
  }).length

  return (
    <div className="flex flex-1 overflow-hidden min-h-0">
      {/* Feed */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tabs */}
        <div className="flex bg-s2 px-5 flex-shrink-0 overflow-x-auto" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.07)' }}>
          {TABS.map(tab => {
            const count = tab.key ? (typeCounts[tab.key] || 0) : total
            const isActive = typeFilter === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setTypeFilter(tab.key)}
                className={`px-3 py-[9px] text-xs whitespace-nowrap transition-colors ${
                  isActive ? 'text-t1 font-medium border-b-2 border-t1' : 'text-t4 hover:text-t1 border-b-2 border-transparent'
                }`}
              >
                {tab.label}
                {count > 0 && (
                  <span className="text-[10px] ml-1 px-[5px] py-0 rounded-[6px] bg-page text-t4" style={{ border: '0.5px solid rgba(0,0,0,0.07)' }}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Feed content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Filter bar */}
          <div className="flex items-center gap-[6px] mb-3">
            <span className="font-display text-[11px] tracking-[2px] text-t5 flex-1">RECENT OUTPUTS</span>
            <button
              onClick={() => setSortNewest(true)}
              className={`text-[11px] px-[9px] py-[3px] rounded-[9px] cursor-pointer transition-all ${
                sortNewest ? 'bg-t1 text-white font-medium' : 'bg-s3 text-t3 hover:bg-card'
              }`}
              style={{ border: sortNewest ? '0.5px solid var(--color-t1)' : '0.5px solid rgba(0,0,0,0.07)' }}
            >Newest</button>
            <button
              onClick={() => setSortNewest(false)}
              className={`text-[11px] px-[9px] py-[3px] rounded-[9px] cursor-pointer transition-all ${
                !sortNewest ? 'bg-t1 text-white font-medium' : 'bg-s3 text-t3 hover:bg-card'
              }`}
              style={{ border: !sortNewest ? '0.5px solid var(--color-t1)' : '0.5px solid rgba(0,0,0,0.07)' }}
            >By agent</button>
          </div>

          {/* Generating cards */}
          {activeTasks.map(task => {
            const tile = AGENT_TILES[task.agent_id] || { letter: '?', class: 'tile-nexus' }
            const agentName = agents.find(a => a.id === task.agent_id)?.name || task.agent_id
            return (
              <div key={task.id} className="hive-card mb-[9px] p-[13px] relative overflow-hidden gen-shimmer-top" style={{ borderColor: 'rgba(40,167,69,0.22)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`agent-tile w-[27px] h-[27px] rounded-lg text-sm ${tile.class}`}>{tile.letter}</div>
                  <span className="text-[13px] font-semibold text-t1">{agentName}</span>
                  <span className="text-[11px] text-t4 flex-1 truncate">{task.title}</span>
                  <div className="flex items-center gap-1 text-[10px] font-medium text-success px-2 py-[2px] rounded-[7px]" style={{ background: 'rgba(40,167,69,0.09)', border: '0.5px solid rgba(40,167,69,0.18)' }}>
                    <span className="w-[5px] h-[5px] rounded-full bg-success dot-pulse" />
                    Generating
                  </div>
                </div>
                <div className="shimmer-line w-[90%] mb-1.5" />
                <div className="shimmer-line w-[74%] mb-1.5" />
                <div className="shimmer-line w-[54%]" />
              </div>
            )
          })}

          {/* Loading */}
          {loading && <div className="text-center text-t4 py-12 text-sm">Loading deliverables...</div>}

          {/* Empty */}
          {!loading && filtered.length === 0 && (
            <div className="text-center py-12">
              <p className="text-t3 text-sm">No deliverables yet</p>
              <p className="text-t4 text-xs mt-1">Completed tasks with real output will appear here</p>
            </div>
          )}

          {/* Output cards */}
          {filtered.map(item => {
            const tile = AGENT_TILES[item.agent_id] || { letter: '?', class: 'tile-nexus' }
            const agentName = agents.find(a => a.id === item.agent_id)?.name || item.agent_id
            const badge = TYPE_BADGE[item.type] || TYPE_BADGE.text
            const isExpanded = expanded === item.id

            return (
              <div key={item.id} className="hive-card mb-[9px] cursor-pointer" onClick={() => setExpanded(isExpanded ? null : item.id)}>
                {/* Card header */}
                <div className="flex items-center gap-2 px-[14px] py-[11px]">
                  <div className={`agent-tile w-[27px] h-[27px] rounded-lg text-sm ${tile.class}`}>{tile.letter}</div>
                  <span className="text-[13px] font-semibold text-t1">{agentName}</span>
                  <span className="text-[11px] text-t4 flex-1 truncate">{item.title}</span>
                  <span className={`text-[10px] px-[7px] py-[2px] rounded-[7px] font-medium ${badge.class}`}>{badge.label}</span>
                  <span className="text-[10px] text-t5 flex-shrink-0">{timeAgo(item.completed_at)}</span>
                </div>

                {/* Rule */}
                <div className="h-[0.5px] mx-[14px]" style={{ background: 'rgba(0,0,0,0.07)' }} />

                {/* Card body */}
                <div className="px-[14px] py-[11px]">
                  <div className="font-display text-[16px] tracking-[1px] text-t1 leading-tight mb-[5px]">
                    {item.title?.toUpperCase()}
                  </div>
                  <div className="text-xs text-t3 leading-relaxed mb-[11px] line-clamp-2">
                    {item.output?.replace(/[#*`\[\]]/g, '').slice(0, 250)}
                  </div>

                  {!isExpanded && (
                    <div className="flex items-center gap-[6px]">
                      <button className="text-xs py-[6px] px-3 rounded-lg font-medium bg-t1 text-white transition-opacity hover:opacity-80">
                        View output
                      </button>
                      <button className="text-xs py-[6px] px-3 rounded-lg bg-s1 text-t2 transition-colors hover:bg-page" style={{ border: '0.5px solid rgba(0,0,0,0.12)' }}>
                        Copy
                      </button>
                      <div className="flex-1" />
                      {item.task_id && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onSelectTask?.(item.task_id) }}
                          className="text-[11px] text-t4 hover:text-t1 transition-colors"
                        >
                          ↗ task
                        </button>
                      )}
                    </div>
                  )}

                  {isExpanded && (
                    <div className="mt-2 pt-3" style={{ borderTop: '0.5px solid rgba(0,0,0,0.07)' }}>
                      <div className="prose prose-sm max-w-none max-h-[50vh] overflow-y-auto text-sm text-t2 leading-relaxed">
                        <MarkdownRenderer content={item.output} />
                      </div>
                      <div className="flex gap-2 mt-3 pt-2" style={{ borderTop: '0.5px solid rgba(0,0,0,0.07)' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(item.output) }}
                          className="text-xs py-[6px] px-3 rounded-lg bg-t1 text-white transition-opacity hover:opacity-80"
                        >Copy output</button>
                        {item.evidence?.files_created > 0 && (
                          <button className="text-xs py-[6px] px-3 rounded-lg bg-s1 text-t2" style={{ border: '0.5px solid rgba(0,0,0,0.12)' }}>
                            {item.evidence.files_created} files
                          </button>
                        )}
                        <div className="flex-1" />
                        {item.score != null && (
                          <span className={`text-[10px] font-bold px-2 py-1 rounded ${
                            item.score >= 7 ? 'bg-[rgba(40,167,69,0.09)] text-success' :
                            item.score >= 4 ? 'bg-[rgba(212,121,10,0.1)] text-scout' : 'bg-[rgba(192,41,42,0.09)] text-danger'
                          }`}>{item.score}/10</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Right panel */}
      <div className="hidden lg:flex w-[214px] flex-shrink-0 bg-s1 flex-col overflow-y-auto" style={{ borderLeft: '0.5px solid rgba(0,0,0,0.07)' }}>
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-[7px] p-[13px]" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.07)' }}>
          <div className="bg-s2 rounded-[10px] p-[9px]" style={{ border: '0.5px solid rgba(0,0,0,0.07)' }}>
            <div className="font-display text-[24px] tracking-[1px] leading-none mb-[3px] text-t1">{total}</div>
            <div className="text-[10px] text-t4">Total outputs</div>
          </div>
          <div className="bg-s2 rounded-[10px] p-[9px]" style={{ border: '0.5px solid rgba(0,0,0,0.07)' }}>
            <div className="font-display text-[24px] tracking-[1px] leading-none mb-[3px] text-success">{thisWeek}</div>
            <div className="text-[10px] text-t4">This week</div>
          </div>
          <div className="bg-s2 rounded-[10px] p-[9px]" style={{ border: '0.5px solid rgba(0,0,0,0.07)' }}>
            <div className="font-display text-[24px] tracking-[1px] leading-none mb-[3px] text-scout">{typeCounts.outreach || 0}</div>
            <div className="text-[10px] text-t4">Emails sent</div>
          </div>
          <div className="bg-s2 rounded-[10px] p-[9px]" style={{ border: '0.5px solid rgba(0,0,0,0.07)' }}>
            <div className="font-display text-[24px] tracking-[1px] leading-none mb-[3px] text-t1">{typeCounts.code || 0}</div>
            <div className="text-[10px] text-t4">Code builds</div>
          </div>
        </div>

        {/* By agent */}
        <div className="p-[13px]" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.07)' }}>
          <div className="font-display text-[11px] tracking-[2px] text-t5 mb-[9px]">BY AGENT</div>
          {agents.map(a => {
            const tile = AGENT_TILES[a.id] || { letter: '?', class: 'tile-nexus' }
            const count = agentCounts[a.id] || 0
            const pct = maxAgentCount > 0 ? (count / maxAgentCount) * 100 : 0
            const colorMap = { scout: 'var(--color-scout)', forge: 'var(--color-forge)', quill: 'var(--color-quill)', dealer: 'var(--color-dealer)', oracle: 'var(--color-oracle)', nexus: 'var(--color-nexus)' }
            return (
              <div key={a.id} className="mb-[5px]">
                <div className="flex items-center gap-[7px] py-[3px]">
                  <div className={`agent-tile w-5 h-5 rounded-[6px] text-[10px] ${tile.class}`}>{tile.letter}</div>
                  <span className="text-xs text-t2 flex-1">{a.name}</span>
                  <span className="text-[11px] text-t4 tabular-nums">{count}</span>
                </div>
                <div className="h-[2px] bg-page rounded-[1px] my-[2px]">
                  <div className="h-full rounded-[1px]" style={{ width: `${pct}%`, background: colorMap[a.id] || 'var(--color-t4)' }} />
                </div>
              </div>
            )
          })}
        </div>

        {/* Recent */}
        <div className="p-[13px]">
          <div className="font-display text-[11px] tracking-[2px] text-t5 mb-2">RECENT</div>
          {items.slice(0, 5).map(item => {
            const agentName = agents.find(a => a.id === item.agent_id)?.name || item.agent_id
            return (
              <div key={item.id} className="py-[6px] cursor-pointer" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.07)' }} onClick={() => setExpanded(item.id)}>
                <div className="text-[11px] text-t2 leading-snug mb-[2px] truncate">{item.title}</div>
                <div className="text-[10px] text-t4">{agentName} · {timeAgo(item.completed_at)}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
