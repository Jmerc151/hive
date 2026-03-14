import { useState } from 'react'
import { api } from '../lib/api'

const COLUMNS = [
  { id: 'backlog', label: 'Backlog', color: 'text-hive-400', dot: 'bg-hive-500' },
  { id: 'todo', label: 'To Do', color: 'text-blue-400', dot: 'bg-blue-400' },
  { id: 'awaiting_approval', label: 'Approval', color: 'text-amber-400', dot: 'bg-amber-400' },
  { id: 'in_progress', label: 'In Progress', color: 'text-honey', dot: 'bg-honey' },
  { id: 'in_review', label: 'Review', color: 'text-prism', dot: 'bg-prism' },
  { id: 'done', label: 'Done', color: 'text-honey', dot: 'bg-honey' },
  { id: 'failed', label: 'Failed', color: 'text-red-400', dot: 'bg-red-400' },
]

const PRIORITY_BADGE = {
  critical: 'bg-red-500/15 text-red-400 border-red-500/20',
  high: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
  medium: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  low: 'bg-hive-500/15 text-hive-400 border-hive-500/20',
}

export default function TaskBoard({ tasks, agents, onSelectTask, onRunTask, onUpdateTask }) {
  const [mobileColumn, setMobileColumn] = useState('todo')

  return (
    <>
      {/* Mobile: column picker + single column view */}
      <div className="md:hidden flex flex-col flex-1 overflow-hidden pb-16">
        <div className="flex overflow-x-auto px-3 py-2 gap-1 border-b border-hive-700/30 shrink-0">
          {COLUMNS.map(col => {
            const count = tasks.filter(t => t.status === col.id).length
            return (
              <button
                key={col.id}
                onClick={() => setMobileColumn(col.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all shrink-0 ${
                  mobileColumn === col.id
                    ? `${col.color} bg-hive-800 border border-hive-600`
                    : 'text-hive-500 active:bg-hive-800'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${col.dot}`} />
                {col.label}
                {count > 0 && (
                  <span className="text-[10px] bg-hive-700 rounded-full px-1.5">{count}</span>
                )}
              </button>
            )
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {tasks.filter(t => t.status === mobileColumn).map(task => {
            const agent = agents.find(a => a.id === task.agent_id)
            return (
              <TaskCard
                key={task.id}
                task={task}
                agent={agent}
                onSelect={() => onSelectTask(task.id)}
                onRun={() => onRunTask(task.id)}
              />
            )
          })}
          {tasks.filter(t => t.status === mobileColumn).length === 0 && (
            <div className="text-center py-16">
              <div className="w-12 h-12 rounded-2xl bg-hive-800 flex items-center justify-center mx-auto mb-3">
                <span className="text-xl text-hive-600">📋</span>
              </div>
              <p className="text-sm text-hive-500">No tasks here</p>
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
              <div key={col.id} className="w-72 flex flex-col bg-hive-800/30 rounded-2xl border border-hive-700/30">
                <div className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                    <span className={`font-medium text-sm ${col.color}`}>{col.label}</span>
                    <span className="text-xs bg-hive-700/50 text-hive-500 rounded-full px-2 py-0.5">{colTasks.length}</span>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
                  {colTasks.map(task => {
                    const agent = agents.find(a => a.id === task.agent_id)
                    return (
                      <TaskCard
                        key={task.id}
                        task={task}
                        agent={agent}
                        onSelect={() => onSelectTask(task.id)}
                        onRun={() => onRunTask(task.id)}
                      />
                    )
                  })}

                  {colTasks.length === 0 && (
                    <div className="text-center text-xs text-hive-600 py-8">No tasks</div>
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
  // Strip step headers and tool syntax to get the "human" content
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
  // Get first meaningful line (skip empty lines)
  const lines = clean.split('\n').filter(l => l.trim().length > 10)
  return lines.length > 0 ? lines[0].trim().slice(0, 120) : null
}

function TaskCard({ task, agent, onSelect, onRun }) {
  const outputPreview = task.status === 'done' ? getOutputPreview(task.output) : null
  const hasToolResults = task.output?.includes('[TOOL_RESULT')
  const outputLen = (task.output || '').length

  return (
    <div
      onClick={onSelect}
      className="bg-hive-800/80 border border-hive-700/50 rounded-xl p-3.5 cursor-pointer hover:border-hive-500/50 transition-all group active:scale-[0.98]"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-sm font-medium leading-snug flex-1">{task.title}</h3>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-md border font-medium shrink-0 ${PRIORITY_BADGE[task.priority]}`}>
          {task.priority}
        </span>
      </div>

      {task.status !== 'done' && task.description && (
        <p className="text-xs text-hive-500 line-clamp-2 mb-3 leading-relaxed">{task.description}</p>
      )}

      {/* Output preview for done tasks */}
      {task.status === 'done' && (
        <div className="mb-3">
          {outputPreview ? (
            <p className="text-xs text-hive-400 line-clamp-2 leading-relaxed italic">
              "{outputPreview}{outputPreview.length >= 120 ? '...' : ''}"
            </p>
          ) : outputLen > 0 ? (
            <p className="text-[10px] text-hive-600 italic">Output too short or malformed</p>
          ) : (
            <p className="text-[10px] text-red-400/60 italic">No output produced</p>
          )}
          <div className="flex items-center gap-2 mt-1.5">
            {hasToolResults && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">
                used real tools
              </span>
            )}
            {outputLen > 1000 && (
              <span className="text-[10px] text-hive-600">{Math.round(outputLen / 1000)}k chars</span>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        {agent ? (
          <div className="flex items-center gap-1.5">
            <span className="text-sm">{agent.avatar}</span>
            <span className="text-xs text-hive-400 font-medium">{agent.name}</span>
          </div>
        ) : (
          <span className="text-xs text-hive-600 italic">Unassigned</span>
        )}

        {(task.status === 'todo' || task.status === 'backlog' || task.status === 'failed') && task.agent_id && (
          <button
            onClick={(e) => { e.stopPropagation(); onRun() }}
            className="text-xs px-2.5 py-1 bg-honey/15 text-honey rounded-lg hover:bg-honey/25 transition-all font-medium md:opacity-0 md:group-hover:opacity-100 active:scale-95"
          >
            Run ▶
          </button>
        )}

        {task.status === 'awaiting_approval' && (
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); api.approveTask(task.id) }}
              className="text-xs px-2 py-0.5 bg-green-500/15 text-green-400 rounded hover:bg-green-500/25 font-medium"
            >Approve</button>
            <button
              onClick={(e) => { e.stopPropagation(); api.rejectTask(task.id) }}
              className="text-xs px-2 py-0.5 bg-red-500/15 text-red-400 rounded hover:bg-red-500/25 font-medium"
            >Reject</button>
          </div>
        )}

        {task.status === 'in_progress' && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-honey/10 rounded-full">
            <div className="w-1.5 h-1.5 rounded-full bg-honey animate-pulse" />
            <span className="text-xs text-honey font-medium">Running</span>
          </div>
        )}

        {task.status === 'done' && (
          <div className="flex items-center gap-1.5">
            {task.nexus_score != null && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                task.nexus_score >= 7 ? 'bg-green-500/15 text-green-400' :
                task.nexus_score >= 4 ? 'bg-yellow-500/15 text-yellow-400' : 'bg-red-500/15 text-red-400'
              }`}>{task.nexus_score}/10</span>
            )}
            <span className="text-xs text-honey font-medium flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Done
            </span>
          </div>
        )}

        {task.status === 'awaiting_approval' && task.nexus_score != null && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded mr-1 ${
            task.nexus_score >= 7 ? 'bg-green-500/15 text-green-400' :
            task.nexus_score >= 4 ? 'bg-yellow-500/15 text-yellow-400' : 'bg-red-500/15 text-red-400'
          }`}>{task.nexus_score}/10</span>
        )}
      </div>
    </div>
  )
}
