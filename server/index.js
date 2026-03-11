import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import db from './db.js'
import { v4 as uuid } from 'uuid'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import Anthropic from '@anthropic-ai/sdk'
import webpush from 'web-push'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()

// CORS — allow frontend
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3333,http://localhost:5173').split(',')
app.use(cors({ origin: ALLOWED_ORIGINS }))
app.use(express.json())

// ── Auth middleware ────────────────────────────────
const API_KEY = process.env.HIVE_API_KEY
if (API_KEY) {
  app.use('/api', (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (token !== API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    next()
  })
  console.log('🔒 Auth enabled — requests require Bearer token')
} else {
  console.log('⚠️  No HIVE_API_KEY set — API is open (set it in production!)')
}

// Anthropic client
const anthropic = new Anthropic() // uses ANTHROPIC_API_KEY env var

// ── Spend Controls ────────────────────────────────
// Cost per token (Sonnet 4 pricing: $3/MTok input, $15/MTok output)
const COST_PER_INPUT_TOKEN = 3 / 1_000_000
const COST_PER_OUTPUT_TOKEN = 15 / 1_000_000

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
  return row?.value || null
}

function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime(\'now\')) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime(\'now\')').run(key, value, value)
}

function getTodaySpend(agentId) {
  const today = new Date().toISOString().slice(0, 10)
  if (agentId) {
    const row = db.prepare('SELECT COALESCE(SUM(cost), 0) as total FROM spend_log WHERE date = ? AND agent_id = ?').get(today, agentId)
    return row.total
  }
  const row = db.prepare('SELECT COALESCE(SUM(cost), 0) as total FROM spend_log WHERE date = ?').get(today)
  return row.total
}

function getMonthSpend() {
  const monthStart = new Date().toISOString().slice(0, 7) + '-01'
  const row = db.prepare('SELECT COALESCE(SUM(cost), 0) as total FROM spend_log WHERE date >= ?').get(monthStart)
  return row.total
}

function logSpend(agentId, tokensIn, tokensOut, cost, taskId) {
  const today = new Date().toISOString().slice(0, 10)
  db.prepare('INSERT INTO spend_log (date, agent_id, tokens_in, tokens_out, cost, task_id) VALUES (?, ?, ?, ?, ?, ?)').run(today, agentId, tokensIn, tokensOut, cost, taskId)
}

function checkSpendLimit(agentId) {
  const paused = getSetting('pause_all_agents')
  if (paused === 'true') throw new Error('AGENTS_PAUSED: All agents are paused')

  const agentPaused = getSetting(`agent_${agentId}_paused`)
  if (agentPaused === 'true') throw new Error(`AGENT_PAUSED: ${agentId} is paused`)

  const dailyLimit = parseFloat(getSetting('daily_limit_usd') || '999')
  const todaySpend = getTodaySpend()
  if (todaySpend >= dailyLimit) throw new Error(`DAILY_LIMIT_REACHED: $${todaySpend.toFixed(2)} / $${dailyLimit.toFixed(2)}`)

  const monthlyLimit = parseFloat(getSetting('monthly_limit_usd') || '999')
  const monthSpend = getMonthSpend()
  if (monthSpend >= monthlyLimit) throw new Error(`MONTHLY_LIMIT_REACHED: $${monthSpend.toFixed(2)} / $${monthlyLimit.toFixed(2)}`)

  const agentLimit = getSetting(`agent_${agentId}_daily_limit`)
  if (agentLimit) {
    const agentSpend = getTodaySpend(agentId)
    if (agentSpend >= parseFloat(agentLimit)) throw new Error(`AGENT_LIMIT_REACHED: ${agentId} at $${agentSpend.toFixed(2)} / $${agentLimit}`)
  }
}

// Wrapped Claude call that tracks spend
async function callClaude(opts, agentId, taskId, signal) {
  checkSpendLimit(agentId)

  const response = await anthropic.messages.create(opts, signal ? { signal } : undefined)

  const tokensIn = response.usage?.input_tokens || 0
  const tokensOut = response.usage?.output_tokens || 0
  const cost = (tokensIn * COST_PER_INPUT_TOKEN) + (tokensOut * COST_PER_OUTPUT_TOKEN)

  logSpend(agentId, tokensIn, tokensOut, cost, taskId)

  if (taskId) {
    db.prepare('UPDATE tasks SET tokens_used = tokens_used + ?, estimated_cost = estimated_cost + ? WHERE id = ?')
      .run(tokensIn + tokensOut, cost, taskId)
  }

  return response
}

// Web Push setup
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || 'BJzTO_33QaJQKmSo6s639IQ8O3VdYIYB2AgcMmGA_6zroPrWL8UHho56bOqSp6pav6YGVFkdwe15ZnmVW6Z8W3M'
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || 'vkrHsFUbb4ZnhroYqUA5MzZzu8cbK1ZnTlltkf6_ixg'
webpush.setVapidDetails('mailto:hive@agents.app', VAPID_PUBLIC, VAPID_PRIVATE)

// In-memory push subscriptions
const pushSubscriptions = new Set()

function sendPushToAll(payload) {
  for (const sub of pushSubscriptions) {
    webpush.sendNotification(JSON.parse(sub), JSON.stringify(payload)).catch(() => {
      pushSubscriptions.delete(sub)
    })
  }
}

// Load agent configs
const agentsPath = join(__dirname, '..', 'agents', 'agents.json')
const agents = JSON.parse(readFileSync(agentsPath, 'utf8'))

// Active agent runs (in-memory tracking)
const activeRuns = new Map()

// ══════════════════════════════════════════════════════
// ██ AGENT MEMORY — Persistent learnings per agent    ██
// ══════════════════════════════════════════════════════

const MEMORY_DIR = join(__dirname, '..', 'memory')
mkdirSync(MEMORY_DIR, { recursive: true })

