import { useState, useEffect } from 'react'
import { api } from '../lib/api'

const SCORE_COLOR = (n) => n >= 7 ? 'text-green-400' : n >= 4 ? 'text-yellow-400' : 'text-red-400'
const WINNER_BADGE = { current: 'bg-blue-900/30 text-blue-400', modified: 'bg-green-900/30 text-green-400', tie: 'bg-hive-700 text-hive-300' }

export default function AgentSandbox({ agents, onClose }) {
  const [agentId, setAgentId] = useState(agents?.[0]?.id || 'scout')
  const [taskDesc, setTaskDesc] = useState('')
  const [modifiedPrompt, setModifiedPrompt] = useState('')
  const [promptLoading, setPromptLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [maxSteps, setMaxSteps] = useState(3)

  // Load agent's current prompt when agent changes
  useEffect(() => {
    if (!agentId) return
    setPromptLoading(true)
    api.getAgentPrompt(agentId)
      .then(data => setModifiedPrompt(data.systemPrompt || ''))
      .catch(() => setModifiedPrompt(''))
      .finally(() => setPromptLoading(false))
  }, [agentId])

  async function runComparison() {
    if (!taskDesc.trim()) return
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const data = await api.runSandbox({
        agent_id: agentId,
        task_description: taskDesc.trim(),
        modified_prompt: modifiedPrompt.trim() || undefined,
        max_steps: maxSteps,
      })
      setResult(data)
    } catch (e) {
      setError(e.message || 'Sandbox run failed')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-8 overflow-y-auto">
      <div className="bg-hive-800 border border-hive-700 rounded-xl w-full max-w-6xl mx-4 mb-8">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-hive-700">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🧫</span>
            <h2 className="text-lg font-bold text-hive-100">Agent Sandbox</h2>
            <span className="text-xs text-hive-400">Test prompt changes before deploying</span>
          </div>
          <button onClick={onClose} className="text-hive-400 hover:text-hive-200 text-xl">&times;</button>
        </div>

        {/* Config */}
        <div className="p-4 border-b border-hive-700 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-shrink-0">
              <label className="text-xs text-hive-400 mb-1 block">Agent</label>
              <select
                value={agentId}
                onChange={e => setAgentId(e.target.value)}
                className="bg-hive-900 border border-hive-600 rounded-lg px-3 py-2 text-sm text-hive-100 w-full sm:w-40"
              >
                {(agents || []).map(a => (
                  <option key={a.id} value={a.id}>{a.avatar} {a.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-hive-400 mb-1 block">Task Description</label>
              <textarea
                value={taskDesc}
                onChange={e => setTaskDesc(e.target.value)}
                placeholder="Describe the task to test (e.g. 'Research Telegram bot monetization strategies')"
                className="bg-hive-900 border border-hive-600 rounded-lg px-3 py-2 text-sm text-hive-100 w-full h-20 resize-none"
              />
            </div>
            <div className="flex-shrink-0">
              <label className="text-xs text-hive-400 mb-1 block">Max Steps</label>
              <select
                value={maxSteps}
                onChange={e => setMaxSteps(Number(e.target.value))}
                className="bg-hive-900 border border-hive-600 rounded-lg px-3 py-2 text-sm text-hive-100 w-full sm:w-20"
              >
                {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-hive-400 mb-1 block">Modified System Prompt (edit below to test changes)</label>
            {promptLoading ? (
              <div className="bg-hive-900 border border-hive-600 rounded-lg px-3 py-4 text-sm text-hive-500 text-center">Loading prompt...</div>
            ) : (
              <textarea
                value={modifiedPrompt}
                onChange={e => setModifiedPrompt(e.target.value)}
                className="bg-hive-900 border border-hive-600 rounded-lg px-3 py-2 text-sm text-hive-100 w-full h-40 resize-y font-mono text-xs"
                placeholder="Agent's system prompt will appear here..."
              />
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={runComparison}
              disabled={running || !taskDesc.trim()}
              className="px-4 py-2 rounded-lg bg-honey/20 text-honey font-medium text-sm hover:bg-honey/30 disabled:opacity-50 transition-colors"
            >
              {running ? '⏳ Running comparison...' : '▶ Run Comparison'}
            </button>
            {running && (
              <span className="text-xs text-hive-400 animate-pulse">
                This may take 30-60 seconds. Both prompts run in parallel.
              </span>
            )}
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-900/20 border border-red-800/30 rounded-lg px-3 py-2">{error}</div>
          )}
        </div>

        {/* Results */}
        {result && (
          <div className="p-4 space-y-4">
            {/* Scoring card */}
            {result.scoring && (
              <div className="bg-hive-900/50 border border-hive-700 rounded-xl p-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-3">
                  <h3 className="text-sm font-semibold text-hive-200">Quality Scoring</h3>
                  {result.scoring.winner && (
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${WINNER_BADGE[result.scoring.winner] || WINNER_BADGE.tie}`}>
                      Winner: {result.scoring.winner === 'tie' ? 'Tie' : result.scoring.winner === 'current' ? 'Current Prompt' : 'Modified Prompt'}
                    </span>
                  )}
                </div>
                {result.scoring.reason && (
                  <p className="text-xs text-hive-400 mb-3">{result.scoring.reason}</p>
                )}
                <div className="grid grid-cols-2 gap-4">
                  {['current', 'modified'].map(side => (
                    <div key={side}>
                      <div className="text-xs font-medium text-hive-400 mb-2 uppercase">{side === 'current' ? 'Current Prompt' : 'Modified Prompt'}</div>
                      <div className="flex gap-4">
                        {['tool_usage', 'relevance', 'actionability'].map(dim => (
                          <div key={dim} className="text-center">
                            <div className={`text-lg font-bold ${SCORE_COLOR(result.scoring[side]?.[dim] || 0)}`}>
                              {result.scoring[side]?.[dim] || '-'}
                            </div>
                            <div className="text-[10px] text-hive-500 capitalize">{dim.replace('_', ' ')}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Side-by-side outputs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[result.current, result.modified].map((run, i) => (
                <div key={i} className="bg-hive-900/50 border border-hive-700 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between p-3 border-b border-hive-700">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${i === 0 ? 'bg-blue-400' : 'bg-green-400'}`} />
                      <h4 className="text-sm font-semibold text-hive-200">
                        {i === 0 ? 'Current Prompt' : 'Modified Prompt'}
                      </h4>
                      {result.scoring?.winner === run?.label && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-honey/20 text-honey">WINNER</span>
                      )}
                    </div>
                    {run?.error && <span className="text-xs text-red-400">Error</span>}
                  </div>

                  {/* Metrics */}
                  <div className="flex gap-3 p-3 border-b border-hive-700/50 overflow-x-auto">
                    {[
                      { label: 'Tokens', value: run?.tokens?.toLocaleString() || '0' },
                      { label: 'Cost', value: `$${(run?.cost || 0).toFixed(4)}` },
                      { label: 'Duration', value: `${((run?.duration_ms || 0) / 1000).toFixed(1)}s` },
                      { label: 'Tools', value: (run?.tools_used || []).length },
                    ].map(m => (
                      <div key={m.label} className="flex-shrink-0 text-center">
                        <div className="text-sm font-semibold text-hive-100">{m.value}</div>
                        <div className="text-[10px] text-hive-500">{m.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Tools used */}
                  {run?.tools_used?.length > 0 && (
                    <div className="px-3 py-2 border-b border-hive-700/50 flex flex-wrap gap-1">
                      {run.tools_used.map((t, j) => (
                        <span key={j} className="text-[10px] px-1.5 py-0.5 rounded bg-hive-700 text-hive-300 font-mono">{t}</span>
                      ))}
                    </div>
                  )}

                  {/* Output */}
                  <div className="p-3 max-h-80 overflow-y-auto">
                    {run?.error ? (
                      <div className="text-sm text-red-400">{run.error}</div>
                    ) : (
                      <pre className="text-xs text-hive-300 whitespace-pre-wrap break-words font-mono leading-relaxed">
                        {run?.output || 'No output'}
                      </pre>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!result && !running && (
          <div className="p-12 text-center text-hive-500">
            <div className="text-4xl mb-3">🧫</div>
            <p className="text-sm">Configure a task and modify the system prompt above, then run a comparison.</p>
            <p className="text-xs mt-1">Both prompts execute in parallel with the same task. Results are scored by AI.</p>
          </div>
        )}

        {running && (
          <div className="p-12 text-center">
            <div className="text-4xl mb-3 animate-bounce">🧫</div>
            <p className="text-sm text-hive-300">Running both prompts in parallel...</p>
            <p className="text-xs text-hive-500 mt-1">This typically takes 30-60 seconds depending on the task complexity.</p>
            <div className="mt-4 flex justify-center">
              <div className="w-48 h-1.5 bg-hive-700 rounded-full overflow-hidden">
                <div className="h-full bg-honey rounded-full animate-pulse" style={{ width: '60%' }} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
