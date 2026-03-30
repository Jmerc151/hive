import { useState, useEffect } from 'react';
import { api } from '../lib/api';

export default function Dashboard() {
  const [usage, setUsage] = useState(null);
  const [recentTasks, setRecentTasks] = useState([]);
  const [agents, setAgents] = useState([]);

  useEffect(() => {
    api.usage().then(setUsage).catch(() => {});
    api.tasks({ limit: 5 }).then(setRecentTasks).catch(() => {});
    api.agents().then(setAgents).catch(() => {});
  }, []);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Dashboard</h2>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Credits Left" value={usage?.credits_remaining ?? '—'} />
        <StatCard label="Plan" value={usage?.plan ?? '—'} />
        <StatCard label="Used Today" value={usage?.today ?? '—'} />
        <StatCard label="Used This Month" value={usage?.month ?? '—'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Agents */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold mb-3">Your Agents ({agents.length})</h3>
          {agents.length === 0 ? (
            <p className="text-sm text-gray-400">No agents yet. Create one to get started.</p>
          ) : (
            <div className="space-y-2">
              {agents.map(a => (
                <div key={a.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
                       style={{ background: a.color || '#6366f1', color: 'white' }}>
                    {a.avatar || a.name[0]}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{a.name}</div>
                    <div className="text-xs text-gray-400">{a.role}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Tasks */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold mb-3">Recent Tasks</h3>
          {recentTasks.length === 0 ? (
            <p className="text-sm text-gray-400">No tasks yet.</p>
          ) : (
            <div className="space-y-2">
              {recentTasks.map(t => (
                <div key={t.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
                  <div>
                    <div className="text-sm font-medium">{t.title}</div>
                    <div className="text-xs text-gray-400">{t.agent_name || 'Unassigned'}</div>
                  </div>
                  <StatusBadge status={t.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-2xl font-bold mt-1 capitalize">{value}</div>
    </div>
  );
}

function StatusBadge({ status }) {
  const colors = {
    pending: 'bg-gray-100 text-gray-600',
    running: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    paused: 'bg-yellow-100 text-yellow-700',
    cancelled: 'bg-gray-100 text-gray-500',
  };
  return (
    <span className={`text-xs px-2 py-1 rounded-full font-medium ${colors[status] || colors.pending}`}>
      {status}
    </span>
  );
}