function getAgentMemoryPath(agentId) {
  return join(MEMORY_DIR, `${agentId}.md`)
}

function readAgentMemory(agentId) {
  const path = getAgentMemoryPath(agentId)
  if (!existsSync(path)) return ''
  return readFileSync(path, 'utf8')
}

function writeAgentMemory(agentId, content) {
  writeFileSync(getAgentMemoryPath(agentId), content, 'utf8')
}

function appendAgentMemory(agentId, entry) {
  const existing = readAgentMemory(agentId)
  const timestamp = new Date().toISOString().slice(0, 16)
  const newEntry = `\n## [${timestamp}] ${entry.title}\n${entry.content}\n`
  writeAgentMemory(agentId, existing + newEntry)
}

async function updateAgentMemory(agent, task, output) {
  try {
    const currentMemory = readAgentMemory(agent.id)

    const response = await callClaude({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: `You are a memory curator for ${agent.name} (${agent.role}). Extract the most important learnings, decisions, and context from completed work that would help this agent perform better on future tasks.

Rules:
- Be concise — bullet points, not paragraphs
- Focus on: patterns discovered, decisions made, gotchas found, strategies that worked, income opportunities identified
- Skip generic knowledge — only save project-specific insights
- If nothing new was learned, respond with just "NOTHING_NEW"

Respond with ONLY the memory entry content (markdown bullets).`,
      messages: [{
        role: 'user',
        content: `Task completed: "${task.title}"
Output (first 2000 chars): ${output.slice(0, 2000)}

Current memory (for context — avoid duplicates):
${currentMemory.slice(-2000) || '(empty)'}`
      }]
    }, agent.id, task.id)

    const text = response.content.map(b => b.type === 'text' ? b.text : '').join('')
    if (text.includes('NOTHING_NEW')) return

    appendAgentMemory(agent.id, { title: task.title, content: text.slice(0, 1000) })
    console.log(`🧠 Memory updated for ${agent.name}`)
  } catch (err) {
    console.error(`Memory update failed for ${agent.name}:`, err.message)
  }
}


// ══════════════════════════════════════════════════════
// ██ TASK QUEUE — Per-agent serial queue              ██
// ══════════════════════════════════════════════════════

const agentQueues = new Map()

async function processAgentQueue(agentId) {
  if (agentQueues.get(agentId)?.processing) return
  agentQueues.set(agentId, { processing: true })

  try {
    const nextTask = db.prepare(
      "SELECT * FROM tasks WHERE agent_id = ? AND status = 'todo' ORDER BY priority = 'critical' DESC, priority = 'high' DESC, priority = 'medium' DESC, created_at ASC LIMIT 1"
    ).get(agentId)

    if (!nextTask) {
      agentQueues.set(agentId, { processing: false })
      return
    }

    if (activeRuns.has(agentId)) {
      agentQueues.set(agentId, { processing: false })
      return
    }

    console.log(`📋 Queue: auto-running "${nextTask.title}" for ${agentId}`)

    try {
      const PORT = process.env.API_PORT || process.env.PORT || 3002
      await fetch(`http://localhost:${PORT}/api/tasks/${nextTask.id}/run`, { method: 'POST' })
    } catch (e) {
      console.error('Queue auto-run failed:', e.message)
    }
  } finally {
    agentQueues.set(agentId, { processing: false })
  }
}

// Check all agent queues periodically
setInterval(() => {
  for (const agent of agents) {
    if (!activeRuns.has(agent.id)) {
      processAgentQueue(agent.id)
    }
  }
}, 30000)


// ══════════════════════════════════════════════════════
// ██ INTER-AGENT CONSULTATION                         ██
// ══════════════════════════════════════════════════════

async function agentConsult(fromAgent, toAgentId, question, taskContext) {
  const toAgent = agents.find(a => a.id === toAgentId)
  if (!toAgent) return null

  try {
    const toMemory = readAgentMemory(toAgentId)

    const response = await callClaude({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: `${toAgent.systemPrompt}

You are being consulted by ${fromAgent.name} (${fromAgent.role}) about a task they're working on. Answer their question using your expertise. Be concise and actionable.

Your accumulated knowledge:
${toMemory.slice(-1500) || '(no prior knowledge)'}`,
      messages: [{
        role: 'user',
        content: `Question from ${fromAgent.name}:\n${question}\n\nTask context:\n${taskContext}`
      }]
    }, toAgentId, null)

    const answer = response.content.map(b => b.type === 'text' ? b.text : '').join('')

    db.prepare('INSERT INTO messages (sender_id, sender_name, sender_avatar, sender_color, text) VALUES (?, ?, ?, ?, ?)')
      .run(fromAgent.id, fromAgent.name, fromAgent.avatar, fromAgent.color,
        `💬 @${toAgent.name}: ${question.slice(0, 200)}`)
    db.prepare('INSERT INTO messages (sender_id, sender_name, sender_avatar, sender_color, text) VALUES (?, ?, ?, ?, ?)')
      .run(toAgent.id, toAgent.name, toAgent.avatar, toAgent.color,
        `↩️ Re: ${fromAgent.name}'s question:\n${answer.slice(0, 500)}`)

    return answer
  } catch (err) {
    console.error(`Consultation ${fromAgent.id} → ${toAgentId} failed:`, err.message)
    return null
  }
}


