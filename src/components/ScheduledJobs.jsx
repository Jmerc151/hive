import { useState, useEffect } from 'react'
import { api } from '../lib/api'

const CRON_PRESETS = [
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Daily 9am', value: '0 9 * * *' },
  { label: 'Weekdays 9am', value: '0 9 * * 1-5' },
  { label: 'Monday 9am', value: '0 9 * * 1' },
  { label: 'Monthly 1st', value: '0 0 1 * *' },
]

function cronToHuman(expr) {
  const map = {
    '0 * * * *': 'Every hour',
    '0 9 * * *': 'Daily at 9:00 AM',
    '0 9 * * 1-5': 'Weekdays at 9:00 AM',
    '0 9 * * 1': 'Mondays at 9:00 AM',
    '0 0 1 * *': '1st of each month',
    '*/5 * * * *': 'Every 5 minutes',
    '*/30 * * * *': 'Every 30 minutes',
  }
  return map[expr] || expr
}

function timeAgo(dateStr) {
  if (!dateStr) return 'Never'
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 60000) return 'Just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

export default function ScheduledJobs({ agents = [], onClose }) {
  const [jobs, setJobs] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [agentId, setAgentId] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDesc, setTaskDesc] = useState('')
  const [cronExpr, setCronExpr] = useState('0 9 * * *')
  const [deleting, setDeleting] = useState(null)

  const refresh = () => api.getScheduledJobs().then(setJobs).catch(() => {})
  useEffect(() => { refresh() }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!name.trim() || !agentId || !taskTitle.trim() || !cronExpr.trim()) return
    await api.createScheduledJob({
      name: name.trim(),
      agent_id: agentId,
      task_title: taskTitle.trim(),
      task_description: taskDesc.trim(),
      cron_expression: cronExpr.trim(),
    })
    setName(''); setAgentId(''); setTaskTitle(''); setTaskDesc(''); setCronExpr('0 9 * * *')
    setShowForm(false)
    refresh()
  }

  const toggleEnabled = async (job) => {
    await api.updateScheduledJob(job.id, { enabled: !job.enabled })
    refresh()
  }

  const handleDelete = async (id) => {
    if (deleting !== id) { setDeleting(id); return }
    await api.deleteScheduledJob(id)
    setDeleting(null)
    refresh()
  }

  const agentMap = {}
  agents.forEach(a => { agentMap[a.id] = a })

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-hive-800 border border-hive-700 rounded-xl w-full max-w-lg shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

        <div className="p-5 border-b border-hive-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">&#9200;</span>
            <h2 className="text-lg font-semibold">Scheduled Jobs</h2>
            <span className="text-xs bg-hive-700 px-2 py-0.5 rounded-full text-hive-400">{jobs.length}</span>
          </div>
          <button onClick={onClose} className="text-hive-400 hover:text-hive-200 text-xl">&times;</button>
        </div>

        <div className="p-5 space-y-3">
          {jobs.map(job => {
            const agent = agentMap[job.agent_id]
            return (
              <div key={job.id} className="p-3 bg-hive-700/30 rounded-lg border border-hive-700">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${job.enabled ? 'bg-green-500' : 'bg-hive-500'}`} />
                    <span className="font-medium text-sm text-hive-100">{job.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => toggleEnabled(job)} className="text-xs text-hive-400 hover:text-hive-200">
                      {job.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button onClick={() => handleDelete(job.id)} className={`text-xs ${deleting === job.id ? 'text-red-300 font-medium' : 'text-red-400 hover:text-red-300'}`}>
                      {deleting === job.id ? 'Confirm?' : 'Del'}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-1">
                  {agent && <span className="text-sm">{agent.avatar}</span>}
                  <span className="text-xs text-hive-300">{agent?.name || job.agent_id}</span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-hive-700 rounded font-mono text-hive-400">{cronToHuman(job.cron_expression)}</span>
                </div>
                <div className="text-xs text-hive-300 truncate">{job.task_title}</div>
                {job.task_description && <div className="text-[10px] text-hive-500 truncate mt-0.5">{job.task_description}</div>}
                <div className="text-[10px] text-hive-500 mt-1">
                  Last run: {timeAgo(job.last_run)}
                </div>
              </div>
            )
          })}

          {jobs.length === 0 && !showForm && (
            <div className="text-center text-hive-500 py-6 text-sm">No scheduled jobs yet. Create one to automate agent tasks.</div>
          )}

          {showForm && (
            <form onSubmit={handleCreate} className="p-4 bg-hive-700/20 rounded-lg border border-hive-700 space-y-3">
              <div>
                <label className="text-xs text-hive-400 block mb-1">Job Name</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Daily market scan" className="w-full bg-hive-900 border border-hive-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-honey/50" />
              </div>
              <div>
                <label className="text-xs text-hive-400 block mb-1">Agent</label>
                <select value={agentId} onChange={e => setAgentId(e.target.value)} className="w-full bg-hive-900 border border-hive-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-honey/50">
                  <option value="">Select agent...</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.avatar} {a.name} — {a.role}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-hive-400 block mb-1">Task Title</label>
                <input value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="Research top trending stocks" className="w-full bg-hive-900 border border-hive-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-honey/50" />
              </div>
              <div>
                <label className="text-xs text-hive-400 block mb-1">Task Description (optional)</label>
                <textarea value={taskDesc} onChange={e => setTaskDesc(e.target.value)} placeholder="Scan for momentum setups..." rows={2} className="w-full bg-hive-900 border border-hive-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-honey/50 resize-none" />
              </div>
              <div>
                <label className="text-xs text-hive-400 block mb-1">Cron Expression</label>
                <input value={cronExpr} onChange={e => setCronExpr(e.target.value)} placeholder="0 9 * * *" className="w-full bg-hive-900 border border-hive-600 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-honey/50" />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {CRON_PRESETS.map(p => (
                    <button key={p.value} type="button" onClick={() => setCronExpr(p.value)} className={`text-[10px] px-2 py-1 rounded-full border transition-all ${cronExpr === p.value ? 'bg-honey/20 border-honey/40 text-honey' : 'bg-hive-700/50 border-hive-600 text-hive-400 hover:border-hive-500'}`}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="submit" className="flex-1 py-2 bg-honey text-white rounded-lg text-sm font-medium hover:bg-honey-dim transition-colors">Create Job</button>
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 bg-hive-700 text-hive-300 rounded-lg text-sm hover:bg-hive-600 transition-colors">Cancel</button>
              </div>
            </form>
          )}

          {!showForm && (
            <button onClick={() => setShowForm(true)} className="w-full p-2.5 border border-dashed border-hive-600 rounded-lg text-sm text-hive-400 hover:border-honey/50 hover:text-honey transition-all">
              + New Scheduled Job
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
