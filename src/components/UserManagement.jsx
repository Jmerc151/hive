import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import ConfirmDialog from './ConfirmDialog'

const ROLE_COLORS = {
  admin: 'bg-danger/15 text-danger border-red-500/20',
  operator: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  viewer: 'bg-s3 text-t3 border-s4',
}

export default function UserManagement({ onClose }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [form, setForm] = useState({ username: '', password: '', role: 'viewer', display_name: '' })
  const [error, setError] = useState('')

  const refresh = () => {
    setLoading(true)
    api.getUsers()
      .then(data => setUsers(Array.isArray(data) ? data : []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { refresh() }, [])

  const handleCreate = async () => {
    if (!form.username || !form.password) { setError('Username and password required'); return }
    setError('')
    try {
      await api.createUser(form)
      setCreating(false)
      setForm({ username: '', password: '', role: 'viewer', display_name: '' })
      refresh()
    } catch (e) {
      setError(e.message || 'Failed to create user')
    }
  }

  const handleUpdate = async () => {
    if (!editing) return
    setError('')
    try {
      const updates = {}
      if (form.role) updates.role = form.role
      if (form.display_name !== undefined) updates.display_name = form.display_name
      if (form.password) updates.password = form.password
      await api.updateUser(editing.id, updates)
      setEditing(null)
      refresh()
    } catch (e) {
      setError(e.message || 'Failed to update user')
    }
  }

  const handleDelete = async (id) => {
    try {
      await api.deleteUser(id)
      refresh()
    } catch (e) {
      setError(e.message || 'Failed to delete user')
    }
  }

  const userForm = (isEdit) => (
    <div className="space-y-3">
      {error && <div className="bg-danger/10 border border-danger/20 text-danger text-sm rounded-lg px-3 py-2">{error}</div>}
      {!isEdit && (
        <div>
          <label className="text-xs text-t3 mb-1 block">Username</label>
          <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
            className="w-full bg-page border border-s4 rounded-lg px-3 py-2 text-sm text-t1 focus:outline-none focus:border-t1/50"
            placeholder="Username" />
        </div>
      )}
      <div>
        <label className="text-xs text-t3 mb-1 block">{isEdit ? 'New Password (leave blank to keep)' : 'Password'}</label>
        <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
          className="w-full bg-page border border-s4 rounded-lg px-3 py-2 text-sm text-t1 focus:outline-none focus:border-t1/50"
          placeholder={isEdit ? 'Leave blank to keep current' : 'Password'} />
      </div>
      <div>
        <label className="text-xs text-t3 mb-1 block">Display Name</label>
        <input value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
          className="w-full bg-page border border-s4 rounded-lg px-3 py-2 text-sm text-t1 focus:outline-none focus:border-t1/50"
          placeholder="Display name" />
      </div>
      <div>
        <label className="text-xs text-t3 mb-1 block">Role</label>
        <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
          className="w-full bg-page border border-s4 rounded-lg px-3 py-2 text-sm text-t1 focus:outline-none focus:border-t1/50">
          <option value="admin">Admin</option>
          <option value="operator">Operator</option>
          <option value="viewer">Viewer</option>
        </select>
      </div>
    </div>
  )

  // Edit view
  if (editing) {
    return (
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-s1 rounded-2xl border border-s4 w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between p-4 border-b border-s4">
            <h2 className="text-lg font-bold text-t1">Edit User: {editing.username}</h2>
            <button onClick={() => { setEditing(null); setError('') }} className="text-t3 hover:text-t1 text-xl">&times;</button>
          </div>
          <div className="p-4 space-y-4">
            {userForm(true)}
            <div className="flex gap-2">
              <button onClick={handleUpdate} className="px-4 py-2 bg-t1 text-white rounded-lg text-sm font-medium hover:bg-t2">Save</button>
              <button onClick={() => { setEditing(null); setError('') }} className="px-4 py-2 bg-s4 text-t1 rounded-lg text-sm hover:bg-s5">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Create view
  if (creating) {
    return (
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-s1 rounded-2xl border border-s4 w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between p-4 border-b border-s4">
            <h2 className="text-lg font-bold text-t1">Add User</h2>
            <button onClick={() => { setCreating(false); setError('') }} className="text-t3 hover:text-t1 text-xl">&times;</button>
          </div>
          <div className="p-4 space-y-4">
            {userForm(false)}
            <div className="flex gap-2">
              <button onClick={handleCreate} disabled={!form.username || !form.password}
                className="px-4 py-2 bg-t1 text-white rounded-lg text-sm font-medium hover:bg-t2 disabled:opacity-50">Create User</button>
              <button onClick={() => { setCreating(false); setError('') }} className="px-4 py-2 bg-s4 text-t1 rounded-lg text-sm hover:bg-s5">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // List view
  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-s1 rounded-2xl border border-s4 w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-s4 shrink-0">
          <h2 className="text-lg font-bold text-t1">User Management</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => { setCreating(true); setForm({ username: '', password: '', role: 'viewer', display_name: '' }); setError('') }}
              className="px-3 py-1.5 bg-t1 text-white rounded-lg text-xs font-medium hover:bg-t2">+ Add User</button>
            <button onClick={onClose} className="text-t3 hover:text-t1 text-xl">&times;</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && <div className="text-center text-t3 py-8">Loading...</div>}
          {!loading && users.length === 0 && (
            <div className="text-center text-t3 py-12">
              <div className="text-sm">No users found.</div>
            </div>
          )}

          <div className="space-y-2">
            {users.map(user => (
              <div key={user.id} className="bg-page border border-s4 rounded-lg p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-s4 flex items-center justify-center text-lg font-bold text-t2">
                  {(user.display_name || user.username).charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-t1">{user.display_name || user.username}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${ROLE_COLORS[user.role] || ROLE_COLORS.viewer}`}>
                      {user.role}
                    </span>
                  </div>
                  <div className="text-xs text-t3">@{user.username}</div>
                  {user.last_login && (
                    <div className="text-[10px] text-t4 mt-0.5">Last login: {new Date(user.last_login).toLocaleString()}</div>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => {
                    setEditing(user)
                    setForm({ username: user.username, password: '', role: user.role, display_name: user.display_name || '' })
                    setError('')
                  }} className="px-2.5 py-1 bg-s4 text-t1 rounded text-xs hover:bg-s5">Edit</button>
                  <button onClick={() => setConfirmDelete(user)}
                    className="px-2.5 py-1 bg-danger/15 text-danger rounded text-xs hover:bg-danger/25">Delete</button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 p-3 bg-page/50 border border-s4 rounded-lg">
            <h4 className="text-xs font-medium text-t2 mb-1">Role Permissions</h4>
            <div className="space-y-1 text-[10px] text-t3">
              <div><span className="text-danger font-medium">Admin</span> — Full access: manage users, settings, run tasks, delete data</div>
              <div><span className="text-blue-400 font-medium">Operator</span> — Run tasks, create tasks, approve/reject. No user or settings management</div>
              <div><span className="text-t3 font-medium">Viewer</span> — Read-only access to all dashboards</div>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={!!confirmDelete}
        title="Delete User?"
        message={`Are you sure you want to delete user "${confirmDelete?.username}"? Their sessions will also be removed.`}
        onConfirm={() => { handleDelete(confirmDelete.id); setConfirmDelete(null) }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
