import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getWorkspaceId } from '../lib/api';

const TABS = ['General', 'Team', 'API Keys', 'Danger Zone'];

export default function Settings() {
  const [tab, setTab] = useState('General');
  const navigate = useNavigate();

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Settings</h2>
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'General' && <GeneralTab navigate={navigate} />}
      {tab === 'Team' && <TeamTab />}
      {tab === 'API Keys' && <ApiKeysTab />}
      {tab === 'Danger Zone' && <DangerTab navigate={navigate} />}
    </div>
  );
}

function GeneralTab({ navigate }) {
  const [workspace, setWorkspace] = useState(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const wsId = getWorkspaceId();

  useEffect(() => {
    api.workspaces().then(ws => {
      const current = ws.find(w => w.id === wsId) || ws[0];
      if (current) {
        setWorkspace(current);
        setName(current.name);
      }
    }).catch(() => {});
  }, []);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const updated = await api.updateWorkspace({ name: name.trim() });
      setWorkspace(prev => ({ ...prev, ...updated }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  function copyId() {
    navigator.clipboard.writeText(wsId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="max-w-xl space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Workspace Name</label>
        <div className="flex gap-2">
          <input value={name} onChange={e => setName(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
          <button onClick={handleSave} disabled={saving || !name.trim()}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Plan</label>
        <div className="flex items-center justify-between">
          <span className="text-lg font-semibold capitalize">{workspace?.plan || '...'}</span>
          <button onClick={() => navigate('/billing')}
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
            Upgrade plan
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Workspace ID</label>
        <div className="flex gap-2 items-center">
          <code className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600 font-mono truncate select-all">
            {wsId}
          </code>
          <button onClick={copyId}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shrink-0">
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1.5">Use this ID for API requests with the X-Workspace-Id header.</p>
      </div>
    </div>
  );
}

function TeamTab() {
  const [members, setMembers] = useState([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { loadMembers(); }, []);

  async function loadMembers() {
    try { setMembers(await api.members()); } catch {}
  }

  async function handleInvite(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setInviting(true);
    setError('');
    try {
      await api.inviteMember(email.trim(), role);
      setEmail('');
      setRole('member');
      loadMembers();
    } catch (err) {
      setError(err.message);
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(userId, newRole) {
    try {
      await api.updateMemberRole(userId, newRole);
      setMembers(prev => prev.map(m => m.id === userId ? { ...m, role: newRole } : m));
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleRemove(userId) {
    if (!confirm('Remove this member from the workspace?')) return;
    try {
      await api.removeMember(userId);
      setMembers(prev => prev.filter(m => m.id !== userId));
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold mb-3">Invite Member</h3>
        <form onSubmit={handleInvite} className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="teammate@company.com" required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Role</label>
            <select value={role} onChange={e => setRole(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
              <option value="admin">Admin</option>
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <button type="submit" disabled={inviting || !email.trim()}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            {inviting ? 'Inviting...' : 'Send Invite'}
          </button>
        </form>
        {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold mb-3">Members ({members.length})</h3>
        {members.length === 0 ? (
          <p className="text-sm text-gray-400">No members loaded.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {members.map(m => (
              <div key={m.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-medium shrink-0">
                    {(m.name || m.email)[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{m.name || m.email}</div>
                    <div className="text-xs text-gray-400">
                      {m.email}{m.joined_at && ` — joined ${new Date(m.joined_at).toLocaleDateString()}`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {m.role === 'owner' ? (
                    <span className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-md text-xs font-medium">Owner</span>
                  ) : (
                    <>
                      <select value={m.role} onChange={e => handleRoleChange(m.id, e.target.value)}
                        className="px-2 py-1 border border-gray-200 rounded-md text-xs bg-white">
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <button onClick={() => handleRemove(m.id)}
                        className="px-2 py-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md">
                        Remove
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ApiKeysTab() {
  const [keys, setKeys] = useState([]);
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { loadKeys(); }, []);

  async function loadKeys() {
    try { setKeys(await api.apiKeys()); } catch {}
  }

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    try {
      const result = await api.createApiKey(label.trim() || 'default');
      setNewKey(result.key);
      setLabel('');
      loadKeys();
    } catch (err) {
      alert(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(keyId) {
    if (!confirm('Revoke this API key? Any integrations using it will stop working.')) return;
    try {
      await api.revokeApiKey(keyId);
      setKeys(prev => prev.filter(k => k.id !== keyId));
    } catch (err) {
      alert(err.message);
    }
  }

  function copyKey() {
    navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="max-w-2xl space-y-6">
      {newKey && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <span className="text-amber-500 text-lg shrink-0">!</span>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-amber-800 mb-1">Save your API key</h4>
              <p className="text-xs text-amber-700 mb-3">This key will only be shown once. Copy it now and store it securely.</p>
              <div className="flex gap-2">
                <code className="flex-1 px-3 py-2 bg-white border border-amber-300 rounded-lg text-sm font-mono text-gray-800 break-all select-all">
                  {newKey}
                </code>
                <button onClick={copyKey}
                  className="px-3 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 shrink-0">
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          </div>
          <button onClick={() => setNewKey(null)} className="mt-3 text-xs text-amber-600 hover:text-amber-800 ml-7">
            Dismiss
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold mb-3">Create API Key</h3>
        <form onSubmit={handleCreate} className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Label</label>
            <input type="text" value={label} onChange={e => setLabel(e.target.value)}
              placeholder="e.g. production, staging"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
          </div>
          <button type="submit" disabled={creating}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            {creating ? 'Creating...' : 'Create New Key'}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold mb-3">API Keys ({keys.length})</h3>
        {keys.length === 0 ? (
          <p className="text-sm text-gray-400">No API keys yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {keys.map(k => (
              <div key={k.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="text-sm font-medium">{k.label}</div>
                  <div className="text-xs text-gray-400">
                    Created {new Date(k.created_at).toLocaleDateString()}
                    {k.last_used_at && ` — Last used ${new Date(k.last_used_at).toLocaleDateString()}`}
                  </div>
                </div>
                <button onClick={() => handleRevoke(k.id)}
                  className="px-3 py-1.5 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md border border-red-200">
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DangerTab({ navigate }) {
  const [confirmName, setConfirmName] = useState('');
  const [wsName, setWsName] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api.workspaces().then(ws => {
      const current = ws.find(w => w.id === getWorkspaceId());
      if (current) setWsName(current.name);
    }).catch(() => {});
  }, []);

  async function handleDelete() {
    if (confirmName !== wsName) return;
    setDeleting(true);
    try {
      await api.deleteWorkspace();
      navigate('/');
      window.location.reload();
    } catch (err) {
      alert(err.message);
      setDeleting(false);
    }
  }

  return (
    <div className="max-w-xl">
      <div className="bg-white rounded-xl border-2 border-red-200 p-5">
        <h3 className="text-lg font-semibold text-red-700 mb-2">Delete Workspace</h3>
        <p className="text-sm text-gray-600 mb-4">
          This will permanently delete the workspace, all agents, tasks, pipelines, and data. This action cannot be undone.
        </p>
        <div className="mb-3">
          <label className="block text-sm text-gray-600 mb-1">
            Type <strong>{wsName || '...'}</strong> to confirm
          </label>
          <input type="text" value={confirmName} onChange={e => setConfirmName(e.target.value)}
            placeholder="Workspace name"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent" />
        </div>
        <button onClick={handleDelete} disabled={deleting || confirmName !== wsName}
          className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed">
          {deleting ? 'Deleting...' : 'Delete Workspace'}
        </button>
      </div>
    </div>
  );
}
