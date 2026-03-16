import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'

const AGENT_TILES = {
  scout:  { letter: 'S', class: 'tile-scout', name: 'Scout' },
  forge:  { letter: 'F', class: 'tile-forge', name: 'Forge' },
  quill:  { letter: 'Q', class: 'tile-quill', name: 'Quill' },
  dealer: { letter: 'D', class: 'tile-dealer', name: 'Dealer' },
  oracle: { letter: 'O', class: 'tile-oracle', name: 'Oracle' },
  nexus:  { letter: 'N', class: 'tile-nexus', name: 'Nexus' },
}

const PILLAR_BADGES = {
  ember: { label: 'Ember', color: 'text-scout', bg: 'bg-[rgba(212,121,10,0.09)]' },
  hive: { label: 'Hive', color: 'text-oracle', bg: 'bg-[rgba(128,64,184,0.09)]' },
  trading: { label: 'Trading', color: 'text-success', bg: 'bg-[rgba(40,167,69,0.09)]' },
}

const STATUS_STYLES = {
  pending: { label: 'Pending', dot: 'bg-t5', text: 'text-t4' },
  in_progress: { label: 'Running', dot: 'bg-success dot-pulse', text: 'text-success' },
  done: { label: 'Done', dot: 'bg-success', text: 'text-success' },
  blocked: { label: 'Blocked', dot: 'bg-danger', text: 'text-danger' },
  skipped: { label: 'Skipped', dot: 'bg-t5', text: 'text-t4' },
}

function ProgressRing({ progress, size = 40 }) {
  const r = (size - 4) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (progress / 100) * circ
  return (
    <svg width={size} height={size} className="flex-shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="3" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-success)" strokeWidth="3"
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
        className="fill-t1 font-display text-[11px] tracking-wider"
        style={{ transform: 'rotate(90deg)', transformOrigin: 'center' }}
      >{progress}%</text>
    </svg>
  )
}

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
            <label className="text-[11px] text-t4 font-medium block mb-1">Goal — what does success look like?</label>
            <textarea value={goal} onChange={e => setGoal(e.target.value)} rows={3}
              placeholder="e.g. 10 prompt templates published on Gumroad with pricing, landing page live, promoted on Twitter and Dev.to"
              className="w-full bg-s1 rounded-xl px-3 py-2.5 text-sm text-t1 focus:outline-none focus:ring-2 focus:ring-t1/20 resize-none"
              style={{ border: '0.5px solid rgba(0,0,0,0.08)' }} />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[11px] text-t4 font-medium block mb-1">Business pillar</label>
              <select value={pillar} onChange={e => setPillar(e.target.value)}
                className="w-full bg-s1 rounded-xl px-3 py-2.5 text-sm text-t1 focus:outline-none"
                style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
                <option value="">Any</option>
                <option value="ember">Ember (Restaurant SaaS)</option>
                <option value="hive">Hive (AI Platform)</option>
                <option value="trading">Trading (Alpaca)</option>
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
              {submitting ? 'Creating…' : 'CREATE PROJECT'}
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

