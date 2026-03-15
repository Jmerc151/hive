import { useState } from 'react'
import { api } from '../lib/api'

const AGENT_TILES = {
  scout:  { letter: 'S', class: 'tile-scout' },
  forge:  { letter: 'F', class: 'tile-forge' },
  quill:  { letter: 'Q', class: 'tile-quill' },
  dealer: { letter: 'D', class: 'tile-dealer' },
  oracle: { letter: 'O', class: 'tile-oracle' },
  nexus:  { letter: 'N', class: 'tile-nexus' },
}

const COLUMNS = [
  { id: 'backlog', label: 'Backlog', dot: 'bg-t5' },
  { id: 'todo', label: 'To Do', dot: 'bg-t4' },
  { id: 'awaiting_approval', label: 'Approval', dot: 'bg-warning' },
  { id: 'in_progress', label: 'In Progress', dot: 'bg-success' },
  { id: 'in_review', label: 'Review', dot: 'bg-oracle' },
  { id: 'done', label: 'Done', dot: 'bg-success' },
  { id: 'failed', label: 'Failed', dot: 'bg-danger' },
]

const PRIORITY_BADGE = {
  critical: 'bg-[rgba(255,59,48,0.1)] text-danger',
  high: 'bg-[rgba(255,149,0,0.1)] text-[#c67600]',
  medium: 'bg-[rgba(142,142,147,0.1)] text-t3',
  low: 'bg-[rgba(142,142,147,0.06)] text-t4',
}

