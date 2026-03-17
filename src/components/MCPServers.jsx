import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import ConfirmDialog from './ConfirmDialog'

const thinBorder = { border: '0.5px solid rgba(0,0,0,0.08)' }

export default function MCPServers({ onClose }) {
  const [servers, setServers] = useState([])
  const [tools, setTools] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [testing, setTesting] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [form, setForm] = useState({ name: '', transport: 'stdio', command: '', url: '' })
  const [saving, setSaving] = useState(false)

  const refresh = async () => {
    try {
      const [s, t] = await Promise.all([api.getMCPServers(), api.getMCPTools()])
      setServers(s)
      setTools(t)
    } catch (e) {
      console.warn('Failed to load MCP data:', e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  const handleAdd = async () => {
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        transport: form.transport,
        ...(form.transport === 'stdio' ? { command: form.command } : { url: form.url })
      }
      await api.addMCPServer(payload)
      setForm({ name: '', transport: 'stdio', command: '', url: '' })
      setShowAdd(false)
      refresh()
    } catch (e) {
      alert(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async (id) => {
    setTesting(id)
    try {
      const result = await api.testMCPServer(id)
      setExpanded(id)
      refresh()
      if (!result.success) alert('Connection failed: ' + (result.error || 'Unknown error'))
    } catch (e) {
      alert('Test failed: ' + e.message)
    } finally {
      setTesting(null)
    }
  }

  const handleDelete = async (id) => {
    try {
      await api.deleteMCPServer(id)
      setConfirmDelete(null)
      refresh()
    } catch (e) {
      alert(e.message)
    }
  }

  const serverTools = (serverId) => tools.filter(t => t.server_id === serverId)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-backdrop" />
      <div className="modal-content w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-5" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-s3 flex items-center justify-center text-sm" style={thinBorder}>&#x1F50C;</div>
            <div>
              <h2 className="font-display text-lg tracking-wider text-t1">MCP SERVERS</h2>
              <p className="text-xs text-t4">{servers.length} server{servers.length !== 1 ? 's' : ''} configured</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowAdd(!showAdd)} className="text-xs px-3 py-1.5 rounded-lg bg-t1 text-white hover:opacity-80 transition-opacity">
              + Add Server
            </button>
            <button onClick={onClose} className="text-t4 hover:text-t1 text-xl transition-colors">&times;</button>
          </div>
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="p-4 bg-s2" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Server name"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 bg-s1 rounded-lg text-sm text-t1 placeholder:text-t5 outline-none focus:ring-1 focus:ring-t1"
                style={thinBorder}
              />
              <div className="flex gap-3">
                {['stdio', 'sse'].map(t => (
                  <label key={t} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="transport"
                      checked={form.transport === t}
                      onChange={() => setForm({ ...form, transport: t })}
                      className="accent-[var(--color-t1)]"
                    />
                    <span className="text-xs text-t2 uppercase font-medium">{t}</span>
                  </label>
                ))}
              </div>
              {form.transport === 'stdio' ? (
                <input
                  type="text"
                  placeholder="Command (e.g. npx -y @modelcontextprotocol/server-github)"
                  value={form.command}
                  onChange={e => setForm({ ...form, command: e.target.value })}
                  className="w-full px-3 py-2 bg-s1 rounded-lg text-sm text-t1 placeholder:text-t5 outline-none focus:ring-1 focus:ring-t1 font-mono"
                  style={thinBorder}
                />
              ) : (
                <input
                  type="text"
                  placeholder="SSE URL (e.g. http://localhost:8080/sse)"
                  value={form.url}
                  onChange={e => setForm({ ...form, url: e.target.value })}
                  className="w-full px-3 py-2 bg-s1 rounded-lg text-sm text-t1 placeholder:text-t5 outline-none focus:ring-1 focus:ring-t1 font-mono"
                  style={thinBorder}
                />
              )}
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowAdd(false)} className="text-xs px-3 py-1.5 rounded-lg text-t4 hover:text-t2 transition-colors" style={thinBorder}>
                  Cancel
                </button>
                <button
                  onClick={handleAdd}
                  disabled={saving || !form.name || (form.transport === 'stdio' ? !form.command : !form.url)}
                  className="text-xs px-4 py-1.5 rounded-lg bg-t1 text-white hover:opacity-80 transition-opacity disabled:opacity-40"
                >
                  {saving ? 'Adding...' : 'Add Server'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Server list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="text-center text-t5 py-12">Loading servers...</div>
          ) : servers.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-3xl mb-3">&#x1F50C;</div>
              <div className="text-t3 text-sm mb-1">No MCP servers configured</div>
              <div className="text-t5 text-xs">Add a server to extend agent capabilities with external tools</div>
            </div>
          ) : (
            servers.map(server => {
              const sTools = serverTools(server.id)
              const isExpanded = expanded === server.id
              return (
                <div key={server.id} className="bg-s2 rounded-xl overflow-hidden" style={thinBorder}>
                  <div className="p-3 flex items-center gap-3">
                    {/* Status dot */}
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${server.status === 'connected' ? 'bg-success' : 'bg-t5'}`} />
                    {/* Name + transport */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-t1 truncate">{server.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-s3 text-t4 uppercase font-medium" style={thinBorder}>
                          {server.transport || 'stdio'}
                        </span>
                      </div>
                      <div className="text-xs text-t4 mt-0.5 truncate font-mono">
                        {server.command || server.url || '—'}
                      </div>
                    </div>
                    {/* Tool count */}
                    {sTools.length > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-s3 text-t3" style={thinBorder}>
                        {sTools.length} tool{sTools.length !== 1 ? 's' : ''}
                      </span>
                    )}
                    {/* Actions */}
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleTest(server.id)}
                        disabled={testing === server.id}
                        className="text-[10px] px-2 py-1 rounded text-t3 hover:text-t1 hover:bg-s3 transition-colors disabled:opacity-40"
                        style={thinBorder}
                      >
                        {testing === server.id ? '...' : 'Test'}
                      </button>
                      <button
                        onClick={() => setExpanded(isExpanded ? null : server.id)}
                        className="text-[10px] px-2 py-1 rounded text-t4 hover:text-t2 transition-colors"
                      >
                        {isExpanded ? '▴' : '▾'}
                      </button>
                      <button
                        onClick={() => setConfirmDelete({ id: server.id, name: server.name })}
                        className="text-[10px] px-2 py-1 rounded text-red-400 hover:text-red-500 transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  {/* Expanded tools list */}
                  {isExpanded && (
                    <div className="px-3 pb-3" style={{ borderTop: '0.5px solid rgba(0,0,0,0.06)' }}>
                      {sTools.length === 0 ? (
                        <div className="text-xs text-t5 py-2">No tools discovered. Try testing the connection.</div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-2">
                          {sTools.map((tool, i) => (
                            <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-s1" style={thinBorder}>
                              <span className="text-[10px] text-t5 mt-0.5">&#x25CF;</span>
                              <div className="min-w-0">
                                <div className="text-xs font-medium text-t2 truncate">{tool.name}</div>
                                {tool.description && (
                                  <div className="text-[10px] text-t4 leading-tight mt-0.5 line-clamp-2">{tool.description}</div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
      <ConfirmDialog
        isOpen={!!confirmDelete}
        title="Delete Server?"
        message={`Remove "${confirmDelete?.name}"? Connected tools will no longer be available to agents.`}
        onConfirm={() => handleDelete(confirmDelete.id)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