// ── Auto Task Generation ────────────────────────────
async function generateFollowUpTasks(completedTask, agent, output) {
  try {
    const allTasks = db.prepare('SELECT title, status, agent_id FROM tasks ORDER BY created_at DESC LIMIT 20').all()
    const taskContext = allTasks.map(t => `- [${t.status}] ${t.title}`).join('\n')

    const response = await callClaude({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: `You are a strategic task planner for Hive, a personal AI agent team focused on generating income across multiple channels: digital products, content/affiliate, freelance services, and stock/crypto trading.

Available agents and their specialties:
${agents.map(a => `- ${a.id}: ${a.name} (${a.role}) — ${a.description}`).join('\n')}

Generate 1-3 follow-up tasks based on completed work. Each task should:
- Be actionable, specific, and assigned to the most appropriate agent
- Connect back to income generation — either directly (build product, find gig, write content) or indirectly (improve process, learn skill, analyze results)
- Build on momentum — if something is working, create tasks to double down on it

IMPORTANT: Do NOT duplicate existing tasks. Do NOT create vague tasks. Each must be concrete enough for an agent to execute.

Respond with ONLY valid JSON — an array of objects with: title, description, agent_id, priority (low/medium/high)`,
      messages: [{
        role: 'user',
        content: `Completed task: "${completedTask.title}"
Agent: ${agent.name} (${agent.role})

Output summary (first 2000 chars):
${output.slice(0, 2000)}

Existing tasks (avoid duplicates):
${taskContext}

Generate follow-up tasks as JSON array:`
      }]
    }, agent.id, completedTask.id)

    const text = response.content.map(b => b.type === 'text' ? b.text : '').join('')
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return

    const newTasks = JSON.parse(jsonMatch[0])
    const created = []

    for (const t of newTasks.slice(0, 3)) {
      const validAgent = agents.find(a => a.id === t.agent_id)
      if (!validAgent || !t.title) continue

      const id = uuid()
      db.prepare(`
        INSERT INTO tasks (id, title, description, priority, agent_id, status)
        VALUES (?, ?, ?, ?, ?, 'todo')
      `).run(id, t.title, t.description || '', t.priority || 'medium', t.agent_id)
      created.push({ title: t.title, agent: validAgent.name, agentId: t.agent_id })
    }

    if (created.length > 0) {
      const taskList = created.map(t => `• ${t.title} → ${t.agent}`).join('\n')
      db.prepare('INSERT INTO messages (sender_id, sender_name, sender_avatar, sender_color, text) VALUES (?, ?, ?, ?, ?)')
        .run('system', '🧠 Task Planner', '🧠', '#a855f7', `Generated ${created.length} follow-up task${created.length > 1 ? 's' : ''}:\n${taskList}`)

      console.log(`🧠 Auto-generated ${created.length} follow-up tasks from "${completedTask.title}"`)

      const affectedAgents = [...new Set(created.map(t => t.agentId))]
      for (const agentId of affectedAgents) {
        setTimeout(() => processAgentQueue(agentId), 5000)
      }
    }
  } catch (err) {
    console.error('Auto-task generation failed:', err.message)
  }
}

// ── QA Review — Nexus auto-reviews completed work ────────
async function reviewCompletedWork(completedTask, agent, output) {
  try {
    // Nexus doesn't review its own work (prevent loops)
    if (agent.id === 'nexus') return

    const nexus = agents.find(a => a.id === 'nexus')
    if (!nexus) return

    const nexusMemory = readAgentMemory('nexus')

    db.prepare('INSERT INTO task_logs (task_id, agent_id, message, type) VALUES (?, ?, ?, ?)')
      .run(completedTask.id, 'nexus', 'Nexus is reviewing this work...', 'info')

    const response = await callClaude({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: `You are Nexus, the meta-agent and quality reviewer for Hive — a personal AI agent team focused on income generation. You review the output of other agents to ensure quality, actionability, and alignment with income goals.

Evaluate:
1. **Quality** — Is the output well-written, thorough, and professional?
2. **Actionability** — Can the user act on this immediately? Are there clear next steps?
3. **Income Relevance** — Does this contribute to generating income? Is it focused on results?
4. **Accuracy** — Are claims, data, or strategies sound? Any red flags?
5. **Improvement** — How could this agent do better next time?

Your accumulated review knowledge:
${nexusMemory.slice(-1500) || '(no prior reviews)'}

Format your response as:
**Score: X/10**
**Verdict: PASS | NEEDS WORK | FAIL**

Then explain your findings concisely. If NEEDS WORK or FAIL, list specific issues.`,
      messages: [{
        role: 'user',
        content: `Review this completed work:

**Task:** ${completedTask.title}
**Agent:** ${agent.name} (${agent.role})
**Description:** ${completedTask.description || 'No description'}

**Agent Output (first 4000 chars):**
${output.slice(0, 4000)}`
      }]
    }, 'nexus', completedTask.id)

    const review = response.content.map(b => b.type === 'text' ? b.text : '').join('')

    const verdictMatch = review.match(/Verdict:\s*(PASS|NEEDS WORK|FAIL)/i)
    const scoreMatch = review.match(/Score:\s*(\d+)\/10/i)
    const verdict = verdictMatch ? verdictMatch[1].toUpperCase() : 'UNKNOWN'
    const score = scoreMatch ? parseInt(scoreMatch[1]) : null

    db.prepare('INSERT INTO task_logs (task_id, agent_id, message, type) VALUES (?, ?, ?, ?)')
      .run(completedTask.id, 'nexus', review.slice(0, 5000), verdict === 'PASS' ? 'success' : 'warning')

    const emoji = verdict === 'PASS' ? '✅' : verdict === 'FAIL' ? '🚨' : '⚠️'
    const shortReview = review.length > 500 ? review.slice(0, 500) + '…' : review
    db.prepare('INSERT INTO messages (sender_id, sender_name, sender_avatar, sender_color, text) VALUES (?, ?, ?, ?, ?)')
      .run('nexus', nexus.name, nexus.avatar, nexus.color,
        `${emoji} **Review of "${completedTask.title}"** (by ${agent.name}):\n\n${shortReview}`)

    if (verdict === 'FAIL' || (score !== null && score <= 4)) {
      const fixId = uuid()
      db.prepare(`
        INSERT INTO tasks (id, title, description, priority, agent_id, status)
        VALUES (?, ?, ?, 'high', ?, 'todo')
      `).run(fixId, `Fix issues: ${completedTask.title}`, `Nexus review found critical issues:\n\n${review.slice(0, 2000)}`, agent.id)

      db.prepare('INSERT INTO messages (sender_id, sender_name, sender_avatar, sender_color, text) VALUES (?, ?, ?, ?, ?)')
        .run('nexus', nexus.name, nexus.avatar, nexus.color,
          `🔁 Created fix task for ${agent.name}: issues found in "${completedTask.title}"`)

      setTimeout(() => processAgentQueue(agent.id), 5000)
    }

    console.log(`🛡️ Nexus reviewed "${completedTask.title}": ${verdict} ${score ? `(${score}/10)` : ''}`)
  } catch (err) {
    console.error('QA review failed:', err.message)
  }
}

