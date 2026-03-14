import { Router } from 'express'
import { traceBus } from '../traceBus.js'

const router = Router()

// Connection tracking: agentId -> Set<Response>
const connections = new Map()

function addConn(key, res) {
  if (!connections.has(key)) connections.set(key, new Set())
  connections.get(key).add(res)
}

function removeConn(key, res) {
  const set = connections.get(key)
  if (set) {
    set.delete(res)
    if (set.size === 0) connections.delete(key)
  }
}

function getCount(key) {
  return connections.get(key)?.size || 0
}

function setupSSE(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  // Heartbeat every 30s
  const hb = setInterval(() => {
    try { res.write(':heartbeat\n\n') } catch {}
  }, 30000)
  return hb
}

/**
 * GET /api/trace/live — Global live stream (all agents)
 * Query: ?types=THOUGHT,TOOL_CALL  ?token=<key>
 */
router.get('/trace/live', (req, res) => {
  const typeFilter = req.query.types ? new Set(req.query.types.split(',')) : null
  const hb = setupSSE(res)

  res.write(`event: connected\ndata: ${JSON.stringify({
    channel: 'all',
    connected_at: new Date().toISOString(),
    active_connections: getCount('*') + 1,
  })}\n\n`)

  addConn('*', res)

  const onTrace = (event) => {
    if (typeFilter && !typeFilter.has(event.event_type)) return
    try { res.write(`event: trace\ndata: ${JSON.stringify(event)}\n\n`) } catch {}
  }

  traceBus.on('trace:*', onTrace)

  req.on('close', () => {
    clearInterval(hb)
    traceBus.off('trace:*', onTrace)
    removeConn('*', res)
  })
})

/**
 * GET /api/agents/:agentId/trace — Per-agent live stream
 * Query: ?types=  ?task_id=  ?token=<key>
 */
router.get('/agents/:agentId/trace/live', (req, res) => {
  const { agentId } = req.params
  const typeFilter = req.query.types ? new Set(req.query.types.split(',')) : null
  const taskFilter = req.query.task_id ? parseInt(req.query.task_id) : null
  const hb = setupSSE(res)

  res.write(`event: connected\ndata: ${JSON.stringify({
    agent_id: agentId,
    connected_at: new Date().toISOString(),
    active_connections: getCount(agentId) + 1,
  })}\n\n`)

  addConn(agentId, res)

  const onTrace = (event) => {
    if (typeFilter && !typeFilter.has(event.event_type)) return
    if (taskFilter && event.task_id !== taskFilter) return
    try { res.write(`event: trace\ndata: ${JSON.stringify(event)}\n\n`) } catch {}
  }

  traceBus.on(`trace:${agentId}`, onTrace)

  req.on('close', () => {
    clearInterval(hb)
    traceBus.off(`trace:${agentId}`, onTrace)
    removeConn(agentId, res)
  })
})

/**
 * GET /api/trace/connections — Connection stats
 */
router.get('/trace/connections', (req, res) => {
  const stats = {}
  for (const [key] of connections) {
    stats[key] = getCount(key)
  }
  res.json({ connections: stats })
})

/**
 * GET /api/events/stream — Global dashboard SSE stream
 * Streams task_update, agent_status, and spend_update events
 * Query: ?token=<key> (auth via query param since EventSource doesn't support headers)
 */
router.get('/events/stream', (req, res) => {
  const hb = setupSSE(res)

  const send = (event, data) => {
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`) } catch {}
  }

  send('connected', { time: new Date().toISOString() })

  addConn('events', res)

  const onTaskUpdate = (data) => send('task_update', data)
  const onAgentStatus = (data) => send('agent_status', data)
  const onSpendUpdate = (data) => send('spend_update', data)

  traceBus.on('task:update', onTaskUpdate)
  traceBus.on('agent:status', onAgentStatus)
  traceBus.on('spend:update', onSpendUpdate)

  req.on('close', () => {
    clearInterval(hb)
    traceBus.off('task:update', onTaskUpdate)
    traceBus.off('agent:status', onAgentStatus)
    traceBus.off('spend:update', onSpendUpdate)
    removeConn('events', res)
  })
})

export default router
