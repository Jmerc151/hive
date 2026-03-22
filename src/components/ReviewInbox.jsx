import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import MarkdownRenderer from './MarkdownRenderer'

const AGENT_TILES = {
  scout:  { letter: 'S', class: 'tile-scout', label: 'Scout' },
  forge:  { letter: 'F', class: 'tile-forge', label: 'Forge' },
  quill:  { letter: 'Q', class: 'tile-quill', label: 'Quill' },
  dealer: { letter: 'D', class: 'tile-dealer', label: 'Dealer' },
  oracle: { letter: 'O', class: 'tile-oracle', label: 'Oracle' },
  nexus:  { letter: 'N', class: 'tile-nexus', label: 'Nexus' },
}

function timeAgo(d) {
  if (!d) return ''
  const diff = Date.now() - new Date(d + 'Z').getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

function categorize(title) {
  const t = (title || '').toLowerCase()
  if (t.includes('ember') || t.includes('sous') || t.includes('restaurant') || t.includes('kitchen')) return 'Ember'
  if (t.includes('agentforge') || t.includes('agent forge') || t.includes('template')) return 'AgentForge'
  if (t.includes('trading') || t.includes('oracle') || t.includes('backtest') || t.includes('polymarket') || t.includes('rsi') || t.includes('paper trad')) return 'Trading'
  return 'Other'
}

function truncateClean(text, max = 200) {
  if (!text) return ''
  const clean = text.replace(/[#*`\[\]]/g, '').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()
  return clean.length > max ? clean.slice(0, max) + '…' : clean
}

const CATEGORY_COLORS = {
  Ember: { bg: 'rgba(40,167,69,0.08)', border: 'rgba(40,167,69,0.18)', text: 'text-success' },
  AgentForge: { bg: 'rgba(128,64,184,0.08)', border: 'rgba(128,64,184,0.18)', text: 'text-oracle' },
  Trading: { bg: 'rgba(212,121,10,0.08)', border: 'rgba(212,121,10,0.18)', text: 'text-scout' },
  Other: { bg: 'rgba(0,0,0,0.04)', border: 'rgba(0,0,0,0.08)', text: 'text-t3' },
}

export default function ReviewInbox({ tasks = [], agents = [], onSelectTask, onNav }) {
  const [expanded, setExpanded] = useState(null)
  const [proposals, setProposals] = useState([])
  const [deadLetters, setDeadLetters] = useState([])
  const [actionLoading, setActionLoading] = useState(null)

  useEffect(() => {
    api.getProposals('pending').then(d => setProposals(Array.isArray(d) ? d : d.proposals || [])).catch(() => {})
    api.getDeadLetters().then(d => setDeadLetters(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

  // --- Categorize tasks ---
  const needsDecision = tasks.filter(t => t.status === 'awaiting_approval' || t.status === 'paused')
  const recentDone = tasks
    .filter(t => t.status === 'done' && t.output && t.output.length > 50)
    .sort((a, b) => new Date(b.completed_at || 0) - new Date(a.completed_at || 0))
    .slice(0, 30)
  const comingUp = tasks
    .filter(t => t.status === 'todo' || t.status === 'backlog')
    .sort((a, b) => {
      const pri = { critical: 0, high: 1, medium: 2, low: 3 }
      return (pri[a.priority] || 2) - (pri[b.priority] || 2)
    })
    .slice(0, 10)
  const activeNow = tasks.filter(t => t.status === 'in_progress')
  const failedRecent = tasks
    .filter(t => t.status === 'failed' && !t.error?.includes('Duplicate') && !t.error?.includes('systemic issue'))
    .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))
    .slice(0, 5)

  // Group done tasks by project
  const doneByProject = {}
  recentDone.forEach(t => {
    const cat = categorize(t.title)
    if (!doneByProject[cat]) doneByProject[cat] = []
    doneByProject[cat].push(t)
  })

  const handleApprove = async (id) => {
    setActionLoading(id)
    try { await api.approveTask(id) } catch {}
    setActionLoading(null)
  }
  const handleReject = async (id) => {
    setActionLoading(id)
    try { await api.rejectTask(id) } catch {}
    setActionLoading(null)
  }

  const attentionCount = needsDecision.length + proposals.length + deadLetters.length + failedRecent.length

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-5">
        <h1 className="font-display text-xl tracking-[1px] text-t1 mb-1">Review Inbox</h1>
        <p className="text-sm text-t3">
          {attentionCount > 0
            ? `${attentionCount} item${attentionCount !== 1 ? 's' : ''} need your attention`
            : 'Everything looks good — agents are on track'
          }
          {activeNow.length > 0 && ` · ${activeNow.length} task${activeNow.length !== 1 ? 's' : ''} running now`}
        </p>
      </div>

      {/* ═══ Section 1: Needs Your Decision ═══ */}
      {(needsDecision.length > 0 || proposals.length > 0 || deadLetters.length > 0) && (
        <Section title="NEEDS YOUR DECISION" count={needsDecision.length + proposals.length + deadLetters.length} urgent>
          {needsDecision.map(task => (
            <DecisionCard
              key={task.id}
              task={task}
              agents={agents}
              onApprove={() => handleApprove(task.id)}
              onReject={() => handleReject(task.id)}
              onView={() => onSelectTask?.(task.id)}
              loading={actionLoading === task.id}
            />
          ))}
          {proposals.map(p => (
            <ProposalCard key={p.id} proposal={p} onNav={onNav} />
          ))}
          {deadLetters.map(dl => (
            <DeadLetterCard key={dl.id} item={dl} />
          ))}
        </Section>
      )}

      {/* ═══ Section 2: Active Now ═══ */}
      {activeNow.length > 0 && (
        <Section title="RUNNING NOW" count={activeNow.length}>
          {activeNow.map(task => {
            const tile = AGENT_TILES[task.agent_id] || { letter: '?', class: 'tile-nexus', label: task.agent_id }
            return (
              <div
                key={task.id}
                onClick={() => onSelectTask?.(task.id)}
                className="hive-card mb-[6px] px-[13px] py-[10px] cursor-pointer relative overflow-hidden gen-shimmer-top"
                style={{ borderColor: 'rgba(40,167,69,0.22)' }}
              >
                <div className="flex items-center gap-[8px]">
                  <div className={`agent-tile w-[23px] h-[23px] rounded-[7px] text-[10px] ${tile.class}`}>{tile.letter}</div>
                  <span className="text-[12px] font-medium text-t1 flex-1 truncate">{task.title}</span>
                  <div className="flex items-center gap-1 text-[10px] font-medium text-success px-[7px] py-[2px] rounded-[7px]" style={{ background: 'rgba(40,167,69,0.09)', border: '0.5px solid rgba(40,167,69,0.18)' }}>
                    <span className="w-[5px] h-[5px] rounded-full bg-success dot-pulse" />
                    Working
                  </div>
                </div>
              </div>
            )
          })}
        </Section>
      )}

      {/* ═══ Section 3: Completed — Ready for Review ═══ */}
      {recentDone.length > 0 && (
        <Section title="COMPLETED WORK" count={recentDone.length}>
          {Object.entries(doneByProject).map(([project, items]) => (
            <ProjectGroup key={project} project={project} items={items} expanded={expanded} setExpanded={setExpanded} agents={agents} onSelectTask={onSelectTask} />
          ))}
        </Section>
      )}

      {/* ═══ Section 4: Coming Up ═══ */}
      {comingUp.length > 0 && (
        <Section title="QUEUED NEXT" count={comingUp.length}>
          {comingUp.map(task => {
            const tile = AGENT_TILES[task.agent_id] || { letter: '?', class: 'tile-nexus', label: task.agent_id }
            const cat = categorize(task.title)
            const catColor = CATEGORY_COLORS[cat]
            return (
              <div
                key={task.id}
                onClick={() => onSelectTask?.(task.id)}
                className="hive-card mb-[6px] flex items-center gap-[8px] px-[13px] py-[10px] cursor-pointer hover:shadow-sm transition-all"
              >
                <div className={`agent-tile w-[23px] h-[23px] rounded-[7px] text-[10px] ${tile.class}`}>{tile.letter}</div>
                <span className="text-[12px] text-t1 flex-1 truncate">{task.title}</span>
                <span className={`text-[9px] px-[6px] py-[1px] rounded-[5px] ${catColor.text}`} style={{ background: catColor.bg, border: `0.5px solid ${catColor.border}` }}>
                  {cat}
                </span>
                <span className={`text-[9px] px-[5px] py-[1px] rounded-[5px] ${
                  task.priority === 'critical' ? 'bg-[rgba(192,41,42,0.09)] text-danger font-medium' :
                  task.priority === 'high' ? 'bg-[rgba(212,121,10,0.09)] text-scout' :
                  'bg-s3 text-t4'
                }`}>{task.priority}</span>
              </div>
            )
          })}
        </Section>
      )}

      {/* ═══ Section 5: Failed (non-duplicate) ═══ */}
      {failedRecent.length > 0 && (
        <Section title="NEEDS ATTENTION" count={failedRecent.length}>
          {failedRecent.map(task => {
            const tile = AGENT_TILES[task.agent_id] || { letter: '?', class: 'tile-nexus', label: task.agent_id }
            return (
              <div
                key={task.id}
                onClick={() => onSelectTask?.(task.id)}
                className="hive-card mb-[6px] px-[13px] py-[10px] cursor-pointer hover:shadow-sm transition-all"
                style={{ borderColor: 'rgba(192,41,42,0.15)' }}
              >
                <div className="flex items-center gap-[8px]">
                  <div className={`agent-tile w-[23px] h-[23px] rounded-[7px] text-[10px] ${tile.class}`}>{tile.letter}</div>
                  <span className="text-[12px] text-t1 flex-1 truncate">{task.title}</span>
                  <span className="text-[9px] text-danger px-[6px] py-[1px] rounded-[5px]" style={{ background: 'rgba(192,41,42,0.08)', border: '0.5px solid rgba(192,41,42,0.15)' }}>failed</span>
                </div>
                {task.error && (
                  <div className="text-[11px] text-t4 mt-[4px] ml-[31px] truncate">{task.error.slice(0, 100)}</div>
                )}
              </div>
            )
          })}
        </Section>
      )}

      {/* All clear */}
      {attentionCount === 0 && recentDone.length === 0 && comingUp.length === 0 && (
        <div className="text-center py-16">
          <div className="text-t4 text-lg mb-2">Inbox zero</div>
          <p className="text-sm text-t4">No tasks need your attention right now.</p>
        </div>
      )}
    </div>
  )
}

// ── Reusable Section ──
function Section({ title, count, urgent, children }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-[8px]">
        <span className="font-display text-[11px] tracking-[2px] text-t5">{title}</span>
        {count > 0 && (
          <span className={`text-[10px] font-medium px-[6px] py-[1px] rounded-full ${
            urgent ? 'bg-[rgba(192,41,42,0.1)] text-danger' : 'bg-s3 text-t4'
          }`}>{count}</span>
        )}
        <div className="flex-1 h-[0.5px]" style={{ background: 'rgba(0,0,0,0.06)' }} />
      </div>
      {children}
    </div>
  )
}

// ── Approval Card ──
function DecisionCard({ task, agents, onApprove, onReject, onView, loading }) {
  const tile = AGENT_TILES[task.agent_id] || { letter: '?', class: 'tile-nexus', label: task.agent_id }
  const isPaused = task.status === 'paused'

  return (
    <div className="hive-card mb-[6px] px-[13px] py-[11px]" style={{ borderColor: 'rgba(212,121,10,0.25)' }}>
      <div className="flex items-center gap-[8px]">
        <div className={`agent-tile w-[23px] h-[23px] rounded-[7px] text-[10px] ${tile.class}`}>{tile.letter}</div>
        <div className="flex-1 min-w-0">
          <span className="text-[12px] font-medium text-t1 truncate block">{task.title}</span>
          <span className="text-[11px] text-t4">{isPaused ? 'Paused mid-execution — needs approval to continue' : 'Waiting for your approval to run'}</span>
        </div>
        <span className="text-[9px] text-scout font-medium px-[6px] py-[1px] rounded-[5px]" style={{ background: 'rgba(212,121,10,0.1)', border: '0.5px solid rgba(212,121,10,0.18)' }}>
          {isPaused ? 'paused' : 'approval'}
        </span>
      </div>

      {task.description && (
        <div className="text-[11px] text-t3 mt-[6px] ml-[31px] line-clamp-2">{task.description.slice(0, 200)}</div>
      )}

      <div className="flex items-center gap-[6px] mt-[8px] ml-[31px]">
        <button
          onClick={(e) => { e.stopPropagation(); onApprove() }}
          disabled={loading}
          className="text-[11px] py-[5px] px-[12px] rounded-[8px] bg-success text-white font-medium transition-opacity hover:opacity-80 disabled:opacity-50 cursor-pointer"
        >
          {isPaused ? 'Continue' : 'Approve & Run'}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onReject() }}
          disabled={loading}
          className="text-[11px] py-[5px] px-[12px] rounded-[8px] bg-s3 text-t2 transition-colors hover:bg-s4 disabled:opacity-50 cursor-pointer"
          style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}
        >
          Reject
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onView() }}
          className="text-[11px] py-[5px] px-[10px] rounded-[8px] text-t3 hover:text-t1 transition-colors cursor-pointer"
        >
          View details
        </button>
      </div>
    </div>
  )
}

