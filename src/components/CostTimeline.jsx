import { useState, useEffect, useMemo } from 'react'
import { api } from '../lib/api'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { SkeletonChart } from './Skeleton'

const AGENTS = [
  { id: 'scout', color: '#06b6d4' },
  { id: 'forge', color: '#3b82f6' },
  { id: 'quill', color: '#8b5cf6' },
  { id: 'dealer', color: '#3BB273' },
  { id: 'oracle', color: '#E8C547' },
  { id: 'nexus', color: '#ec4899' },
]
const AGENT_COLORS = Object.fromEntries(AGENTS.map(a => [a.id, a.color]))
const RANGES = ['24h', '7d', '30d']

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-s1 rounded-lg px-3 py-2 text-xs shadow-lg" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
      <p className="text-t2 mb-1">{label}</p>
      {payload.filter(p => p.value > 0).map(p => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-t1">{p.dataKey}</span>
          <span className="text-t1 font-mono ml-auto">${p.value.toFixed(4)}</span>
        </div>
      ))}
      <div className="mt-1 pt-1 text-t1 font-mono" style={{ borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
        Total: ${payload.reduce((s, p) => s + (p.value || 0), 0).toFixed(4)}
      </div>
    </div>
  )
}

export default function CostTimeline({ onClose }) {
  const [range, setRange] = useState('7d')
  const [spendData, setSpendData] = useState([])
  const [taskSpend, setTaskSpend] = useState([])
  const [agentSummary, setAgentSummary] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.getAnalyticsSpend(range),
      api.getSpendByTask(50),
      api.getAgentsSummary(range),
    ]).then(([spend, tasks, summary]) => {
      setSpendData(spend || [])
      setTaskSpend(tasks || [])
      setAgentSummary(summary || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [range])

  const chartData = useMemo(() => {
    const buckets = {}
    for (const row of spendData) {
      const key = row.time_bucket
      if (!buckets[key]) buckets[key] = { time: key }
      buckets[key][row.agent_id] = (buckets[key][row.agent_id] || 0) + (row.total_cost || 0)
    }
    return Object.values(buckets).sort((a, b) => a.time.localeCompare(b.time))
  }, [spendData])

  const formatXAxis = (val) => {
    if (range === '24h') return val?.slice(11, 16) || val
    return val?.slice(5, 10) || val
  }

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-page rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
          <h2 className="text-lg font-bold font-display text-t1">Cost Timeline</h2>
          <div className="flex items-center gap-3">
            <div className="flex bg-s2 rounded-lg p-0.5">
              {RANGES.map(r => (
                <button key={r} onClick={() => setRange(r)}
                  className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${range === r ? 'bg-t1 text-white' : 'text-t3 hover:text-t1'}`}>
                  {r}
                </button>
              ))}
            </div>
            <button onClick={onClose} className="text-t3 hover:text-t1 text-xl" aria-label="Close cost timeline">&times;</button>
          </div>
        </div>

        <div className="p-4 space-y-6">
          {loading ? (
            <SkeletonChart />
          ) : (
            <>
              <div className="bg-s1 rounded-xl p-4" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                    <XAxis dataKey="time" tickFormatter={formatXAxis} tick={{ fill: '#8e8e93', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#8e8e93', fontSize: 11 }} tickFormatter={v => `$${v.toFixed(2)}`} width={60} />
                    <Tooltip content={<CustomTooltip />} />
                    {AGENTS.map(a => (
                      <Area key={a.id} type="monotone" dataKey={a.id} stackId="1" stroke={a.color} fill={a.color} fillOpacity={0.6} />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-3 mt-3 justify-center">
                  {AGENTS.map(a => (
                    <div key={a.id} className="flex items-center gap-1.5 text-xs text-t2">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: a.color }} />
                      {a.id}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4">
                {agentSummary.map(a => (
                  <div key={a.agent_id} className="min-w-[140px] bg-s1 rounded-xl p-3 flex-shrink-0" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: AGENT_COLORS[a.agent_id] || '#666' }} />
                      <span className="text-sm font-medium text-t1 capitalize">{a.agent_id}</span>
                    </div>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between"><span className="text-t3">Cost</span><span className="font-mono text-t1">${(a.total_cost || 0).toFixed(3)}</span></div>
                      <div className="flex justify-between"><span className="text-t3">Tokens</span><span className="font-mono text-t1">{(a.total_tokens || 0).toLocaleString()}</span></div>
                      <div className="flex justify-between"><span className="text-t3">Tasks</span><span className="font-mono text-t1">{a.task_count || 0}</span></div>
                    </div>
                  </div>
                ))}
              </div>

              {taskSpend.length > 0 && (
                <div className="bg-s1 rounded-xl overflow-hidden" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
                  <div className="px-4 py-3" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
                    <h3 className="text-sm font-medium text-t1">Cost per Task</h3>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-xs hidden sm:table">
                      <thead className="text-t3 sticky top-0 bg-s1">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium">Task</th>
                          <th className="text-left px-4 py-2 font-medium">Agent</th>
                          <th className="text-right px-4 py-2 font-medium">Cost</th>
                          <th className="text-right px-4 py-2 font-medium">Tokens</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y" style={{ '--tw-divide-opacity': 1, borderColor: 'rgba(0,0,0,0.04)' }}>
                        {taskSpend.map(t => (
                          <tr key={t.task_id} className="hover:bg-s2">
                            <td className="px-4 py-2 text-t1 max-w-[200px] truncate">{t.title || t.task_id}</td>
                            <td className="px-4 py-2"><span className="capitalize" style={{ color: AGENT_COLORS[t.agent_id] || '#9ca3af' }}>{t.agent_id}</span></td>
                            <td className="px-4 py-2 text-right font-mono text-t1">${(t.total_cost || 0).toFixed(4)}</td>
                            <td className="px-4 py-2 text-right font-mono text-t2">{(t.total_tokens || 0).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="sm:hidden" style={{ borderColor: 'rgba(0,0,0,0.04)' }}>
                      {taskSpend.map(t => (
                        <div key={t.task_id} className="px-4 py-3" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.04)' }}>
                          <div className="flex justify-between items-start mb-1">
                            <span className="text-t1 text-xs truncate max-w-[60%]">{t.title || t.task_id}</span>
                            <span className="text-t1 font-mono text-xs">${(t.total_cost || 0).toFixed(4)}</span>
                          </div>
                          <div className="flex gap-3 text-[10px] text-t3">
                            <span className="capitalize" style={{ color: AGENT_COLORS[t.agent_id] || '#9ca3af' }}>{t.agent_id}</span>
                            <span>{(t.total_tokens || 0).toLocaleString()} tokens</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
