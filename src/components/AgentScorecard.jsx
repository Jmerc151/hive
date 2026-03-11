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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-hive-800 border border-hive-700 rounded-xl w-full max-w-lg shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="p-5 border-b border-hive-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{agent.avatar}</span>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: agent.color }}>{agent.name}</h2>
              <p className="text-xs text-hive-400">{agent.role}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-hive-400 hover:text-hive-200 text-xl">&times;</button>
        </div>

        {!data ? (
          <div className="p-8 text-center text-hive-500">Loading scorecard...</div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-3">
              <StatBox label="Success Rate" value={`${data.successRate}%`} color={data.successRate >= 80 ? 'text-green-400' : data.successRate >= 50 ? 'text-yellow-400' : 'text-red-400'} />
              <StatBox label="Tasks Done" value={data.tasks.done} color="text-honey" />
              <StatBox label="Failed" value={data.tasks.failed} color="text-red-400" />
              <StatBox label="Avg Duration" value={formatDuration(data.avgDurationSec)} color="text-hive-200" />
              <StatBox label="Avg Tokens" value={data.avgTokens.toLocaleString()} color="text-hive-200" />
              <StatBox label="Avg Cost" value={`$${data.avgCost.toFixed(3)}`} color="text-hive-200" />
              <StatBox label="QA Pass Rate" value={`${data.qaPassRate}%`} color={data.qaPassRate >= 80 ? 'text-green-400' : 'text-yellow-400'} />
              <StatBox label="Total Spend" value={`$${data.totalSpend.toFixed(2)}`} color="text-orange-400" />
              <StatBox label="ROI" value={`$${data.roi.toFixed(2)}`} color={data.roi >= 0 ? 'text-green-400' : 'text-red-400'} />
            </div>

            {/* Revenue */}
            {data.revenue > 0 && (
              <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                <div className="text-xs text-green-400 mb-1">Revenue Attributed</div>
                <div className="text-lg font-bold text-green-400">${data.revenue.toFixed(2)}</div>
              </div>
            )}

            {/* 7-Day Trend */}
            {data.weekTrend.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-hive-300 mb-2">7-Day Completion Trend</h3>
                <div className="flex items-end gap-1 h-16">
                  {data.weekTrend.map((d, i) => {
                    const max = Math.max(...data.weekTrend.map(d => d.count))
                    const pct = max > 0 ? (d.count / max) * 100 : 0
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <div className="w-full bg-honey/80 rounded-t" style={{ height: `${Math.max(pct, 5)}%` }} />
                        <span className="text-[9px] text-hive-500">{d.date.slice(5)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Task Breakdown */}
            <div>
              <h3 className="text-sm font-medium text-hive-300 mb-2">Task Breakdown</h3>
              <div className="flex gap-1 h-3 rounded-full overflow-hidden bg-hive-700">
                {data.tasks.done > 0 && <div className="bg-green-500" style={{ width: `${(data.tasks.done / data.tasks.total) * 100}%` }} />}
                {data.tasks.in_progress > 0 && <div className="bg-honey" style={{ width: `${(data.tasks.in_progress / data.tasks.total) * 100}%` }} />}
                {data.tasks.todo > 0 && <div className="bg-blue-400" style={{ width: `${(data.tasks.todo / data.tasks.total) * 100}%` }} />}
                {data.tasks.failed > 0 && <div className="bg-red-400" style={{ width: `${(data.tasks.failed / data.tasks.total) * 100}%` }} />}
              </div>
              <div className="flex gap-3 mt-2 text-[10px] text-hive-400">
                <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />Done {data.tasks.done}</span>
                <span><span className="inline-block w-2 h-2 rounded-full bg-honey mr-1" />Active {data.tasks.in_progress}</span>
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
    <div className="bg-hive-700/30 rounded-lg p-3 text-center">
      <div className={`text-lg font-bold font-mono ${color}`}>{value}</div>
      <div className="text-[10px] text-hive-500 mt-0.5">{label}</div>
    </div>
  )
}

function formatDuration(seconds) {
  if (!seconds || seconds < 1) return '—'
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${(seconds / 3600).toFixed(1)}h`
}
