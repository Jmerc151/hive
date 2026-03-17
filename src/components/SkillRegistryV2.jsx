import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import ConfirmDialog from './ConfirmDialog'

const AGENT_COLORS = {
  scout: '#06b6d4', forge: '#3b82f6', quill: '#8b5cf6',
  dealer: '#3BB273', oracle: '#E8C547', nexus: '#ec4899'
}
const AGENTS = ['scout', 'forge', 'quill', 'dealer', 'oracle', 'nexus']

const TEMPLATES = {
  research: `---
name: research-template
description: Research skill template
version: 1.0.0
author: john
agents: [scout]
tags: [research]
requires_tools: [web_search]
---

# Research Skill

When asked to research a topic:
1. Search for recent sources
2. Extract key findings
3. Summarize with actionable insights`,
  builder: `---
name: builder-template
description: Builder skill template
version: 1.0.0
author: john
agents: [forge]
tags: [build]
requires_tools: []
---

# Builder Skill

When asked to build something:
1. Analyze requirements
2. Generate code/content
3. Validate output quality`,
  analyzer: `---
name: analyzer-template
description: Analysis skill template
version: 1.0.0
author: john
agents: [oracle]
tags: [analysis]
requires_tools: []
---

# Analysis Skill

When asked to analyze:
1. Gather relevant data
2. Apply analytical framework
3. Provide structured assessment`,
}

function parseTags(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try { return JSON.parse(raw) } catch { return [] }
}