export default function TaskBoard({ tasks, agents, onSelectTask, onRunTask, onUpdateTask }) {
  const [mobileColumn, setMobileColumn] = useState('todo')

  return (
    <>
      {/* Mobile: column picker + single column view */}
      <div className="md:hidden flex flex-col flex-1 overflow-hidden pb-16">
        <div className="flex overflow-x-auto px-3 py-2 gap-1.5 shrink-0" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
          {COLUMNS.map(col => {
            const count = tasks.filter(t => t.status === col.id).length
            const isActive = mobileColumn === col.id
            return (
              <button
                key={col.id}
                onClick={() => setMobileColumn(col.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all shrink-0 ${
                  isActive
                    ? 'bg-t1 text-white'
                    : 'text-t3 hover:bg-s3'
                }`}
                style={{ border: isActive ? 'none' : '0.5px solid rgba(0,0,0,0.08)' }}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-white/50' : col.dot}`} />
                {col.label}
                {count > 0 && (
                  <span className={`text-[10px] rounded-full px-1.5 ${isActive ? 'bg-white/20' : 'bg-s3'}`}>{count}</span>
                )}
              </button>
            )
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {tasks.filter(t => t.status === mobileColumn).map(task => {
            const agent = agents.find(a => a.id === task.agent_id)
            return (
              <TaskCard key={task.id} task={task} agent={agent} onSelect={() => onSelectTask(task.id)} onRun={() => onRunTask(task.id)} />
            )
          })}
          {tasks.filter(t => t.status === mobileColumn).length === 0 && (
            <div className="text-center py-16">
              <p className="text-sm text-t4">No tasks here</p>
            </div>
          )}
        </div>
      </div>

      {/* Desktop: horizontal kanban */}
      <div className="hidden md:block flex-1 overflow-x-auto p-4">
        <div className="flex gap-3 h-full min-w-max">
          {COLUMNS.map(col => {
            const colTasks = tasks.filter(t => t.status === col.id)
            return (
              <div key={col.id} className="w-72 flex flex-col rounded-2xl bg-s1/60" style={{ border: '0.5px solid rgba(0,0,0,0.06)' }}>
                <div className="p-3 flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                  <span className="font-medium text-sm text-t1">{col.label}</span>
                  <span className="text-xs text-t4 bg-s3 rounded-full px-2 py-0.5" style={{ border: '0.5px solid rgba(0,0,0,0.06)' }}>{colTasks.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
                  {colTasks.map(task => {
                    const agent = agents.find(a => a.id === task.agent_id)
                    return (
                      <TaskCard key={task.id} task={task} agent={agent} onSelect={() => onSelectTask(task.id)} onRun={() => onRunTask(task.id)} />
                    )
                  })}
                  {colTasks.length === 0 && (
                    <div className="text-center text-xs text-t4 py-8">No tasks</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

function getOutputPreview(output) {
  if (!output) return null
  let clean = output
    .replace(/^--- Step \d+ ---$/gm, '')
    .replace(/\[TOOL:\w+\][\s\S]*?\[\/TOOL\]/g, '')
    .replace(/\[TOOL_RESULT:\w+\][\s\S]*?\[\/TOOL_RESULT\]/g, '[used real data]')
    .replace(/\[TOOL_ERROR:\w+\][\s\S]*?\[\/TOOL_ERROR\]/g, '')
    .replace(/\[CONSULT:\w+\][\s\S]*$/gm, '')
    .replace(/```[\s\S]*?```/g, '[code block]')
    .replace(/#{1,3}\s+/g, '')
    .replace(/\*\*/g, '')
    .trim()
  const lines = clean.split('\n').filter(l => l.trim().length > 10)
  return lines.length > 0 ? lines[0].trim().slice(0, 120) : null
}

function TaskCard({ task, agent, onSelect, onRun }) {
  const outputPreview = task.status === 'done' ? getOutputPreview(task.output) : null
  const hasToolResults = task.output?.includes('[TOOL_RESULT')
  const outputLen = (task.output || '').length
  const tile = agent ? AGENT_TILES[agent.id] || { letter: '?', class: 'tile-nexus' } : null

  return (
    <div
      onClick={onSelect}
      className="hive-card p-3.5 cursor-pointer group active:scale-[0.98] transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-sm font-medium text-t1 leading-snug flex-1">{task.title}</h3>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium shrink-0 ${PRIORITY_BADGE[task.priority] || PRIORITY_BADGE.medium}`}>
          {task.priority}
        </span>
      </div>

      {task.status !== 'done' && task.description && (
        <p className="text-xs text-t3 line-clamp-2 mb-3 leading-relaxed">{task.description}</p>
      )}

      {task.status === 'done' && (
        <div className="mb-3">
          {outputPreview ? (
            <p className="text-xs text-t3 line-clamp-2 leading-relaxed italic">
              "{outputPreview}{outputPreview.length >= 120 ? '...' : ''}"
            </p>
          ) : outputLen > 0 ? (
            <p className="text-[10px] text-t4 italic">Output too short or malformed</p>
          ) : (
            <p className="text-[10px] text-danger/60 italic">No output produced</p>
          )}
          <div className="flex items-center gap-2 mt-1.5">
            {hasToolResults && (
              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(52,199,89,0.1)', color: '#248a3d' }}>
                used real tools
              </span>
            )}
            {outputLen > 1000 && (
              <span className="text-[10px] text-t4">{Math.round(outputLen / 1000)}k chars</span>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        {agent ? (
          <div className="flex items-center gap-1.5">
            <div className={`agent-tile w-5 h-5 rounded-md text-[10px] ${tile.class}`}>{tile.letter}</div>
            <span className="text-xs text-t3 font-medium">{agent.name}</span>
          </div>
        ) : (
          <span className="text-xs text-t4 italic">Unassigned</span>
        )}

        {(task.status === 'todo' || task.status === 'backlog' || task.status === 'failed') && task.agent_id && (
          <button
            onClick={(e) => { e.stopPropagation(); onRun() }}
            className="btn-ghost text-xs px-2.5 py-1 md:opacity-0 md:group-hover:opacity-100 active:scale-95"
          >
            Run &#x25B6;
          </button>
        )}

        {task.status === 'awaiting_approval' && (
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); api.approveTask(task.id) }}
              className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: 'rgba(52,199,89,0.1)', color: '#248a3d' }}
            >Approve</button>
            <button
              onClick={(e) => { e.stopPropagation(); api.rejectTask(task.id) }}
              className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: 'rgba(255,59,48,0.1)', color: '#ff3b30' }}
            >Reject</button>
          </div>
        )}

        {task.status === 'in_progress' && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full" style={{ background: 'rgba(52,199,89,0.1)' }}>
            <div className="w-1.5 h-1.5 rounded-full bg-success dot-pulse" />
            <span className="text-xs text-success font-medium">Running</span>
          </div>
        )}

        {task.status === 'done' && (
          <div className="flex items-center gap-1.5">
            {task.nexus_score != null && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                task.nexus_score >= 7 ? 'text-success' : task.nexus_score >= 4 ? 'text-warning' : 'text-danger'
              }`} style={{ background: task.nexus_score >= 7 ? 'rgba(52,199,89,0.1)' : task.nexus_score >= 4 ? 'rgba(255,149,0,0.1)' : 'rgba(255,59,48,0.1)' }}>
                {task.nexus_score}/10
              </span>
            )}
            <span className="text-xs text-success font-medium flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Done
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