function MilestoneRow({ milestone, agents, onExecute, onUpdate, onSelect, isFirst }) {
  const tile = AGENT_TILES[milestone.agent_id] || { letter: '?', class: 'tile-nexus', name: '?' }
  const st = STATUS_STYLES[milestone.status] || STATUS_STYLES.pending
  const task = milestone.task
  const canRun = milestone.status === 'pending'
  const isBlocked = milestone.status === 'blocked'

  return (
    <div className="flex gap-3">
      {/* Timeline line + dot */}
      <div className="flex flex-col items-center flex-shrink-0 w-6">
        {!isFirst && <div className="w-[1.5px] h-3 bg-s4" />}
        <div className={`w-3 h-3 rounded-full flex-shrink-0 ${st.dot}`} style={{ border: milestone.status === 'done' ? 'none' : '2px solid var(--color-s4)' }} />
        <div className="w-[1.5px] flex-1 bg-s4" />
      </div>

      {/* Content */}
      <div className="flex-1 pb-4 min-w-0">
        <div className="hive-card">
          <div className="px-3 py-[10px]">
            {/* Header row */}
            <div className="flex items-center gap-2">
              <div className={`agent-tile w-[22px] h-[22px] rounded-[6px] text-[10px] ${tile.class}`}>{tile.letter}</div>
              <span className="text-[12px] font-semibold text-t1 flex-1 truncate">{milestone.title}</span>
              <span className={`text-[10px] font-medium ${st.text}`}>{st.label}</span>
            </div>

            {/* Description */}
            {milestone.description && (
              <p className="text-[11px] text-t3 mt-1 ml-[30px] line-clamp-2 leading-relaxed">{milestone.description}</p>
            )}

            {/* Acceptance criteria */}
            {milestone.acceptance_criteria && (
              <div className="mt-[6px] ml-[30px] text-[10px] text-t4 flex items-start gap-1">
                <span className="text-t5 mt-[1px]">✓</span>
                <span className="line-clamp-1">{milestone.acceptance_criteria}</span>
              </div>
            )}

            {/* Task result summary */}
            {task && task.status === 'done' && (
              <div className="mt-[8px] ml-[30px] rounded-lg bg-[rgba(40,167,69,0.05)] px-[10px] py-[7px]" style={{ border: '0.5px solid rgba(40,167,69,0.12)' }}>
                <div className="flex items-center gap-[5px] text-[10px]">
                  <span className="text-success font-medium">Completed</span>
                  {task.nexus_score != null && (
                    <span className={`font-bold px-[4px] py-[1px] rounded ${
                      task.nexus_score >= 7 ? 'text-success' : task.nexus_score >= 4 ? 'text-scout' : 'text-danger'
                    }`}>{task.nexus_score}/10</span>
                  )}
                  <span className="text-t4">·</span>
                  <button onClick={() => onSelect?.(task.id)} className="text-t3 hover:text-t1 transition-colors">
                    View output ↗
                  </button>
                </div>
              </div>
            )}

            {/* Task in progress */}
            {task && task.status === 'in_progress' && (
              <div className="mt-[8px] ml-[30px] flex items-center gap-[5px]">
                <span className="w-[5px] h-[5px] rounded-full bg-success dot-pulse" />
                <span className="text-[10px] text-success font-medium">Agent working…</span>
                <button onClick={() => onSelect?.(task.id)} className="text-[10px] text-t4 hover:text-t1 ml-1">
                  View trace ↗
                </button>
              </div>
            )}

            {/* Actions */}
            {canRun && (
              <div className="mt-[8px] ml-[30px]">
                <button onClick={() => onExecute(milestone.id)}
                  className="text-[11px] py-[5px] px-[10px] rounded-[8px] bg-t1 text-white hover:opacity-80 transition-opacity">
                  Run milestone →
                </button>
              </div>
            )}

            {isBlocked && (
              <div className="mt-[6px] ml-[30px] text-[10px] text-danger">
                ⛔ Waiting on dependencies
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ProjectDetail({ project, agents, onBack, onRefresh, onSelectTask }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [executing, setExecuting] = useState(null)

  const fetch = useCallback(() => {
    setLoading(true)
    api.getProjectV2(project.id)
      .then(d => setDetail(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [project.id])

  useEffect(() => { fetch() }, [fetch])

  // Poll for updates when milestones are running
  useEffect(() => {
    if (!detail) return
    const hasRunning = detail.milestones?.some(m => m.status === 'in_progress')
    if (!hasRunning) return
    const interval = setInterval(fetch, 5000)
    return () => clearInterval(interval)
  }, [detail, fetch])

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      await api.generateRoadmap(project.id)
      fetch()
      onRefresh?.()
    } finally { setGenerating(false) }
  }

  const handleExecute = async (milestoneId) => {
    setExecuting(milestoneId)
    try {
      await api.executeMilestone(milestoneId)
      fetch()
    } finally { setExecuting(null) }
  }

  const handleStatusChange = async (newStatus) => {
    await api.updateProjectV2(project.id, { status: newStatus })
    onRefresh?.()
    fetch()
  }

  if (loading) return <div className="text-center text-t4 py-12 text-sm">Loading project…</div>
  if (!detail) return null

  const milestones = detail.milestones || []
  const done = milestones.filter(m => m.status === 'done').length
  const progress = milestones.length > 0 ? Math.round((done / milestones.length) * 100) : 0
  const pillar = PILLAR_BADGES[detail.pillar]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 flex-shrink-0" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.07)' }}>
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-t3 hover:text-t1 text-sm transition-colors">← Back</button>
          <div className="flex-1" />
          {detail.status === 'active' && (
            <button onClick={() => handleStatusChange('completed')} className="text-[11px] text-t4 hover:text-success transition-colors">
              Mark complete ✓
            </button>
          )}
          {detail.status === 'active' && (
            <button onClick={() => handleStatusChange('paused')} className="text-[11px] text-t4 hover:text-scout transition-colors ml-2">
              Pause ⏸
            </button>
          )}
          {detail.status === 'paused' && (
            <button onClick={() => handleStatusChange('active')} className="text-[11px] text-success hover:opacity-70 transition-colors">
              Resume ▶
            </button>
          )}
        </div>
        <div className="flex items-start gap-4 mt-3">
          <ProgressRing progress={progress} size={48} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-[20px] tracking-[1.5px] text-t1 truncate">{detail.name?.toUpperCase()}</h2>
              {pillar && (
                <span className={`text-[9px] font-medium px-[6px] py-[2px] rounded-[5px] ${pillar.color} ${pillar.bg}`}>{pillar.label}</span>
              )}
            </div>
            <p className="text-xs text-t3 mt-[3px] line-clamp-2">{detail.goal}</p>
            <div className="flex items-center gap-3 mt-[6px] text-[10px] text-t4">
              <span>{done}/{milestones.length} milestones</span>
              {detail.target_date && <span>Target: {new Date(detail.target_date).toLocaleDateString()}</span>}
              <span className={`font-medium ${
                detail.status === 'active' ? 'text-success' : detail.status === 'paused' ? 'text-scout' : detail.status === 'completed' ? 'text-t3' : 'text-t4'
              }`}>{detail.status}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Milestones / Roadmap */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {milestones.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-3xl mb-3">🗺️</div>
            <p className="text-sm text-t2 font-medium">No roadmap yet</p>
            <p className="text-xs text-t4 mt-1 mb-4">AI will generate milestones from your goal</p>
            <button onClick={handleGenerate} disabled={generating}
              className="px-5 py-[10px] rounded-xl bg-t1 text-white font-display text-[13px] tracking-wider hover:opacity-80 disabled:opacity-50 transition-opacity">
              {generating ? 'Generating roadmap…' : 'GENERATE ROADMAP'}
            </button>
          </div>
        ) : (
          <>
            {/* Regenerate button */}
            <div className="flex items-center gap-2 mb-3">
              <span className="font-display text-[11px] tracking-[2px] text-t5 flex-1">ROADMAP</span>
              <button onClick={handleGenerate} disabled={generating}
                className="text-[10px] text-t4 hover:text-t1 transition-colors disabled:opacity-40">
                {generating ? 'Regenerating…' : '↻ Regenerate'}
              </button>
            </div>

            {/* Timeline */}
            <div>
              {milestones.map((ms, i) => (
                <MilestoneRow
                  key={ms.id}
                  milestone={ms}
                  agents={agents}
                  onExecute={handleExecute}
                  onSelect={onSelectTask}
                  isFirst={i === 0}
                />
              ))}
            </div>

            {/* Run all pending button */}
            {milestones.some(m => m.status === 'pending') && (
              <div className="mt-4 flex justify-center">
                <button onClick={async () => {
                  // Execute milestones in order, only ones with no pending deps
                  for (const ms of milestones) {
                    if (ms.status !== 'pending') continue
                    const deps = ms.depends_on || []
                    const allDepsDone = deps.length === 0 || deps.every(depId => {
                      const dep = milestones.find(m => m.id === depId)
                      return dep?.status === 'done'
                    })
                    if (allDepsDone) {
                      await handleExecute(ms.id)
                      break // Run one at a time
                    }
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

export default function ProjectRoadmap({ agents = [], onClose, onSelectTask }) {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedProject, setSelectedProject] = useState(null)

  const fetchProjects = useCallback(() => {
    setLoading(true)
    api.getProjectsV2()
      .then(setProjects)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchProjects() }, [fetchProjects])

  const handleCreate = async (data) => {
    const result = await api.createProjectV2(data)
    fetchProjects()
    setSelectedProject(result.id)
  }

  const handleDelete = async (id) => {
    await api.deleteProjectV2(id)
    fetchProjects()
  }

  // Full-screen modal
  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center" onClick={onClose}>
      <div className="w-full max-w-2xl h-[85vh] bg-page rounded-2xl shadow-2xl flex flex-col overflow-hidden mx-4"
        onClick={e => e.stopPropagation()}
        style={{ border: '0.5px solid rgba(0,0,0,0.1)' }}>

        {selectedProject ? (
          <ProjectDetail
            project={projects.find(p => p.id === selectedProject) || { id: selectedProject }}
            agents={agents}
            onBack={() => setSelectedProject(null)}
            onRefresh={fetchProjects}
            onSelectTask={(id) => { onClose(); onSelectTask?.(id) }}
          />
        ) : (
          <>
            {/* Header */}
            <div className="px-5 pt-5 pb-3 flex items-center gap-3 flex-shrink-0" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.07)' }}>
              <h2 className="font-display text-[22px] tracking-[2px] text-t1 flex-1">PROJECTS</h2>
              <button onClick={() => setShowCreate(true)}
                className="text-[11px] py-[6px] px-3 rounded-[9px] bg-t1 text-white font-medium hover:opacity-80 transition-opacity">
                + New project
              </button>
              <button onClick={onClose} className="text-t3 hover:text-t1 text-xl ml-1">&times;</button>
            </div>

            {/* Project list */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {loading && <div className="text-center text-t4 py-12 text-sm">Loading…</div>}

              {!loading && projects.length === 0 && (
                <div className="text-center py-16">
                  <div className="text-4xl mb-3">🗺️</div>
                  <p className="text-sm text-t2 font-medium">No projects yet</p>
                  <p className="text-xs text-t4 mt-1 max-w-xs mx-auto">Create a project with a clear goal and AI will generate a step-by-step roadmap your agents can execute.</p>
                  <button onClick={() => setShowCreate(true)}
                    className="mt-4 px-5 py-[10px] rounded-xl bg-t1 text-white font-display text-[13px] tracking-wider hover:opacity-80 transition-opacity">
                    CREATE FIRST PROJECT
                  </button>
                </div>
              )}

              {!loading && projects.map(p => {
                const pillar = PILLAR_BADGES[p.pillar]
                const isCompleted = p.status === 'completed'
                return (
                  <div key={p.id} className="hive-card mb-[8px] cursor-pointer" onClick={() => setSelectedProject(p.id)}>
                    <div className="flex items-center gap-3 px-[14px] py-[12px]">
                      <ProgressRing progress={p.progress} size={38} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-[13px] font-semibold truncate ${isCompleted ? 'text-t3 line-through' : 'text-t1'}`}>{p.name}</span>
                          {pillar && (
                            <span className={`text-[9px] font-medium px-[5px] py-[1px] rounded-[5px] ${pillar.color} ${pillar.bg}`}>{pillar.label}</span>
                          )}
                        </div>
                        <p className="text-[11px] text-t3 truncate mt-[2px]">{p.goal}</p>
                        <div className="flex items-center gap-2 mt-[4px] text-[10px] text-t4">
                          <span>{p.done_count}/{p.milestone_count} milestones</span>
                          <span>·</span>
                          <span className={`font-medium ${
                            p.status === 'active' ? 'text-success' : p.status === 'paused' ? 'text-scout' : 'text-t4'
                          }`}>{p.status}</span>
                          {p.target_date && <><span>·</span><span>Due {new Date(p.target_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {/* Agent avatars for milestones */}
                        {[...new Set((p.milestones || []).map(m => m.agent_id).filter(Boolean))].slice(0, 4).map(aid => {
                          const t = AGENT_TILES[aid]
                          return t ? <div key={aid} className={`agent-tile w-[18px] h-[18px] rounded-[5px] text-[8px] ${t.class}`}>{t.letter}</div> : null
                        })}
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(p.id) }}
                        className="text-t5 hover:text-danger text-xs ml-1 transition-colors p-1">✕</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {showCreate && (
          <CreateProjectModal onClose={() => setShowCreate(false)} onCreate={handleCreate} />
        )}
      </div>
    </div>
  )
}
