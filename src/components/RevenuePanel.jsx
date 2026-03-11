import { useState, useEffect } from 'react'
import { api } from '../lib/api'

export default function RevenuePanel({ agents, onClose }) {
  const [entries, setEntries] = useState([])
  const [summary, setSummary] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [source, setSource] = useState('')
  const [agentId, setAgentId] = useState('')

  const refresh = () => {
    api.getRevenue().then(setEntries).catch(() => {})
    api.getRevenueSummary().then(setSummary).catch(() => {})
  }

  useEffect(() => { refresh() }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim() || !amount) return
    await api.createRevenue({ title: title.trim(), amount: parseFloat(amount), source, agent_id: agentId || null })
    setTitle(''); setAmount(''); setSource(''); setAgentId('')
    setShowForm(false)
    refresh()
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-hive-800 border border-hive-700 rounded-xl w-full max-w-lg shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="p-5 border-b border-hive-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">💰</span>
            <h2 className="text-lg font-semibold">Revenue & ROI</h2>
          </div>
          <button onClick={onClose} className="text-hive-400 hover:text-hive-200 text-xl">&times;</button>
        </div>

        {summary && (
          <div className="p-5 space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-green-400 font-mono">${summary.totalRevenue.toFixed(2)}</div>
                <div className="text-[10px] text-green-400/60">Revenue</div>
              </div>
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-orange-400 font-mono">${summary.totalSpend.toFixed(2)}</div>
                <div className="text-[10px] text-orange-400/60">Spend</div>
              </div>
              <div className={`${summary.netROI >= 0 ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'} border rounded-lg p-3 text-center`}>
                <div className={`text-lg font-bold font-mono ${summary.netROI >= 0 ? 'text-green-400' : 'text-red-400'}`}>${summary.netROI.toFixed(2)}</div>
                <div className="text-[10px] text-hive-400">Net ROI</div>
              </div>
            </div>

            {/* By Agent */}
            {summary.byAgent.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-hive-300 mb-2">Agent ROI</h3>
                <div className="space-y-1.5">
                  {summary.byAgent.map(a => {
                    const agent = agents?.find(ag => ag.id === a.agent_id)
                    const roi = a.revenue - a.spend
                    return (
                      <div key={a.agent_id} className="flex items-center justify-between p-2 bg-hive-700/30 rounded-lg text-sm">
                        <div className="flex items-center gap-2">
                          {agent && <span>{agent.avatar}</span>}
                          <span className="text-hive-200">{agent?.name || a.agent_id}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs font-mono">
                          <span className="text-green-400">${a.revenue.toFixed(2)}</span>
                          <span className="text-hive-500">-</span>
                          <span className="text-orange-400">${a.spend.toFixed(2)}</span>
                          <span className="text-hive-500">=</span>
                          <span className={roi >= 0 ? 'text-green-400' : 'text-red-400'}>${roi.toFixed(2)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* By Source */}
            {summary.bySource.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-hive-300 mb-2">By Source</h3>
                <div className="flex gap-2 flex-wrap">
                  {summary.bySource.map(s => (
                    <span key={s.source || 'other'} className="px-2.5 py-1 bg-hive-700/50 rounded-lg text-xs text-hive-300">
                      {s.source || 'Other'}: <span className="text-green-400 font-mono">${s.total.toFixed(2)}</span> ({s.count})
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Log Revenue */}
            <button onClick={() => setShowForm(!showForm)} className="w-full p-2.5 border border-dashed border-hive-600 rounded-lg text-sm text-hive-400 hover:border-green-500/50 hover:text-green-400 transition-all">
              + Log Revenue
            </button>

            {showForm && (
              <form onSubmit={handleSubmit} className="space-y-3 p-3 bg-hive-700/30 rounded-lg border border-hive-700">
                <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="What earned revenue?"
                  className="w-full bg-hive-900 border border-hive-600 rounded-lg px-3 py-2 text-sm text-hive-100 placeholder:text-hive-500 focus:outline-none focus:ring-2 focus:ring-honey/50" />
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount ($)"
                    className="bg-hive-900 border border-hive-600 rounded-lg px-3 py-2 text-sm text-hive-100 placeholder:text-hive-500 focus:outline-none focus:ring-2 focus:ring-honey/50" />
                  <input type="text" value={source} onChange={e => setSource(e.target.value)} placeholder="Source (e.g. bot sale)"
                    className="bg-hive-900 border border-hive-600 rounded-lg px-3 py-2 text-sm text-hive-100 placeholder:text-hive-500 focus:outline-none focus:ring-2 focus:ring-honey/50" />
                </div>
                <select value={agentId} onChange={e => setAgentId(e.target.value)}
                  className="w-full bg-hive-900 border border-hive-600 rounded-lg px-3 py-2 text-sm text-hive-100 focus:outline-none focus:ring-2 focus:ring-honey/50">
                  <option value="">Attribute to agent (optional)</option>
                  {agents?.map(a => <option key={a.id} value={a.id}>{a.avatar} {a.name}</option>)}
                </select>
                <button type="submit" disabled={!title.trim() || !amount}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded-lg font-medium text-sm hover:bg-green-500 transition-colors disabled:opacity-40">
                  Log Revenue
                </button>
              </form>
            )}

            {/* Recent Entries */}
            {entries.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-hive-300 mb-2">Recent</h3>
                <div className="space-y-1">
                  {entries.slice(0, 10).map(e => (
                    <div key={e.id} className="flex items-center justify-between text-xs p-2 bg-hive-900/50 rounded">
                      <span className="text-hive-300">{e.title}</span>
                      <span className="text-green-400 font-mono">${e.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
