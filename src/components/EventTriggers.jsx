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
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-s1 rounded-xl w-full max-w-lg shadow-2xl max-h-[85vh] overflow-y-auto" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="p-5 flex items-center justify-between" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
          <div className="flex items-center gap-2">
            <span className="text-xl">⚡</span>
            <h2 className="text-lg font-semibold font-display">Event Triggers</h2>
          </div>
          <button onClick={onClose} className="text-t3 hover:text-t1 text-xl">&times;</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Trigger List */}
          {triggers.map(t => (
            <div key={t.id} className="p-3 bg-s2 rounded-lg" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${t.enabled ? 'bg-success' : 'bg-s4'}`} />
                  <span className="font-medium text-sm text-t1">{t.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-s3 rounded text-t3">{t.type}</span>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => toggleEnabled(t)} className="text-xs text-t3 hover:text-t1">
                    {t.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button onClick={async () => { await api.deleteTrigger(t.id); refresh() }} className="text-xs text-danger hover:opacity-80">Del</button>
                </div>
              </div>
              {/* Webhook URL */}
              <div className="bg-s2 rounded p-2 text-xs font-mono text-t3 break-all" style={{ border: '0.5px solid rgba(0,0,0,0.06)' }}>
                POST {PORT}/api/webhooks/{t.id}
                {t.config?.secret && <span className="text-t4"> (secret: {t.config.secret})</span>}
              </div>
              {t.last_fired && <div className="text-[10px] text-t4 mt-1">Last fired: {new Date(t.last_fired).toLocaleString()}</div>}
            </div>
          ))}

          {triggers.length === 0 && !showForm && (
            <div className="text-center text-t4 py-6 text-sm">No triggers yet.</div>
          )}

          {/* Create Trigger */}
          <button onClick={() => setShowForm(!showForm)} className="w-full p-2.5 border border-dashed rounded-lg text-sm text-t3 hover:text-t1 transition-all" style={{ borderColor: 'rgba(0,0,0,0.15)' }}>
            + New Trigger
          </button>

          {showForm && (
            <form onSubmit={handleCreate} className="space-y-3 p-3 bg-s2 rounded-lg" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Trigger name"
                className="w-full bg-s1 rounded-lg px-3 py-2 text-sm text-t1 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-t1/30" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }} />
              <div className="flex gap-2">
                <button type="button" onClick={() => setActionType('run_task')}
                  className={`flex-1 p-2 rounded-lg text-xs ${actionType === 'run_task' ? 'bg-s3 text-t1' : 'text-t3'}`}
                  style={{ border: actionType === 'run_task' ? '1px solid rgba(28,28,30,0.3)' : '0.5px solid rgba(0,0,0,0.08)' }}>
                  Run Task
                </button>
                <button type="button" onClick={() => setActionType('run_pipeline')}
                  className={`flex-1 p-2 rounded-lg text-xs ${actionType === 'run_pipeline' ? 'bg-s3 text-t1' : 'text-t3'}`}
                  style={{ border: actionType === 'run_pipeline' ? '1px solid rgba(28,28,30,0.3)' : '0.5px solid rgba(0,0,0,0.08)' }}>
                  Run Pipeline
                </button>
              </div>
              {actionType === 'run_task' ? (
                <>
                  <select value={agentId} onChange={e => setAgentId(e.target.value)}
                    className="w-full bg-s1 rounded-lg px-3 py-2 text-sm text-t1 focus:outline-none" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
                    <option value="">Select agent</option>
                    {agents?.map(a => <option key={a.id} value={a.id}>{a.avatar} {a.name}</option>)}
                  </select>
                  <textarea value={promptTemplate} onChange={e => setPromptTemplate(e.target.value)}
                    placeholder="Task prompt... Use {{payload}} for webhook data"
                    rows={3}
                    className="w-full bg-s1 rounded-lg px-3 py-2 text-sm text-t1 placeholder:text-t4 focus:outline-none resize-none" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }} />
                </>
              ) : (
                <select value={pipelineId} onChange={e => setPipelineId(e.target.value)}
                  className="w-full bg-s1 rounded-lg px-3 py-2 text-sm text-t1 focus:outline-none" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
                  <option value="">Select pipeline</option>
                  {pipelines?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
              <button type="submit" disabled={!name.trim()}
                className="w-full px-4 py-2 bg-t1 text-white rounded-lg font-medium text-sm hover:opacity-80 transition-colors disabled:opacity-40">
                Create Trigger
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
