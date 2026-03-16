import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { api } from '../lib/api'

const AGENT_TILES = {
  scout:  { letter: 'S', class: 'tile-scout', name: 'Scout', color: '#d4790a' },
  forge:  { letter: 'F', class: 'tile-forge', name: 'Forge', color: '#5a5a60' },
  quill:  { letter: 'Q', class: 'tile-quill', name: 'Quill', color: '#28a745' },
  dealer: { letter: 'D', class: 'tile-dealer', name: 'Dealer', color: '#c0292a' },
  oracle: { letter: 'O', class: 'tile-oracle', name: 'Oracle', color: '#8040b8' },
  nexus:  { letter: 'N', class: 'tile-nexus', name: 'Nexus', color: '#8e8e93' },
}

const PILLAR_CONFIG = {
  ember:   { label: 'EMBER', subtitle: 'Restaurant SaaS', color: '#d4790a', bgAlpha: 'rgba(212,121,10,0.06)', borderAlpha: 'rgba(212,121,10,0.15)', trackColor: 'rgba(212,121,10,0.18)', icon: '🔥' },
  hive:    { label: 'HIVE', subtitle: 'AI Agent Platform', color: '#8040b8', bgAlpha: 'rgba(128,64,184,0.06)', borderAlpha: 'rgba(128,64,184,0.15)', trackColor: 'rgba(128,64,184,0.18)', icon: '🐝' },
  trading: { label: 'TRADING', subtitle: 'Alpaca Paper Trading', color: '#28a745', bgAlpha: 'rgba(40,167,69,0.06)', borderAlpha: 'rgba(40,167,69,0.15)', trackColor: 'rgba(40,167,69,0.18)', icon: '📈' },
}

const STATUS_NODE = {
  pending:     { fill: '#e5e5ea', stroke: '#c7c7cc', pulse: false },
  in_progress: { fill: '#28a745', stroke: '#28a745', pulse: true },
  done:        { fill: '#1c1c1e', stroke: '#1c1c1e', pulse: false },
  blocked:     { fill: '#c0292a', stroke: '#c0292a', pulse: false },
  skipped:     { fill: '#c7c7cc', stroke: '#c7c7cc', pulse: false },
}

/* ── Reusable progress ring ── */
function ProgressRing({ progress, size = 40, color = 'var(--color-success)' }) {
  const r = (size - 4) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (progress / 100) * circ
  return (
    <svg width={size} height={size} className="flex-shrink-0 -rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="3" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="3"
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        className="fill-t1 font-display text-[10px] tracking-wider"
        style={{ transform: 'rotate(90deg)', transformOrigin: 'center' }}
      >{progress}%</text>
    </svg>
  )
}

