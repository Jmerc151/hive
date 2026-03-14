import { useState, useEffect } from 'react'
import { api } from '../lib/api'

const STATUS_COLORS = {
  passed: 'text-green-400 bg-green-900/30',
  failed: 'text-red-400 bg-red-900/30',
  running: 'text-yellow-400 bg-yellow-900/30',
  pending: 'text-hive-400 bg-hive-900/30',
}

export default function EvalHarness({ onClose, agents }) {
  const [cases, setCases] = useState([])
  const [history, setHistory] = useState([])
  const [running, setRunning] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', agent_id: 'scout', input_prompt: '', expected_tools: '', expected_keywords: '' })

  useEffect(() => { load() }, [])

  async function load() {
    const [c, h] = await Promise.all([api.getEvalCases(), api.getEvalHistory(null, 100)])
    setCases(c)
    setHistory(h)
  }

  async function runAll() {
    setRunning(true)
    try {
      await api.runAllEvals()
      // Poll for completion
      const poll = setInterval(async () => {
        const h = await api.getEvalHistory(null, 100)
        setHistory(h)
        if (!h.some(r => r.status === 'running' || r.status === 'pending')) {
          clearInterval(poll)
          setRunning(false)
        }
      }, 3000)
    } catch { setRunning(false) }
  }

  async function runOne(caseId) {
    await api.runEval(caseId)
    setTimeout(load, 5000)
  }

  async function handleCreate(e) {
    e.preventDefault()
    await api.createEvalCase({
      ...form,
      expected_tools: form.expected_tools.split(',').map(s => s.trim()).filter(Boolean),
      expected_keywords: form.expected_keywords.split(',').map(s => s.trim()).filter(Boolean),
    })
    setForm({ name: '', agent_id: 'scout', input_prompt: '', expected_tools: '', expected_keywords: '' })
    setShowCreate(false)
    load()
  }

  // Group latest run per case
  const latestByCase = {}
  for (const r of history) {
    if (!latestByCase[r.eval_case_id] || r.created_at > latestByCase[r.eval_case_id].created_at) {
      latestByCase[r.eval_case_id] = r
    }
  }

  const passRate = cases.length === 0 ? 0 : Math.round(cases.filter(c => latestByCase[c.id]?.status === 'passed').length / cases.length * 100)

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-8 overflow-y-auto">
      <div className="bg-hive-800 border border-hive-700 rounded-xl w-full max-w-4xl mx-4 mb-8">
        <div className="flex items-center justify-between p-4 border-b border-hive-700">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🧪</span>
            <h2 className="text-lg font-bold text-hive-100">Eval Harness</h2>
            <span className={`text-sm px-2 py-0.5 rounded-full ${passRate >= 70 ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
              {passRate}% pass rate
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowCreate(!showCreate)} className="text-xs px-3 py-1.5 rounded-lg bg-hive-700 text-hive-200 hover:bg-hive-600">
              + Add Case
            </button>
            <button onClick={runAll} disabled={running} className="text-xs px-3 py-1.5 rounded-lg bg-honey/20 text-honey hover:bg-honey/30 disabled:opacity-50">
              {running ? '⏳ Running...' : '▶ Run All'}
            </button>
            <button onClick={onClose} className="text-hive-400 hover:text-hive-200 text-xl ml-2">&times;</button>
          </div>
        </div>

        {showCreate && (
          <form onSubmit={handleCreate} className="p-4 border-b border-hive-700 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="Test name" value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                className="bg-hive-900 border border-hive-600 rounded-lg px-3 py-2 text-sm text-hive-100" required />
              <select value={form.agent_id} onChange={e => setForm({...form, agent_id: e.target.value})}
                className="bg-hive-900 border border-hive-600 rounded-lg px-3 py-2 text-sm text-hive-100">
                {(agents || []).map(a => <option key={a.id} value={a.id}>{a.avatar} {a.name}</option>)}
              </select>
            </div>
            <textarea placeholder="Input prompt for the agent" value={form.input_prompt} onChange={e => setForm({...form, input_prompt: e.target.value})}
              className="w-full bg-hive-900 border border-hive-600 rounded-lg px-3 py-2 text-sm text-hive-100 h-20" required />
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="Expected tools (comma-separated)" value={form.expected_tools} onChange={e => setForm({...form, expected_tools: e.target.value})}
                className="bg-hive-900 border border-hive-600 rounded-lg px-3 py-2 text-sm text-hive-100" />
              <input placeholder="Expected keywords (comma-separated)" value={form.expected_keywords} onChange={e => setForm({...form, expected_keywords: e.target.value})}
                className="bg-hive-900 border border-hive-600 rounded-lg px-3 py-2 text-sm text-hive-100" />
            </div>
            <button type="submit" className="text-xs px-4 py-2 rounded-lg bg-honey/20 text-honey hover:bg-honey/30">Create</button>
          </form>
        )}

        <div className="divide-y divide-hive-700/50">
          {cases.map(c => {
            const latest = latestByCase[c.id]
            const agent = (agents || []).find(a => a.id === c.agent_id)
            let tools = []
            try { tools = JSON.parse(c.expected_tools || '[]') } catch {}
            let actualTools = []
            try { actualTools = JSON.parse(latest?.actual_tools || '[]') } catch {}

            return (
              <div key={c.id} className="p-4 hover:bg-hive-700/20">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span>{agent?.avatar || '🤖'}</span>
                    <span className="font-medium text-hive-100 text-sm">{c.name}</span>
                    {latest && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[latest.status] || ''}`}>
                        {latest.status} {latest.score ? `(${Math.round(latest.score * 100)}%)` : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => runOne(c.id)} className="text-xs px-2 py-1 rounded bg-hive-700 text-hive-300 hover:bg-hive-600">▶ Run</button>
                    <button onClick={async () => { await api.deleteEvalCase(c.id); load() }} className="text-xs text-red-500 hover:text-red-400">✕</button>
                  </div>
                </div>
                <p className="text-xs text-hive-400 mb-2 line-clamp-2">{c.input_prompt}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-hive-500">Expected:</span>
                  {tools.map(t => <span key={t} className={`text-xs px-1.5 py-0.5 rounded ${actualTools.includes(t) ? 'bg-green-900/30 text-green-400' : 'bg-hive-700 text-hive-400'}`}>{t}</span>)}
                  {latest?.actual_tools && (
                    <>
                      <span className="text-xs text-hive-500 ml-2">Actual:</span>
                      {actualTools.map(t => <span key={t} className={`text-xs px-1.5 py-0.5 rounded ${tools.includes(t) ? 'bg-green-900/30 text-green-400' : 'bg-blue-900/30 text-blue-400'}`}>{t}</span>)}
                    </>
                  )}
                </div>
                {latest?.failure_reason && (
                  <p className="text-xs text-red-400 mt-1">{latest.failure_reason}</p>
                )}
                {latest?.cost > 0 && (
                  <p className="text-xs text-hive-500 mt-1">${latest.cost.toFixed(4)} &middot; {latest.duration_ms ? `${(latest.duration_ms / 1000).toFixed(1)}s` : ''}</p>
                )}
              </div>
            )
          })}
          {cases.length === 0 && (
            <div className="p-8 text-center text-hive-400 text-sm">No eval cases. Click "+ Add Case" to create one.</div>
          )}
        </div>
      </div>
    </div>
  )
}
