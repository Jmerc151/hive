import { useState, useEffect } from 'react'
import { api } from '../lib/api'

export default function SpendDashboard({ onClose, inline }) {
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

  const content = (
    <div className={inline ? "h-full overflow-y-auto" : "modal-content w-full max-w-lg max-h-[80vh] overflow-y-auto"}
      onClick={inline ? undefined : e => e.stopPropagation()}>
      <div className="flex items-center justify-between p-4" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
        <h2 className="text-lg font-bold font-display tracking-wider text-t1">Spend Dashboard</h2>
        <button onClick={onClose} className="text-t4 hover:text-t1 text-xl">&times;</button>
      </div>

        <div className="p-4 space-y-6">
          {/* Today's Spend */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-t3">Today</span>
              <span className="font-mono text-t1">${spend.today.spend.toFixed(2)} / ${spend.today.limit.toFixed(2)}</span>
            </div>
            <div className="w-full h-2 bg-s3 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${todayPct > 80 ? 'bg-danger' : 'bg-t1'}`}
                style={{ width: `${Math.min(100, todayPct)}%` }}
              />
            </div>
          </div>

          {/* Month's Spend */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-t3">This Month</span>
              <span className="font-mono text-t1">${spend.month.spend.toFixed(2)} / ${spend.month.limit.toFixed(2)}</span>
            </div>
            <div className="w-full h-2 bg-s3 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${monthPct > 80 ? 'bg-danger' : 'bg-t1'}`}
                style={{ width: `${Math.min(100, monthPct)}%` }}
              />
            </div>
          </div>

          {/* Per-Agent Breakdown */}
          {spend.agentBreakdown.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-t3 mb-2">Today by Agent</h3>
              <div className="space-y-1">
                {spend.agentBreakdown.map(a => (
                  <div key={a.agent_id} className="flex justify-between text-sm">
                    <span className="text-t1">{a.agent_id}</span>
                    <span className="font-mono text-t2">${a.total_cost.toFixed(3)} ({a.calls} calls)</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Week Trend */}
          {spend.weekTrend.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-t3 mb-2">7-Day Trend</h3>
              <div className="flex items-end gap-1 h-16">
                {spend.weekTrend.map(d => {
                  const maxCost = Math.max(...spend.weekTrend.map(t => t.daily_cost), 0.01)
                  const height = (d.daily_cost / maxCost) * 100
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full bg-t1/80 rounded-sm" style={{ height: `${height}%`, minHeight: '2px' }} />
                      <span className="text-[9px] text-t4">{d.date.slice(5)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Quick Controls */}
          <div className="pt-4 space-y-3" style={{ borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
            <h3 className="text-sm font-medium text-t3">Limits</h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-t3">
                Daily Limit ($)
                <input
                  type="number"
                  step="0.50"
                  value={settings.daily_limit_usd || ''}
                  onChange={e => updateSetting('daily_limit_usd', e.target.value)}
                  className="mt-1 w-full bg-s3 rounded-lg px-3 py-1.5 text-sm text-t1"
                  style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}
                />
              </label>
              <label className="text-xs text-t3">
                Monthly Limit ($)
                <input
                  type="number"
                  step="5"
                  value={settings.monthly_limit_usd || ''}
                  onChange={e => updateSetting('monthly_limit_usd', e.target.value)}
                  className="mt-1 w-full bg-s3 rounded-lg px-3 py-1.5 text-sm text-t1"
                  style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}
                />
              </label>
            </div>

            {/* Global Pause */}
            <button
              onClick={() => updateSetting('pause_all_agents', settings.pause_all_agents === 'true' ? 'false' : 'true')}
              className={`w-full py-2 rounded-xl text-sm font-medium transition-colors ${
                settings.pause_all_agents === 'true'
                  ? 'bg-danger/20 text-danger border border-danger/30 hover:bg-danger/30'
                  : 'bg-s3 text-t2 hover:bg-s3/80'
              }`}
              style={settings.pause_all_agents !== 'true' ? { border: '0.5px solid rgba(0,0,0,0.08)' } : undefined}
            >
              {settings.pause_all_agents === 'true' ? '⏸ All Agents PAUSED — Click to Resume' : '⏸ Pause All Agents'}
            </button>
          </div>
      </div>
    </div>
  )

  if (inline) return content

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-backdrop" />
      {content}
    </div>
  )
}