/* ── Transit-style milestone node on the track ── */
function StationNode({ milestone, pillarColor, x, y, nodeRadius, isHovered, onClick, onHover }) {
  const st = STATUS_NODE[milestone.status] || STATUS_NODE.pending
  const agent = AGENT_TILES[milestone.agent_id]
  const isDone = milestone.status === 'done'
  const isActive = milestone.status === 'in_progress'

  return (
    <g
      className="cursor-pointer"
      onClick={() => onClick(milestone)}
      onMouseEnter={() => onHover(milestone.id)}
      onMouseLeave={() => onHover(null)}
      style={{ transition: 'transform 0.2s ease' }}
    >
      {/* Pulse ring for active */}
      {isActive && (
        <circle cx={x} cy={y} r={nodeRadius + 6} fill="none" stroke={pillarColor} strokeWidth="1.5" opacity="0.4">
          <animate attributeName="r" from={nodeRadius + 3} to={nodeRadius + 10} dur="1.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.5" to="0" dur="1.5s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Outer ring */}
      <circle cx={x} cy={y} r={nodeRadius + 2} fill="none"
        stroke={isDone ? '#1c1c1e' : isActive ? pillarColor : 'rgba(0,0,0,0.08)'}
        strokeWidth={isDone || isActive ? 2 : 1}
        style={{ transition: 'all 0.3s ease' }}
      />

      {/* Main node */}
      <circle cx={x} cy={y} r={nodeRadius}
        fill={isDone ? '#1c1c1e' : isActive ? pillarColor : isHovered ? '#f5f5f8' : '#fafafc'}
        stroke={isDone ? '#1c1c1e' : isHovered ? pillarColor : 'rgba(0,0,0,0.1)'}
        strokeWidth="1.5"
        style={{ transition: 'all 0.2s ease' }}
      />

      {/* Done checkmark */}
      {isDone && (
        <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="central"
          fill="white" fontSize="10" fontWeight="600">✓</text>
      )}

      {/* Active spinner dot */}
      {isActive && (
        <circle cx={x} cy={y} r={3} fill="white" opacity="0.9">
          <animateTransform attributeName="transform" type="rotate"
            from={`0 ${x} ${y}`} to={`360 ${x} ${y}`} dur="1.2s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Agent tile below node */}
      {agent && (
        <g>
          <rect x={x - 9} y={y + nodeRadius + 5} width={18} height={16} rx={4}
            fill={isDone ? 'rgba(28,28,30,0.08)' : `${agent.color}15`}
            stroke={isDone ? 'rgba(28,28,30,0.15)' : `${agent.color}30`}
            strokeWidth="0.5" />
          <text x={x} y={y + nodeRadius + 14} textAnchor="middle" dominantBaseline="central"
            fill={isDone ? '#8e8e93' : agent.color} fontSize="8" fontWeight="700" fontFamily="var(--font-display)">
            {agent.letter}
          </text>
        </g>
      )}

      {/* Title label above node */}
      <text x={x} y={y - nodeRadius - 8} textAnchor="middle" dominantBaseline="auto"
        fill={isDone ? '#8e8e93' : '#1c1c1e'} fontSize="9.5" fontWeight="600"
        fontFamily="var(--font-sans)"
        style={{ textDecoration: isDone ? 'line-through' : 'none' }}>
        {milestone.title.length > 22 ? milestone.title.slice(0, 20) + '…' : milestone.title}
      </text>
    </g>
  )
}

/* ── Single project track (horizontal rail line) ── */
function ProjectTrack({ project, detail, pillarKey, yOffset, trackHeight, width, onSelectMilestone, onExecute }) {
  const config = PILLAR_CONFIG[pillarKey] || PILLAR_CONFIG.hive
  const milestones = detail?.milestones || []
  const done = milestones.filter(m => m.status === 'done').length
  const progress = milestones.length > 0 ? Math.round((done / milestones.length) * 100) : 0
  const [hoveredNode, setHoveredNode] = useState(null)
  const hoveredMs = milestones.find(m => m.id === hoveredNode)

  // Layout constants
  const leftPad = 160
  const rightPad = 60
  const trackLen = width - leftPad - rightPad
  const trackY = yOffset + trackHeight / 2
  const nodeRadius = 12
  const nodeSpacing = milestones.length > 1 ? trackLen / (milestones.length - 1) : 0

  return (
    <g>
      {/* Track background band */}
      <rect x={0} y={yOffset} width={width} height={trackHeight} rx={12}
        fill={config.bgAlpha} />

      {/* Left label zone */}
      <foreignObject x={16} y={yOffset + 12} width={130} height={trackHeight - 24}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '16px' }}>{config.icon}</span>
            <span style={{
              fontFamily: 'var(--font-display)', fontSize: '13px', letterSpacing: '2px',
              color: config.color, fontWeight: 700
            }}>{config.label}</span>
          </div>
          <span style={{ fontSize: '10px', color: '#8e8e93', lineHeight: '1.2' }}>{config.subtitle}</span>
          <span style={{ fontSize: '10px', color: '#aeaeb2' }}>
            {done}/{milestones.length} milestones
          </span>
          {/* Mini progress bar */}
          <div style={{ width: '80px', height: '3px', borderRadius: '2px', background: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
            <div style={{
              width: `${progress}%`, height: '100%', borderRadius: '2px',
              background: config.color, transition: 'width 0.5s ease'
            }} />
          </div>
        </div>
      </foreignObject>

      {/* Main track rail */}
      <line x1={leftPad} y1={trackY} x2={leftPad + trackLen} y2={trackY}
        stroke={config.trackColor} strokeWidth="3" strokeLinecap="round" />

      {/* Progress overlay on rail */}
      {milestones.length > 1 && (
        <line x1={leftPad} y1={trackY}
          x2={leftPad + (done > 0 ? nodeSpacing * Math.min(done - 1, milestones.length - 1) : 0)} y2={trackY}
          stroke={config.color} strokeWidth="3" strokeLinecap="round"
          opacity="0.5"
          style={{ transition: 'x2 0.5s ease' }} />
      )}

      {/* Connector segments between nodes */}
      {milestones.map((ms, i) => {
        if (i === 0) return null
        const x1 = leftPad + nodeSpacing * (i - 1)
        const x2 = leftPad + nodeSpacing * i
        const prevDone = milestones[i - 1].status === 'done'
        return (
          <line key={`seg-${i}`} x1={x1} y1={trackY} x2={x2} y2={trackY}
            stroke={prevDone ? config.color : config.trackColor}
            strokeWidth={prevDone ? 3 : 2}
            strokeLinecap="round"
            opacity={prevDone ? 0.7 : 0.3}
            style={{ transition: 'all 0.4s ease' }} />
        )
      })}

      {/* Station nodes */}
      {milestones.map((ms, i) => {
        const x = milestones.length === 1 ? leftPad + trackLen / 2 : leftPad + nodeSpacing * i
        return (
          <StationNode key={ms.id} milestone={ms} pillarColor={config.color}
            x={x} y={trackY} nodeRadius={nodeRadius}
            isHovered={hoveredNode === ms.id}
            onClick={onSelectMilestone}
            onHover={setHoveredNode} />
        )
      })}

      {/* Empty state */}
      {milestones.length === 0 && (
        <text x={leftPad + trackLen / 2} y={trackY + 1} textAnchor="middle" dominantBaseline="central"
          fill="#aeaeb2" fontSize="11" fontFamily="var(--font-sans)">
          No milestones — generate a roadmap
        </text>
      )}

      {/* Hover tooltip */}
      {hoveredMs && (() => {
        const i = milestones.indexOf(hoveredMs)
        const x = milestones.length === 1 ? leftPad + trackLen / 2 : leftPad + nodeSpacing * i
        const tooltipW = 220
        const tooltipX = Math.max(8, Math.min(x - tooltipW / 2, width - tooltipW - 8))
        const tooltipY = trackY + nodeRadius + 30
        return (
          <foreignObject x={tooltipX} y={tooltipY} width={tooltipW} height={90}>
            <div style={{
              background: '#1c1c1e', color: 'white', borderRadius: '10px',
              padding: '8px 10px', fontSize: '10px', lineHeight: '1.4',
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)', pointerEvents: 'none'
            }}>
              <div style={{ fontWeight: 700, fontSize: '11px', marginBottom: '3px' }}>{hoveredMs.title}</div>
              {hoveredMs.description && (
                <div style={{ color: '#aeaeb2', marginBottom: '3px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {hoveredMs.description}
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px', color: '#8e8e93', fontSize: '9px' }}>
                <span>{AGENT_TILES[hoveredMs.agent_id]?.name || '—'}</span>
                <span style={{ color: STATUS_NODE[hoveredMs.status]?.stroke }}>{hoveredMs.status}</span>
                {hoveredMs.acceptance_criteria && <span>✓ Has criteria</span>}
              </div>
            </div>
          </foreignObject>
        )
      })()}
    </g>
  )
}

/* ── Create project modal ── */
function CreateProjectModal({ onClose, onCreate }) {
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [pillar, setPillar] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim() || !goal.trim()) return
    setSubmitting(true)
    try {
      await onCreate({ name: name.trim(), goal: goal.trim(), pillar, target_date: targetDate || undefined })
      onClose()
    } finally { setSubmitting(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-backdrop" />
      <div className="modal-content p-5 max-w-md w-full" onClick={e => e.stopPropagation()}>
        <h3 className="font-display text-xl tracking-wider text-t1 mb-4">NEW PROJECT</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-[11px] text-t4 font-medium block mb-1">Project name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Launch Prompt Template Store"
              className="w-full bg-s1 rounded-xl px-3 py-2.5 text-sm text-t1 focus:outline-none focus:ring-2 focus:ring-t1/20"
              style={{ border: '0.5px solid rgba(0,0,0,0.08)' }} autoFocus />
          </div>
          <div>
            <label className="text-[11px] text-t4 font-medium block mb-1">Goal</label>
            <textarea value={goal} onChange={e => setGoal(e.target.value)} rows={3}
              placeholder="What does success look like?"
              className="w-full bg-s1 rounded-xl px-3 py-2.5 text-sm text-t1 focus:outline-none focus:ring-2 focus:ring-t1/20 resize-none"
              style={{ border: '0.5px solid rgba(0,0,0,0.08)' }} />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[11px] text-t4 font-medium block mb-1">Pillar</label>
              <select value={pillar} onChange={e => setPillar(e.target.value)}
                className="w-full bg-s1 rounded-xl px-3 py-2.5 text-sm text-t1 focus:outline-none"
                style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
                <option value="">Any</option>
                <option value="ember">Ember</option>
                <option value="hive">Hive</option>
                <option value="trading">Trading</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="text-[11px] text-t4 font-medium block mb-1">Target date</label>
              <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)}
                className="w-full bg-s1 rounded-xl px-3 py-2.5 text-sm text-t1 focus:outline-none"
                style={{ border: '0.5px solid rgba(0,0,0,0.08)' }} />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={!name.trim() || !goal.trim() || submitting}
              className="flex-1 py-[10px] rounded-xl bg-t1 text-white font-display text-[14px] tracking-wider hover:opacity-80 disabled:opacity-30 transition-opacity">
              {submitting ? 'Creating…' : 'CREATE'}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 py-[10px] rounded-xl bg-s3 text-t2 text-sm hover:bg-s4 transition-colors"
              style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ── Milestone detail side panel ── */
function MilestonePanel({ milestone, pillarColor, onClose, onExecute, onSelectTask }) {
  if (!milestone) return null
  const agent = AGENT_TILES[milestone.agent_id]
  const canRun = milestone.status === 'pending'
  const isDone = milestone.status === 'done'
  const isActive = milestone.status === 'in_progress'
  const task = milestone.task

  return (
    <div className="absolute right-0 top-0 bottom-0 w-[320px] bg-page z-10 flex flex-col overflow-hidden"
      style={{ borderLeft: `3px solid ${pillarColor}`, boxShadow: '-8px 0 30px rgba(0,0,0,0.06)' }}>
      <div className="px-4 pt-4 pb-3 flex items-center gap-2 flex-shrink-0" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.07)' }}>
        <div className={`w-2 h-2 rounded-full ${isDone ? 'bg-t1' : isActive ? 'bg-success dot-pulse' : 'bg-s5'}`} />
        <span className="font-display text-[12px] tracking-[1.5px] text-t1 flex-1 truncate">{milestone.title?.toUpperCase()}</span>
        <button onClick={onClose} className="text-t4 hover:text-t1 text-lg">&times;</button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {/* Agent + Status */}
        <div className="flex items-center gap-2">
          {agent && (
            <div className="flex items-center gap-[5px]">
              <div className={`agent-tile w-[20px] h-[20px] rounded-[5px] text-[9px] ${agent.class}`}>{agent.letter}</div>
              <span className="text-[11px] text-t2 font-medium">{agent.name}</span>
            </div>
          )}
          <span className="text-[10px] text-t4 ml-auto">{milestone.status}</span>
        </div>

        {/* Description */}
        {milestone.description && (
          <div>
            <span className="text-[10px] text-t5 font-medium block mb-1">DESCRIPTION</span>
            <p className="text-[11px] text-t2 leading-relaxed">{milestone.description}</p>
          </div>
        )}

        {/* Acceptance criteria */}
        {milestone.acceptance_criteria && (
          <div>
            <span className="text-[10px] text-t5 font-medium block mb-1">SUCCESS CRITERIA</span>
            <p className="text-[11px] text-t3 leading-relaxed">{milestone.acceptance_criteria}</p>
          </div>
        )}

        {/* Task result */}
        {task && task.status === 'done' && (
          <div className="rounded-lg bg-[rgba(40,167,69,0.05)] px-3 py-2" style={{ border: '0.5px solid rgba(40,167,69,0.12)' }}>
            <div className="flex items-center gap-[5px] text-[10px]">
              <span className="text-success font-medium">Completed</span>
              {task.nexus_score != null && (
                <span className={`font-bold px-1 rounded ${task.nexus_score >= 7 ? 'text-success' : task.nexus_score >= 4 ? 'text-scout' : 'text-danger'}`}>
                  {task.nexus_score}/10
                </span>
              )}
            </div>
            {task.output && (
              <p className="text-[10px] text-t3 mt-1 line-clamp-4 leading-relaxed">{task.output.slice(0, 300)}</p>
            )}
            <button onClick={() => onSelectTask?.(task.id)} className="text-[10px] text-t4 hover:text-t1 mt-1 transition-colors">
              View full output ↗
            </button>
          </div>
        )}

        {task && task.status === 'in_progress' && (
          <div className="flex items-center gap-[5px] py-2">
            <span className="w-[5px] h-[5px] rounded-full bg-success dot-pulse" />
            <span className="text-[10px] text-success font-medium">Agent working…</span>
            <button onClick={() => onSelectTask?.(task.id)} className="text-[10px] text-t4 hover:text-t1 ml-auto">
              View trace ↗
            </button>
          </div>
        )}

        {/* Execute button */}
        {canRun && (
          <button onClick={() => onExecute(milestone.id)}
            className="w-full py-[9px] rounded-xl bg-t1 text-white font-display text-[12px] tracking-wider hover:opacity-80 transition-opacity">
            EXECUTE MILESTONE →
          </button>
        )}

        {milestone.status === 'blocked' && (
          <div className="text-[10px] text-danger py-1">Blocked — waiting on dependencies</div>
        )}
      </div>
    </div>
  )
}

/* ── Summary stat cards at top ── */
function SummaryCards({ projects, details }) {
  const totalMilestones = Object.values(details).reduce((sum, d) => sum + (d?.milestones?.length || 0), 0)
  const totalDone = Object.values(details).reduce((sum, d) => sum + (d?.milestones?.filter(m => m.status === 'done').length || 0), 0)
  const totalActive = Object.values(details).reduce((sum, d) => sum + (d?.milestones?.filter(m => m.status === 'in_progress').length || 0), 0)
  const overallProgress = totalMilestones > 0 ? Math.round((totalDone / totalMilestones) * 100) : 0

  const agents = {}
  Object.values(details).forEach(d => {
    (d?.milestones || []).forEach(m => {
      if (m.agent_id) agents[m.agent_id] = (agents[m.agent_id] || 0) + 1
    })
  })

  return (
    <div className="flex items-center gap-3 px-5 py-3 flex-shrink-0 overflow-x-auto" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.07)' }}>
      <div className="flex items-center gap-2 pr-4" style={{ borderRight: '1px solid rgba(0,0,0,0.06)' }}>
        <ProgressRing progress={overallProgress} size={36} />
        <div>
          <div className="text-[11px] font-semibold text-t1">{overallProgress}% Complete</div>
          <div className="text-[9px] text-t4">{totalDone}/{totalMilestones} milestones</div>
        </div>
      </div>

      <div className="flex items-center gap-1 px-3" style={{ borderRight: '1px solid rgba(0,0,0,0.06)' }}>
        <span className="text-[18px] font-bold text-t1 font-display">{projects.length}</span>
        <span className="text-[10px] text-t4">projects</span>
      </div>

      {totalActive > 0 && (
        <div className="flex items-center gap-[5px] px-3" style={{ borderRight: '1px solid rgba(0,0,0,0.06)' }}>
          <span className="w-[5px] h-[5px] rounded-full bg-success dot-pulse" />
          <span className="text-[11px] font-medium text-success">{totalActive} running</span>
        </div>
      )}

      <div className="flex items-center gap-[3px] px-2">
        {Object.entries(agents).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, count]) => {
          const t = AGENT_TILES[id]
          return t ? (
            <div key={id} className="flex items-center gap-[2px]">
              <div className={`agent-tile w-[16px] h-[16px] rounded-[4px] text-[7px] ${t.class}`}>{t.letter}</div>
              <span className="text-[9px] text-t4">{count}</span>
            </div>
          ) : null
        })}
      </div>
    </div>
  )
}

/* ── Mobile list fallback ── */
function MobileTrackList({ projects, details, onSelectProject }) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
      {projects.map(p => {
        const config = PILLAR_CONFIG[p.pillar] || PILLAR_CONFIG.hive
        const d = details[p.id]
        const milestones = d?.milestones || []
        const done = milestones.filter(m => m.status === 'done').length
        const active = milestones.filter(m => m.status === 'in_progress').length
        const progress = milestones.length > 0 ? Math.round((done / milestones.length) * 100) : 0

        return (
          <div key={p.id} className="hive-card cursor-pointer" onClick={() => onSelectProject(p.id)}
            style={{ borderLeft: `3px solid ${config.color}` }}>
            <div className="px-3 py-[10px]">
              <div className="flex items-center gap-2">
                <span style={{ fontSize: '14px' }}>{config.icon}</span>
                <span className="font-display text-[12px] tracking-[1.5px] flex-1" style={{ color: config.color }}>
                  {config.label}
                </span>
                <ProgressRing progress={progress} size={30} color={config.color} />
              </div>
              <p className="text-[11px] text-t2 font-medium mt-1 truncate">{p.name}</p>
              <p className="text-[10px] text-t4 mt-[2px] line-clamp-1">{p.goal}</p>

              {/* Mini milestone dots */}
              <div className="flex items-center gap-[3px] mt-2 flex-wrap">
                {milestones.map(ms => {
                  const st = STATUS_NODE[ms.status] || STATUS_NODE.pending
                  return (
                    <div key={ms.id} className="flex items-center gap-[2px]">
                      <div className="rounded-full" style={{
                        width: 6, height: 6, background: st.fill,
                        boxShadow: ms.status === 'in_progress' ? `0 0 4px ${config.color}` : 'none'
                      }} />
                    </div>
                  )
                })}
                {milestones.length > 0 && (
                  <span className="text-[9px] text-t4 ml-1">{done}/{milestones.length}</span>
                )}
              </div>

              {active > 0 && (
                <div className="flex items-center gap-[4px] mt-[6px]">
                  <span className="w-[4px] h-[4px] rounded-full bg-success dot-pulse" />
                  <span className="text-[9px] text-success font-medium">{active} running</span>
                </div>
              )}
            </div>
          </div>
        )
      })}

      {projects.length === 0 && (
        <div className="text-center py-12">
          <div className="text-3xl mb-2">🗺️</div>
          <p className="text-sm text-t2 font-medium">No projects yet</p>
          <p className="text-xs text-t4 mt-1">Create a project to get started</p>
        </div>
      )}
    </div>
  )
}

