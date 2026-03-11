const BASE = import.meta.env.VITE_API_URL || '/api'
const API_KEY = import.meta.env.VITE_API_KEY || localStorage.getItem('hive_api_key') || ''

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`

  const res = await fetch(`${BASE}${path}`, {
    headers,
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  })

  if (res.status === 401) {
    const key = prompt('Enter your Hive API key:')
    if (key) {
      localStorage.setItem('hive_api_key', key)
      window.location.reload()
    }
    throw new Error('Unauthorized')
  }

  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export const api = {
  // Agents
  getAgents: () => request('/agents'),

  // Tasks
  getTasks: () => request('/tasks'),
  createTask: (data) => request('/tasks', { method: 'POST', body: data }),
  updateTask: (id, data) => request(`/tasks/${id}`, { method: 'PATCH', body: data }),
  deleteTask: (id) => request(`/tasks/${id}`, { method: 'DELETE' }),
  runTask: (id) => request(`/tasks/${id}/run`, { method: 'POST' }),
  getTaskLogs: (id) => request(`/tasks/${id}/logs`),

  // Agent control
  stopAgent: (id) => request(`/agents/${id}/stop`, { method: 'POST' }),

  // Stats
  getStats: () => request('/stats'),

  // Chat
  getMessages: () => request('/messages'),
  sendMessage: (data) => request('/messages', { method: 'POST', body: data }),
  clearMessages: () => request('/messages', { method: 'DELETE' }),
  triggerStandup: () => request('/chat/standup', { method: 'POST' }),

  // Push notifications
  getVapidKey: () => request('/push/vapid-key'),
  subscribePush: (subscription) => request('/push/subscribe', { method: 'POST', body: subscription }),

  // Spend & Settings
  getSpend: () => request('/spend'),
  getSettings: () => request('/settings'),
  updateSettings: (data) => request('/settings', { method: 'PATCH', body: data }),

  // Bot Generator
  getBotSuggestions: () => request('/bot-suggestions'),
  refreshBotSuggestions: () => request('/bot-suggestions/refresh', { method: 'POST' }),
  dismissSuggestion: (id) => request(`/bot-suggestions/${id}`, { method: 'DELETE' }),
  downloadBot: async (taskId) => {
    const headers = {}
    if (API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`
    const res = await fetch(`${BASE}/tasks/${taskId}/download`, { headers })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Download failed' }))
      throw new Error(err.error || `Download failed: ${res.status}`)
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const filename = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] || 'bot-package.zip'
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  },
}
