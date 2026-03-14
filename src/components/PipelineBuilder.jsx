import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../lib/api'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

// ── Custom Node Components ──

function AgentNode({ data, selected }) {
  const agent = data.agent
  return (
    <div className={`px-4 py-3 rounded-xl border-2 min-w-[180px] max-w-[220px] transition-all ${
      selected ? 'border-honey shadow-lg shadow-honey/20' : 'border-hive-600'
    }`} style={{ background: '#1e1e2e' }}>
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-hive-400 !border-hive-600" />
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{agent?.avatar || '🤖'}</span>
        <div>
          <div className="text-sm font-semibold text-hive-100">{agent?.name || data.agentId}</div>
          <div className="text-[10px] text-hive-400 truncate">{agent?.role || ''}</div>
        </div>
      </div>
      {data.prompt && (
        <div className="text-[11px] text-hive-300 line-clamp-2 leading-relaxed">{data.prompt}</div>
      )}
      {!data.prompt && (
        <div className="text-[11px] text-hive-500 italic">Double-click to edit prompt</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-honey !border-honey-dim" />
    </div>
  )
}

function StartNode() {
  return (
    <div className="w-12 h-12 rounded-full bg-green-500/20 border-2 border-green-500 flex items-center justify-center">
      <span className="text-green-400 text-lg">▶</span>
      <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-green-400 !border-green-600" />
    </div>
  )
}

function EndNode() {
  return (
    <div className="w-12 h-12 rounded-full bg-red-500/20 border-2 border-red-500 flex items-center justify-center">
      <span className="text-red-400 text-lg">■</span>
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-red-400 !border-red-600" />
    </div>
  )
}

const nodeTypes = { agentNode: AgentNode, startNode: StartNode, endNode: EndNode }

// ── Convert between react-flow and pipeline JSON ──

function pipelineToFlow(pipeline, agents) {
  const steps = (pipeline.steps || []).sort((a, b) => a.position - b.position)
  const nodes = [
    { id: 'start', type: 'startNode', position: { x: 250, y: 0 }, data: {} },
  ]
  const edges = []

  steps.forEach((step, i) => {
    const nodeId = `step-${i}`
    const agent = agents.find(a => a.id === step.agent_id)
    nodes.push({
      id: nodeId,
      type: 'agentNode',
      position: { x: 200, y: 100 + i * 140 },
      data: { agentId: step.agent_id, agent, prompt: step.prompt_template },
    })
    edges.push({
      id: `e-${i === 0 ? 'start' : `step-${i - 1}`}-${nodeId}`,
      source: i === 0 ? 'start' : `step-${i - 1}`,
      target: nodeId,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#E8C547' },
      style: { stroke: '#E8C547', strokeWidth: 2 },
    })
  })

  const lastId = steps.length > 0 ? `step-${steps.length - 1}` : 'start'
  nodes.push({ id: 'end', type: 'endNode', position: { x: 250, y: 100 + steps.length * 140 }, data: {} })
  edges.push({
    id: `e-${lastId}-end`,
    source: lastId,
    target: 'end',
    markerEnd: { type: MarkerType.ArrowClosed, color: '#ef4444' },
    style: { stroke: '#ef4444', strokeWidth: 2 },
  })

  return { nodes, edges }
}

function flowToPipeline(nodes) {
  return nodes
    .filter(n => n.type === 'agentNode')
    .sort((a, b) => a.position.y - b.position.y)
    .map((n, i) => ({
      agent_id: n.data.agentId,
      prompt_template: n.data.prompt || '',
      position: i + 1,
    }))
}

// ── Prompt Editor Modal ──

function PromptEditor({ node, onSave, onClose }) {
  const [prompt, setPrompt] = useState(node?.data?.prompt || '')
  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-hive-800 border border-hive-700 rounded-xl w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">{node?.data?.agent?.avatar || '🤖'}</span>
          <h3 className="font-semibold text-hive-100">{node?.data?.agent?.name || 'Agent'} — Step Prompt</h3>
        </div>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Instructions for this agent... Use {{previous_output}} to inject the previous step's output."
          rows={6}
          className="w-full bg-hive-900 border border-hive-600 rounded-lg px-3 py-2 text-sm text-hive-100 placeholder:text-hive-500 focus:outline-none focus:ring-2 focus:ring-honey/50 resize-none mb-3"
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-hive-400 hover:text-hive-200">Cancel</button>
          <button onClick={() => { onSave(prompt); onClose() }} className="px-4 py-1.5 bg-honey text-white rounded-lg text-sm font-medium hover:bg-honey-dim">Save</button>
        </div>
      </div>
    </div>
  )
}

// ── Replay Modal ──

function ReplayModal({ pipeline, agents, onClose, onReplay }) {
  const [selectedStep, setSelectedStep] = useState(null)
  const [modifiedInput, setModifiedInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const steps = (pipeline.steps || []).sort((a, b) => (a.position || 0) - (b.position || 0))

  const handleReplay = async () => {
    if (selectedStep === null) return
    setSubmitting(true)
    try {
      await onReplay(pipeline.id, selectedStep, modifiedInput)
      onClose()
    } catch (e) {
      alert(e.message)
    }
    setSubmitting(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-hive-800 border border-hive-700 rounded-xl w-full max-w-lg p-5 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-hive-100 flex items-center gap-2">
            <span>🔄</span> Replay: {pipeline.name}
          </h3>
          <button onClick={onClose} className="text-hive-400 hover:text-hive-200 text-xl">&times;</button>
        </div>

        <div className="text-xs text-hive-400 mb-3">Select a step to replay from. All subsequent steps will re-run.</div>

        <div className="flex-1 overflow-y-auto space-y-2 mb-4">
          {steps.map((step, i) => {
            const agent = agents.find(a => a.id === step.agent_id)
            const isSelected = selectedStep === i
            return (
              <button key={i} onClick={() => { setSelectedStep(i); setModifiedInput(step.prompt_template || '') }}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  isSelected ? 'border-honey bg-honey/10' : 'border-hive-700 bg-hive-700/30 hover:border-hive-500'
                }`}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-hive-500 w-6">#{i + 1}</span>
                  <span>{agent?.avatar || '🤖'}</span>
                  <span className="text-sm text-hive-200">{agent?.name || step.agent_id}</span>
                  {isSelected && <span className="ml-auto text-xs text-honey font-medium">Replay from here</span>}
                </div>
                {step.prompt_template && (
                  <div className="text-[11px] text-hive-400 mt-1 ml-8 line-clamp-1">{step.prompt_template}</div>
                )}
              </button>
            )
          })}
        </div>

        {selectedStep !== null && (
          <div className="mb-4">
            <label className="text-xs text-hive-400 block mb-1">Modified input (optional):</label>
            <textarea
              value={modifiedInput}
              onChange={e => setModifiedInput(e.target.value)}
              placeholder="Override the step prompt, or leave as-is..."
              rows={3}
              className="w-full bg-hive-900 border border-hive-600 rounded-lg px-3 py-2 text-sm text-hive-100 placeholder:text-hive-500 focus:outline-none focus:ring-2 focus:ring-honey/50 resize-none"
            />
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-hive-400 hover:text-hive-200">Cancel</button>
          <button onClick={handleReplay} disabled={selectedStep === null || submitting}
            className="px-4 py-1.5 bg-honey text-white rounded-lg text-sm font-medium hover:bg-honey-dim disabled:opacity-40 transition-colors">
            {submitting ? 'Starting...' : `Replay from Step ${selectedStep !== null ? selectedStep + 1 : '...'}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ──

export default function PipelineBuilder({ agents, onClose }) {
  const [pipelines, setPipelines] = useState([])
  const [editing, setEditing] = useState(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [running, setRunning] = useState(null)
  const [editingNode, setEditingNode] = useState(null)
  const [pipelineStatuses, setPipelineStatuses] = useState({})
  const [replayingPipeline, setReplayingPipeline] = useState(null)
  const [isMobile] = useState(() => window.innerWidth < 768)

  // List-based fallback state (for mobile + simple editing)
  const [listSteps, setListSteps] = useState([])

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const onConnect = useCallback((params) => setEdges(eds => addEdge({
    ...params,
    markerEnd: { type: MarkerType.ArrowClosed, color: '#E8C547' },
    style: { stroke: '#E8C547', strokeWidth: 2 },
  }, eds)), [setEdges])

  const refresh = () => api.getPipelines().then(setPipelines).catch(() => {})
  useEffect(() => { refresh() }, [])

  useEffect(() => {
    if (pipelines.length === 0) return
    const fetchStatuses = async () => {
      const statuses = {}
      for (const p of pipelines) {
        try {
          const s = await api.getPipelineStatus(p.id)
          if (s) statuses[p.id] = s
        } catch {}
      }
      setPipelineStatuses(statuses)
    }
    fetchStatuses()
    const interval = setInterval(fetchStatuses, 5000)
    return () => clearInterval(interval)
  }, [pipelines.length])

  const startNew = () => {
    setEditing('new')
    setName('')
    setDescription('')
    if (isMobile) {
      setListSteps([{ agent_id: agents[0]?.id || '', prompt_template: '', position: 1 }])
    } else {
      const { nodes: n, edges: e } = pipelineToFlow({ steps: [{ agent_id: agents[0]?.id || '', prompt_template: '', position: 1 }] }, agents)
      setNodes(n)
      setEdges(e)
    }
  }

  const editPipeline = (p) => {
    setEditing(p.id)
    setName(p.name)
    setDescription(p.description || '')
    if (isMobile) {
      setListSteps(p.steps.sort((a, b) => a.position - b.position))
    } else {
      const { nodes: n, edges: e } = pipelineToFlow(p, agents)
      setNodes(n)
      setEdges(e)
    }
  }

  const handleSave = async () => {
    if (!name.trim()) return
    const steps = isMobile ? listSteps : flowToPipeline(nodes)
    if (steps.length === 0) return
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
    try { await api.runPipeline(id) } catch (e) { alert(e.message) }
    setRunning(null)
  }

  const handleDelete = async (id) => {
    await api.deletePipeline(id)
    refresh()
  }

  const handleReplay = async (pipelineId, fromStep, modifiedInput) => {
    await api.replayPipeline(pipelineId, fromStep, modifiedInput)
  }

  const addAgentToCanvas = (agentId) => {
    const agent = agents.find(a => a.id === agentId)
    const agentNodes = nodes.filter(n => n.type === 'agentNode')
    const y = agentNodes.length > 0 ? Math.max(...agentNodes.map(n => n.position.y)) + 140 : 100
    const newNode = {
      id: `step-${Date.now()}`,
      type: 'agentNode',
      position: { x: 200, y },
      data: { agentId, agent, prompt: '' },
    }
    setNodes(nds => [...nds, newNode])
  }

  const onNodeDoubleClick = useCallback((_, node) => {
    if (node.type === 'agentNode') setEditingNode(node)
  }, [])

  const handlePromptSave = (prompt) => {
    setNodes(nds => nds.map(n =>
      n.id === editingNode.id ? { ...n, data: { ...n.data, prompt } } : n
    ))
    setEditingNode(null)
  }

  // ── Mobile list editor helpers ──
  const addListStep = () => setListSteps([...listSteps, { agent_id: agents[0]?.id || '', prompt_template: '', position: listSteps.length + 1 }])
  const removeListStep = (i) => setListSteps(listSteps.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, position: idx + 1 })))
  const updateListStep = (i, field, value) => {
    const updated = [...listSteps]
    updated[i] = { ...updated[i], [field]: value }
    setListSteps(updated)
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 md:p-4" onClick={onClose}>
      <div className="bg-hive-800 border border-hive-700 rounded-xl w-full max-w-5xl shadow-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="p-4 border-b border-hive-700 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔗</span>
            <h2 className="text-lg font-semibold">{editing ? (editing === 'new' ? 'New Pipeline' : 'Edit Pipeline') : 'Pipelines'}</h2>
          </div>
          <div className="flex gap-2">
            {editing && <button onClick={() => setEditing(null)} className="text-sm text-hive-400 hover:text-hive-200">Back</button>}
            <button onClick={onClose} className="text-hive-400 hover:text-hive-200 text-xl">&times;</button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          {!editing ? (
            /* ── Pipeline List ── */
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
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
                      <button onClick={() => setReplayingPipeline(p)} className="px-2 py-1 text-xs text-purple-400 hover:text-purple-300">🔄 Replay</button>
                      <button onClick={() => editPipeline(p)} className="px-2 py-1 text-xs text-hive-400 hover:text-hive-200">Edit</button>
                      <button onClick={() => handleDelete(p.id)} className="px-2 py-1 text-xs text-red-400 hover:text-red-300">Del</button>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    {p.steps.sort((a, b) => a.position - b.position).map((s, i) => {
                      const agent = agents.find(a => a.id === s.agent_id)
                      const ps = pipelineStatuses[p.id]
                      const stepInfo = ps?.steps?.[i]
                      const stepStatus = stepInfo?.status
                      const dotColor = stepStatus === 'done' ? 'bg-green-500' :
                                       stepStatus === 'in_progress' ? 'bg-honey animate-pulse' :
                                       stepStatus === 'failed' ? 'bg-red-500' : 'bg-hive-600'
                      const borderColor = stepStatus === 'done' ? 'border-green-500/30' :
                                          stepStatus === 'in_progress' ? 'border-honey/30' :
                                          stepStatus === 'failed' ? 'border-red-500/30' : 'border-transparent'
                      return (
                        <div key={i} className="flex items-center gap-1">
                          {i > 0 && <span className="text-hive-600 text-xs">→</span>}
                          <span className={`text-xs px-2 py-0.5 bg-hive-700 rounded-full flex items-center gap-1.5 border ${borderColor}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
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
            /* ── Pipeline Editor ── */
            <div className="flex-1 overflow-hidden flex flex-col">
              {/* Name/description */}
              <div className="p-4 border-b border-hive-700 space-y-2 shrink-0">
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Pipeline name..."
                  className="w-full bg-hive-900 border border-hive-600 rounded-lg px-3 py-2 text-sm text-hive-100 placeholder:text-hive-500 focus:outline-none focus:ring-2 focus:ring-honey/50" />
                <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)"
                  className="w-full bg-hive-900 border border-hive-600 rounded-lg px-3 py-2 text-sm text-hive-100 placeholder:text-hive-500 focus:outline-none focus:ring-2 focus:ring-honey/50" />
              </div>

              {isMobile ? (
                /* ── Mobile: List editor ── */
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {listSteps.map((step, i) => {
                    const agent = agents.find(a => a.id === step.agent_id)
                    return (
                      <div key={i} className="p-3 bg-hive-700/30 rounded-lg border border-hive-700">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-bold text-hive-500 w-6">#{step.position}</span>
                          <select value={step.agent_id} onChange={e => updateListStep(i, 'agent_id', e.target.value)}
                            className="flex-1 bg-hive-900 border border-hive-600 rounded-lg px-2 py-1.5 text-sm text-hive-100">
                            {agents.map(a => <option key={a.id} value={a.id}>{a.avatar} {a.name}</option>)}
                          </select>
                          {listSteps.length > 1 && (
                            <button onClick={() => removeListStep(i)} className="text-xs text-red-400">Remove</button>
                          )}
                        </div>
                        <textarea value={step.prompt_template} onChange={e => updateListStep(i, 'prompt_template', e.target.value)}
                          placeholder={`Instructions for ${agent?.name || 'agent'}...`} rows={3}
                          className="w-full bg-hive-900 border border-hive-600 rounded-lg px-3 py-2 text-sm text-hive-100 placeholder:text-hive-500 resize-none" />
                      </div>
                    )
                  })}
                  <button onClick={addListStep} className="w-full p-2 border border-dashed border-hive-600 rounded-lg text-xs text-hive-400 hover:border-hive-500">
                    + Add Step
                  </button>
                </div>
              ) : (
                /* ── Desktop: React Flow canvas ── */
                <div className="flex-1 flex">
                  {/* Agent palette */}
                  <div className="w-48 border-r border-hive-700 p-3 overflow-y-auto shrink-0">
                    <div className="text-xs font-medium text-hive-400 uppercase tracking-wider mb-2">Drag Agent</div>
                    {agents.map(agent => (
                      <button
                        key={agent.id}
                        onClick={() => addAgentToCanvas(agent.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-hive-200 hover:bg-hive-700/50 transition-colors mb-1 text-left"
                      >
                        <span>{agent.avatar}</span>
                        <span className="truncate">{agent.name}</span>
                      </button>
                    ))}
                  </div>

                  {/* Canvas */}
                  <div className="flex-1" style={{ height: '100%', minHeight: 400 }}>
                    <ReactFlow
                      nodes={nodes}
                      edges={edges}
                      onNodesChange={onNodesChange}
                      onEdgesChange={onEdgesChange}
                      onConnect={onConnect}
                      onNodeDoubleClick={onNodeDoubleClick}
                      nodeTypes={nodeTypes}
                      fitView
                      style={{ background: '#12121e' }}
                      defaultEdgeOptions={{
                        markerEnd: { type: MarkerType.ArrowClosed, color: '#E8C547' },
                        style: { stroke: '#E8C547', strokeWidth: 2 },
                      }}
                    >
                      <Background color="#2a2a3e" gap={20} size={1} />
                      <Controls className="!bg-hive-800 !border-hive-700 !rounded-lg [&>button]:!bg-hive-700 [&>button]:!border-hive-600 [&>button]:!text-hive-200 [&>button:hover]:!bg-hive-600" />
                      <MiniMap
                        nodeColor={() => '#E8C547'}
                        maskColor="rgba(0,0,0,0.6)"
                        style={{ background: '#1e1e2e', border: '1px solid #333' }}
                      />
                    </ReactFlow>
                  </div>
                </div>
              )}

              {/* Save footer */}
              <div className="p-4 border-t border-hive-700 flex justify-end gap-2 shrink-0">
                <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm text-hive-400 hover:text-hive-200">Cancel</button>
                <button onClick={handleSave} disabled={!name.trim()}
                  className="px-5 py-2 bg-gradient-to-r from-honey to-honey-dim text-white rounded-lg font-medium text-sm hover:opacity-90 disabled:opacity-40">
                  {editing === 'new' ? 'Create Pipeline' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Prompt editor modal */}
      {editingNode && (
        <PromptEditor node={editingNode} onSave={handlePromptSave} onClose={() => setEditingNode(null)} />
      )}

      {/* Replay modal */}
      {replayingPipeline && (
        <ReplayModal
          pipeline={replayingPipeline}
          agents={agents}
          onClose={() => setReplayingPipeline(null)}
          onReplay={handleReplay}
        />
      )}
    </div>
  )
}