export default function SkillRegistryV2({ onClose, inline }) {
  const [activeTab, setActiveTab] = useState('skills')
  const [skills, setSkills] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState(null)
  const [editing, setEditing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', skill_md: '', tags: '' })
  const [assignModal, setAssignModal] = useState(null)
  const [agentSkills, setAgentSkills] = useState({})
  const [confirmDelete, setConfirmDelete] = useState(null)

  const [a2aAgents, setA2aAgents] = useState([])
  const [a2aLoading, setA2aLoading] = useState(false)
  const [a2aUrl, setA2aUrl] = useState('')
  const [a2aName, setA2aName] = useState('')
  const [a2aTestResult, setA2aTestResult] = useState(null)
  const [a2aTestingId, setA2aTestingId] = useState(null)

  const refreshA2A = () => {
    setA2aLoading(true)
    api.getA2AAgents()
      .then(data => setA2aAgents(Array.isArray(data) ? data : []))
      .catch(() => setA2aAgents([]))
      .finally(() => setA2aLoading(false))
  }

  useEffect(() => { if (activeTab === 'a2a') refreshA2A() }, [activeTab])

  const handleAddA2A = async () => {
    if (!a2aUrl) return
    try {
      await api.addA2AAgent({ url: a2aUrl, name: a2aName || undefined })
      setA2aUrl('')
      setA2aName('')
      refreshA2A()
    } catch {}
  }

  const handleDeleteA2A = async (id) => {
    try { await api.deleteA2AAgent(id); refreshA2A() } catch {}
  }

  const handleTestA2A = async (id) => {
    setA2aTestingId(id)
    setA2aTestResult(null)
    try {
      const result = await api.testA2AAgent(id)
      setA2aTestResult({ id, ...result })
    } catch (e) {
      setA2aTestResult({ id, success: false, error: e.message })
    }
    setA2aTestingId(null)
  }

  const refresh = () => {
    setLoading(true)
    api.getSkillsV2(search ? { search } : {})
      .then(data => setSkills(Array.isArray(data) ? data : data?.skills || []))
      .catch(() => setSkills([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { refresh() }, [search])

  const loadDetail = async (slug) => {
    try {
      const d = await api.getSkillDetail(slug)
      setDetail(d)
      setForm({ name: d.name, description: d.description || '', skill_md: d.skill_md || '', tags: parseTags(d.tags).join(', ') })
    } catch {}
  }

  const loadAgentSkills = async (agentId) => {
    try {
      const skills = await api.getAgentSkillsV2(agentId)
      setAgentSkills(prev => ({ ...prev, [agentId]: Array.isArray(skills) ? skills : [] }))
    } catch {}
  }

  const handleCreate = async () => {
    if (!form.name || !form.skill_md) return
    try {
      await api.createSkillV2({
        name: form.name, description: form.description,
        skill_md: form.skill_md,
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean)
      })
      setCreating(false)
      setForm({ name: '', description: '', skill_md: '', tags: '' })
      refresh()
    } catch {}
  }

  const handleUpdate = async () => {
    if (!detail) return
    try {
      await api.updateSkillV2(detail.slug, {
        name: form.name, description: form.description,
        skill_md: form.skill_md,
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean)
      })
      setEditing(false)
      loadDetail(detail.slug)
      refresh()
    } catch {}
  }

  const handleDelete = async (slug) => {
    try {
      await api.deleteSkillV2(slug)
      setDetail(null)
      refresh()
    } catch {}
  }

  const handleAssign = async (agentId, slug) => {
    try {
      await api.assignSkill(agentId, slug)
      loadAgentSkills(agentId)
      if (detail) loadDetail(detail.slug)
    } catch {}
  }

  const handleUnassign = async (agentId, slug) => {
    try {
      await api.unassignSkill(agentId, slug)
      loadAgentSkills(agentId)
      if (detail) loadDetail(detail.slug)
    } catch {}
  }

  const handleToggle = async (agentId, slug, enabled) => {
    try {
      await api.toggleSkillV2(agentId, slug, { enabled: !enabled })
      loadAgentSkills(agentId)
    } catch {}
  }

  const editorForm = (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-t3 mb-1 block">Name</label>
        <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          className="w-full bg-s2 rounded-lg px-3 py-2 text-sm text-t1 focus:outline-none focus:ring-1 focus:ring-t1/30" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }} />
      </div>
      <div>
        <label className="text-xs text-t3 mb-1 block">Description</label>
        <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          className="w-full bg-s2 rounded-lg px-3 py-2 text-sm text-t1 focus:outline-none focus:ring-1 focus:ring-t1/30" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }} />
      </div>
      <div>
        <label className="text-xs text-t3 mb-1 block">Tags (comma-separated)</label>
        <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
          className="w-full bg-s2 rounded-lg px-3 py-2 text-sm text-t1 focus:outline-none focus:ring-1 focus:ring-t1/30" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }} />
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-t3">SKILL.md</label>
          {creating && (
            <select onChange={e => e.target.value && setForm(f => ({ ...f, skill_md: TEMPLATES[e.target.value] }))}
              className="bg-s2 rounded text-xs text-t3 px-2 py-1" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
              <option value="">Template...</option>
              <option value="research">Research</option>
              <option value="builder">Builder</option>
              <option value="analyzer">Analyzer</option>
            </select>
          )}
        </div>
        <textarea value={form.skill_md} onChange={e => setForm(f => ({ ...f, skill_md: e.target.value }))}
          rows={12}
          className="w-full bg-s2 rounded-lg px-3 py-2 text-sm text-t1 font-mono focus:outline-none focus:ring-1 focus:ring-t1/30 resize-y" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }} />
      </div>
    </div>
  )

  if (detail && !creating) {
    const tags = parseTags(detail.tags)
    const detailContent = (
      <div className={inline ? "h-full overflow-y-auto" : "bg-s1 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl"} style={inline ? {} : { border: '0.5px solid rgba(0,0,0,0.08)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
          <div className="flex items-center gap-3">
            <button onClick={() => { setDetail(null); setEditing(false) }} className="text-t3 hover:text-t1 text-sm">← Back</button>
            <h2 className="text-lg font-bold font-display text-t1">{detail.name}</h2>
            <span className="text-xs text-t4">v{detail.version}</span>
          </div>
          <div className="flex items-center gap-2">
            {!editing && <button onClick={() => setEditing(true)} className="px-3 py-1 bg-s3 text-t1 rounded-lg text-xs hover:bg-s3">Edit</button>}
            <button onClick={() => setConfirmDelete({ slug: detail.slug, name: detail.name })} className="px-3 py-1 rounded-lg text-xs text-danger" style={{ background: 'rgba(255,59,48,0.1)' }}>Delete</button>
            {!inline && <button onClick={onClose} className="text-t3 hover:text-t1 text-xl ml-2">&times;</button>}
          </div>
        </div>

        <div className="p-4 space-y-4">
          {editing ? (
            <>
              {editorForm}
              <div className="flex gap-2">
                <button onClick={handleUpdate} className="px-4 py-2 bg-t1 text-white rounded-lg text-sm font-medium hover:opacity-80">Save</button>
                <button onClick={() => setEditing(false)} className="px-4 py-2 bg-s3 text-t1 rounded-lg text-sm hover:bg-s3">Cancel</button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-t2">{detail.description}</p>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {tags.map(t => <span key={t} className="text-[10px] bg-s3 text-t2 px-2 py-0.5 rounded">{t}</span>)}
                </div>
              )}
              <div className="bg-s2 rounded-lg p-4" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
                <pre className="text-xs text-t1 font-mono whitespace-pre-wrap">{detail.skill_md}</pre>
              </div>

              <div>
                <h3 className="text-sm font-medium text-t1 mb-2">Assign to Agents</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {AGENTS.map(agentId => {
                    const assigned = detail.assigned_agents?.includes(agentId)
                    return (
                      <button key={agentId} onClick={() => assigned ? handleUnassign(agentId, detail.slug) : handleAssign(agentId, detail.slug)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                          assigned ? 'bg-s3 text-t1' : 'bg-s2 text-t3 hover:bg-s3'
                        }`}
                        style={{ border: assigned ? '1px solid rgba(28,28,30,0.3)' : '0.5px solid rgba(0,0,0,0.08)' }}>
                        <span className="w-2 h-2 rounded-full" style={{ background: AGENT_COLORS[agentId] }} />
                        <span className="capitalize">{agentId}</span>
                        {assigned && <span className="ml-auto">✓</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    )

    if (inline) return (
      <>
        {detailContent}
        <ConfirmDialog
          isOpen={!!confirmDelete}
          title="Delete Skill?"
          message={`Are you sure you want to delete "${confirmDelete?.name}"? This action cannot be undone.`}
          onConfirm={() => { handleDelete(confirmDelete.slug); setConfirmDelete(null) }}
          onCancel={() => setConfirmDelete(null)}
        />
      </>
    )

    return (
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
        {detailContent}
        <ConfirmDialog
          isOpen={!!confirmDelete}
          title="Delete Skill?"
          message={`Are you sure you want to delete "${confirmDelete?.name}"? This action cannot be undone.`}
          onConfirm={() => { handleDelete(confirmDelete.slug); setConfirmDelete(null) }}
          onCancel={() => setConfirmDelete(null)}
        />
      </div>
    )
  }

  if (creating) {
    const createContent = (
      <div className={inline ? "h-full overflow-y-auto" : "bg-s1 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl"} style={inline ? {} : { border: '0.5px solid rgba(0,0,0,0.08)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
          <h2 className="text-lg font-bold font-display text-t1">Create Skill</h2>
          <button onClick={() => setCreating(false)} className="text-t3 hover:text-t1 text-xl">&times;</button>
        </div>
        <div className="p-4 space-y-4">
          {editorForm}
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={!form.name || !form.skill_md}
              className="px-4 py-2 bg-t1 text-white rounded-lg text-sm font-medium hover:opacity-80 disabled:opacity-50">Create Skill</button>
            <button onClick={() => setCreating(false)} className="px-4 py-2 bg-s3 text-t1 rounded-lg text-sm hover:bg-s3">Cancel</button>
          </div>
        </div>
      </div>
    )

    if (inline) return createContent

    return (
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
        {createContent}
      </div>
    )
  }

  const a2aContent = (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="bg-s2 rounded-lg p-4" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
        <h3 className="text-sm font-medium text-t1 mb-3">Register External A2A Agent</h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={a2aUrl} onChange={e => setA2aUrl(e.target.value)} placeholder="Agent URL (e.g. https://agent.example.com/a2a/scout)"
            className="flex-1 bg-s1 rounded-lg px-3 py-2 text-sm text-t1 placeholder:text-t4 focus:outline-none focus:ring-1 focus:ring-t1/30" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }} />
          <input value={a2aName} onChange={e => setA2aName(e.target.value)} placeholder="Name (optional)"
            className="sm:w-40 bg-s1 rounded-lg px-3 py-2 text-sm text-t1 placeholder:text-t4 focus:outline-none focus:ring-1 focus:ring-t1/30" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }} />
          <button onClick={handleAddA2A} disabled={!a2aUrl}
            className="px-4 py-2 bg-t1 text-white rounded-lg text-sm font-medium hover:opacity-80 disabled:opacity-50 whitespace-nowrap">Add Agent</button>
        </div>
      </div>

      {a2aLoading && a2aAgents.length === 0 && <div className="text-center text-t3 py-8">Loading...</div>}
      {!a2aLoading && a2aAgents.length === 0 && (
        <div className="text-center text-t3 py-12">
          <div className="text-sm">No external A2A agents registered.</div>
          <div className="text-xs mt-1 text-t4">Add an agent URL to discover and connect to external A2A-compatible agents.</div>
        </div>
      )}

      <div className="space-y-2">
        {a2aAgents.map(agent => {
          let card = {}
          try { card = JSON.parse(agent.agent_card || '{}') } catch {}
          const testRes = a2aTestResult?.id === agent.id ? a2aTestResult : null
          return (
            <div key={agent.id} className="bg-s2 rounded-lg p-4" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-t1">{agent.name}</h3>
                    <span className={`w-2 h-2 rounded-full ${agent.enabled ? 'bg-success' : 'bg-s4'}`} />
                  </div>
                  <p className="text-xs text-t3 truncate mt-0.5">{agent.url}</p>
                  {agent.description && <p className="text-xs text-t2 mt-1">{agent.description}</p>}
                </div>
                <div className="flex items-center gap-1.5 ml-2">
                  <button onClick={() => handleTestA2A(agent.id)} disabled={a2aTestingId === agent.id}
                    className="px-2.5 py-1 bg-s3 text-t1 rounded text-xs hover:bg-s3 disabled:opacity-50">
                    {a2aTestingId === agent.id ? '...' : 'Test'}
                  </button>
                  <button onClick={() => handleDeleteA2A(agent.id)}
                    className="px-2.5 py-1 text-danger rounded text-xs" style={{ background: 'rgba(255,59,48,0.1)' }}>Delete</button>
                </div>
              </div>

              {card.agents && card.agents.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {card.agents.map((a, i) => (
                    <span key={i} className="text-[10px] bg-s3 text-t2 px-1.5 py-0.5 rounded">{a.name || a.id}</span>
                  ))}
                </div>
              )}

              {agent.last_contacted && (
                <div className="text-[10px] text-t4 mt-2">Last contacted: {new Date(agent.last_contacted).toLocaleString()}</div>
              )}

              {testRes && (
                <div className={`mt-2 p-2 rounded text-xs ${testRes.success ? 'text-success' : 'text-danger'}`}
                  style={{ background: testRes.success ? 'rgba(52,199,89,0.1)' : 'rgba(255,59,48,0.1)', border: testRes.success ? '1px solid rgba(52,199,89,0.2)' : '1px solid rgba(255,59,48,0.2)' }}>
                  {testRes.success ? 'Connection successful' : `Failed: ${testRes.error}`}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )

  const mainContent = (
    <div className={inline ? "h-full flex flex-col" : "bg-s1 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl"} style={inline ? {} : { border: '0.5px solid rgba(0,0,0,0.08)' }} onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between p-4 shrink-0" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold font-display text-t1">Skills & Agents</h2>
          <div className="flex bg-s2 rounded-lg p-0.5">
            <button onClick={() => setActiveTab('skills')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${activeTab === 'skills' ? 'bg-s3 text-t1' : 'text-t3 hover:text-t1'}`}>
              Skills
            </button>
            <button onClick={() => setActiveTab('a2a')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${activeTab === 'a2a' ? 'bg-s3 text-t1' : 'text-t3 hover:text-t1'}`}>
              External Agents (A2A)
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'skills' && (
            <>
              <button onClick={() => {
                const url = prompt('Enter SKILL.md URL to import:')
                if (url) api.importSkillUrl(url).then(() => refresh()).catch(e => alert(e.message))
              }} className="px-3 py-1.5 bg-s3 text-t1 rounded-lg text-xs hover:bg-s3">Import URL</button>
              <button onClick={() => {
                const content = prompt('Paste SKILL.md content:')
                if (content) api.importSkill(content).then(() => refresh()).catch(e => alert(e.message))
              }} className="px-3 py-1.5 bg-s3 text-t1 rounded-lg text-xs hover:bg-s3">Import</button>
              <button onClick={() => { setCreating(true); setForm({ name: '', description: '', skill_md: '', tags: '' }) }}
                className="px-3 py-1.5 bg-t1 text-white rounded-lg text-xs font-medium hover:opacity-80">+ New Skill</button>
            </>
          )}
          {!inline && <button onClick={onClose} className="text-t3 hover:text-t1 text-xl">&times;</button>}
        </div>
      </div>

      {activeTab === 'skills' ? (
        <>
          <div className="p-4 shrink-0" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search skills..."
              className="w-full bg-s2 rounded-lg px-3 py-2 text-sm text-t1 placeholder:text-t4 focus:outline-none focus:ring-1 focus:ring-t1/30" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }} />
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {loading && skills.length === 0 && <div className="text-center text-t3 py-8">Loading...</div>}
            {!loading && skills.length === 0 && (
              <div className="text-center text-t3 py-12">
                <div className="text-sm">No skills yet.</div>
                <div className="text-xs mt-1 text-t4">Create your first SKILL.md instruction package.</div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {skills.map(skill => {
                const tags = parseTags(skill.tags)
                return (
                  <div key={skill.id || skill.slug} onClick={() => loadDetail(skill.slug)}
                    className="bg-s2 rounded-lg p-4 cursor-pointer hover:bg-s3 transition-colors" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-sm font-medium text-t1">{skill.name}</h3>
                      <span className="text-[10px] text-t4">v{skill.version || '1.0.0'}</span>
                    </div>
                    <p className="text-xs text-t3 line-clamp-2 mb-2">{skill.description}</p>
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {tags.map(t => <span key={t} className="text-[10px] bg-s3 text-t2 px-1.5 py-0.5 rounded">{t}</span>)}
                      </div>
                    )}
                    <div className="flex items-center justify-between text-[10px] text-t4">
                      <span>{skill.source || 'custom'} · {skill.author || 'john'}</span>
                      <a href={api.exportSkill(skill.slug)} target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()} className="text-t1 hover:opacity-80">Export</a>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      ) : (
        a2aContent
      )}
    </div>
  )

  if (inline) return mainContent

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      {mainContent}
    </div>
  )
}
