import { useState, useEffect } from 'react'
import { api } from '../lib/api'

export default function PromptReviewModal({ task, agent, onRun, onClose }) {
  const [original, setOriginal] = useState('')
  const [optimized, setOptimized] = useState('')
  const [edited, setEdited] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!task) return
    setLoading(true)
    setError(null)
    api.optimizePrompt(task.id)
      .then(data => {
        setOriginal(data.original)
        setOptimized(data.optimized)
        setEdited(data.optimized)
        setLoading(false)
      })
      .catch(err => {
        setOriginal(task.description || '')
        setError(err.message)
        setLoading(false)
      })
  }, [task?.id])

  const isEdited = edited !== optimized
  const hasChanges = edited !== original

  const handleRun = async (useOptimized) => {
    const finalDescription = useOptimized ? edited : original
    if (finalDescription !== original) {
      await api.updateTask(task.id, { description: finalDescription })
    }
    onRun(task.id)
    onClose()
  }

  if (!task) return null

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-s1 border border-s4 rounded-xl w-full max-w-3xl shadow-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="p-5 border-b border-s4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-nexus/15 flex items-center justify-center">
              <span className="text-base">🧬</span>
            </div>
            <div>
              <h2 className="text-lg font-semibold">Optimize Prompt</h2>
              <p className="text-xs text-t3">Nexus rewrites for clarity before {agent?.name || 'the agent'} runs</p>
            </div>
          </div>
          <button onClick={onClose} className="text-t3 hover:text-t1 text-xl">&times;</button>
        </div>

        {/* Task title */}
        <div className="px-5 pt-4 pb-2 shrink-0">
          <div className="flex items-center gap-2">
            {agent && <span className="text-lg">{agent.avatar}</span>}
            <span className="font-medium text-sm">{task.title}</span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-10 h-10 rounded-full border-2 border-s4 border-t-nexus animate-spin" />
              <p className="text-sm text-t3">Nexus is optimizing the prompt...</p>
            </div>
          ) : error ? (
            <div className="space-y-4 pt-2">
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-danger">
                Optimization failed: {error}
              </div>
              <div>
                <h3 className="text-sm font-medium text-t2 mb-2">Original Prompt</h3>
                <div className="bg-page border border-s4 rounded-lg p-4 text-sm text-t1 whitespace-pre-wrap">
                  {original || 'No description provided.'}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              {/* Original */}
              <div>
                <h3 className="text-sm font-medium text-t4 mb-2">Original</h3>
                <div className="bg-page/50 border border-s4 rounded-lg p-4 text-sm text-t3 whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {original || 'No description provided.'}
                </div>
              </div>

              {/* Optimized (editable) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-nexus">
                    Optimized by Nexus
                    {isEdited && <span className="ml-2 text-t1 text-xs">(edited)</span>}
                  </h3>
                  {isEdited && (
                    <button
                      onClick={() => setEdited(optimized)}
                      className="text-xs text-t4 hover:text-t2 transition-colors"
                    >
                      Reset
                    </button>
                  )}
                </div>
                <textarea
                  value={edited}
                  onChange={e => setEdited(e.target.value)}
                  rows={8}
                  className="w-full bg-page border border-nexus/30 rounded-lg p-4 text-sm text-t1 focus:outline-none focus:ring-2 focus:ring-nexus/50 focus:border-nexus resize-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-s4 flex items-center justify-between shrink-0">
          <button
            onClick={() => handleRun(false)}
            className="text-sm text-t3 hover:text-t1 transition-colors"
          >
            Skip — Run Original
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-t3 hover:text-t1 transition-colors"
            >
              Cancel
            </button>
            {!loading && !error && (
              <button
                onClick={() => handleRun(true)}
                className="px-5 py-2 bg-gradient-to-r from-honey to-honey-dim text-white rounded-lg font-medium text-sm hover:opacity-90 transition-all flex items-center gap-1.5"
              >
                {isEdited ? '▶ Run Edited Prompt' : hasChanges ? '▶ Run Optimized' : '▶ Run'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
