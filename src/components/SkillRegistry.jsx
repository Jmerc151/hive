import { useState, useEffect } from 'react'
import { api } from '../lib/api'

const SKILL_TYPES = [
  { value: 'web_search', label: 'Web Search', icon: '🔍' },
  { value: 'code_exec', label: 'Code Execution', icon: '💻' },
  { value: 'file_io', label: 'File I/O', icon: '📁' },
  { value: 'api_call', label: 'API Call', icon: '🔌' },
  { value: 'data_analysis', label: 'Data Analysis', icon: '📊' },
  { value: 'custom', label: 'Custom', icon: '⚙️' },
]

export default function SkillRegistry({ agent, onClose }) {
  const [skills, setSkills] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState('custom')

  const refresh = () => {
    if (agent) api.getSkills(agent.id).then(setSkills).catch(() => {})
  }
  useEffect(() => { refresh() }, [agent?.id])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    await api.createSkill(agent.id, { name: name.trim(), description: description.trim(), type })
    setName(''); setDescription(''); setType('custom')
    setShowForm(false)
    refresh()
  }

  const toggleSkill = async (skill) => {
    await api.updateSkill(skill.id, { enabled: !skill.enabled })
    refresh()
  }

  if (!agent) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-hive-800 border border-hive-700 rounded-xl w-full max-w-md shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="p-5 border-b border-hive-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">{agent.avatar}</span>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: agent.color }}>Skills</h2>
              <p className="text-xs text-hive-400">{agent.name} — {agent.role}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-hive-400 hover:text-hive-200 text-xl">&times;</button>
        </div>

        <div className="p-5 space-y-3">
          {/* Skills List */}
          {skills.map(skill => {
            const st = SKILL_TYPES.find(s => s.value === skill.type)
            return (
              <div key={skill.id} className="flex items-center gap-3 p-3 bg-hive-700/30 rounded-lg border border-hive-700">
                <span className="text-lg">{st?.icon || '⚙️'}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-hive-100">{skill.name}</div>
                  {skill.description && <div className="text-xs text-hive-400 truncate">{skill.description}</div>}
                  <span className="text-[10px] text-hive-500">{st?.label || skill.type}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => toggleSkill(skill)}
                    className={`w-10 h-5 rounded-full relative transition-colors ${skill.enabled ? 'bg-green-500' : 'bg-hive-600'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${skill.enabled ? 'left-5' : 'left-0.5'}`} />
                  </button>
                  <button onClick={async () => { await api.deleteSkill(skill.id); refresh() }}
                    className="text-xs text-red-400 hover:text-red-300">×</button>
                </div>
              </div>
            )
          })}

          {skills.length === 0 && !showForm && (
            <div className="text-center text-hive-500 py-6 text-sm">No skills configured. Add skills to enhance this agent.</div>
          )}

          {/* Add Skill */}
          <button onClick={() => setShowForm(!showForm)}
            className="w-full p-2.5 border border-dashed border-hive-600 rounded-lg text-sm text-hive-400 hover:border-honey/50 hover:text-honey transition-all">
            + Add Skill
          </button>

          {showForm && (
            <form onSubmit={handleCreate} className="space-y-3 p-3 bg-hive-700/30 rounded-lg border border-hive-700">
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Skill name"
                className="w-full bg-hive-900 border border-hive-600 rounded-lg px-3 py-2 text-sm text-hive-100 placeholder:text-hive-500 focus:outline-none focus:ring-2 focus:ring-honey/50" />
              <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="What does this skill do?"
                className="w-full bg-hive-900 border border-hive-600 rounded-lg px-3 py-2 text-sm text-hive-100 placeholder:text-hive-500 focus:outline-none focus:ring-2 focus:ring-honey/50" />
              <div className="grid grid-cols-3 gap-1.5">
                {SKILL_TYPES.map(st => (
                  <button key={st.value} type="button" onClick={() => setType(st.value)}
                    className={`p-2 rounded-lg border text-xs transition-all ${type === st.value ? 'border-honey bg-honey/10 text-honey' : 'border-hive-600 text-hive-400'}`}>
                    {st.icon} {st.label}
                  </button>
                ))}
              </div>
              <button type="submit" disabled={!name.trim()}
                className="w-full px-4 py-2 bg-honey text-white rounded-lg font-medium text-sm hover:bg-honey-dim transition-colors disabled:opacity-40">
                Add Skill
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
