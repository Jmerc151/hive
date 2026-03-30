const BASE = '/api';

let token = localStorage.getItem('af_token');
let workspaceId = localStorage.getItem('af_workspace');

export function setAuth(t, wsId) {
  token = t;
  workspaceId = wsId;
  localStorage.setItem('af_token', t);
  localStorage.setItem('af_workspace', wsId);
}

export function clearAuth() {
  token = null;
  workspaceId = null;
  localStorage.removeItem('af_token');
  localStorage.removeItem('af_workspace');
}

export function getWorkspaceId() {
  return workspaceId;
}

async function request(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...opts.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (workspaceId) headers['X-Workspace-Id'] = workspaceId;

  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status });
  return data;
}

export const api = {
  // Auth
  signup: (body) => request('/auth/signup', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  me: () => request('/auth/me'),
  forgotPassword: (body) => request('/auth/forgot-password', { method: 'POST', body: JSON.stringify(body) }),
  resetPassword: (body) => request('/auth/reset-password', { method: 'POST', body: JSON.stringify(body) }),

  // Workspaces
  workspaces: () => request('/workspaces'),
  usage: () => request(`/workspaces/${workspaceId}/usage`),

  // Agents
  agents: () => request('/agents'),
  agent: (id) => request(`/agents/${id}`),
  createAgent: (body) => request('/agents', { method: 'POST', body: JSON.stringify(body) }),
  updateAgent: (id, body) => request(`/agents/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteAgent: (id) => request(`/agents/${id}`, { method: 'DELETE' }),

  // Tasks
  tasks: (params) => request(`/tasks?${new URLSearchParams(params || {})}`),
  task: (id) => request(`/tasks/${id}`),
  createTask: (body) => request('/tasks', { method: 'POST', body: JSON.stringify(body) }),
  runTask: (id) => request(`/tasks/${id}/run`, { method: 'POST' }),
  cancelTask: (id) => request(`/tasks/${id}/cancel`, { method: 'POST' }),

  // Billing
  billingStatus: () => request('/billing/status'),
  checkout: (plan) => request('/billing/checkout', { method: 'POST', body: JSON.stringify({ plan }) }),
  buyCredits: (amount) => request('/billing/credits', { method: 'POST', body: JSON.stringify({ amount }) }),
  billingPortal: () => request('/billing/portal', { method: 'POST' }),

  // Pipelines
  pipelines: () => request('/pipelines'),
  pipeline: (id) => request(`/pipelines/${id}`),
  createPipeline: (body) => request('/pipelines', { method: 'POST', body: JSON.stringify(body) }),
  updatePipeline: (id, body) => request(`/pipelines/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deletePipeline: (id) => request(`/pipelines/${id}`, { method: 'DELETE' }),
  runPipeline: (id) => request(`/pipelines/${id}/run`, { method: 'POST' }),

  // Templates
  templates: () => request('/templates'),
  template: (id) => request(`/templates/${id}`),
  installTemplate: (id) => request(`/templates/${id}/install`, { method: 'POST' }),

  // Workspace settings
  updateWorkspace: (body) => request(`/workspaces/${workspaceId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteWorkspace: () => request(`/workspaces/${workspaceId}`, { method: 'DELETE' }),
  saveApiKey: (key) => request(`/workspaces/${workspaceId}/settings`, { method: 'PATCH', body: JSON.stringify({ openrouter_api_key: key }) }),

  // Team members
  members: () => request(`/workspaces/${workspaceId}/members`),
  inviteMember: (email, role) => request(`/workspaces/${workspaceId}/members`, { method: 'POST', body: JSON.stringify({ email, role }) }),
  updateMemberRole: (userId, role) => request(`/workspaces/${workspaceId}/members/${userId}`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  removeMember: (userId) => request(`/workspaces/${workspaceId}/members/${userId}`, { method: 'DELETE' }),

  // API keys
  apiKeys: () => request(`/workspaces/${workspaceId}/keys`),
  createApiKey: (label) => request(`/workspaces/${workspaceId}/keys`, { method: 'POST', body: JSON.stringify({ label }) }),
  revokeApiKey: (keyId) => request(`/workspaces/${workspaceId}/keys/${keyId}`, { method: 'DELETE' }),

  // Analytics
  analyticsOverview: () => request('/analytics/overview'),
  analyticsDaily: (days = 7) => request(`/analytics/daily?days=${days}`),
  analyticsAgents: () => request('/analytics/agents'),
  analyticsTasks: () => request('/analytics/tasks'),

  // Health
  health: () => request('/health'),
};
