import { useState } from 'react'
import { api } from '../lib/api'

export default function ABTestPanel({ task, agent, onClose }) {
  const [promptA, setPromptA] = useState(task?.description || '')
  const [promptB, setPromptB] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleTest = async () => {
    if (!promptA.trim() || !promptB.trim()) return
    setLoading(true)
    try {
      const data = await api.abTest(task.id, { promptA: promptA.trim(), promptB: promptB.trim() })
      setResults(data)
    } catch (err) {
      alert(err.message)
    }
    setLoading(false)
  }

  if (!task) return null

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-s1 border border-s4 rounded-xl w-full max-w-3xl shadow-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="p-5 border-b border-s4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔬</span>
            <div>
              <h2 className="text-lg font-semibold">A/B Prompt Test</h2>
              <p className="text-xs text-t3">{task.title} · {agent?.name || task.agent_id}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-t3 hover:text-t1 text-xl">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!results ? (
            <>
              {/* Prompt inputs */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-blue-400 mb-1.5">Prompt A (Original)</label>
                  <textarea value={promptA} onChange={e => setPromptA(e.target.value)} rows={8}
                    className="w-full bg-page border border-blue-500/30 rounded-lg px-3 py-2.5 text-sm text-t1 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-orange-400 mb-1.5">Prompt B (Alternative)</label>
                  <textarea value={promptB} onChange={e => setPromptB(e.target.value)} rows={8} placeholder="Write an alternative prompt to compare..."
                    className="w-full bg-page border border-orange-500/30 rounded-lg px-3 py-2.5 text-sm text-t1 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none" />
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Results */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-blue-400">Output A</span>
                    <span className="text-xs text-t4 font-mono">{results.promptA.tokens} tok</span>
                  </div>
                  <div className="bg-page border border-blue-500/20 rounded-lg p-3 text-xs text-t1 whitespace-pre-wrap max-h-64 overflow-y-auto font-mono">
                    {results.promptA.output}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-orange-400">Output B</span>
                    <span className="text-xs text-t4 font-mono">{results.promptB.tokens} tok</span>
                  </div>
                  <div className="bg-page border border-orange-500/20 rounded-lg p-3 text-xs text-t1 whitespace-pre-wrap max-h-64 overflow-y-auto font-mono">
                    {results.promptB.output}
                  </div>
                </div>
              </div>

              {/* Token comparison */}
              <div className="flex items-center gap-3 p-3 bg-s3 rounded-lg text-xs text-t3">
                <span>A: {results.promptA.tokens} tokens</span>
                <span>vs</span>
                <span>B: {results.promptB.tokens} tokens</span>
                <span className="ml-auto">
                  {results.promptA.tokens < results.promptB.tokens ? '🏆 A is more efficient' : results.promptB.tokens < results.promptA.tokens ? '🏆 B is more efficient' : 'Same token count'}
                </span>
              </div>

              <button onClick={() => setResults(null)} className="text-sm text-t3 hover:text-t1">
                ← Test Again
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-s4 flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-t3 hover:text-t1">Close</button>
          {!results && (
            <button onClick={handleTest} disabled={loading || !promptA.trim() || !promptB.trim()}
              className="px-5 py-2 bg-gradient-to-r from-honey to-honey-dim text-white rounded-lg font-medium text-sm hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5">
              {loading ? 'Testing...' : '🔬 Run A/B Test'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
