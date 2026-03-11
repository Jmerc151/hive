import { useState, useEffect } from 'react'
import { api } from '../lib/api'

export default function PipelineBuilder({ agents, onClose }) {
  const [pipelines, setPipelines] = useState([])
  const [editing, setEditing] = useState(null) // null = list, object = editing
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [steps, setSteps] = useState([])
  const [running, setRunning] = useState(null)

  const refresh = () => api.getPipelines().then(setPipelines).catch(() => {})
  useEffect(() => { refresh() }, [])

  const startNew = () => {
    setEditing('new')
    setName('')
    setDescription('')
    setSteps([{ agent_id: agents[0]?.id || '', prompt_template: '', position: 1 }])
  }

  const editPipeline = (p) => {
    setEditing(p.id)
    setName(p.name)
    setDescription(p.description || '')
    setSteps(p.steps.sort((a, b) => a.position - b.position))
  }

  const addStep = () => {
    setSteps([...steps, { agent_id: agents[0]?.id || '', prompt_template: '', position: steps.length + 1 }])
  }

  const removeStep = (i) => {
    const updated = steps.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, position: idx + 1 }))
    setSteps(updated)
  }

  const updateStep = (i, field, value) => {
    const updated = [...steps]
    updated[i] = { ...updated[i], [field]: value }
    setSteps(updated)
  }

  const handleSave = async () => {
    if (!name.trim() || steps.length === 0) return
    const data = { name: name.trim(), description: description.trim(), steps }
    if (editing === 'new') {
      await api.createPipeline(data)
    } else {
      await api.updatePipeline(editing, data)
    }
    setEditing(null)
    refresh()
  }

  const handleRun = async (id) => {
    setRunning(id)
    try {
      await api.runPipeline(id)
    } catch (e) { alert(e.message) }
    setRunning(null)
  }

  const handleDelete = async (id) => {
    await api.deletePipeline(id)
    refresh()
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-hive-800 border border-hive-700 rounded-xl w-full max-w-2xl shadow-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="p-5 border-b border-hive-700 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔗</span>
            <h2 className="text-lg font-semibold">{editing ? (editing === 'new' ? 'New Pipeline' : 'Edit Pipeline') : 'Pipelines'}</h2>
          </div>
          <div className="flex gap-2">
            {editing && <button onClick={() => setEditing(null)} className="text-sm text-hive-400 hover:text-hive-200">Back</button>}
            <button onClick={onClose} className="text-hive-400 hover:text-hive-200 text-xl">&times;</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {!editing ? (
            /* Pipeline List */
            <div className="space-y-3">
              <button onClick={startNew} className="w-full p-3 border border-dashed border-hive-600 rounded-lg text-sm text-hive-400 hover:border-honey/50 hover:text-honey transition-all">
                + Create Pipeline
              </button>
              {pipelines.map(p => (
                <div key={p.id} className="p-4 bg-hive-700/30 rounded-lg border border-hive-700">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="font-medium text-sm text-hive-100">{p.name}</h3>
                      {p.description && <p className="text-xs text-hive-400 mt-0.5">{p.description}</p>}
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => handleRun(p.id)} disabled={running === p.id}
                        className="px-3 py-1 bg-honey text-white rounded text-xs font-medium hover:bg-honey-dim transition-colors disabled:opacity-50">
                        {running === p.id ? 'Starting...' : '▶ Run'}
                      </button>
                      <button onClick={() => editPipeline(p)} className="px-2 py-1 text-xs text-hive-400 hover:text-hive-200">Edit</button>
                      <button onClick={() => handleDelete(p.id)} className="px-2 py-1 text-xs text-red-400 hover:text-red-300">Del</button>
                    </div>
                  </div>
                  {/* Steps preview */}
                  <div className="flex items-center gap-1 flex-wrap">
                    {p.steps.sort((a, b) => a.position - b.position).map((s, i) => {
                      const agent = agents.find(a => a.id === s.agent_id)
                      return (
                        <div key={i} className="flex items-center gap-1">
                          {i > 0 && <span className="text-hive-600 text-xs">→</span>}
                          <span className="text-xs px-2 py-0.5 bg-hive-700 rounded-full flex items-center gap-1">
                            <span>{agent?.avatar || '🤖'}</span>
                            <span className="text-hive-300">{agent?.name || s.agent_id}</span>
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
              {pipelines.length === 0 && (
                <div className="text-center text-hive-500 py-8 text-sm">No pipelines yet. Create one to chain agents together.</div>
              )}
            </div>
          ) : (
            /* Pipeline Editor */
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-hive-300 mb-1.5">Pipeline Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Research → Write → Publish"
                  className="w-full bg-hive-900 border border-hive-600 rounded-lg px-3 py-2.5 text-sm text-hive-100 placeholder:text-hive-500 focus:outline-none focus:ring-2 focus:ring-honey/50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-hive-300 mb-1.5">Description</label>
                <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="What does this pipeline do?"
                  className="w-full bg-hive-900 border border-hive-600 rounded-lg px-3 py-2.5 text-sm text-hive-100 placeholder:text-hive-500 focus:outline-none focus:ring-2 focus:ring-honey/50" />
              </div>

              <div>
                <label className="block text-sm font-medium text-hive-300 mb-2">Steps</label>
                <div className="space-y-3">
                  {steps.map((step, i) => {
                    const agent = agents.find(a => a.id === step.agent_id)
                    return (
                      <div key={i} className="p-3 bg-hive-700/30 rounded-lg border border-hive-700 relative">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-bold text-hive-500 w-6">#{step.position}</span>
                          <select value={step.agent_id} onChange={e => updateStep(i, 'agent_id', e.target.value)}
                            className="flex-1 bg-hive-900 border border-hive-600 rounded-lg px-2 py-1.5 text-sm text-hive-100 focus:outline-none">
                            {agents.map(a => <option key={a.id} value={a.id}>{a.avatar} {a.name} — {a.role}</option>)}
                          </select>
                          {steps.length > 1 && (
                            <button onClick={() => removeStep(i)} className="text-xs text-red-400 hover:text-red-300">Remove</button>
                          )}
                        </div>
                        <textarea value={step.prompt_template} onChange={e => updateStep(i, 'prompt_template', e.target.value)}
                          placeholder={`Instructions for ${agent?.name || 'agent'}... Use {{previous_output}} to inject the previous step's output.`}
                          rows={3}
                          className="w-full bg-hive-900 border border-hive-600 rounded-lg px-3 py-2 text-sm text-hive-100 placeholder:text-hive-500 focus:outline-none focus:ring-2 focus:ring-honey/50 resize-none" />
                      </div>
                    )
                  })}
                </div>
                <button onClick={addStep} className="mt-2 w-full p-2 border border-dashed border-hive-600 rounded-lg text-xs text-hive-400 hover:border-hive-500 hover:text-hive-300">
                  + Add Step
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {editing && (
          <div className="p-4 border-t border-hive-700 flex justify-end gap-2 shrink-0">
            <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm text-hive-400 hover:text-hive-200">Cancel</button>
            <button onClick={handleSave} disabled={!name.trim() || steps.length === 0}
              className="px-5 py-2 bg-gradient-to-r from-honey to-honey-dim text-white rounded-lg font-medium text-sm hover:opacity-90 disabled:opacity-40">
              {editing === 'new' ? 'Create Pipeline' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
