import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
  PieChart, Pie,
} from 'recharts';

const STATUS_COLORS = {
  completed: '#22c55e',
  failed: '#ef4444',
  running: '#3b82f6',
  pending: '#9ca3af',
  paused: '#f59e0b',
  cancelled: '#6b7280',
};

const DEFAULT_AGENT_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6', '#06b6d4', '#84cc16', '#f43f5e'];

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

export default function Analytics() {
  const [overview, setOverview] = useState(null);
  const [daily, setDaily] = useState([]);
  const [agents, setAgents] = useState([]);
  const [taskDist, setTaskDist] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.analyticsOverview(),
      api.analyticsDaily(7),
      api.analyticsAgents(),
      api.analyticsTasks(),
    ])
      .then(([ov, d, ag, td]) => {
        setOverview(ov);
        setDaily(d.map(r => ({ ...r, date: new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) })));
        setAgents(ag);
        setTaskDist(td);
      })
      .catch(err => console.error('Analytics load error:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading analytics...</div>
      </div>
    );
  }

  const pieData = taskDist
    ? Object.entries(taskDist)
        .filter(([, v]) => v > 0)
        .map(([status, value]) => ({ name: status, value }))
    : [];

  const agentBarData = agents.map((a, i) => ({
    name: a.agent_name,
    credits: a.credits_used,
    color: a.agent_color || DEFAULT_AGENT_COLORS[i % DEFAULT_AGENT_COLORS.length],
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Analytics</h1>

      {/* Top stats */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Tasks" value={overview.total_tasks} sub={`${overview.tasks_today} today`} />
          <StatCard label="Credits This Month" value={overview.credits_this_month} sub={`${overview.credits_today} today`} />
          <StatCard label="Active Agents" value={overview.active_agents} sub={`${overview.total_agents} total`} />
          <StatCard label="Avg Credits/Task" value={overview.avg_credits_per_task} />
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Credit Usage Chart */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Credit Usage (7 days)</h2>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#9ca3af" />
              <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
              <Tooltip />
              <Line type="monotone" dataKey="credits_used" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} name="Credits" />
              <Line type="monotone" dataKey="tasks_completed" stroke="#22c55e" strokeWidth={1.5} dot={false} name="Completed" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Task Status Distribution */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Task Distribution</h2>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  dataKey="value"
                  paddingAngle={2}
                  label={({ name, value }) => `${name} (${value})`}
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || '#9ca3af'} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-400">No tasks yet</div>
          )}
        </div>
      </div>

      {/* Agent Performance Bar Chart */}
      {agentBarData.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Credits by Agent</h2>
          <ResponsiveContainer width="100%" height={Math.max(200, agentBarData.length * 48)}>
            <BarChart data={agentBarData} layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12 }} stroke="#9ca3af" />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} stroke="#9ca3af" width={80} />
              <Tooltip />
              <Bar dataKey="credits" radius={[0, 4, 4, 0]} name="Credits Used">
                {agentBarData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Agent Efficiency Table */}
      {agents.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="p-5 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-700">Agent Efficiency</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="px-5 py-3 font-medium">Agent</th>
                  <th className="px-5 py-3 font-medium text-right">Tasks Run</th>
                  <th className="px-5 py-3 font-medium text-right">Completed</th>
                  <th className="px-5 py-3 font-medium text-right">Failed</th>
                  <th className="px-5 py-3 font-medium text-right">Credits Used</th>
                  <th className="px-5 py-3 font-medium text-right">Avg/Task</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a, i) => (
                  <tr key={a.agent_id} className={i % 2 === 0 ? 'bg-gray-50/50' : ''}>
                    <td className="px-5 py-3 font-medium flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: a.agent_color || DEFAULT_AGENT_COLORS[i % DEFAULT_AGENT_COLORS.length] }} />
                      {a.agent_name}
                    </td>
                    <td className="px-5 py-3 text-right">{a.tasks_run}</td>
                    <td className="px-5 py-3 text-right text-green-600">{a.tasks_completed}</td>
                    <td className="px-5 py-3 text-right text-red-500">{a.tasks_failed}</td>
                    <td className="px-5 py-3 text-right">{a.credits_used}</td>
                    <td className="px-5 py-3 text-right text-gray-500">{a.avg_credits_per_task}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
