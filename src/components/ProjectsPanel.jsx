import { useState, useEffect } from 'react'
import { api } from '../lib/api'

const STATUS_COLOR = (pct) =>
  pct >= 75 ? 'bg-green-500' : pct >= 25 ? 'bg-honey' : 'bg-red-500'

const STATUS_BADGE = (pct) =>
  pct >= 75 ? 'text-green-400 bg-green-500/15' : pct >= 25 ? 'text-honey bg-honey/15' : 'text-red-400 bg-red-500/15'

export default function ProjectsPanel({ agents = [], onClose }) {
  const [projects, setProjects] = useState([])
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    api.getProjects().then(setProjects).catch(() => {})
    const i = setInterval(() => api.getProjects().then(setProjects).catch(() => {}), 5000)
    return () => clearInterval(i)
  }, [])

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-hive-800 border border-hive-700 rounded-xl w-full max-w-2xl shadow-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-hive-700 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xl">📁</span>
            <h2 className="text-lg font-semibold">Projects</h2>
            <span className="text-xs bg-hive-700 text-hive-400 rounded-full px-2 py-0.5">{projects.length}</span>
          </div>
          <button onClick={onClose} className="text-hive-400 hover:text-hive-200 text-xl">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {projects.length === 0 && (
            <div className="text-center py-12">
              <div className="text-3xl mb-2">📁</div>
              <p className="text-sm text-hive-500">No projects yet. Prefix task titles with [ProjectName] to group them.</p>
              <p className="text-xs text-hive-600 mt-1">Example: [SwingIQ] Deploy trading system</p>
            </div>
          )}

          {projects.map(p => (
            <div key={p.name} className="bg-hive-700/30 border border-hive-700 rounded-xl overflow-hidden">
              <div
                className="p-4 cursor-pointer hover:bg-hive-700/50 transition-colors"
                onClick={() => setExpanded(expanded === p.name ? null : p.name)}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-sm text-hive-100">{p.name}</h3>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${STATUS_BADGE(p.completionPct)}`}>
                    {p.completionPct}%
                  </span>
                </div>

                {/* Progress bar */}
                <div className="h-2 bg-hive-600 rounded-full overflow-hidden mb-3">
                  <div className={`h-full rounded-full transition-all ${STATUS_COLOR(p.completionPct)}`} style={{ width: `${p.completionPct}%` }} />
                </div>

                <div className="flex items-center justify-between text-xs text-hive-400">
                  <div className="flex items-center gap-3">
                    <span>{p.completed}/{p.total} done</span>
                    {p.failed > 0 && <span className="text-red-400">{p.failed} failed</span>}
                    {p.inProgress > 0 && <span className="text-honey">{p.inProgress} running</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    {p.agents.map(aid => {
                      const a = agents.find(x => x.id === aid)
                      return a ? <span key={aid} title={a.name}>{a.avatar}</span> : null
                    })}
                    <span className="ml-1 text-hive-500">${p.totalCost.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {expanded === p.name && (
                <div className="border-t border-hive-700 p-3 space-y-1.5 bg-hive-800/50 max-h-60 overflow-y-auto">
                  {p.tasks.map(t => {
                    const a = agents.find(x => x.id === t.agent_id)
                    return (
                      <div key={t.id} className="flex items-center gap-2 text-xs p-2 bg-hive-700/30 rounded-lg">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          t.status === 'done' ? 'bg-green-500' :
                          t.status === 'failed' ? 'bg-red-500' :
                          t.status === 'in_progress' ? 'bg-honey' : 'bg-hive-500'
                        }`} />
                        <span className="flex-1 truncate text-hive-200">{t.title.replace(/^\[[^\]]+\]\s*/, '')}</span>
                        {a && <span className="shrink-0">{a.avatar}</span>}
                        <span className="text-hive-500 shrink-0">{t.status}</span>
                        {t.nexus_score != null && (
                          <span className={`px-1 py-0.5 rounded text-[10px] font-bold ${
                            t.nexus_score >= 7 ? 'text-green-400' : t.nexus_score >= 4 ? 'text-yellow-400' : 'text-red-400'
                          }`}>{t.nexus_score}/10</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
