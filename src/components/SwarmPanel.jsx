import { useState, useEffect } from 'react'
import { api } from '../lib/api'

const thinBorder = { border: '0.5px solid rgba(0,0,0,0.08)' }

const STATUS_COLORS = {
  pending: { bg: 'rgba(156,163,175,0.1)', text: '#6b7280' },
  voting: { bg: 'rgba(59,130,246,0.1)', text: '#3b82f6' },
  consensus_reached: { bg: 'rgba(52,199,89,0.1)', text: '#34c759' },
  failed: { bg: 'rgba(255,59,48,0.1)', text: '#ff3b30' },
  cancelled: { bg: 'rgba(156,163,175,0.1)', text: '#9ca3af' },
}

const COMPLEXITY_BADGES = {
  simple: { label: 'Simple', color: '#34c759', bg: 'rgba(52,199,89,0.1)' },
  medium: { label: 'Medium', color: '#ff9500', bg: 'rgba(255,149,0,0.1)' },
  complex: { label: 'Complex', color: '#ff3b30', bg: 'rgba(255,59,48,0.1)' },
  swarm: { label: 'Swarm', color: '#af52de', bg: 'rgba(175,82,222,0.1)' },
}

export default function SwarmPanel({ inline, agents = [] }) {
  const [swarms, setSwarms] = useState([])
  const [selectedSwarm, setSelectedSwarm] = useState(null)
  const [swarmDetail, setSwarmDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [classifyInput, setClassifyInput] = useState('')
  const [classifyResult, setClassifyResult] = useState(null)

  // New swarm form
  const [newSwarm, setNewSwarm] = useState({
    task_id: '',
    participant_agents: [],
    topology: 'hierarchical',
    consensus_method: 'weighted',
    coordinator_agent: 'nexus'
  })

  const loadSwarms = async () => {
    try {
      const data = await api.getSwarms()
      setSwarms(Array.isArray(data) ? data : [])
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { loadSwarms(); const iv = setInterval(loadSwarms, 10000); return () => clearInterval(iv) }, [])

  const selectSwarm = async (id) => {
    setSelectedSwarm(id)
    try {
      const detail = await api.getSwarm(id)
      setSwarmDetail(detail)
    } catch {}
  }

  const handleCreate = async () => {
    if (!newSwarm.task_id) return
    setCreating(true)
    try {
      const result = await api.createSwarm(newSwarm)
      setNewSwarm({ task_id: '', participant_agents: [], topology: 'hierarchical', consensus_method: 'weighted', coordinator_agent: 'nexus' })
      await loadSwarms()
      if (result.swarm_id) selectSwarm(result.swarm_id)
    } catch {} finally { setCreating(false) }
  }

  const handleClassify = async () => {
    if (!classifyInput.trim()) return
    try {
      const result = await api.classifyTask(classifyInput, classifyInput)
      setClassifyResult(result)
    } catch {}
  }

  const handleCancel = async (id) => {
    try {
      await api.cancelSwarm(id)
      await loadSwarms()
      if (selectedSwarm === id) {
        setSelectedSwarm(null)
        setSwarmDetail(null)
      }
    } catch {}
  }

  const toggleAgent = (agentId) => {
    setNewSwarm(prev => ({
      ...prev,
      participant_agents: prev.participant_agents.includes(agentId)
        ? prev.participant_agents.filter(a => a !== agentId)
        : [...prev.participant_agents, agentId]
    }))
  }

  const agentList = ['scout', 'forge', 'quill', 'dealer', 'oracle', 'nexus', 'sentinel', 'architect', 'designer', 'tester', 'strategist']
  const agentEmoji = { scout: '🔍', forge: '🔨', quill: '✍️', dealer: '🤝', oracle: '🔮', nexus: '🧠', sentinel: '🛡️', architect: '📐', designer: '🎨', tester: '🧪', strategist: '♟️' }

  return (
    <div className="h-full flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between p-5" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm" style={{ ...thinBorder, background: 'rgba(245,158,11,0.08)', color: '#f59e0b' }}>&#x1F41D;</div>
          <div>
            <h2 className="font-display text-lg tracking-wider text-t1">SWARM INTELLIGENCE</h2>
            <p className="text-xs text-t3">Multi-agent consensus coordination</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(175,82,222,0.1)', color: '#af52de' }}>
            {swarms.filter(s => s.status === 'voting').length} active
          </span>
          <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(52,199,89,0.1)', color: '#34c759' }}>
            {swarms.filter(s => s.status === 'consensus_reached').length} completed
          </span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Swarm List + Create */}
        <div className="w-80 flex-shrink-0 flex flex-col overflow-y-auto" style={{ borderRight: '0.5px solid rgba(0,0,0,0.08)' }}>
          {/* Complexity Classifier */}
          <div className="p-4" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
            <label className="text-xs font-medium text-t3 mb-1 block">COMPLEXITY CLASSIFIER</label>
            <div className="flex gap-2">
              <input
                className="flex-1 px-3 py-1.5 rounded-lg text-sm bg-surface text-t1"
                style={thinBorder}
                placeholder="Describe a task..."
                value={classifyInput}
                onChange={e => setClassifyInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleClassify()}
              />
              <button onClick={handleClassify} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ ...thinBorder, background: 'rgba(59,130,246,0.08)', color: '#3b82f6' }}>
                Classify
              </button>
            </div>
            {classifyResult && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: COMPLEXITY_BADGES[classifyResult.complexity]?.bg, color: COMPLEXITY_BADGES[classifyResult.complexity]?.color }}>
                  {COMPLEXITY_BADGES[classifyResult.complexity]?.label}
                </span>
                {classifyResult.suggestedParticipants?.length > 0 && (
                  <span className="text-xs text-t3">
                    {classifyResult.suggestedParticipants.map(p => agentEmoji[p.id] || p.id).join(' ')}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Create Swarm */}
          <div className="p-4" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
            <label className="text-xs font-medium text-t3 mb-2 block">CREATE SWARM</label>
            <input
              className="w-full px-3 py-1.5 rounded-lg text-sm bg-surface text-t1 mb-2"
              style={thinBorder}
              placeholder="Task ID..."
              value={newSwarm.task_id}
              onChange={e => setNewSwarm(prev => ({ ...prev, task_id: e.target.value }))}
            />
            <div className="flex flex-wrap gap-1 mb-2">
              {agentList.map(a => (
                <button
                  key={a}
                  onClick={() => toggleAgent(a)}
                  className="px-2 py-0.5 rounded-full text-xs transition-all"
                  style={{
                    ...thinBorder,
                    background: newSwarm.participant_agents.includes(a) ? 'rgba(175,82,222,0.15)' : 'transparent',
                    color: newSwarm.participant_agents.includes(a) ? '#af52de' : '#9ca3af'
                  }}
                >
                  {agentEmoji[a]} {a}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mb-2">
              <select
                className="flex-1 px-2 py-1 rounded-lg text-xs bg-surface text-t1"
                style={thinBorder}
                value={newSwarm.topology}
                onChange={e => setNewSwarm(prev => ({ ...prev, topology: e.target.value }))}
              >
                <option value="hierarchical">Hierarchical</option>
                <option value="mesh">Mesh</option>
                <option value="ring">Ring</option>
              </select>
              <select
                className="flex-1 px-2 py-1 rounded-lg text-xs bg-surface text-t1"
                style={thinBorder}
                value={newSwarm.consensus_method}
                onChange={e => setNewSwarm(prev => ({ ...prev, consensus_method: e.target.value }))}
              >
                <option value="weighted">Weighted</option>
                <option value="majority">Majority</option>
                <option value="unanimous">Unanimous</option>
              </select>
            </div>
            <button
              onClick={handleCreate}
              disabled={creating || !newSwarm.task_id}
              className="w-full px-3 py-2 rounded-lg text-sm font-medium transition-all"
              style={{ ...thinBorder, background: creating ? 'rgba(156,163,175,0.1)' : 'rgba(245,158,11,0.1)', color: creating ? '#9ca3af' : '#f59e0b' }}
            >
              {creating ? 'Launching...' : 'Launch Swarm'}
            </button>
          </div>

          {/* Swarm List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-t3 text-sm">Loading...</div>
            ) : swarms.length === 0 ? (
              <div className="p-4 text-center text-t3 text-sm">No swarms yet. Create one above.</div>
            ) : swarms.map(s => {
              const sc = STATUS_COLORS[s.status] || STATUS_COLORS.pending
              return (
                <button
                  key={s.id}
                  onClick={() => selectSwarm(s.id)}
                  className="w-full text-left p-3 transition-all hover:bg-surface/50"
                  style={{
                    borderBottom: '0.5px solid rgba(0,0,0,0.04)',
                    background: selectedSwarm === s.id ? 'rgba(59,130,246,0.04)' : undefined
                  }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-t1 truncate flex-1 mr-2">{s.task_title || s.task_id}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: sc.bg, color: sc.text }}>
                      {s.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-t3">
                    <span>{(s.participant_agents || []).map(a => agentEmoji[a] || a).join(' ')}</span>
                    <span>·</span>
                    <span>{new Date(s.created_at).toLocaleDateString()}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Right: Swarm Detail */}
        <div className="flex-1 overflow-y-auto">
          {!swarmDetail ? (
            <div className="flex items-center justify-center h-full text-t3 text-sm">
              Select a swarm to view details
            </div>
          ) : (
            <div className="p-5 space-y-4">
              {/* Swarm Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-medium text-t1">{swarmDetail.task_title || swarmDetail.task_id}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: STATUS_COLORS[swarmDetail.status]?.bg, color: STATUS_COLORS[swarmDetail.status]?.text }}>
                      {swarmDetail.status?.replace('_', ' ')}
                    </span>
                    <span className="text-xs text-t3">{swarmDetail.topology} · {swarmDetail.consensus_method}</span>
                    <span className="text-xs text-t3">Coordinator: {agentEmoji[swarmDetail.coordinator_agent]} {swarmDetail.coordinator_agent}</span>
                  </div>
                </div>
                {(swarmDetail.status === 'pending' || swarmDetail.status === 'voting') && (
                  <button onClick={() => handleCancel(swarmDetail.id)} className="px-3 py-1.5 rounded-lg text-xs" style={{ ...thinBorder, color: '#ff3b30' }}>
                    Cancel
                  </button>
                )}
              </div>

              {/* Participants */}
              <div className="rounded-xl p-4" style={{ ...thinBorder, background: 'rgba(0,0,0,0.01)' }}>
                <h4 className="text-xs font-medium text-t3 mb-3">AGENT VOTES</h4>
                {(swarmDetail.votes || []).length === 0 ? (
                  <p className="text-xs text-t3">Waiting for agent analyses...</p>
                ) : (
                  <div className="space-y-3">
                    {(swarmDetail.votes || []).map((vote, i) => (
                      <div key={i} className="rounded-lg p-3" style={{ ...thinBorder, background: 'white' }}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span>{agentEmoji[vote.agent_id] || '🤖'}</span>
                            <span className="text-sm font-medium text-t1">{vote.agent_id}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{
                              background: vote.vote === 'approve' ? 'rgba(52,199,89,0.1)' : vote.vote === 'reject' ? 'rgba(255,59,48,0.1)' : 'rgba(156,163,175,0.1)',
                              color: vote.vote === 'approve' ? '#34c759' : vote.vote === 'reject' ? '#ff3b30' : '#9ca3af'
                            }}>
                              {vote.vote}
                            </span>
                          </div>
                          <span className="text-[10px] text-t3">{vote.tokens_used} tokens · ${(vote.cost || 0).toFixed(4)}</span>
                        </div>
                        <p className="text-xs text-t2 whitespace-pre-wrap leading-relaxed">{(vote.output || '').slice(0, 500)}{(vote.output || '').length > 500 ? '...' : ''}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Final Output */}
              {swarmDetail.final_output && (
                <div className="rounded-xl p-4" style={{ ...thinBorder, background: 'rgba(175,82,222,0.03)' }}>
                  <h4 className="text-xs font-medium text-t3 mb-2">CONSENSUS OUTPUT</h4>
                  <p className="text-sm text-t1 whitespace-pre-wrap leading-relaxed">{swarmDetail.final_output}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