// ── Auto-Troubleshoot & Retry Failed Tasks ──────────
const MAX_RETRIES = 2

async function troubleshootAndRetry(failedTask, agent, errorMsg) {
  try {
    const retries = failedTask.retries || 0
    if (retries >= MAX_RETRIES) {
      db.prepare('INSERT INTO messages (sender_id, sender_name, sender_avatar, sender_color, text) VALUES (?, ?, ?, ?, ?)')
        .run('system', '🔧 Troubleshooter', '🔧', '#ef4444', `⛔ "${failedTask.title}" failed ${MAX_RETRIES} times — giving up. Needs manual review.`)
      console.log(`🔧 Max retries reached for "${failedTask.title}"`)
      return
    }

    const logs = db.prepare('SELECT message, type FROM task_logs WHERE task_id = ? ORDER BY created_at ASC').all(failedTask.id)
    const logContext = logs.map(l => `[${l.type}] ${l.message}`).join('\n')

    db.prepare('INSERT INTO task_logs (task_id, agent_id, message, type) VALUES (?, ?, ?, ?)')
      .run(failedTask.id, 'system', `Troubleshooting failure (attempt ${retries + 1}/${MAX_RETRIES})...`, 'info')

    const response = await callClaude({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: `You are a troubleshooter for Hive, a personal AI agent team. A task just failed. Your job is to:
1. Diagnose WHY it failed based on the error message and logs
2. Determine if it's retryable (transient error, rate limit, timeout) vs permanent (bad logic, impossible task)
3. If retryable, provide an improved task description that avoids the failure
4. If permanent, explain what needs to change

Respond with ONLY valid JSON:
{
  "diagnosis": "Brief explanation of what went wrong",
  "retryable": true/false,
  "fix": "What to change to fix it",
  "improved_description": "Updated task description for retry (only if retryable)"
}`,
      messages: [{
        role: 'user',
        content: `Failed task: "${failedTask.title}"
Agent: ${agent.name} (${agent.role})
Original description: ${failedTask.description || 'No description'}

Error: ${errorMsg}

Task logs:
${logContext.slice(0, 2000)}`
      }]
    }, agent.id, failedTask.id)

    const text = response.content.map(b => b.type === 'text' ? b.text : '').join('')
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return

    const diagnosis = JSON.parse(jsonMatch[0])

    db.prepare('INSERT INTO messages (sender_id, sender_name, sender_avatar, sender_color, text) VALUES (?, ?, ?, ?, ?)')
      .run('system', '🔧 Troubleshooter', '🔧', '#ef4444',
        `🔍 Diagnosed "${failedTask.title}":\n\n**Problem:** ${diagnosis.diagnosis}\n**Fix:** ${diagnosis.fix}\n**Retryable:** ${diagnosis.retryable ? 'Yes — retrying now' : 'No — needs manual intervention'}`)

    db.prepare('INSERT INTO task_logs (task_id, agent_id, message, type) VALUES (?, ?, ?, ?)')
      .run(failedTask.id, 'system', `Diagnosis: ${diagnosis.diagnosis}\nFix: ${diagnosis.fix}`, 'warning')

    if (diagnosis.retryable && diagnosis.improved_description) {
      const newDesc = `${diagnosis.improved_description}\n\n---\n⚠️ Previous attempt failed: ${diagnosis.diagnosis}\nFix applied: ${diagnosis.fix}`
      db.prepare(`UPDATE tasks SET status = 'todo', description = ?, error = '', retries = ?, completed_at = NULL, started_at = NULL, updated_at = datetime('now') WHERE id = ?`)
        .run(newDesc, retries + 1, failedTask.id)

      db.prepare('INSERT INTO task_logs (task_id, agent_id, message, type) VALUES (?, ?, ?, ?)')
        .run(failedTask.id, 'system', `Task reset for retry (${retries + 1}/${MAX_RETRIES}) with improved description`, 'info')

      setTimeout(() => processAgentQueue(agent.id), 5000)
    } else {
      db.prepare('INSERT INTO task_logs (task_id, agent_id, message, type) VALUES (?, ?, ?, ?)')
        .run(failedTask.id, 'system', 'Task requires manual intervention — not auto-retryable', 'error')
    }

    console.log(`🔧 Troubleshot "${failedTask.title}": ${diagnosis.retryable ? 'retrying' : 'needs manual fix'}`)
  } catch (err) {
    console.error('Troubleshooting failed:', err.message)
  }
}


// ══════════════════════════════════════════════════════
// ██ HEARTBEAT / CRON SCHEDULER                       ██
// ══════════════════════════════════════════════════════

const heartbeatJobs = []

function registerHeartbeat(name, intervalMs, fn) {
  const id = setInterval(fn, intervalMs)
  heartbeatJobs.push({ name, id, intervalMs })
  console.log(`💓 Heartbeat registered: ${name} (every ${Math.round(intervalMs / 60000)}min)`)
}

// Daily standup every 24 hours
registerHeartbeat('auto-standup', 24 * 60 * 60 * 1000, async () => {
  try {
    const PORT = process.env.API_PORT || process.env.PORT || 3002
    await fetch(`http://localhost:${PORT}/api/chat/standup`, { method: 'POST' })
    console.log('💓 Auto-standup triggered')
  } catch (e) {
    console.error('Auto-standup failed:', e.message)
  }
})

