import { useState, useEffect } from 'react'
import { api } from '../lib/api'

const thinBorder = { border: '0.5px solid rgba(0,0,0,0.08)' }

export default function SmokeTestPanel({ inline }) {
  const [status, setStatus] = useState(null)
  const [runs, setRuns] = useState([])
  const [selectedRun, setSelectedRun] = useState(null)
  const [runDetail, setRunDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)

  const loadData = async () => {
    try {
      const [s, r] = await Promise.all([api.getSmokeTestStatus(), api.getSmokeTestRuns(20)])
      setStatus(s)
      setRuns(Array.isArray(r) ? r : [])
      // Auto-select latest run
      if (r?.length && !selectedRun) {
        const latest = r[0]
        setSelectedRun(latest.id)
        const detail = await api.getSmokeTestRun(latest.id)
        setRunDetail(detail)
      }
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { loadData() }, [])

  const handleRunNow = async () => {
    setRunning(true)
    try {
      const result = await api.runSmokeTest()
      setSelectedRun(result.runId)
      await loadData()
      const detail = await api.getSmokeTestRun(result.runId)
      setRunDetail(detail)
    } catch {} finally { setRunning(false) }
  }

  const handleSelectRun = async (runId) => {
    setSelectedRun(runId)
    try {
      const detail = await api.getSmokeTestRun(runId)
      setRunDetail(detail)
    } catch {}
  }

  const passRate = status?.uptimePercent ?? 100
  const passColor = passRate >= 95 ? 'rgba(52,199,89,0.9)' : passRate >= 80 ? 'rgba(255,159,10,0.9)' : 'rgba(255,59,48,0.9)'

  return (
    <div className="h-full flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between p-5" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm" style={{ ...thinBorder, background: 'rgba(239,68,68,0.08)', color: '#ef4444' }}>&#x1F6E1;</div>
          <div>
            <h2 className="font-display text-lg tracking-wider text-t1">SMOKE TESTS</h2>
            <p className="text-xs text-t3">Ember production health monitor</p>
          </div>
        </div>
        <button onClick={handleRunNow} disabled={running}
          className="px-4 py-2 rounded-lg text-xs font-medium"
          style={{ background: running ? 'rgba(0,0,0,0.04)' : 'rgba(239,68,68,0.08)', color: running ? '#999' : '#ef4444', ...thinBorder }}>
          {running ? 'Running...' : 'Run Now'}
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-t3 text-sm">Loading...</div>
      ) : (
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard label="Uptime (24h)" value={`${passRate}%`} color={passColor} />
            <SummaryCard label="Runs (24h)" value={status?.runsLast24h || 0} />
            <SummaryCard label="Avg Response" value={`${status?.avgResponseTime || 0}ms`} />
            <SummaryCard label="Last Run" value={status?.latest ? (status.latest.failed > 0 ? `${status.latest.failed} failed` : 'All passed') : 'None'}
              color={status?.latest?.failed > 0 ? 'rgba(255,59,48,0.9)' : 'rgba(52,199,89,0.9)'} />
          </div>

          {/* Test results for selected run */}
          {runDetail?.tests?.length > 0 && (
            <div>
              <div className="text-xs text-t3 mb-2 font-medium">
                Test Results — {new Date(runDetail.created_at).toLocaleString()}
                <span className="ml-2" style={{ color: runDetail.failed > 0 ? 'rgba(255,59,48,0.9)' : 'rgba(52,199,89,0.9)' }}>
                  {runDetail.passed}/{runDetail.total} passed
                </span>
              </div>
              <div className="rounded-xl overflow-hidden" style={thinBorder}>
                {runDetail.tests.map((test, i) => (
                  <div key={test.id} className="flex items-center gap-3 px-4 py-3 text-sm"
                    style={{ borderTop: i > 0 ? '0.5px solid rgba(0,0,0,0.06)' : 'none', background: test.passed ? 'transparent' : 'rgba(255,59,48,0.03)' }}>
                    <div className="w-5 text-center">{test.passed ? '✓' : '✗'}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-t1 truncate">{test.test_name}</div>
                      <div className="text-xs text-t3 truncate">{test.url}</div>
                      {test.error && <div className="text-xs mt-0.5" style={{ color: 'rgba(255,59,48,0.8)' }}>{test.error}</div>}
                    </div>
                    <div className="text-xs text-t3 tabular-nums">{test.response_time_ms}ms</div>
                    <div className="text-xs font-mono px-2 py-0.5 rounded-md"
                      style={{ background: test.passed ? 'rgba(52,199,89,0.1)' : 'rgba(255,59,48,0.1)', color: test.passed ? 'rgba(52,199,89,0.9)' : 'rgba(255,59,48,0.9)' }}>
                      {test.actual_status || 'ERR'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Run history */}
          {runs.length > 0 && (
            <div>
              <div className="text-xs text-t3 mb-2 font-medium">History</div>
              <div className="rounded-xl overflow-hidden" style={thinBorder}>
                {runs.map((run, i) => (
                  <div key={run.id}
                    onClick={() => handleSelectRun(run.id)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer hover:bg-s2"
                    style={{ borderTop: i > 0 ? '0.5px solid rgba(0,0,0,0.06)' : 'none', background: selectedRun === run.id ? 'rgba(0,0,0,0.03)' : 'transparent' }}>
                    <div className="w-2 h-2 rounded-full" style={{ background: run.failed > 0 ? 'rgba(255,59,48,0.8)' : 'rgba(52,199,89,0.8)' }} />
                    <div className="flex-1 text-t2">{new Date(run.created_at).toLocaleString()}</div>
                    <div className="text-xs text-t3">{run.passed}/{run.total}</div>
                    <div className="text-xs text-t3">{run.duration_ms}ms</div>
                    <div className="text-[10px] px-1.5 py-0.5 rounded text-t3" style={{ background: 'rgba(0,0,0,0.04)' }}>{run.trigger}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, color }) {
  return (
    <div className="rounded-xl p-3" style={thinBorder}>
      <div className="text-[10px] text-t3 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-lg font-semibold" style={{ color: color || 'var(--color-t1)' }}>{value}</div>
    </div>
  )
}
