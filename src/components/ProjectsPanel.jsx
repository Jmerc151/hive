import { useState, useEffect } from 'react'
import { api } from '../lib/api'

const STATUS_COLOR = (pct) =>
  pct >= 75 ? 'bg-green-500' : pct >= 25 ? 'bg-honey' : 'bg-red-500'

const STATUS_BADGE = (pct) =>
  pct >= 75 ? 'text-green-400 bg-green-500/15' : pct >= 25 ? 'text-honey bg-honey/15' : 'text-red-400 bg-red-500/15'

const STATUS_DOT = {
  done: 'bg-green-500',
  failed: 'bg-red-500',
  in_progress: 'bg-honey animate-pulse',
  awaiting_approval: 'bg-blue-400 animate-pulse',
  todo: 'bg-hive-500',
  in_review: 'bg-purple-400',
  backlog: 'bg-hive-600',
}

export default function ProjectsPanel({ agents = [], onClose, onSelectTask }) {
  const [projects, setProjects] = useState([])
  const [activeProject, setActiveProject] = useState(null)
  const [filter, setFilter] = useState('all') // all, done, awaiting_approval, in_progress

  useEffect(() => {
    api.getProjects().then(setProjects).catch(() => {})
    const i = setInterval(() => api.getProjects().then(setProjects).catch(() => {}), 8000)
    return () => clearInterval(i)
  }, [])

  const project = activeProject ? projects.find(p => p.name === activeProject) : null

  const filteredTasks = project
    ? filter === 'all'
      ? project.tasks
      : project.tasks.filter(t => t.status === filter)
    : []

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-hive-800 border border-hive-700 rounded-xl w-full max-w-4xl shadow-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="p-5 border-b border-hive-700 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            {activeProject ? (
              <>
                <button
                  onClick={() => { setActiveProject(null); setFilter('all') }}
                  className="text-hive-400 hover:text-hive-200 transition-colors text-sm flex items-center gap-1"
                >
                  <span>&larr;</span> Back
                </button>
                <span className="text-hive-600">|</span>
                <span className="text-xl">{project?.icon || '📁'}</span>
                <h2 className="text-lg font-semibold">{activeProject}</h2>
                <span className="text-xs bg-hive-700 text-hive-400 rounded-full px-2 py-0.5">{project?.total || 0} tasks</span>
              </>
            ) : (
              <>
                <span className="text-xl">📂</span>
                <h2 className="text-lg font-semibold">Projects</h2>
                <span className="text-xs bg-hive-700 text-hive-400 rounded-full px-2 py-0.5">{projects.length}</span>
              </>
            )}
          </div>
          <button onClick={onClose} className="text-hive-400 hover:text-hive-200 text-xl">&times;</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {!activeProject ? (
            /* ─── Folder Grid View ─── */
            <div>
              {projects.length === 0 && (
                <div className="text-center py-12">
                  <div className="text-3xl mb-2">📂</div>
                  <p className="text-sm text-hive-500">No tasks found.</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {projects.map(p => {
                  const agentAvatars = p.agents.slice(0, 5).map(aid => {
                    const a = agents.find(x => x.id === aid)
                    return a ? a.avatar : null
                  }).filter(Boolean)

                  return (
                    <div
                      key={p.name}
                      className="bg-hive-700/30 border border-hive-700 rounded-xl p-4 cursor-pointer hover:bg-hive-700/50 hover:border-hive-600 transition-all group"
                      onClick={() => setActiveProject(p.name)}
                    >
                      {/* Folder icon + name */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                          <span className="text-2xl group-hover:scale-110 transition-transform">{p.icon}</span>
                          <div>
                            <h3 className="font-semibold text-sm text-hive-100">{p.name}</h3>
                            <span className="text-xs text-hive-500">{p.total} tasks</span>
                          </div>
                        </div>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${STATUS_BADGE(p.completionPct)}`}>
                          {p.completionPct}%
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="h-1.5 bg-hive-600 rounded-full overflow-hidden mb-3">
                        <div className={`h-full rounded-full transition-all ${STATUS_COLOR(p.completionPct)}`} style={{ width: `${p.completionPct}%` }} />
                      </div>

                      {/* Stats row */}
                      <div className="flex items-center justify-between text-xs text-hive-400">
                        <div className="flex items-center gap-2">
                          <span className="text-green-400">{p.completed} done</span>
                          {p.awaiting > 0 && <span className="text-blue-400">{p.awaiting} review</span>}
                          {p.inProgress > 0 && <span className="text-honey">{p.inProgress} active</span>}
                          {p.failed > 0 && <span className="text-red-400">{p.failed} failed</span>}
                        </div>
                        <div className="flex items-center gap-1">
                          {agentAvatars.map((av, i) => <span key={i}>{av}</span>)}
                          <span className="ml-1 text-hive-500">${p.totalCost.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Summary bar */}
              {projects.length > 0 && (
                <div className="mt-5 pt-4 border-t border-hive-700 flex items-center justify-between text-xs text-hive-500">
                  <span>{projects.reduce((s, p) => s + p.total, 0)} total tasks across {projects.length} projects</span>
                  <span>${projects.reduce((s, p) => s + p.totalCost, 0).toFixed(2)} total spend</span>
                </div>
              )}
            </div>
          ) : (
            /* ─── Project Detail View ─── */
            <div>
              {/* Filter tabs */}
              <div className="flex gap-2 mb-4 flex-wrap">
                {[
                  { key: 'all', label: 'All', count: project?.total },
                  { key: 'done', label: 'Completed', count: project?.completed },
                  { key: 'awaiting_approval', label: 'Needs Review', count: project?.awaiting },
                  { key: 'in_progress', label: 'In Progress', count: project?.inProgress },
                  { key: 'failed', label: 'Failed', count: project?.failed },
                ].filter(f => f.count > 0 || f.key === 'all').map(f => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                      filter === f.key
                        ? 'bg-honey/20 border-honey/40 text-honey'
                        : 'bg-hive-700/30 border-hive-700 text-hive-400 hover:bg-hive-700/50'
                    }`}
                  >
                    {f.label} ({f.count})
                  </button>
                ))}
              </div>

              {/* Task list */}
              <div className="space-y-2">
                {filteredTasks.length === 0 && (
                  <div className="text-center py-8 text-hive-500 text-sm">No tasks match this filter.</div>
                )}
                {filteredTasks.map(t => {
                  const a = agents.find(x => x.id === t.agent_id)
                  const displayTitle = t.title.replace(/^\[([^\]]+)\]\s*/, '')
                  return (
                    <div
                      key={t.id}
                      className="flex items-start gap-3 p-3 bg-hive-700/30 border border-hive-700 rounded-lg hover:bg-hive-700/50 transition-colors cursor-pointer"
                      onClick={() => onSelectTask?.(t)}
                    >
                      <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${STATUS_DOT[t.status] || 'bg-hive-500'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-hive-200 leading-snug">{displayTitle}</div>
                        <div className="flex items-center gap-2 mt-1.5 text-xs text-hive-500">
                          {a && <span className="flex items-center gap-1">{a.avatar} {a.name}</span>}
                          <span className="capitalize">{t.status.replace(/_/g, ' ')}</span>
                          {t.estimated_cost > 0 && <span>${t.estimated_cost.toFixed(3)}</span>}
                          {t.completed_at && <span>{new Date(t.completed_at).toLocaleDateString()}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {t.nexus_score != null && (
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                            t.nexus_score >= 7 ? 'text-green-400 bg-green-500/15' :
                            t.nexus_score >= 4 ? 'text-yellow-400 bg-yellow-500/15' :
                            'text-red-400 bg-red-500/15'
                          }`}>{t.nexus_score}/10</span>
                        )}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          t.priority === 'high' ? 'text-red-400 bg-red-500/15' :
                          t.priority === 'medium' ? 'text-honey bg-honey/15' :
                          'text-hive-500 bg-hive-700'
                        }`}>{t.priority}</span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Project summary */}
              {project && (
                <div className="mt-4 pt-3 border-t border-hive-700 flex items-center justify-between text-xs text-hive-500">
                  <span>{project.completed}/{project.total} completed ({project.completionPct}%)</span>
                  <span>Total cost: ${project.totalCost.toFixed(2)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