// ── Proposal Card ──
function ProposalCard({ proposal, onNav }) {
  const icons = { feature: '\u2728', design: '\uD83C\uDFA8', code: '\uD83D\uDCBB', prompt: '\uD83D\uDCDD', workflow: '\u2699\uFE0F' }
  return (
    <div
      className="hive-card mb-[6px] px-[13px] py-[10px] cursor-pointer hover:shadow-sm transition-all"
      onClick={() => onNav?.('proposals')}
    >
      <div className="flex items-center gap-[8px]">
        <div className="w-[23px] h-[23px] rounded-[7px] bg-[rgba(128,64,184,0.1)] flex items-center justify-center text-[11px]">
          {icons[proposal.type] || '\u2728'}
        </div>
        <span className="text-[12px] text-t1 flex-1 truncate">{proposal.title}</span>
        <span className="text-[9px] text-oracle px-[6px] py-[1px] rounded-[5px]" style={{ background: 'rgba(128,64,184,0.08)', border: '0.5px solid rgba(128,64,184,0.15)' }}>
          proposal
        </span>
      </div>
      {proposal.description && (
        <div className="text-[11px] text-t3 mt-[4px] ml-[31px] truncate">{proposal.description.slice(0, 120)}</div>
      )}
    </div>
  )
}