/* ── Project detail view (milestone list) ── */
function ProjectDetailView({ project, detail, onBack, onRefresh, onSelectTask, onGenerate, generating }) {
  const config = PILLAR_CONFIG[project.pillar] || PILLAR_CONFIG.hive
  const milestones = detail?.milestones || []
  const done = milestones.filter(m => m.status === 'done').length
  const progress = milestones.length > 0 ? Math.round((done / milestones.length) * 100) : 0

  const handleExecute = async (milestoneId) => {
    try {
      await api.executeMilestone(milestoneId)
      onRefresh?.()
    } catch (e) { console.warn('Execute failed:', e) }
  }

  const handleStatusChange = async (newStatus) => {
    await api.updateProjectV2(project.id, { status: newStatus })
    onRefresh?.()
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-5 py-4 flex-shrink-0" style={{ borderBottom: `2px solid ${config.color}` }}>
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-t3 hover:text-t1 text-sm transition-colors">← Back</button>
          <div className="flex-1" />
          {project.status === 'active' && (
            <>
              <button onClick={() => handleStatusChange('completed')} className="text-[11px] text-t4 hover:text-success transition-colors">
                Complete ✓
              </button>
              <button onClick={() => handleStatusChange('paused')} className="text-[11px] text-t4 hover:text-scout transition-colors ml-2">
                Pause ⏸
              </button>
            </>
          )}
          {project.status === 'paused' && (
            <button onClick={() => handleStatusChange('active')} className="text-[11px] text-success hover:opacity-70 transition-colors">
              Resume ▶
            </button>
          )}
        </div>
        <div className="flex items-start gap-4 mt-3">
          <ProgressRing progress={progress} size={48} color={config.color} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span style={{ fontSize: '16px' }}>{config.icon}</span>
              <h2 className="font-display text-[18px] tracking-[1.5px] text-t1 truncate">{project.name?.toUpperCase()}</h2>
            </div>
            <p className="text-xs text-t3 mt-[2px] line-clamp-2">{project.goal}</p>
            <div className="flex items-center gap-3 mt-[6px] text-[10px] text-t4">
              <span>{done}/{milestones.length} milestones</span>
              {project.target_date && <span>Target: {new Date(project.target_date).toLocaleDateString()}</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {milestones.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-3xl mb-3">🗺️</div>
            <p className="text-sm text-t2 font-medium">No roadmap yet</p>
            <p className="text-xs text-t4 mt-1 mb-4">AI will generate milestones from your goal</p>
            <button onClick={() => onGenerate(project.id)} disabled={generating}
              className="px-5 py-[10px] rounded-xl bg-t1 text-white font-display text-[13px] tracking-wider hover:opacity-80 disabled:opacity-50 transition-opacity">
              {generating ? 'Generating…' : 'GENERATE ROADMAP'}
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3">
              <span className="font-display text-[11px] tracking-[2px] text-t5 flex-1">MILESTONES</span>
              <button onClick={() => onGenerate(project.id)} disabled={generating}
                className="text-[10px] text-t4 hover:text-t1 transition-colors disabled:opacity-40">
                {generating ? 'Regenerating…' : '↻ Regenerate'}
              </button>
            </div>

            <div>
              {milestones.map((ms, i) => {
                const tile = AGENT_TILES[ms.agent_id] || { letter: '?', class: 'tile-nexus' }
                const isDone = ms.status === 'done'
                const isActive = ms.status === 'in_progress'
                const task = ms.task

                return (
                  <div key={ms.id} className="flex gap-3">
                    <div className="flex flex-col items-center flex-shrink-0 w-6">
                      {i > 0 && <div className="w-[1.5px] h-3" style={{ background: config.trackColor }} />}
                      <div className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{
                          background: isDone ? config.color : isActive ? config.color : '#e5e5ea',
                          border: isDone || isActive ? 'none' : '2px solid #d1d1d6',
                          boxShadow: isActive ? `0 0 6px ${config.color}40` : 'none'
                        }} />
                      <div className="w-[1.5px] flex-1" style={{ background: config.trackColor }} />
                    </div>
                    <div className="flex-1 pb-3 min-w-0">
                      <div className="hive-card">
                        <div className="px-3 py-[10px]">
                          <div className="flex items-center gap-2">
                            <div className={`agent-tile w-[22px] h-[22px] rounded-[6px] text-[10px] ${tile.class}`}>{tile.letter}</div>
                            <span className={`text-[12px] font-semibold flex-1 truncate ${isDone ? 'text-t3 line-through' : 'text-t1'}`}>{ms.title}</span>
                            <span className={`text-[10px] font-medium ${isDone ? 'text-t4' : isActive ? 'text-success' : ms.status === 'blocked' ? 'text-danger' : 'text-t4'}`}>
                              {isDone ? '✓' : isActive ? 'Running' : ms.status === 'blocked' ? 'Blocked' : 'Pending'}
                            </span>
                          </div>
                          {ms.description && (
                            <p className="text-[11px] text-t3 mt-1 ml-[30px] line-clamp-2 leading-relaxed">{ms.description}</p>
                          )}
                          {ms.acceptance_criteria && (
                            <div className="mt-[6px] ml-[30px] text-[10px] text-t4 flex items-start gap-1">
                              <span className="text-t5 mt-[1px]">✓</span>
                              <span className="line-clamp-1">{ms.acceptance_criteria}</span>
                            </div>
                          )}
                          {task && task.status === 'done' && (
                            <div className="mt-[8px] ml-[30px] rounded-lg px-[10px] py-[7px]"
                              style={{ background: `${config.color}08`, border: `0.5px solid ${config.color}20` }}>
                              <div className="flex items-center gap-[5px] text-[10px]">
                                <span style={{ color: config.color }} className="font-medium">Completed</span>
                                {task.nexus_score != null && (
                                  <span className={`font-bold px-[4px] py-[1px] rounded ${task.nexus_score >= 7 ? 'text-success' : task.nexus_score >= 4 ? 'text-scout' : 'text-danger'}`}>
                                    {task.nexus_score}/10
                                  </span>
                                )}
                                <button onClick={() => onSelectTask?.(task.id)} className="text-t3 hover:text-t1 ml-auto transition-colors">
                                  View ↗
                                </button>
                              </div>
                            </div>
                          )}
                          {task && task.status === 'in_progress' && (
                            <div className="mt-[8px] ml-[30px] flex items-center gap-[5px]">
                              <span className="w-[5px] h-[5px] rounded-full bg-success dot-pulse" />
                              <span className="text-[10px] text-success font-medium">Agent working…</span>
                              <button onClick={() => onSelectTask?.(task.id)} className="text-[10px] text-t4 hover:text-t1 ml-1">Trace ↗</button>
                            </div>
                          )}
                          {ms.status === 'pending' && (
                            <div className="mt-[8px] ml-[30px]">
                              <button onClick={() => handleExecute(ms.id)}
                                className="text-[11px] py-[5px] px-[10px] rounded-[8px] bg-t1 text-white hover:opacity-80 transition-opacity">
                                Run →
                              </button>
                            </div>
                          )}
                          {ms.status === 'blocked' && (
                            <div className="mt-[6px] ml-[30px] text-[10px] text-danger">Waiting on dependencies</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {milestones.some(m => m.status === 'pending') && (
              <div className="mt-3 flex justify-center">
                <button onClick={async () => {
                  for (const ms of milestones) {
                    if (ms.status !== 'pending') continue
                    const deps = ms.depends_on || []
                    const allDepsDone = deps.length === 0 || deps.every(depId => milestones.find(m => m.id === depId)?.status === 'done')
                    if (allDepsDone) { await handleExecute(ms.id); break }
                  }
                }}
                  className="text-[11px] py-[6px] px-4 rounded-[9px] bg-s3 text-t2 hover:bg-card transition-colors"
                  style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
                  Run next milestone →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════ */
/* ── MAIN COMPONENT ── */
/* ═══════════════════════════════════════════════════ */

export default function ProjectRoadmap({ agents = [], onClose, onSelectTask }) {
  const [projects, setProjects] = useState([])
  const [details, setDetails] = useState({}) // { projectId: detailObj }
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedProject, setSelectedProject] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const svgRef = useRef(null)
  const containerRef = useRef(null)
  const [svgWidth, setSvgWidth] = useState(900)

  useEffect(() => {
    const onResize = () => {
      setIsMobile(window.innerWidth < 768)
      if (containerRef.current) setSvgWidth(containerRef.current.offsetWidth)
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const projs = await api.getProjectsV2()
      setProjects(projs)
      // Build detail map from list data (milestones are included in list response)
      const detailMap = {}
      projs.forEach(p => { detailMap[p.id] = p })
      // Then fetch full details in background (has descriptions, acceptance_criteria)
      setDetails(detailMap)
      setLoading(false)
      // Enrich with full detail data (non-blocking)
      const detailResults = await Promise.all(projs.map(p => api.getProjectV2(p.id).catch(() => null)))
      const enriched = { ...detailMap }
      projs.forEach((p, i) => { if (detailResults[i]) enriched[p.id] = detailResults[i] })
      setDetails(enriched)
    } catch (e) {
      console.warn('Failed to load projects:', e)
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Poll when any milestones are running
  useEffect(() => {
    const hasRunning = Object.values(details).some(d => d?.milestones?.some(m => m.status === 'in_progress'))
    if (!hasRunning) return
    const interval = setInterval(fetchAll, 5000)
    return () => clearInterval(interval)
  }, [details, fetchAll])

  const handleCreate = async (data) => {
    await api.createProjectV2(data)
    fetchAll()
  }

  const handleGenerate = async (projectId) => {
    setGenerating(true)
    try {
      await api.generateRoadmap(projectId)
      fetchAll()
    } finally { setGenerating(false) }
  }

  const handleDelete = async (id) => {
    await api.deleteProjectV2(id)
    fetchAll()
  }

  const handleExecuteMilestone = async (milestoneId) => {
    try {
      await api.executeMilestone(milestoneId)
      fetchAll()
    } catch (e) { console.warn('Execute failed:', e) }
  }

  // SVG dimensions
  const trackHeight = 130
  const trackGap = 12
  const topPad = 10
  const svgHeight = topPad + projects.length * (trackHeight + trackGap) + 30

  // If a project is selected, show detail
  if (selectedProject) {
    const proj = projects.find(p => p.id === selectedProject)
    if (!proj) { setSelectedProject(null); return null }
    return (
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center" onClick={onClose}>
        <div className="w-full max-w-2xl h-[85vh] bg-page rounded-2xl shadow-2xl flex flex-col overflow-hidden mx-4"
          onClick={e => e.stopPropagation()} style={{ border: '0.5px solid rgba(0,0,0,0.1)' }}>
          <ProjectDetailView
            project={proj}
            detail={details[proj.id]}
            onBack={() => setSelectedProject(null)}
            onRefresh={fetchAll}
            onSelectTask={(id) => { onClose(); onSelectTask?.(id) }}
            onGenerate={handleGenerate}
            generating={generating}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center" onClick={onClose}>
      <div className="w-full max-w-5xl h-[88vh] bg-page rounded-2xl shadow-2xl flex flex-col overflow-hidden mx-4"
        onClick={e => e.stopPropagation()} style={{ border: '0.5px solid rgba(0,0,0,0.1)' }}>

        {/* Header */}
        <div className="px-5 pt-4 pb-3 flex items-center gap-3 flex-shrink-0" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.07)' }}>
          <div className="flex items-center gap-[6px]">
            <span className="text-[18px]">🗺️</span>
            <h2 className="font-display text-[20px] tracking-[2px] text-t1">ROADMAP</h2>
          </div>
          <div className="flex-1" />
          <button onClick={() => setShowCreate(true)}
            className="text-[11px] py-[6px] px-3 rounded-[9px] bg-t1 text-white font-medium hover:opacity-80 transition-opacity">
            + New project
          </button>
          <button onClick={onClose} className="text-t3 hover:text-t1 text-xl ml-1">&times;</button>
        </div>

        {/* Summary stats */}
        {!loading && projects.length > 0 && <SummaryCards projects={projects} details={details} />}

        {/* Main content */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-t4 text-sm">Loading projects…</div>
        ) : projects.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="text-4xl mb-3">🗺️</div>
            <p className="text-sm text-t2 font-medium">No projects yet</p>
            <p className="text-xs text-t4 mt-1 max-w-xs text-center">Create a project with a clear goal and AI will generate a step-by-step roadmap.</p>
            <button onClick={() => setShowCreate(true)}
              className="mt-4 px-5 py-[10px] rounded-xl bg-t1 text-white font-display text-[13px] tracking-wider hover:opacity-80 transition-opacity">
              CREATE FIRST PROJECT
            </button>
          </div>
        ) : isMobile ? (
          <MobileTrackList projects={projects} details={details} onSelectProject={setSelectedProject} />
        ) : (
          <div ref={containerRef} className="flex-1 overflow-auto px-3 py-3">
            {/* Transit map SVG */}
            <svg ref={svgRef} width={svgWidth} height={Math.max(svgHeight, 200)} className="w-full">
              {/* Grid pattern background */}
              <defs>
                <pattern id="roadmap-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <circle cx="20" cy="20" r="0.5" fill="rgba(0,0,0,0.04)" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#roadmap-grid)" rx="12" />

              {projects.map((p, i) => (
                <ProjectTrack
                  key={p.id}
                  project={p}
                  detail={details[p.id]}
                  pillarKey={p.pillar || 'hive'}
                  yOffset={topPad + i * (trackHeight + trackGap)}
                  trackHeight={trackHeight}
                  width={svgWidth - 24}
                  onSelectMilestone={(ms) => setSelectedProject(p.id)}
                  onExecute={handleExecuteMilestone}
                />
              ))}
            </svg>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-3 px-2 text-[9px] text-t4">
              <div className="flex items-center gap-[4px]"><div className="w-[8px] h-[8px] rounded-full bg-t1" /> Done</div>
              <div className="flex items-center gap-[4px]"><div className="w-[8px] h-[8px] rounded-full bg-success" style={{ boxShadow: '0 0 4px rgba(40,167,69,0.4)' }} /> Running</div>
              <div className="flex items-center gap-[4px]"><div className="w-[8px] h-[8px] rounded-full bg-s5" style={{ border: '1px solid #c7c7cc' }} /> Pending</div>
              <div className="flex items-center gap-[4px]"><div className="w-[8px] h-[8px] rounded-full bg-danger" /> Blocked</div>
              <div className="flex-1" />
              <span className="text-t5">Click a station to view project detail</span>
            </div>
          </div>
        )}

        {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} onCreate={handleCreate} />}
      </div>
    </div>
  )
}
