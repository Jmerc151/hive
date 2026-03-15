import { useState, useEffect } from 'react'
import { api } from '../lib/api'

export default function AgentScorecard({ agent, onClose }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!agent) return
    api.getScorecard(agent.id).then(setData).catch(() => {})
  }, [agent?.id])

  if (!agent) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-backdrop" />
      <div className="modal-content w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="p-5 flex items-center justify-between" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{agent.avatar}</span>
            <div>
              <h2 className="text-lg font-semibold font-display tracking-wider" style={{ color: agent.color }}>{agent.name}</h2>
              <p className="text-xs text-t3">{agent.role}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-t4 hover:text-t1 text-xl">&times;</button>
        </div>

        {!data ? (
          <div className="p-8 text-center text-t4">Loading scorecard...</div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-3">
              <StatBox label="Success Rate" value={`${data.successRate}%`} color={data.successRate >= 80 ? 'text-success' : data.successRate >= 50 ? 'text-yellow-500' : 'text-danger'} />
              <StatBox label="Tasks Done" value={data.tasks.done} color="text-t1" />
              <StatBox label="Failed" value={data.tasks.failed} color="text-danger" />
              <StatBox label="Avg Duration" value={formatDuration(data.avgDurationSec)} color="text-t1" />
              <StatBox label="Avg Tokens" value={data.avgTokens.toLocaleString()} color="text-t1" />
              <StatBox label="Avg Cost" value={`$${data.avgCost.toFixed(3)}`} color="text-t1" />
              <StatBox label="QA Pass Rate" value={`${data.qaPassRate}%`} color={data.qaPassRate >= 80 ? 'text-success' : 'text-yellow-500'} />
              <StatBox label="Total Spend" value={`$${data.totalSpend.toFixed(2)}`} color="text-orange-500" />
              <StatBox label="ROI" value={`$${data.roi.toFixed(2)}`} color={data.roi >= 0 ? 'text-success' : 'text-danger'} />
            </div>

            {/* Revenue */}
            {data.revenue > 0 && (
              <div className="p-3 rounded-lg" style={{ background: 'rgba(52,199,89,0.1)', border: '0.5px solid rgba(52,199,89,0.2)' }}>
                <div className="text-xs text-success mb-1">Revenue Attributed</div>
                <div className="text-lg font-bold text-success">${data.revenue.toFixed(2)}</div>
              </div>
            )}

            {/* 7-Day Trend */}
            {data.weekTrend.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-t2 mb-2">7-Day Completion Trend</h3>
                <div className="flex items-end gap-1 h-16">
                  {data.weekTrend.map((d, i) => {
                    const max = Math.max(...data.weekTrend.map(d => d.count))
                    const pct = max > 0 ? (d.count / max) * 100 : 0
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <div className="w-full bg-t1/80 rounded-t" style={{ height: `${Math.max(pct, 5)}%` }} />
                        <span className="text-[9px] text-t4">{d.date.slice(5)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Task Breakdown */}
            <div>
              <h3 className="text-sm font-medium text-t2 mb-2">Task Breakdown</h3>
              <div className="flex gap-1 h-3 rounded-full overflow-hidden bg-s3">
                {data.tasks.done > 0 && <div className="bg-green-500" style={{ width: `${(data.tasks.done / data.tasks.total) * 100}%` }} />}
                {data.tasks.in_progress > 0 && <div className="bg-t1" style={{ width: `${(data.tasks.in_progress / data.tasks.total) * 100}%` }} />}
                {data.tasks.todo > 0 && <div className="bg-blue-400" style={{ width: `${(data.tasks.todo / data.tasks.total) * 100}%` }} />}
                {data.tasks.failed > 0 && <div className="bg-red-400" style={{ width: `${(data.tasks.failed / data.tasks.total) * 100}%` }} />}
              </div>
              <div className="flex gap-3 mt-2 text-[10px] text-t3">
                <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />Done {data.tasks.done}</span>
                <span><span className="inline-block w-2 h-2 rounded-full bg-t1 mr-1" />Active {data.tasks.in_progress}</span>
                <span><span className="inline-block w-2 h-2 rounded-full bg-blue-400 mr-1" />Queued {data.tasks.todo}</span>
                <span><span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1" />Failed {data.tasks.failed}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatBox({ label, value, color }) {
  return (
    <div className="bg-s2 rounded-lg p-3 text-center">
      <div className={`text-lg font-bold font-mono ${color}`}>{value}</div>
      <div className="text-[10px] text-t4 mt-0.5">{label}</div>
    </div>
  )
}

function formatDuration(seconds) {
  if (!seconds || seconds < 1) return '—'
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${(seconds / 3600).toFixed(1)}h`
}
