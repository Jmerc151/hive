import { useState, useEffect } from 'react';
import { api } from '../lib/api';

const DEFAULT_AGENT = {
  name: '', role: '', avatar: '', color: '#6366f1',
  model: 'anthropic/claude-haiku-4-5', system_prompt: '', tools: [],
};

export default function Agents() {
  const [agents, setAgents] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(DEFAULT_AGENT);

  useEffect(() => { loadAgents(); }, []);

  async function loadAgents() {
    try { setAgents(await api.agents()); } catch {}
  }

  async function handleSave(e) {
    e.preventDefault();
    try {
      if (editing) {
        await api.updateAgent(editing, form);
      } else {
        await api.createAgent(form);
      }
      setEditing(null);
      setForm(DEFAULT_AGENT);
      loadAgents();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this agent?')) return;
    try { await api.deleteAgent(id); loadAgents(); } catch {}
  }

  function startEdit(agent) {
    setEditing(agent.id);
    setForm({ name: agent.name, role: agent.role, avatar: agent.avatar || '', color: agent.color || '#6366f1',
      model: agent.model, system_prompt: agent.system_prompt, tools: agent.tools || [] });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Agents</h2>
        <button
          onClick={() => { setEditing(null); setForm(DEFAULT_AGENT); }}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
        >
          + New Agent
        </button>
      </div>

      {/* Agent list */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {agents.map(a => (
          <div key={a.id} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
                   style={{ background: a.color || '#6366f1', color: 'white' }}>
                {a.avatar || a.name[0]}
              </div>
              <div>
                <div className="font-semibold">{a.name}</div>
                <div className="text-xs text-gray-400">{a.role}</div>
              </div>
            </div>
            <div className="text-xs text-gray-500 mb-3 line-clamp-2">{a.system_prompt}</div>
            <div className="text-xs text-gray-400 mb-3">Model: {a.model}</div>
            <div className="flex gap-2">
              <button onClick={() => startEdit(a)} className="text-xs text-indigo-600 hover:underline">Edit</button>
              <button onClick={() => handleDelete(a.id)} className="text-xs text-red-500 hover:underline">Delete</button>
            </div>
          </div>
        ))}
      </div>

      {/* Create/Edit form */}
      {(editing !== undefined || agents.length === 0) && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-xl">
          <h3 className="font-semibold mb-4">{editing ? 'Edit Agent' : 'Create Agent'}</h3>
          <form onSubmit={handleSave} className="space-y-3">
            <input placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            <input placeholder="Role (e.g. Researcher, Builder)" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            <input placeholder="Model (e.g. anthropic/claude-haiku-4-5)" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            <textarea placeholder="System prompt — define what this agent does" value={form.system_prompt}
              onChange={e => setForm({ ...form, system_prompt: e.target.value })} required rows={5}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            <div className="flex gap-3">
              <input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })}
                className="w-10 h-10 rounded border-0 cursor-pointer" />
              <input placeholder="Avatar emoji" value={form.avatar} onChange={e => setForm({ ...form, avatar: e.target.value })}
                className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
                {editing ? 'Update' : 'Create'}
              </button>
              {editing && (
                <button type="button" onClick={() => { setEditing(null); setForm(DEFAULT_AGENT); }}
                  className="px-4 py-2 text-gray-600 rounded-lg text-sm hover:bg-gray-100">
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
