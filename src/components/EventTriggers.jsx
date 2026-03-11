import { useState, useEffect } from 'react'
import { api } from '../lib/api'

export default function EventTriggers({ agents, pipelines, onClose }) {
  const [triggers, setTriggers] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [actionType, setActionType] = useState('run_task')
  const [agentId, setAgentId] = useState('')
  const [promptTemplate, setPromptTemplate] = useState('')
  const [pipelineId, setPipelineId] = useState('')

  const refresh = () => api.getTriggers().then(setTriggers).catch(() => {})
  useEffect(() => { refresh() }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    const action = actionType === 'run_task'
      ? { type: 'run_task', agent_id: agentId, prompt_template: promptTemplate || 'Webhook triggered: {{payload}}', priority: 'medium' }
      : { type: 'run_pipeline', pipeline_id: pipelineId }
    await api.createTrigger({ name: name.trim(), type: 'webhook', config: {}, action })
    setName(''); setPromptTemplate(''); setShowForm(false)
    refresh()
  }

  const toggleEnabled = async (trigger) => {
    await api.updateTrigger(trigger.id, { enabled: !trigger.enabled })
    refresh()
  }

  const PORT = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-hive-800 border border-hive-700 rounded-xl w-full max-w-lg shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="p-5 border-b border-hive-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚡</span>
            <h2 className="text-lg font-semibold">Event Triggers</h2>
          </div>
          <button onClick={onClose} className="text-hive-400 hover:text-hive-200 text-xl">&times;</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Trigger List */}
          {triggers.map(t => (
            <div key={t.id} className="p-3 bg-hive-700/30 rounded-lg border border-hive-700">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${t.enabled ? 'bg-green-500' : 'bg-hive-500'}`} />
                  <span className="font-medium text-sm text-hive-100">{t.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-hive-700 rounded text-hive-400">{t.type}</span>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => toggleEnabled(t)} className="text-xs text-hive-400 hover:text-hive-200">
                    {t.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button onClick={async () => { await api.deleteTrigger(t.id); refresh() }} className="text-xs text-red-400 hover:text-red-300">Del</button>
                </div>
              </div>
              {/* Webhook URL */}
              <div className="bg-hive-900 rounded p-2 text-xs font-mono text-hive-400 break-all">
                POST {PORT}/api/webhooks/{t.id}
                {t.config?.secret && <span className="text-hive-500"> (secret: {t.config.secret})</span>}
              </div>
              {t.last_fired && <div className="text-[10px] text-hive-500 mt-1">Last fired: {new Date(t.last_fired).toLocaleString()}</div>}
            </div>
          ))}

          {triggers.length === 0 && !showForm && (
            <div className="text-center text-hive-500 py-6 text-sm">No triggers yet.</div>
          )}

          {/* Create Trigger */}
          <button onClick={() => setShowForm(!showForm)} className="w-full p-2.5 border border-dashed border-hive-600 rounded-lg text-sm text-hive-400 hover:border-honey/50 hover:text-honey transition-all">
            + New Trigger
          </button>

          {showForm && (
            <form onSubmit={handleCreate} className="space-y-3 p-3 bg-hive-700/30 rounded-lg border border-hive-700">
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Trigger name"
                className="w-full bg-hive-900 border border-hive-600 rounded-lg px-3 py-2 text-sm text-hive-100 placeholder:text-hive-500 focus:outline-none focus:ring-2 focus:ring-honey/50" />
              <div className="flex gap-2">
                <button type="button" onClick={() => setActionType('run_task')}
                  className={`flex-1 p-2 rounded-lg border text-xs ${actionType === 'run_task' ? 'border-honey bg-honey/10 text-honey' : 'border-hive-600 text-hive-400'}`}>
                  Run Task
                </button>
                <button type="button" onClick={() => setActionType('run_pipeline')}
                  className={`flex-1 p-2 rounded-lg border text-xs ${actionType === 'run_pipeline' ? 'border-honey bg-honey/10 text-honey' : 'border-hive-600 text-hive-400'}`}>
                  Run Pipeline
                </button>
              </div>
              {actionType === 'run_task' ? (
                <>
                  <select value={agentId} onChange={e => setAgentId(e.target.value)}
                    className="w-full bg-hive-900 border border-hive-600 rounded-lg px-3 py-2 text-sm text-hive-100 focus:outline-none">
                    <option value="">Select agent</option>
                    {agents?.map(a => <option key={a.id} value={a.id}>{a.avatar} {a.name}</option>)}
                  </select>
                  <textarea value={promptTemplate} onChange={e => setPromptTemplate(e.target.value)}
                    placeholder="Task prompt... Use {{payload}} for webhook data"
                    rows={3}
                    className="w-full bg-hive-900 border border-hive-600 rounded-lg px-3 py-2 text-sm text-hive-100 placeholder:text-hive-500 focus:outline-none resize-none" />
                </>
              ) : (
                <select value={pipelineId} onChange={e => setPipelineId(e.target.value)}
                  className="w-full bg-hive-900 border border-hive-600 rounded-lg px-3 py-2 text-sm text-hive-100 focus:outline-none">
                  <option value="">Select pipeline</option>
                  {pipelines?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
              <button type="submit" disabled={!name.trim()}
                className="w-full px-4 py-2 bg-honey text-white rounded-lg font-medium text-sm hover:bg-honey-dim transition-colors disabled:opacity-40">
                Create Trigger
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