// Queue monitor — every 5 minutes
registerHeartbeat('queue-monitor', 5 * 60 * 1000, () => {
  for (const agent of agents) {
    if (!activeRuns.has(agent.id)) {
      const pendingCount = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE agent_id = ? AND status = 'todo'").get(agent.id)?.count || 0
      if (pendingCount > 0) {
        processAgentQueue(agent.id)
      }
    }
  }
})

// Memory compaction — every 7 days (compact memories >10KB)
registerHeartbeat('memory-compaction', 7 * 24 * 60 * 60 * 1000, async () => {
  for (const agent of agents) {
    const memory = readAgentMemory(agent.id)
    if (memory.length > 10000) {
      try {
        const response = await callClaude({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2048,
          system: `Compact this agent memory to the most important 50% of content. Keep the most valuable learnings — especially income-generating insights, successful strategies, and key patterns. Remove redundant or outdated entries. Preserve markdown formatting.`,
          messages: [{ role: 'user', content: memory }]
        }, agent.id, null)
        const compacted = response.content.map(b => b.type === 'text' ? b.text : '').join('')
        writeAgentMemory(agent.id, compacted)
        console.log(`🧹 Compacted memory for ${agent.name}: ${memory.length} → ${compacted.length} chars`)
      } catch (e) {
        console.error(`Memory compaction failed for ${agent.name}:`, e.message)
      }
    }
  }
})


// Nexus weekly retrospective — every 7 days
registerHeartbeat('nexus-retrospective', 7 * 24 * 60 * 60 * 1000, async () => {
  try {
    const nexus = agents.find(a => a.id === 'nexus')
    if (!nexus) return

    // Gather week's data
    const weekDone = db.prepare("SELECT title, agent_id, completed_at FROM tasks WHERE status = 'done' AND completed_at >= datetime('now', '-7 days')").all()
    const weekFailed = db.prepare("SELECT title, agent_id FROM tasks WHERE status = 'failed' AND updated_at >= datetime('now', '-7 days')").all()
    const weekSpend = db.prepare("SELECT agent_id, SUM(cost) as total FROM spend_log WHERE date >= date('now', '-7 days') GROUP BY agent_id").all()

    const retroId = uuid()
    db.prepare(`
      INSERT INTO tasks (id, title, description, priority, agent_id, status)
      VALUES (?, ?, ?, 'high', 'nexus', 'todo')
    `).run(retroId, 'Weekly Retrospective', `Analyze this week's performance:\n\nCompleted tasks: ${weekDone.length}\nFailed tasks: ${weekFailed.length}\nCompleted: ${weekDone.map(t => `- ${t.title} (${t.agent_id})`).join('\n')}\nFailed: ${weekFailed.map(t => `- ${t.title} (${t.agent_id})`).join('\n')}\nSpend by agent: ${weekSpend.map(s => `- ${s.agent_id}: $${s.total.toFixed(2)}`).join('\n')}\n\nProduce a full retrospective with income summary, win/loss analysis, agent performance review, prompt improvement proposals, and next week priorities.`)

    setTimeout(() => processAgentQueue('nexus'), 3000)
    console.log('💓 Weekly retrospective queued for Nexus')
  } catch (e) {
    console.error('Weekly retrospective failed:', e.message)
  }
})


// ── Agents ─────────────────────────────────────────
app.get('/api/agents', (req, res) => {
  const taskCounts = db.prepare(`
    SELECT agent_id, status, COUNT(*) as count
    FROM tasks WHERE agent_id IS NOT NULL
    GROUP BY agent_id, status
  `).all()

  const enriched = agents.map(agent => {
    const counts = taskCounts.filter(t => t.agent_id === agent.id)
    return {
      ...agent,
      taskCounts: {
        active: counts.filter(c => c.status === 'in_progress').reduce((s, c) => s + c.count, 0),
        completed: counts.filter(c => c.status === 'done').reduce((s, c) => s + c.count, 0),
        total: counts.reduce((s, c) => s + c.count, 0)
      },
      isRunning: activeRuns.has(agent.id),
      hasMemory: readAgentMemory(agent.id).length > 0
    }
  })
  res.json(enriched)
})

// ── Agent Memory API ──────────────────────────────
app.get('/api/agents/:id/memory', (req, res) => {
  const memory = readAgentMemory(req.params.id)
  res.json({ agent_id: req.params.id, memory, length: memory.length })
})

app.delete('/api/agents/:id/memory', (req, res) => {
  writeAgentMemory(req.params.id, '')
  res.json({ ok: true, message: 'Memory cleared' })
})

// ── Agent System Prompt API (for Nexus self-improvement) ──
app.get('/api/agents/:id/prompt', (req, res) => {
  const agent = agents.find(a => a.id === req.params.id)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })
  res.json({ agent_id: agent.id, name: agent.name, systemPrompt: agent.systemPrompt })
})

// ── Inter-Agent Consult API ───────────────────────
app.post('/api/agents/:fromId/consult/:toId', async (req, res) => {
  const fromAgent = agents.find(a => a.id === req.params.fromId)
  const toAgent = agents.find(a => a.id === req.params.toId)
  if (!fromAgent || !toAgent) return res.status(404).json({ error: 'Agent not found' })

  const { question, context } = req.body
  if (!question) return res.status(400).json({ error: 'Question required' })

  res.json({ ok: true, message: `${fromAgent.name} is consulting ${toAgent.name}...` })

  const answer = await agentConsult(fromAgent, req.params.toId, question, context || '')
  if (answer) {
    console.log(`💬 ${fromAgent.name} consulted ${toAgent.name}`)
  }
})

// ── Tasks CRUD ─────────────────────────────────────
app.get('/api/tasks', (req, res) => {
  const tasks = db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all()
  res.json(tasks)
})

