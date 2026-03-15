import { useState, useEffect } from 'react'
import { api } from '../lib/api'

const STATUS_COLORS = {
  passed: 'text-success',
  failed: 'text-danger',
  running: 'text-yellow-600',
  pending: 'text-t3',
}

const STATUS_BG = {
  passed: 'rgba(52,199,89,0.1)',
  failed: 'rgba(255,59,48,0.1)',
  running: 'rgba(255,204,0,0.1)',
  pending: 'rgba(0,0,0,0.04)',
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

  const latestByCase = {}
  for (const r of history) {
    if (!latestByCase[r.eval_case_id] || r.created_at > latestByCase[r.eval_case_id].created_at) {
      latestByCase[r.eval_case_id] = r
    }
  }

  const passRate = cases.length === 0 ? 0 : Math.round(cases.filter(c => latestByCase[c.id]?.status === 'passed').length / cases.length * 100)

  return (
    <div className="fixed inset-0 bg-black/20 z-50 flex items-start justify-center pt-8 overflow-y-auto">
      <div className="bg-s1 rounded-xl w-full max-w-4xl mx-4 mb-8" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
        <div className="flex items-center justify-between p-4" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">🧪</span>
            <h2 className="text-lg font-bold font-display text-t1">Eval Harness</h2>
            <span className="text-sm px-2 py-0.5 rounded-full" style={{ background: passRate >= 70 ? 'rgba(52,199,89,0.1)' : 'rgba(255,59,48,0.1)', color: passRate >= 70 ? 'rgb(52,199,89)' : 'rgb(255,59,48)' }}>
              {passRate}% pass rate
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowCreate(!showCreate)} className="text-xs px-3 py-1.5 rounded-lg bg-s3 text-t1 hover:bg-s3">
              + Add Case
            </button>
            <button onClick={runAll} disabled={running} className="text-xs px-3 py-1.5 rounded-lg bg-t1 text-white hover:opacity-80 disabled:opacity-50">
              {running ? '⏳ Running...' : '▶ Run All'}
            </button>
            <button onClick={onClose} className="text-t3 hover:text-t1 text-xl ml-2">&times;</button>
          </div>
        </div>

        {showCreate && (
          <form onSubmit={handleCreate} className="p-4 space-y-3" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="Test name" value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                className="bg-s2 rounded-lg px-3 py-2 text-sm text-t1" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }} required />
              <select value={form.agent_id} onChange={e => setForm({...form, agent_id: e.target.value})}
                className="bg-s2 rounded-lg px-3 py-2 text-sm text-t1" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
                {(agents || []).map(a => <option key={a.id} value={a.id}>{a.avatar} {a.name}</option>)}
              </select>
            </div>
            <textarea placeholder="Input prompt for the agent" value={form.input_prompt} onChange={e => setForm({...form, input_prompt: e.target.value})}
              className="w-full bg-s2 rounded-lg px-3 py-2 text-sm text-t1 h-20" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }} required />
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="Expected tools (comma-separated)" value={form.expected_tools} onChange={e => setForm({...form, expected_tools: e.target.value})}
                className="bg-s2 rounded-lg px-3 py-2 text-sm text-t1" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }} />
              <input placeholder="Expected keywords (comma-separated)" value={form.expected_keywords} onChange={e => setForm({...form, expected_keywords: e.target.value})}
                className="bg-s2 rounded-lg px-3 py-2 text-sm text-t1" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }} />
            </div>
            <button type="submit" className="text-xs px-4 py-2 rounded-lg bg-t1 text-white hover:opacity-80">Create</button>
          </form>
        )}

        <div>
          {cases.map(c => {
            const latest = latestByCase[c.id]
            const agent = (agents || []).find(a => a.id === c.agent_id)
            let tools = []
            try { tools = JSON.parse(c.expected_tools || '[]') } catch {}
            let actualTools = []
            try { actualTools = JSON.parse(latest?.actual_tools || '[]') } catch {}

            return (
              <div key={c.id} className="p-4 hover:bg-s2" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.04)' }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span>{agent?.avatar || '🤖'}</span>
                    <span className="font-medium text-t1 text-sm">{c.name}</span>
                    {latest && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[latest.status] || ''}`} style={{ background: STATUS_BG[latest.status] || 'transparent' }}>
                        {latest.status} {latest.score ? `(${Math.round(latest.score * 100)}%)` : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => runOne(c.id)} className="text-xs px-2 py-1 rounded bg-s3 text-t2 hover:bg-s3">▶ Run</button>
                    <button onClick={async () => { await api.deleteEvalCase(c.id); load() }} className="text-xs text-danger hover:opacity-80">✕</button>
                  </div>
                </div>
                <p className="text-xs text-t3 mb-2 line-clamp-2">{c.input_prompt}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-t4">Expected:</span>
                  {tools.map(t => <span key={t} className={`text-xs px-1.5 py-0.5 rounded`} style={{ background: actualTools.includes(t) ? 'rgba(52,199,89,0.1)' : 'rgba(0,0,0,0.04)', color: actualTools.includes(t) ? 'rgb(52,199,89)' : undefined }}>{t}</span>)}
                  {latest?.actual_tools && (
                    <>
                      <span className="text-xs text-t4 ml-2">Actual:</span>
                      {actualTools.map(t => <span key={t} className={`text-xs px-1.5 py-0.5 rounded`} style={{ background: tools.includes(t) ? 'rgba(52,199,89,0.1)' : 'rgba(59,130,246,0.1)', color: tools.includes(t) ? 'rgb(52,199,89)' : 'rgb(59,130,246)' }}>{t}</span>)}
                    </>
                  )}
                </div>
                {latest?.failure_reason && (
                  <p className="text-xs text-danger mt-1">{latest.failure_reason}</p>
                )}
                {latest?.cost > 0 && (
                  <p className="text-xs text-t4 mt-1">${latest.cost.toFixed(4)} &middot; {latest.duration_ms ? `${(latest.duration_ms / 1000).toFixed(1)}s` : ''}</p>
                )}
              </div>
            )
          })}
          {cases.length === 0 && (
            <div className="p-8 text-center text-t3 text-sm">No eval cases. Click "+ Add Case" to create one.</div>
          )}
        </div>
      </div>
    </div>
  )
}