// ── Dead Letter Card ──
function DeadLetterCard({ item }) {
  return (
    <div className="hive-card mb-[6px] px-[13px] py-[10px]" style={{ borderColor: 'rgba(192,41,42,0.2)' }}>
      <div className="flex items-center gap-[8px]">
        <div className="w-[23px] h-[23px] rounded-[7px] bg-[rgba(192,41,42,0.1)] flex items-center justify-center text-[11px] text-danger">!</div>
        <span className="text-[12px] text-t1 flex-1 truncate">{item.title || 'Permanently failed task'}</span>
        <span className="text-[9px] text-danger px-[6px] py-[1px] rounded-[5px]" style={{ background: 'rgba(192,41,42,0.08)', border: '0.5px solid rgba(192,41,42,0.15)' }}>
          dead letter
        </span>
      </div>
      {item.error && (
        <div className="text-[11px] text-t4 mt-[4px] ml-[31px] truncate">{item.error.slice(0, 100)}</div>
      )}
    </div>
  )
}

// ── Project Group ──
function ProjectGroup({ project, items, expanded, setExpanded, agents, onSelectTask }) {
  const catColor = CATEGORY_COLORS[project]

  return (
    <div className="mb-[10px]">
      {/* Project header */}
      <div className="flex items-center gap-[6px] mb-[5px] ml-[2px]">
        <span className={`text-[10px] font-medium px-[7px] py-[2px] rounded-[6px] ${catColor.text}`} style={{ background: catColor.bg, border: `0.5px solid ${catColor.border}` }}>
          {project}
        </span>
        <span className="text-[10px] text-t5">{items.length} deliverable{items.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Items */}
      {items.map(item => {
        const tile = AGENT_TILES[item.agent_id] || { letter: '?', class: 'tile-nexus', label: item.agent_id }
        const isExpanded = expanded === item.id
        const agentName = (AGENT_TILES[item.agent_id] || {}).label || item.agent_id

        return (
          <div key={item.id} className="hive-card mb-[5px] cursor-pointer transition-all" onClick={() => setExpanded(isExpanded ? null : item.id)}>
            {/* Compact row */}
            <div className="flex items-center gap-[8px] px-[12px] py-[9px]">
              <div className={`agent-tile w-[23px] h-[23px] rounded-[7px] text-[10px] ${tile.class}`}>{tile.letter}</div>
              <div className="flex-1 min-w-0">
                <span className="text-[12px] font-medium text-t1 truncate block">{item.title}</span>
                {!isExpanded && (
                  <span className="text-[11px] text-t3 truncate block mt-[1px]">{truncateClean(item.output)}</span>
                )}
              </div>
              <div className="flex items-center gap-[5px] flex-shrink-0">
                {item.nexus_score != null && item.nexus_score > 0 && (
                  <span className={`text-[9px] font-bold px-[5px] py-[1px] rounded-[5px] ${
                    item.nexus_score >= 7 ? 'bg-[rgba(40,167,69,0.09)] text-success' :
                    item.nexus_score >= 4 ? 'bg-[rgba(212,121,10,0.1)] text-scout' : 'bg-[rgba(192,41,42,0.09)] text-danger'
                  }`}>{item.nexus_score}/10</span>
                )}
                <span className="text-[10px] text-t5">{timeAgo(item.completed_at)}</span>
                <span className="text-[11px] text-t4">{isExpanded ? '\u25B4' : '\u25BE'}</span>
              </div>
            </div>

            {/* Expanded — full output */}
            {isExpanded && (
              <div className="px-[12px] pb-[12px]">
                <div className="h-[0.5px] mb-[10px]" style={{ background: 'rgba(0,0,0,0.06)' }} />

                {/* Output */}
                <div className="prose prose-sm max-w-none max-h-[50vh] overflow-y-auto text-sm text-t2 leading-relaxed rounded-lg bg-s1 p-3" style={{ border: '0.5px solid rgba(0,0,0,0.06)' }}>
                  <MarkdownRenderer content={item.output} />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-[6px] mt-[8px]">
                  <button
                    onClick={(e) => { e.stopPropagation(); onSelectTask?.(item.id) }}
                    className="text-[11px] py-[5px] px-[10px] rounded-[8px] bg-t1 text-white transition-opacity hover:opacity-80 cursor-pointer"
                  >View full details</button>
                  <button
                    onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(item.output) }}
                    className="text-[11px] py-[5px] px-[10px] rounded-[8px] bg-s3 text-t2 transition-colors hover:bg-s4 cursor-pointer"
                    style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}
                  >Copy output</button>
                  <div className="flex-1" />
                  <span className="text-[10px] text-t5">
                    {agentName}{item.estimated_cost ? ` · $${item.estimated_cost.toFixed(3)}` : ''}
                  </span>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
