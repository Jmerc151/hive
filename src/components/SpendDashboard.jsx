import { useState, useEffect } from 'react'
import { api } from '../lib/api'

export default function SpendDashboard({ onClose }) {
  const [spend, setSpend] = useState(null)
  const [settings, setSettings] = useState(null)

  useEffect(() => {
    Promise.all([api.getSpend(), api.getSettings()]).then(([s, st]) => {
      setSpend(s)
      setSettings(st)
    })
    const interval = setInterval(async () => {
      const s = await api.getSpend()
      setSpend(s)
    }, 10000)
    return () => clearInterval(interval)
  }, [])

  const updateSetting = async (key, value) => {
    await api.updateSettings({ [key]: value })
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  if (!spend || !settings) return null

  const todayPct = spend.today.limit > 0 ? (spend.today.spend / spend.today.limit) * 100 : 0
  const monthPct = spend.month.limit > 0 ? (spend.month.spend / spend.month.limit) * 100 : 0

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-hive-800 rounded-2xl border border-hive-700 w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-hive-700">
          <h2 className="text-lg font-bold">Spend Dashboard</h2>
          <button onClick={onClose} className="text-hive-400 hover:text-hive-200 text-xl">&times;</button>
        </div>

        <div className="p-4 space-y-6">
          {/* Today's Spend */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-hive-400">Today</span>
              <span className="font-mono">${spend.today.spend.toFixed(2)} / ${spend.today.limit.toFixed(2)}</span>
            </div>
            <div className="w-full h-2 bg-hive-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${todayPct > 80 ? 'bg-danger' : 'bg-honey'}`}
                style={{ width: `${Math.min(100, todayPct)}%` }}
              />
            </div>
          </div>

          {/* Month's Spend */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-hive-400">This Month</span>
              <span className="font-mono">${spend.month.spend.toFixed(2)} / ${spend.month.limit.toFixed(2)}</span>
            </div>
            <div className="w-full h-2 bg-hive-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${monthPct > 80 ? 'bg-danger' : 'bg-honey'}`}
                style={{ width: `${Math.min(100, monthPct)}%` }}
              />
            </div>
          </div>

          {/* Per-Agent Breakdown */}
          {spend.agentBreakdown.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-hive-400 mb-2">Today by Agent</h3>
              <div className="space-y-1">
                {spend.agentBreakdown.map(a => (
                  <div key={a.agent_id} className="flex justify-between text-sm">
                    <span>{a.agent_id}</span>
                    <span className="font-mono text-hive-300">${a.total_cost.toFixed(3)} ({a.calls} calls)</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Week Trend */}
          {spend.weekTrend.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-hive-400 mb-2">7-Day Trend</h3>
              <div className="flex items-end gap-1 h-16">
                {spend.weekTrend.map(d => {
                  const maxCost = Math.max(...spend.weekTrend.map(t => t.daily_cost), 0.01)
                  const height = (d.daily_cost / maxCost) * 100
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full bg-honey/80 rounded-sm" style={{ height: `${height}%`, minHeight: '2px' }} />
                      <span className="text-[9px] text-hive-500">{d.date.slice(5)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Quick Controls */}
          <div className="border-t border-hive-700 pt-4 space-y-3">
            <h3 className="text-sm font-medium text-hive-400">Limits</h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-hive-400">
                Daily Limit ($)
                <input
                  type="number"
                  step="0.50"
                  value={settings.daily_limit_usd || ''}
                  onChange={e => updateSetting('daily_limit_usd', e.target.value)}
                  className="mt-1 w-full bg-hive-700 border border-hive-600 rounded-lg px-3 py-1.5 text-sm text-hive-100"
                />
              </label>
              <label className="text-xs text-hive-400">
                Monthly Limit ($)
                <input
                  type="number"
                  step="5"
                  value={settings.monthly_limit_usd || ''}
                  onChange={e => updateSetting('monthly_limit_usd', e.target.value)}
                  className="mt-1 w-full bg-hive-700 border border-hive-600 rounded-lg px-3 py-1.5 text-sm text-hive-100"
                />
              </label>
            </div>

            {/* Global Pause */}
            <button
              onClick={() => updateSetting('pause_all_agents', settings.pause_all_agents === 'true' ? 'false' : 'true')}
              className={`w-full py-2 rounded-xl text-sm font-medium transition-colors ${
                settings.pause_all_agents === 'true'
                  ? 'bg-danger/20 text-danger border border-danger/30 hover:bg-danger/30'
                  : 'bg-hive-700 text-hive-300 border border-hive-600 hover:bg-hive-600'
              }`}
            >
              {settings.pause_all_agents === 'true' ? '⏸ All Agents PAUSED — Click to Resume' : '⏸ Pause All Agents'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
