export const BASE = import.meta.env.VITE_API_URL || '/api'
export const API_KEY = import.meta.env.VITE_API_KEY || localStorage.getItem('hive_api_key') || ''

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
  getMessages: (mode) => request(`/messages${mode ? `?mode=${mode}` : ''}`),
  sendMessage: (data) => request('/messages', { method: 'POST', body: data }),
  clearMessages: () => request('/messages', { method: 'DELETE' }),
  triggerStandup: () => request('/chat/standup', { method: 'POST' }),
  askChat: async (message) => {
    const headers = { 'Content-Type': 'application/json' }
    if (API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`
    const res = await fetch(`${BASE}/chat/ask`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message })
    })
    if (!res.ok) throw new Error(`Chat error: ${res.status}`)
    return res
  },

  // Push notifications
  getVapidKey: () => request('/push/vapid-key'),
  subscribePush: (subscription) => request('/push/subscribe', { method: 'POST', body: subscription }),

  // Spend & Settings
  getSpend: () => request('/spend'),
  getSettings: () => request('/settings'),
  updateSettings: (data) => request('/settings', { method: 'PATCH', body: data }),

  // Prompt Optimizer
  optimizePrompt: (id) => request(`/tasks/${id}/optimize`, { method: 'POST' }),

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

  // Task Files
  getTaskFiles: (id) => request(`/tasks/${id}/files`),

  // Network Graph (BUILD 2)
  getGraphNodes: () => request('/graph/nodes'),
  getGraphEdges: (range) => request(`/graph/edges?range=${range || '24h'}`),

  // Analytics (BUILD 3)
  getAnalyticsSpend: (range, agent) => request(`/analytics/spend?range=${range || '7d'}${agent ? '&agent=' + agent : ''}`),
  getSpendByTask: (limit) => request(`/analytics/spend/by-task?limit=${limit || 50}`),
  getAgentsSummary: (range) => request(`/analytics/agents/summary?range=${range || '30d'}`),

  // Intel Feed (BUILD 4)
  getIntel: (params) => {
    const clean = params ? Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null)) : null
    return request(`/intel${clean && Object.keys(clean).length ? '?' + new URLSearchParams(clean) : ''}`)
  },
  updateIntelStatus: (id, status) => request(`/intel/${id}/status`, { method: 'PATCH', body: { status } }),

  // Command Bar (BUILD 5)
  parseCommand: (text) => request('/commands/parse', { method: 'POST', body: { text } }),

  // Skills V2 (BUILD 6)
  getSkillsV2: (params) => {
    const clean = params ? Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')) : null
    return request(`/skills${clean && Object.keys(clean).length ? '?' + new URLSearchParams(clean) : ''}`)
  },
  getSkillDetail: (slug) => request(`/skills/${slug}`),
  createSkillV2: (data) => request('/skills', { method: 'POST', body: data }),
  updateSkillV2: (slug, data) => request(`/skills/${slug}`, { method: 'PUT', body: data }),
  deleteSkillV2: (slug) => request(`/skills/${slug}`, { method: 'DELETE' }),
  getAgentSkillsV2: (agentId) => request(`/agents/${agentId}/skills-v2`),
  assignSkill: (agentId, slug) => request(`/agents/${agentId}/skills-v2/${slug}`, { method: 'POST' }),
  unassignSkill: (agentId, slug) => request(`/agents/${agentId}/skills-v2/${slug}`, { method: 'DELETE' }),
  toggleSkillV2: (agentId, slug, data) => request(`/agents/${agentId}/skills-v2/${slug}`, { method: 'PATCH', body: data }),

  // Scorecards
  getScorecard: (agentId) => request(`/agents/${agentId}/scorecard`),
  getScoreboards: () => request('/scorecards'),

  // Approval Gates
  approveTask: (id) => request(`/tasks/${id}/approve`, { method: 'POST' }),
  rejectTask: (id) => request(`/tasks/${id}/reject`, { method: 'POST' }),

  // Traces
  getTraces: (id) => request(`/tasks/${id}/traces`),

  // Pipelines
  getPipelines: () => request('/pipelines'),
  createPipeline: (data) => request('/pipelines', { method: 'POST', body: data }),
  updatePipeline: (id, data) => request(`/pipelines/${id}`, { method: 'PATCH', body: data }),
  deletePipeline: (id) => request(`/pipelines/${id}`, { method: 'DELETE' }),
  runPipeline: (id) => request(`/pipelines/${id}/run`, { method: 'POST' }),

  // Revenue
  getRevenue: (params) => request(`/revenue${params ? '?' + new URLSearchParams(params) : ''}`),
  createRevenue: (data) => request('/revenue', { method: 'POST', body: data }),
  deleteRevenue: (id) => request(`/revenue/${id}`, { method: 'DELETE' }),
  getRevenueSummary: () => request('/revenue/summary'),

  // Event Triggers
  getTriggers: () => request('/triggers'),
  createTrigger: (data) => request('/triggers', { method: 'POST', body: data }),
  updateTrigger: (id, data) => request(`/triggers/${id}`, { method: 'PATCH', body: data }),
  deleteTrigger: (id) => request(`/triggers/${id}`, { method: 'DELETE' }),

  // A/B Testing
  abTest: (taskId, data) => request(`/tasks/${taskId}/ab-test`, { method: 'POST', body: data }),

  // Agent Skills
  getSkills: (agentId) => request(`/agents/${agentId}/skills`),
  createSkill: (agentId, data) => request(`/agents/${agentId}/skills`, { method: 'POST', body: data }),
  updateSkill: (id, data) => request(`/skills/${id}`, { method: 'PATCH', body: data }),
  deleteSkill: (id) => request(`/skills/${id}`, { method: 'DELETE' }),

  // Market Data
  getQuote: (symbol) => request(`/market/quote/${symbol}`),
  getHistory: (symbol, params) => request(`/market/history/${symbol}?${new URLSearchParams(params || {})}`),
  getIndicators: (symbol) => request(`/market/indicators/${symbol}`),
  searchSymbols: (q) => request(`/market/search?q=${q}`),

  // Trading
  getTradingAccount: () => request('/trading/account'),
  getPositions: () => request('/trading/positions'),
  placeOrder: (data) => request('/trading/orders', { method: 'POST', body: data }),
  getOrders: (status) => request(`/trading/orders?status=${status || 'all'}`),
  cancelOrder: (id) => request(`/trading/orders/${id}/cancel`, { method: 'POST' }),
  closePosition: (symbol) => request(`/trading/close/${symbol}`, { method: 'POST' }),
  closeAllPositions: () => request('/trading/close-all', { method: 'POST' }),
  getMarketStatus: () => request('/trading/market-status'),
  getTradeHistory: () => request('/trading/trades'),
  getTradingConfig: () => request('/trading/config'),
  updateTradingConfig: (data) => request('/trading/config', { method: 'PATCH', body: data }),
  getWatchlist: () => request('/trading/watchlist'),
  addToWatchlist: (data) => request('/trading/watchlist', { method: 'POST', body: data }),
  removeFromWatchlist: (id) => request(`/trading/watchlist/${id}`, { method: 'DELETE' }),
  getPortfolioHistory: () => request('/trading/portfolio-history'),

  // Strategies
  getStrategies: (params) => request(`/strategies${params ? '?' + new URLSearchParams(params) : ''}`),
  createStrategy: (data) => request('/strategies', { method: 'POST', body: data }),
  updateStrategy: (id, data) => request(`/strategies/${id}`, { method: 'PATCH', body: data }),
  deleteStrategy: (id) => request(`/strategies/${id}`, { method: 'DELETE' }),
  runBacktest: (id, data) => request(`/strategies/${id}/backtest`, { method: 'POST', body: data }),
  getBacktests: (id) => request(`/strategies/${id}/backtests`),
  getBacktest: (id) => request(`/backtests/${id}`),
  deployStrategy: (id) => request(`/strategies/${id}/deploy`, { method: 'POST' }),
  getDeployments: () => request('/deployments'),
  pauseDeployment: (id) => request(`/deployments/${id}/pause`, { method: 'POST' }),
  stopDeployment: (id) => request(`/deployments/${id}/stop`, { method: 'POST' }),
  getStrategyPerformance: (id) => request(`/strategies/${id}/performance`),
  getPerformanceLeaderboard: () => request('/performance/leaderboard'),

  // Analysis — Multi-Lens Oracle
  analyzeSymbol: (symbol) => request(`/analysis/${symbol}`),
  getTradeConstraints: (symbol, side) => request(`/analysis/${symbol}/constraints?side=${side || 'buy'}`),
  getTradeDecision: (symbol) => request(`/analysis/${symbol}/decide`, { method: 'POST' }),
  getEnsemble: (symbol) => request(`/analysis/${symbol}/ensemble`),
  getPersonas: () => request('/analysis/personas'),

  // Projects
  getProjects: () => request('/projects'),

  // Deliverables
  getDeliverables: (params) => request(`/deliverables${params ? '?' + new URLSearchParams(params) : ''}`),

  // History
  getHistory: (params) => request(`/history${params ? '?' + new URLSearchParams(params) : ''}`),

  // Search
  search: (q) => request(`/search?q=${encodeURIComponent(q)}`),

  // Pipeline Status
  getPipelineStatus: (id) => request(`/pipelines/${id}/status`),

  // Proposals
  getProposals: (status) => request(`/proposals${status ? `?status=${status}` : ''}`),
  createProposal: (data) => request('/proposals', { method: 'POST', body: data }),
  updateProposal: (id, data) => request(`/proposals/${id}`, { method: 'PATCH', body: data }),
  deleteProposal: (id) => request(`/proposals/${id}`, { method: 'DELETE' }),

  // Task Checkpoints
  resumeTask: (id) => request(`/tasks/${id}/resume`, { method: 'POST' }),
  approveContinue: (id) => request(`/tasks/${id}/approve-continue`, { method: 'POST' }),
  rejectContinue: (id) => request(`/tasks/${id}/reject-continue`, { method: 'POST' }),

  // Eval Harness
  getEvalCases: () => request('/eval/cases'),
  createEvalCase: (data) => request('/eval/cases', { method: 'POST', body: data }),
  deleteEvalCase: (id) => request(`/eval/cases/${id}`, { method: 'DELETE' }),
  runEval: (caseId) => request(`/eval/run/${caseId}`, { method: 'POST' }),
  runAllEvals: () => request('/eval/run-all', { method: 'POST' }),
  getEvalHistory: (caseId, limit) => request(`/eval/history?${caseId ? 'case_id=' + caseId + '&' : ''}limit=${limit || 50}`),

  // MCP Servers
  getMCPServers: () => request('/mcp/servers'),
  addMCPServer: (data) => request('/mcp/servers', { method: 'POST', body: data }),
  deleteMCPServer: (id) => request(`/mcp/servers/${id}`, { method: 'DELETE' }),
  testMCPServer: (id) => request(`/mcp/servers/${id}/test`, { method: 'POST' }),
  getMCPTools: () => request('/mcp/tools'),

  // Semantic Memory
  searchMemory: (query, agentId, topK) => request(`/memory/search?query=${encodeURIComponent(query)}${agentId ? '&agent_id=' + agentId : ''}${topK ? '&top_k=' + topK : ''}`),
  getMemoryEntries: (agentId, limit) => request(`/memory/entries?${agentId ? 'agent_id=' + agentId + '&' : ''}limit=${limit || 50}`),

  // OTLP Trace Export
  getOTLPTrace: (taskId) => request(`/traces/${taskId}/otlp`),

  // Guardrail Events
  getGuardrailEvents: (limit) => request(`/guardrails/events?limit=${limit || 50}`),

  // Skill Import/Export
  exportSkill: (slug) => `${BASE}/skills/${slug}/export?token=${API_KEY}`,
  importSkill: (content) => request('/skills/import', { method: 'POST', body: { content } }),
  importSkillUrl: (url) => request('/skills/import-url', { method: 'POST', body: { url } }),
}
