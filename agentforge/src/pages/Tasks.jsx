import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { useTaskStream } from '../lib/useTaskStream';

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [agents, setAgents] = useState([]);
  const [filter, setFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', agent_id: '' });
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    loadTasks();
    api.agents().then(setAgents).catch(() => {});
  }, [filter]);

  async function loadTasks() {
    try {
      const params = {};
      if (filter) params.status = filter;
      setTasks(await api.tasks(params));
    } catch {}
  }

  async function handleCreate(e) {
    e.preventDefault();
    try {
      await api.createTask(form);
      setShowCreate(false);
      setForm({ title: '', description: '', agent_id: '' });
      loadTasks();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleRun(id) {
    try { await api.runTask(id); loadTasks(); } catch (err) { alert(err.message); }
  }

  async function handleCancel(id) {
    try { await api.cancelTask(id); loadTasks(); } catch {}
  }

  async function viewTask(id) {
    try { setSelected(await api.task(id)); } catch {}
  }

  const statuses = ['', 'pending', 'running', 'completed', 'failed'];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Tasks</h2>
        <button onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
          + New Task
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        {statuses.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${filter === s ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 max-w-xl">
          <form onSubmit={handleCreate} className="space-y-3">
            <input placeholder="Task title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            <textarea placeholder="Description (optional)" value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })} rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            <select value={form.agent_id} onChange={e => setForm({ ...form, agent_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
              <option value="">Assign to agent...</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name} — {a.role}</option>)}
            </select>
            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
              Create Task
            </button>
          </form>
        </div>
      )}

      {/* Task list */}
      <div className="space-y-2">
        {tasks.map(t => (
          <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between hover:shadow-sm transition-shadow">
            <div className="cursor-pointer flex-1" onClick={() => viewTask(t.id)}>
              <div className="font-medium text-sm">{t.title}</div>
              <div className="text-xs text-gray-400 mt-0.5">{t.agent_name || 'Unassigned'} · {t.credits_used} credits</div>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={t.status} />
              {t.status === 'pending' && (
                <button onClick={() => handleRun(t.id)} className="text-xs text-indigo-600 hover:underline">Run</button>
              )}
              {['pending', 'running'].includes(t.status) && (
                <button onClick={() => handleCancel(t.id)} className="text-xs text-red-500 hover:underline">Cancel</button>
              )}
            </div>
          </div>
        ))}
        {tasks.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No tasks found.</p>}
      </div>

      {/* Task detail modal */}
      {selected && (
        <TaskDetailModal
          task={selected}
          onClose={() => { setSelected(null); loadTasks(); }}
        />
      )}
    </div>
  );
}

function TaskDetailModal({ task, onClose }) {
  const isRunning = task.status === 'running';
  const { steps, status: streamStatus, error: streamError, isConnected } = useTaskStream(isRunning ? task.id : null);
  const scrollRef = useRef(null);

  // Auto-scroll to latest step
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [steps]);

  // Merge: if streaming, show live steps; otherwise show saved logs
  const showLiveStream = isRunning && steps.length > 0;
  const displaySteps = showLiveStream ? steps : (task.logs || []);
  const isComplete = streamStatus === 'completed';
  const isFailed = streamStatus === 'failed';

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] flex flex-col m-4" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-6 pb-4 border-b border-gray-100">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-lg font-bold">{task.title}</h3>
              <div className="text-sm text-gray-500 flex items-center gap-2 mt-1">
                {task.agent_name}
                <StatusBadge status={isComplete ? 'completed' : isFailed ? 'failed' : task.status} />
                {isRunning && isConnected && (
                  <span className="flex items-center gap-1 text-xs text-blue-600">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                    </span>
                    Live
                  </span>
                )}
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
          </div>
          {task.description && <p className="text-sm text-gray-600 mt-3">{task.description}</p>}
        </div>

        {/* Scrollable body */}
        <div ref={scrollRef} className="flex-1 overflow-auto p-6 pt-4">
          {/* Success result banner */}
          {(task.result || isComplete) && (
            <div className={`border rounded-lg p-3 mb-4 transition-all duration-500 ${isComplete ? 'bg-green-50 border-green-200 animate-fade-in' : 'bg-green-50 border-green-200'}`}>
              <div className="text-xs font-medium text-green-700 mb-1 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Result
              </div>
              <div className="text-sm whitespace-pre-wrap">{isComplete ? steps[steps.length - 1]?.content : task.result}</div>
            </div>
          )}

          {/* Error banner */}
          {(task.error || isFailed) && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <div className="text-xs font-medium text-red-700 mb-1">Error</div>
              <div className="text-sm">{streamError || task.error}</div>
            </div>
          )}

          {/* Execution steps */}
          {displaySteps.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-3">Execution Trace</h4>
              <div className="space-y-2">
                {displaySteps.map((item, i) => (
                  <StepEntry key={i} item={item} isLive={showLiveStream} isLatest={i === displaySteps.length - 1} />
                ))}
              </div>
            </div>
          )}

          {/* Streaming indicator */}
          {isRunning && isConnected && !isComplete && !isFailed && (
            <div className="flex items-center gap-2 mt-4 text-xs text-gray-400">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
              Agent is thinking...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StepEntry({ item, isLive, isLatest }) {
  // Normalize: live stream events use `event` + `type`, saved logs use `type` directly
  const type = item.event ? item.type : item.type;
  const content = item.content || '';
  const toolName = item.tool_name || item.toolName;
  const timestamp = item.timestamp || item.created_at;

  // Skip connected/start/complete events in the trace (they show as banners)
  if (item.event === 'connected' || item.event === 'task:complete') return null;

  const config = stepConfig[type] || stepConfig.thought;

  return (
    <div className={`text-xs border-l-2 pl-3 py-1.5 transition-all duration-300 ${isLive && isLatest ? 'animate-slide-in' : ''}`}
      style={{ borderColor: config.color }}>
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${config.badge}`}>
          {config.icon} {config.label}
        </span>
        {toolName && <span className="text-gray-400 font-mono text-[10px]">{toolName}</span>}
        {timestamp && (
          <span className="text-gray-300 text-[10px] ml-auto">
            {new Date(timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>
      <div className="text-gray-600 mt-1 whitespace-pre-wrap break-words leading-relaxed">{content}</div>
    </div>
  );
}

const stepConfig = {
  start: {
    color: '#8b5cf6', badge: 'bg-violet-50 text-violet-700', label: 'Start', icon: '▶',
  },
  thought: {
    color: '#6366f1', badge: 'bg-indigo-50 text-indigo-700', label: 'Thought', icon: '◆',
  },
  action: {
    color: '#f59e0b', badge: 'bg-amber-50 text-amber-700', label: 'Action', icon: '⚡',
  },
  observation: {
    color: '#10b981', badge: 'bg-emerald-50 text-emerald-700', label: 'Observation', icon: '●',
  },
  error: {
    color: '#ef4444', badge: 'bg-red-50 text-red-700', label: 'Error', icon: '✕',
  },
};

function StatusBadge({ status }) {
  const colors = {
    pending: 'bg-gray-100 text-gray-600', running: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700', failed: 'bg-red-100 text-red-700',
    paused: 'bg-yellow-100 text-yellow-700', cancelled: 'bg-gray-100 text-gray-500',
  };
  return <span className={`text-xs px-2 py-1 rounded-full font-medium ${colors[status] || colors.pending}`}>{status}</span>;
}