app.post('/api/tasks', (req, res) => {
  const { title, description, priority, agent_id } = req.body
  const id = uuid()
  db.prepare(`
    INSERT INTO tasks (id, title, description, priority, agent_id, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, title, description || '', priority || 'medium', agent_id || null, agent_id ? 'todo' : 'backlog')

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)
  res.status(201).json(task)

  if (agent_id) {
    setTimeout(() => processAgentQueue(agent_id), 2000)
  }
})

app.patch('/api/tasks/:id', (req, res) => {
  const { id } = req.params
  const fields = req.body
  const sets = []
  const vals = []

  for (const [key, val] of Object.entries(fields)) {
    if (['title', 'description', 'status', 'priority', 'agent_id', 'output', 'error', 'started_at', 'completed_at'].includes(key)) {
      sets.push(`${key} = ?`)
      vals.push(val)
    }
  }

  if (sets.length === 0) return res.status(400).json({ error: 'No valid fields' })

  sets.push("updated_at = datetime('now')")
  vals.push(id)

  db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)
  res.json(task)
})

app.delete('/api/tasks/:id', (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// ── Task Logs ──────────────────────────────────────
app.get('/api/tasks/:id/logs', (req, res) => {
  const logs = db.prepare('SELECT * FROM task_logs WHERE task_id = ? ORDER BY created_at ASC').all(req.params.id)
  res.json(logs)
})

// ══════════════════════════════════════════════════════
// ██ ReAct LOOP — Multi-step reasoning                ██
// ══════════════════════════════════════════════════════

app.post('/api/tasks/:id/run', async (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id)
  if (!task) return res.status(404).json({ error: 'Task not found' })
  if (!task.agent_id) return res.status(400).json({ error: 'No agent assigned' })

  const agent = agents.find(a => a.id === task.agent_id)
  if (!agent) return res.status(400).json({ error: 'Agent not found' })

  if (activeRuns.has(agent.id)) {
    return res.status(409).json({ error: `${agent.name} is already running a task` })
  }

  // Check spend limits before starting
  try {
    checkSpendLimit(agent.id)
  } catch (limitErr) {
    // Don't fail — pause the task for later
    db.prepare("UPDATE tasks SET status = 'todo', updated_at = datetime('now') WHERE id = ?").run(task.id)
    db.prepare('INSERT INTO task_logs (task_id, agent_id, message, type) VALUES (?, ?, ?, ?)')
      .run(task.id, agent.id, `Paused: ${limitErr.message}`, 'warning')
    return res.status(429).json({ error: limitErr.message })
  }

  db.prepare("UPDATE tasks SET status = 'in_progress', started_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(task.id)
  db.prepare('INSERT INTO task_logs (task_id, agent_id, message, type) VALUES (?, ?, ?, ?)').run(task.id, agent.id, `Agent ${agent.name} started working...`, 'info')

  const abortController = new AbortController()
  activeRuns.set(agent.id, { taskId: task.id, abort: abortController })

  res.json({ ok: true, message: `Agent ${agent.name} is working on it` })

  // ── ReAct Loop ──────────────────────────────────
  try {
    const agentMemory = readAgentMemory(agent.id)
    const MAX_STEPS = 3
    let messages = []
    let fullOutput = ''

    const initialPrompt = `Task: ${task.title}

Details: ${task.description || 'No additional details.'}

${agentMemory ? `## Your Memory (learnings from past tasks):\n${agentMemory.slice(-2000)}\n` : ''}

## Instructions
You are working on this task using a multi-step approach:
1. First, THINK about the task and what you need to do
2. If you need input from another agent, say: [CONSULT:agent_id] question here
   Available agents: ${agents.filter(a => a.id !== agent.id).map(a => `${a.id} (${a.name} - ${a.role})`).join(', ')}
3. Provide your solution with complete, actionable output

Start by analyzing the task and providing your approach.`

    messages.push({ role: 'user', content: initialPrompt })

    for (let step = 0; step < MAX_STEPS; step++) {
      if (abortController.signal.aborted) throw new Error('AbortError')

      db.prepare('INSERT INTO task_logs (task_id, agent_id, message, type) VALUES (?, ?, ?, ?)')
        .run(task.id, agent.id, `ReAct step ${step + 1}/${MAX_STEPS}...`, 'info')

      const response = await callClaude({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        system: agent.systemPrompt,
        messages,
      }, agent.id, task.id, abortController.signal)

      const stepOutput = response.content.map(b => b.type === 'text' ? b.text : '').join('\n')
      fullOutput += `\n--- Step ${step + 1} ---\n${stepOutput}`
      messages.push({ role: 'assistant', content: stepOutput })

      // Check for consultation requests
      const consultMatch = stepOutput.match(/\[CONSULT:(\w+)\]\s*(.+)/s)
      if (consultMatch && step < MAX_STEPS - 1) {
        const [, targetAgentId, question] = consultMatch
        db.prepare('INSERT INTO task_logs (task_id, agent_id, message, type) VALUES (?, ?, ?, ?)')
          .run(task.id, agent.id, `Consulting ${targetAgentId}: ${question.slice(0, 200)}`, 'info')

        const consultResponse = await agentConsult(agent, targetAgentId, question, `Task: ${task.title}`)

        if (consultResponse) {
          messages.push({
            role: 'user',
            content: `Response from ${targetAgentId}:\n${consultResponse}\n\nNow continue with your task, incorporating this input.`
          })
          continue
        }
      }

      if (!consultMatch || step === MAX_STEPS - 1) {
        break
      }
    }

    activeRuns.delete(agent.id)
    db.prepare(`UPDATE tasks SET status = 'done', output = ?, completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
      .run(fullOutput.slice(0, 50000), task.id)
    db.prepare('INSERT INTO task_logs (task_id, agent_id, message, type) VALUES (?, ?, ?, ?)')
      .run(task.id, agent.id, 'Task completed successfully', 'success')

    const summary = fullOutput.length > 300 ? fullOutput.slice(0, 300) + '…' : fullOutput
    db.prepare('INSERT INTO messages (sender_id, sender_name, sender_avatar, sender_color, text) VALUES (?, ?, ?, ?, ?)')
      .run(agent.id, agent.name, agent.avatar, agent.color, `✅ Finished: "${task.title}"\n\n${summary}`)

    sendPushToAll({
      title: `${agent.avatar} ${agent.name} finished`,
      body: task.title,
      tag: `task-done-${task.id}`,
      taskId: task.id
    })

    // Update memory → QA review → generate follow-ups → queue next
    updateAgentMemory(agent, task, fullOutput)
      .then(() => reviewCompletedWork(task, agent, fullOutput))
      .then(() => generateFollowUpTasks(task, agent, fullOutput))
      .then(() => { setTimeout(() => processAgentQueue(agent.id), 5000) })
      .catch(() => {})

  } catch (err) {
    activeRuns.delete(agent.id)
    const errorMsg = err.name === 'AbortError' || err.message === 'AbortError' ? 'Stopped by user' : err.message
    db.prepare(`UPDATE tasks SET status = 'failed', error = ?, completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
      .run(errorMsg, task.id)
    db.prepare('INSERT INTO task_logs (task_id, agent_id, message, type) VALUES (?, ?, ?, ?)')
      .run(task.id, agent.id, `Task failed: ${errorMsg}`, 'error')

    db.prepare('INSERT INTO messages (sender_id, sender_name, sender_avatar, sender_color, text) VALUES (?, ?, ?, ?, ?)')
      .run(agent.id, agent.name, agent.avatar, agent.color, `❌ Failed: "${task.title}" — ${errorMsg}`)

    sendPushToAll({
      title: `${agent.avatar} ${agent.name} failed`,
      body: `${task.title} — ${errorMsg}`,
      tag: `task-fail-${task.id}`,
      taskId: task.id
    })

    if (errorMsg !== 'Stopped by user') {
      troubleshootAndRetry(task, agent, errorMsg).catch(() => {})
    }
  }
})

// ── Stop Agent ─────────────────────────────────────
app.post('/api/agents/:id/stop', (req, res) => {
  const entry = activeRuns.get(req.params.id)
  if (!entry) return res.status(404).json({ error: 'Agent not running' })

  entry.abort.abort()
  activeRuns.delete(req.params.id)

  db.prepare("UPDATE tasks SET status = 'failed', error = 'Stopped by user', completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
    .run(entry.taskId)

  res.json({ ok: true })
})

// ── Stats ──────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as count FROM tasks').get().count
  const byStatus = db.prepare('SELECT status, COUNT(*) as count FROM tasks GROUP BY status').all()
  const byAgent = db.prepare('SELECT agent_id, COUNT(*) as count FROM tasks WHERE agent_id IS NOT NULL GROUP BY agent_id').all()
  const recent = db.prepare("SELECT * FROM tasks WHERE completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 5").all()

  res.json({ total, byStatus, byAgent, recent })
})

// ── Heartbeat Status API ──────────────────────────
app.get('/api/heartbeat', (req, res) => {
  res.json({
    jobs: heartbeatJobs.map(j => ({
      name: j.name,
      intervalMinutes: Math.round(j.intervalMs / 60000)
    })),
    queueStatus: agents.map(a => ({
      agentId: a.id,
      name: a.name,
      isRunning: activeRuns.has(a.id),
      pendingTasks: db.prepare("SELECT COUNT(*) as count FROM tasks WHERE agent_id = ? AND status = 'todo'").get(a.id)?.count || 0
    }))
  })
})

// ── Chat Messages ─────────────────────────────────
app.get('/api/messages', (req, res) => {
  const messages = db.prepare('SELECT * FROM messages ORDER BY created_at ASC LIMIT 200').all()
  res.json(messages)
})

app.post('/api/messages', (req, res) => {
  const { sender_id, sender_name, sender_avatar, sender_color, text } = req.body
  if (!text?.trim()) return res.status(400).json({ error: 'Message text required' })

  db.prepare('INSERT INTO messages (sender_id, sender_name, sender_avatar, sender_color, text) VALUES (?, ?, ?, ?, ?)')
    .run(sender_id || 'user', sender_name || 'You', sender_avatar || '👤', sender_color || '#a8a29e', text.trim())

  const msg = db.prepare('SELECT * FROM messages ORDER BY id DESC LIMIT 1').get()
  res.status(201).json(msg)
})

app.delete('/api/messages', (req, res) => {
  db.prepare('DELETE FROM messages').run()
  res.json({ ok: true })
})

// ── Team Standup ──────────────────────────────────
app.post('/api/chat/standup', async (req, res) => {
  const recentDone = db.prepare("SELECT title, agent_id FROM tasks WHERE status = 'done' ORDER BY completed_at DESC LIMIT 5").all()
  const inProgress = db.prepare("SELECT title, agent_id FROM tasks WHERE status = 'in_progress'").all()
  const todo = db.prepare("SELECT title, agent_id FROM tasks WHERE status = 'todo'").all()
  const failed = db.prepare("SELECT title, agent_id FROM tasks WHERE status = 'failed' ORDER BY updated_at DESC LIMIT 3").all()

  const taskContext = [
    recentDone.length ? `Recently completed: ${recentDone.map(t => `"${t.title}" (${t.agent_id})`).join(', ')}` : 'No recently completed tasks.',
    inProgress.length ? `In progress: ${inProgress.map(t => `"${t.title}" (${t.agent_id})`).join(', ')}` : 'Nothing currently in progress.',
    todo.length ? `Queued: ${todo.map(t => `"${t.title}" (${t.agent_id})`).join(', ')}` : 'Nothing queued.',
    failed.length ? `Failed: ${failed.map(t => `"${t.title}" (${t.agent_id})`).join(', ')}` : '',
  ].filter(Boolean).join('\n')

  const agentProfiles = agents.map(a => `- ${a.avatar} ${a.name} (${a.role}): ${a.description}`).join('\n')

  db.prepare('INSERT INTO messages (sender_id, sender_name, sender_avatar, sender_color, text) VALUES (?, ?, ?, ?, ?)')
    .run('system', 'System', '📋', '#78716c', 'Team standup starting...')

  res.json({ ok: true, message: 'Standup initiated' })

  try {
    const response = await callClaude({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: `You are simulating a quick team standup meeting between ${agents.length} AI agents working together as Hive — a personal AI agent team focused on generating income through digital products, content/affiliate, freelance services, and trading. Each agent has a distinct personality and role.

The team:
${agentProfiles}

Current project status:
${taskContext}

Generate a natural, brief team standup conversation. Each agent should speak 1-2 times. They should:
- Report what they've been working on (reference actual tasks if any)
- Share income-relevant insights or wins
- Mention what they plan to work on next
- Ask questions or offer help to other agents when relevant
- Be concise and natural — like a high-energy startup team standup

CRITICAL FORMAT: Output ONLY lines in this exact format, one per message. No other text:
${agents.map(a => a.name.toUpperCase() + ': message text here').join('\n')}

Keep it to 8-12 messages total. Be conversational and specific.`
      }]
    }, 'system', null)

    const output = response.content.map(b => b.type === 'text' ? b.text : '').join('\n')
    const agentMap = {}
    for (const a of agents) agentMap[a.name.toUpperCase()] = a

    const lines = output.split('\n').filter(l => l.trim())
    let delay = 0

    for (const line of lines) {
      const agentPattern = agents.map(a => a.name.toUpperCase()).join('|')
      const match = line.match(new RegExp(`^(${agentPattern}):\\s*(.+)`, 'i'))
      if (!match) continue
      const agent = agentMap[match[1].toUpperCase()]
      if (!agent) continue
      const text = match[2].trim()
      if (!text) continue

      setTimeout(() => {
        db.prepare('INSERT INTO messages (sender_id, sender_name, sender_avatar, sender_color, text) VALUES (?, ?, ?, ?, ?)')
          .run(agent.id, agent.name, agent.avatar, agent.color, text)
      }, delay)
      delay += 800
    }

    setTimeout(() => {
      db.prepare('INSERT INTO messages (sender_id, sender_name, sender_avatar, sender_color, text) VALUES (?, ?, ?, ?, ?)')
        .run('system', 'System', '✅', '#78716c', 'Standup complete.')
    }, delay + 500)
  } catch (err) {
    db.prepare('INSERT INTO messages (sender_id, sender_name, sender_avatar, sender_color, text) VALUES (?, ?, ?, ?, ?)')
      .run('system', 'System', '⚠️', '#78716c', `Standup failed: ${err.message}`)
  }
})

// ── Push Notifications ───────────────────────────
app.get('/api/push/vapid-key', (req, res) => {
  res.json({ key: VAPID_PUBLIC })
})

app.post('/api/push/subscribe', (req, res) => {
  const sub = JSON.stringify(req.body)
  pushSubscriptions.add(sub)
  res.json({ ok: true })
})

// ── Settings API ──────────────────────────────────
app.get('/api/settings', (req, res) => {
  const rows = db.prepare('SELECT * FROM settings').all()
  const settings = {}
  for (const row of rows) settings[row.key] = row.value
  res.json(settings)
})

app.patch('/api/settings', (req, res) => {
  const updates = req.body
  for (const [key, value] of Object.entries(updates)) {
    setSetting(key, String(value))
  }
  res.json({ ok: true })
})

// ── Spend API ─────────────────────────────────────
app.get('/api/spend', (req, res) => {
  const today = new Date().toISOString().slice(0, 10)
  const monthStart = new Date().toISOString().slice(0, 7) + '-01'

  const todaySpend = getTodaySpend()
  const monthSpend = getMonthSpend()
  const dailyLimit = parseFloat(getSetting('daily_limit_usd') || '999')
  const monthlyLimit = parseFloat(getSetting('monthly_limit_usd') || '999')

  // Per-agent breakdown
  const agentSpend = db.prepare(`
    SELECT agent_id, SUM(cost) as total_cost, SUM(tokens_in + tokens_out) as total_tokens, COUNT(*) as calls
    FROM spend_log WHERE date = ? GROUP BY agent_id
  `).all(today)

  // Last 7 days trend
  const weekTrend = db.prepare(`
    SELECT date, SUM(cost) as daily_cost
    FROM spend_log WHERE date >= date('now', '-7 days')
    GROUP BY date ORDER BY date ASC
  `).all()

  res.json({
    today: { spend: todaySpend, limit: dailyLimit, remaining: Math.max(0, dailyLimit - todaySpend) },
    month: { spend: monthSpend, limit: monthlyLimit, remaining: Math.max(0, monthlyLimit - monthSpend) },
    agentBreakdown: agentSpend,
    weekTrend
  })
})

// ── Health check ──────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    agents: agents.length,
    activeRuns: activeRuns.size,
    heartbeats: heartbeatJobs.length,
    memoryDir: MEMORY_DIR
  })
})

// ── Serve static in production ────────────────────
if (process.env.NODE_ENV === 'production') {
  const distPath = join(__dirname, '..', 'dist')
  app.use(express.static(distPath))
  app.get('/{*splat}', (req, res) => {
    res.sendFile(join(distPath, 'index.html'))
  })
}

const PORT = process.env.API_PORT || process.env.PORT || 3002
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🐝 Hive server running on port ${PORT}`)
  console.log(`🧠 Agent memory dir: ${MEMORY_DIR}`)
  console.log(`📋 Task queues active for ${agents.length} agents`)
  console.log(`💓 ${heartbeatJobs.length} heartbeat jobs registered`)
})
