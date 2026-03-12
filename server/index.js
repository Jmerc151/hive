import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import db from './db.js'
import { v4 as uuid } from 'uuid'
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'fs'
import OpenAI from 'openai'
import webpush from 'web-push'
import archiver from 'archiver'
import * as marketData from './services/marketData.js'
import * as broker from './services/broker.js'
import * as backtest from './services/backtest.js'
import * as analysis from './services/analysis.js'
import * as email from './services/email.js'
import { traceBus } from './traceBus.js'
import sseRoutes from './routes/sse.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()

// ── Security headers ─────────────────────────────
app.use(helmet({ contentSecurityPolicy: false })) // CSP off — SPA serves its own scripts

// ── Rate limiting ────────────────────────────────
app.use(rateLimit({ windowMs: 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false }))

// CORS — allow frontend
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3333,http://localhost:5173').split(',')
app.use(cors({ origin: ALLOWED_ORIGINS }))
app.use(express.json())

// ── Auth middleware ───────────────────────────────
const API_KEY = process.env.HIVE_API_KEY
if (API_KEY) {
  app.use('/api', (req, res, next) => {
    if (req.path.startsWith('/webhooks/') && req.method === 'POST') return next()
    const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token
    if (token !== API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    next()
  })
  console.log('🔒 Auth enabled — requests require Bearer token')
} else {
  console.log('🔓 No HIVE_API_KEY set — API is open (protected by helmet + rate limiting)')
}

// ── SSE trace routes ─────────────────────────────
app.use('/api', sseRoutes)

// OpenRouter client — routes to multiple model providers via one API
const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY || '',
})

// ── Agent Model Assignment ──────────────────────────
const AGENT_MODELS = {
  scout:  'perplexity/sonar-pro',
  forge:  'deepseek/deepseek-r1',
  quill:  'anthropic/claude-haiku-4-5',
  dealer: 'anthropic/claude-haiku-4-5',
  oracle: 'anthropic/claude-sonnet-4-5',
  nexus:  'anthropic/claude-sonnet-4-5',
}
function getAgentModel(agentId) {
  return AGENT_MODELS[agentId] || 'anthropic/claude-sonnet-4-5'
}

// ── Spend Controls ────────────────────────────────
const MODEL_COSTS = {
  'perplexity/sonar-pro':         { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  'deepseek/deepseek-r1':         { input: 0.55 / 1_000_000, output: 2.19 / 1_000_000 },
  'anthropic/claude-haiku-4-5':   { input: 0.80 / 1_000_000, output: 4 / 1_000_000 },
  'anthropic/claude-sonnet-4-5':  { input: 3 / 1_000_000, output: 15 / 1_000_000 },
}
const DEFAULT_COST = MODEL_COSTS['anthropic/claude-sonnet-4-5']

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

// ── Helpers: convert Anthropic message format → OpenAI format ──
function flattenContent(content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map(b => b.type === 'text' ? b.text : (b.text || '')).join('')
  return String(content || '')
}

// Wrapped LLM call that tracks spend (OpenRouter via OpenAI SDK)
async function callClaude(opts, agentId, taskId, signal) {
  checkSpendLimit(agentId)

  // Convert Anthropic message format → OpenAI messages array
  const messages = []
  if (opts.system) {
    messages.push({ role: 'system', content: flattenContent(opts.system) })
  }
  for (const msg of (opts.messages || [])) {
    messages.push({ role: msg.role, content: flattenContent(msg.content) })
  }

  const response = await openai.chat.completions.create({
    model: opts.model,
    messages,
    max_tokens: opts.max_tokens,
  }, signal ? { signal } : undefined)

  const tokensIn = response.usage?.prompt_tokens || 0
  const tokensOut = response.usage?.completion_tokens || 0
  const pricing = MODEL_COSTS[opts.model] || DEFAULT_COST
  const cost = (tokensIn * pricing.input) + (tokensOut * pricing.output)

  logSpend(agentId, tokensIn, tokensOut, cost, taskId)

  if (taskId) {
    db.prepare('UPDATE tasks SET tokens_used = tokens_used + ?, estimated_cost = estimated_cost + ? WHERE id = ?')
      .run(tokensIn + tokensOut, cost, taskId)
  }

  // Return Anthropic-compatible shape so all existing parsing code works unchanged
  return {
    content: [{ type: 'text', text: response.choices?.[0]?.message?.content || '' }],
    usage: { input_tokens: tokensIn, output_tokens: tokensOut },
  }
}

// Web Push setup — generate VAPID keys if not set
let VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY
let VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY
if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
  const vapidKeys = webpush.generateVAPIDKeys()
  VAPID_PUBLIC = vapidKeys.publicKey
  VAPID_PRIVATE = vapidKeys.privateKey
  const envPath = join(__dirname, '..', '.env')
  try {
    appendFileSync(envPath, `\nVAPID_PUBLIC_KEY=${VAPID_PUBLIC}\nVAPID_PRIVATE_KEY=${VAPID_PRIVATE}\n`)
    console.log('🔔 Generated VAPID keys and saved to .env')
  } catch (e) { /* ignore */ }
}
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
      model: getAgentModel(agent.id),
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
      model: getAgentModel(toAgentId),
      max_tokens: 1024,
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

    // Record interaction for network graph
    try {
      db.prepare('INSERT INTO agent_interactions (source_agent_id, target_agent_id, interaction_type, task_id) VALUES (?, ?, ?, ?)').run(fromAgent.id, toAgentId, 'consult', null)
    } catch (e) { /* table may not exist yet */ }

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
      model: getAgentModel('nexus'),
      max_tokens: 512,
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
      model: getAgentModel('nexus'),
      max_tokens: 2048,
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

    // Store Nexus score on task
    if (score !== null) {
      db.prepare('UPDATE tasks SET nexus_score = ? WHERE id = ?').run(score, completedTask.id)
    }
    // Auto-hold low-scoring tasks for human review
    if (score !== null && score < 7 && verdict !== 'PASS') {
      db.prepare("UPDATE tasks SET status = 'awaiting_approval', updated_at = datetime('now') WHERE id = ?").run(completedTask.id)
      db.prepare('INSERT INTO task_logs (task_id, agent_id, message, type) VALUES (?, ?, ?, ?)').run(completedTask.id, 'nexus', `Score ${score}/10 — moved to approval queue for human review`, 'warning')
      sendPushToAll({ title: '⏸️ Review Needed', body: `${completedTask.title} scored ${score}/10`, tag: `review-${completedTask.id}` })
      email.sendApprovalEmail(completedTask, agent).catch(() => {})
    }

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
      model: getAgentModel('nexus'),
      max_tokens: 1024,
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
          model: getAgentModel(agent.id),
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


// Bot opportunity scan — weekly
registerHeartbeat('bot-opportunity-scan', 7 * 24 * 60 * 60 * 1000, async () => {
  try {
    const scout = agents.find(a => a.id === 'scout')
    if (!scout) return
    const taskId = uuid()
    db.prepare(`INSERT INTO tasks (id, title, description, priority, agent_id, status) VALUES (?, ?, ?, 'medium', 'scout', 'todo')`)
      .run(taskId, 'Bot Opportunity Scan', 'Research 5 trending bot/tool opportunities that could generate income. Consider current market trends, popular APIs, gaps in existing tools, and emerging niches.\n\nReturn your findings as a JSON array with this exact format:\n[\n  {\n    "name": "Bot Name",\n    "type": "chrome-extension|telegram-bot|discord-bot|web-app|cli-tool|api|landing-page",\n    "description": "What the bot does and why it\'s a good opportunity (2-3 sentences)",\n    "audience": "Target audience",\n    "monetization": "How to make money from it",\n    "reasoning": "Why this is a good opportunity right now"\n  }\n]\n\nFocus on ideas that are technically feasible as a solo project, have clear monetization paths, and are not oversaturated.')
    setTimeout(() => processAgentQueue('scout'), 3000)
    console.log('💓 Bot opportunity scan queued for Scout')
  } catch (e) {
    console.error('Bot opportunity scan failed:', e.message)
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
      hasMemory: readAgentMemory(agent.id).length > 0,
      model: getAgentModel(agent.id),
      todaySpend: getTodaySpend(agent.id),
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
  const { title, description, priority, agent_id, token_budget, requires_approval } = req.body
  const id = uuid()
  const budget = token_budget || parseInt(getSetting('per_task_token_budget') || '0')
  db.prepare(`
    INSERT INTO tasks (id, title, description, priority, agent_id, status, token_budget, requires_approval)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, title, description || '', priority || 'medium', agent_id || null, agent_id ? 'todo' : 'backlog', budget, requires_approval ? 1 : 0)

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
    if (['title', 'description', 'status', 'priority', 'agent_id', 'output', 'error', 'started_at', 'completed_at', 'token_budget', 'requires_approval', 'pipeline_id', 'pipeline_step'].includes(key)) {
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
// ██ Prompt Optimizer                                  ██
// ══════════════════════════════════════════════════════

app.post('/api/tasks/:id/optimize', async (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id)
  if (!task) return res.status(404).json({ error: 'Task not found' })
  if (!task.agent_id) return res.status(400).json({ error: 'No agent assigned' })

  const agent = agents.find(a => a.id === task.agent_id)
  if (!agent) return res.status(400).json({ error: 'Agent not found' })

  try {
    const response = await callClaude({
      model: getAgentModel('nexus'),
      max_tokens: 1024,
      system: `You are Nexus, prompt optimizer for Hive's AI agent team. Your job is to rewrite task prompts so they are clearer, more structured, and easier for an AI agent to execute — saving tokens and improving output quality.

The task will be executed by: ${agent.name} (${agent.role})

Rules:
- Keep the user's intent exactly — don't change WHAT they want, improve HOW it's expressed
- Add structure: use ## sections (Requirements, Deliverables, Constraints) where helpful
- Make vague instructions specific and actionable
- Remove redundancy and filler
- If the prompt is already well-structured, return it with minimal changes
- Never add requirements the user didn't ask for
- Keep it concise — don't pad with unnecessary sections

Respond with ONLY the optimized prompt text. No preamble, no explanation.`,
      messages: [{
        role: 'user',
        content: `Task title: ${task.title}\n\nOriginal prompt:\n${task.description || '(no description provided)'}`
      }]
    }, 'nexus', task.id)

    const optimized = response.content.map(b => b.type === 'text' ? b.text : '').join('').trim()
    res.json({ original: task.description || '', optimized })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
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

  // ── Approval Gates ──────────────────────────────
  const approvalThreshold = parseFloat(getSetting('approval_threshold_usd') || '999')
  const approvalKeywords = (getSetting('approval_keywords') || '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean)
  const needsApproval = task.requires_approval === 1 ||
    (approvalThreshold < 999 && task.estimated_cost >= approvalThreshold) ||
    approvalKeywords.some(kw => (task.title + ' ' + task.description).toLowerCase().includes(kw))

  if (needsApproval && task.status !== 'awaiting_approval') {
    db.prepare("UPDATE tasks SET status = 'awaiting_approval', updated_at = datetime('now') WHERE id = ?").run(task.id)
    db.prepare('INSERT INTO task_logs (task_id, agent_id, message, type) VALUES (?, ?, ?, ?)')
      .run(task.id, agent.id, 'Requires approval before running', 'warning')
    sendPushToAll({ title: '⏸️ Approval Required', body: task.title, tag: `approval-${task.id}`, taskId: task.id })
    email.sendApprovalEmail(task, agent).catch(() => {})
    return res.json({ ok: true, message: 'Task requires approval', awaiting_approval: true })
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

      // Token budget check
      const taskBudget = task.token_budget || parseInt(getSetting('per_task_token_budget') || '0')
      if (taskBudget > 0) {
        const currentUsage = db.prepare('SELECT tokens_used FROM tasks WHERE id = ?').get(task.id)
        if (currentUsage && currentUsage.tokens_used >= taskBudget) {
          db.prepare('INSERT INTO task_logs (task_id, agent_id, message, type) VALUES (?, ?, ?, ?)')
            .run(task.id, agent.id, `Token budget reached (${currentUsage.tokens_used}/${taskBudget})`, 'warning')
          break
        }
      }

      // Inject V2 skills (full SKILL.md content) into prompt
      const skillsV2 = db.prepare(
        'SELECT s.name, s.skill_md FROM agent_skills_v2 asv JOIN skills s ON s.id = asv.skill_id WHERE asv.agent_id = ? AND asv.enabled = 1 ORDER BY asv.priority'
      ).all(agent.id)
      const skillsContext = skillsV2.length > 0
        ? '\n\n## Skills\n' + skillsV2.map(s => s.skill_md).join('\n\n---\n\n')
        : ''

      const agentModel = getAgentModel(agent.id)
      const traceStart = Date.now()
      const response = await callClaude({
        model: agentModel,
        max_tokens: 4096,
        system: agent.systemPrompt + skillsContext,
        messages,
      }, agent.id, task.id, abortController.signal)

      const traceDuration = Date.now() - traceStart
      const traceTokensIn = response.usage?.input_tokens || 0
      const traceTokensOut = response.usage?.output_tokens || 0
      const tracePricing = MODEL_COSTS[agentModel] || DEFAULT_COST
      const traceCost = (traceTokensIn * tracePricing.input) + (traceTokensOut * tracePricing.output)

      const stepOutput = response.content.map(b => b.type === 'text' ? b.text : '').join('\n')
      fullOutput += `\n--- Step ${step + 1} ---\n${stepOutput}`
      messages.push({ role: 'assistant', content: stepOutput })

      // Log trace
      db.prepare('INSERT INTO task_traces (task_id, agent_id, step, type, input_summary, output_summary, tokens_in, tokens_out, cost, duration_ms, model) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(task.id, agent.id, step + 1, 'llm_call', messages[messages.length - 2]?.content?.slice(0, 500) || '', stepOutput.slice(0, 500), traceTokensIn, traceTokensOut, traceCost, traceDuration, agentModel)

      // Emit SSE trace event
      traceBus.emitTrace({
        agent_id: agent.id, task_id: task.id, event_type: 'THOUGHT',
        payload: { content: stepOutput.slice(0, 500), step: step + 1, latency_ms: traceDuration, token_count: traceTokensIn + traceTokensOut, cost: traceCost, model: agentModel }
      })

      // Check for consultation requests
      const consultMatch = stepOutput.match(/\[CONSULT:(\w+)\]\s*(.+)/s)
      if (consultMatch && step < MAX_STEPS - 1) {
        const [, targetAgentId, question] = consultMatch
        db.prepare('INSERT INTO task_logs (task_id, agent_id, message, type) VALUES (?, ?, ?, ?)')
          .run(task.id, agent.id, `Consulting ${targetAgentId}: ${question.slice(0, 200)}`, 'info')

        const consultStart = Date.now()
        const consultResponse = await agentConsult(agent, targetAgentId, question, `Task: ${task.title}`)

        if (consultResponse) {
          db.prepare('INSERT INTO task_traces (task_id, agent_id, step, type, input_summary, output_summary, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(task.id, targetAgentId, step + 1, 'consult', question.slice(0, 500), consultResponse.slice(0, 500), Date.now() - consultStart)

          traceBus.emitTrace({
            agent_id: agent.id, task_id: task.id, event_type: 'CONSULT',
            payload: { target: targetAgentId, content: question.slice(0, 300), result: consultResponse.slice(0, 300), latency_ms: Date.now() - consultStart, step: step + 1 }
          })

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

    traceBus.emitTrace({
      agent_id: agent.id, task_id: task.id, event_type: 'DECISION',
      payload: { content: 'Task completed', step: 'final' }
    })

    const summary = fullOutput.length > 300 ? fullOutput.slice(0, 300) + '…' : fullOutput
    db.prepare('INSERT INTO messages (sender_id, sender_name, sender_avatar, sender_color, text) VALUES (?, ?, ?, ?, ?)')
      .run(agent.id, agent.name, agent.avatar, agent.color, `✅ Finished: "${task.title}"\n\n${summary}`)

    sendPushToAll({
      title: `${agent.avatar} ${agent.name} finished`,
      body: task.title,
      tag: `task-done-${task.id}`,
      taskId: task.id
    })
    email.sendTaskCompletedEmail(task, agent).catch(() => {})

    // Self-improvement proposal hook: parse proposals from agent output
    if (task.title.startsWith('[Self-Improvement]')) {
      try {
        const jsonMatch = fullOutput.match(/\[[\s\S]*?\{[\s\S]*?"title"[\s\S]*?"type"[\s\S]*?\}[\s\S]*?\]/)
        if (jsonMatch) {
          const proposals = JSON.parse(jsonMatch[0])
          for (const p of proposals) {
            if (!p.title || !p.type) continue
            createProposal({ ...p, proposed_by: agent.id, source_task_id: task.id })
          }
          console.log(`💡 Created ${proposals.length} proposals from ${agent.name}`)
        }
      } catch (e) { console.error('Proposal parse error:', e.message) }
    }

    // Bot suggestion hook: parse Scout's output into bot_suggestions table
    if (agent.id === 'scout' && task.title.toLowerCase().includes('bot opportunity')) {
      try {
        const suggestions = parseSuggestions(fullOutput)
        const insert = db.prepare('INSERT OR IGNORE INTO bot_suggestions (id, name, type, description, audience, monetization, reasoning) VALUES (?, ?, ?, ?, ?, ?, ?)')
        for (const s of suggestions) {
          insert.run(uuid(), s.name, s.type, s.description, s.audience, s.monetization, s.reasoning)
        }
        if (suggestions.length > 0) console.log(`🤖 Stored ${suggestions.length} bot suggestions from Scout`)
      } catch (e) { console.error('Bot suggestion parse error:', e.message) }
    }

    // Strategy discovery hook: parse Scout's output into strategies table
    if (agent.id === 'scout' && task.title.toLowerCase().includes('strategy discover')) {
      try {
        const jsonMatch = fullOutput.match(/\[[\s\S]*?\{[\s\S]*?"name"[\s\S]*?\}[\s\S]*?\]/)
        if (jsonMatch) {
          const strategies = JSON.parse(jsonMatch[0])
          const insert = db.prepare('INSERT OR IGNORE INTO strategies (id, name, description, type, logic, source, source_url, status, discovered_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          let count = 0
          for (const s of strategies) {
            if (!s.name || !s.logic) continue
            const existing = db.prepare('SELECT id FROM strategies WHERE name = ? AND source_url = ?').get(s.name, s.source_url || '')
            if (existing) continue
            insert.run(uuid(), s.name, s.description || '', s.type || 'technical', JSON.stringify(s.logic), s.source || 'scout', s.source_url || '', 'discovered', 'scout')
            count++
          }
          if (count > 0) console.log(`📈 Stored ${count} trading strategies from Scout`)
        }
      } catch (e) { console.error('Strategy parse error:', e.message) }
    }

    // Pipeline continuation: if task is part of a pipeline, run next step
    if (task.pipeline_id) {
      try {
        const pipeline = db.prepare('SELECT * FROM pipelines WHERE id = ?').get(task.pipeline_id)
        if (pipeline) {
          const steps = JSON.parse(pipeline.steps)
          const nextStep = steps.find(s => s.position === task.pipeline_step + 1)
          if (nextStep) {
            const nextId = uuid()
            const nextPrompt = nextStep.prompt_template.replace('{{previous_output}}', fullOutput.slice(0, 4000))
            db.prepare(`INSERT INTO tasks (id, title, description, priority, agent_id, status, pipeline_id, pipeline_step) VALUES (?, ?, ?, 'high', ?, 'todo', ?, ?)`)
              .run(nextId, `[Pipeline: ${pipeline.name}] Step ${nextStep.position}`, nextPrompt, nextStep.agent_id, pipeline.id, nextStep.position)
            db.prepare('INSERT INTO task_logs (task_id, agent_id, message, type) VALUES (?, ?, ?, ?)')
              .run(task.id, agent.id, `Pipeline continues → Step ${nextStep.position} (${nextStep.agent_id})`, 'info')
            setTimeout(() => processAgentQueue(nextStep.agent_id), 2000)
          } else {
            db.prepare('INSERT INTO messages (sender_id, sender_name, sender_avatar, sender_color, text) VALUES (?, ?, ?, ?, ?)')
              .run('system', '🔗 Pipeline', '🔗', '#8b5cf6', `Pipeline "${pipeline.name}" completed all ${steps.length} steps!`)
          }
        }
      } catch (e) { console.error('Pipeline continuation error:', e.message) }
    }

    // Update memory → optional QA review → optional follow-ups → skill extraction → queue next
    updateAgentMemory(agent, task, fullOutput)
      .then(() => {
        const qaEnabled = getSetting('qa_reviews_enabled') !== 'false'
        return qaEnabled ? reviewCompletedWork(task, agent, fullOutput) : null
      })
      .then(() => {
        const autoTasksEnabled = getSetting('auto_tasks_enabled') !== 'false'
        return autoTasksEnabled ? generateFollowUpTasks(task, agent, fullOutput) : null
      })
      .then(() => {
        // Extract discovered skills from Scout discovery tasks → create proposals
        if (task.agent_id === 'scout' && task.title.startsWith('Discover skills:')) {
          try {
            const jsonMatch = fullOutput.match(/\[[\s\S]*\]/)?.[0]
            if (jsonMatch) {
              const discovered = JSON.parse(jsonMatch)
              if (Array.isArray(discovered)) {
                for (const skill of discovered.slice(0, 10)) {
                  if (!skill.name || !skill.skill_md) continue
                  db.prepare('INSERT INTO proposals (id, type, title, description, code_diff, proposed_by, priority) VALUES (?, ?, ?, ?, ?, ?, ?)')
                    .run(uuid(), 'prompt', `New Skill: ${skill.name}`, skill.description || '', JSON.stringify({ skill_md: skill.skill_md, tags: skill.tags || [], agents: skill.suggested_agents || [] }), 'scout', 'medium')
                }
                console.log(`[skill-discovery] Extracted ${discovered.length} skill proposals from task ${task.id}`)
              }
            }
          } catch (e) { console.error('[skill-discovery] Parse error:', e.message) }
        }
      })
      .then(() => { setTimeout(() => processAgentQueue(agent.id), 5000) })
      .catch(() => {})

  } catch (err) {
    activeRuns.delete(agent.id)
    const errorMsg = err.name === 'AbortError' || err.message === 'AbortError' ? 'Stopped by user' : err.message
    db.prepare(`UPDATE tasks SET status = 'failed', error = ?, completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
      .run(errorMsg, task.id)
    db.prepare('INSERT INTO task_logs (task_id, agent_id, message, type) VALUES (?, ?, ?, ?)')
      .run(task.id, agent.id, `Task failed: ${errorMsg}`, 'error')

    traceBus.emitTrace({
      agent_id: agent.id, task_id: task.id, event_type: 'ERROR',
      payload: { error: errorMsg }
    })

    db.prepare('INSERT INTO messages (sender_id, sender_name, sender_avatar, sender_color, text) VALUES (?, ?, ?, ?, ?)')
      .run(agent.id, agent.name, agent.avatar, agent.color, `❌ Failed: "${task.title}" — ${errorMsg}`)

    sendPushToAll({
      title: `${agent.avatar} ${agent.name} failed`,
      body: `${task.title} — ${errorMsg}`,
      tag: `task-fail-${task.id}`,
      taskId: task.id
    })

    if (errorMsg !== 'Stopped by user') {
      const retries = task.retries || 0
      const MAX_AUTO_RETRIES = 3
      const isTransient = /rate.?limit|timeout|ECONNRESET|ENOTFOUND|503|529|overloaded|credit balance/i.test(errorMsg)
      if (isTransient && retries < MAX_AUTO_RETRIES) {
        db.prepare(`UPDATE tasks SET status = 'todo', retries = ?, error = '', completed_at = NULL, started_at = NULL, updated_at = datetime('now') WHERE id = ?`)
          .run(retries + 1, task.id)
        db.prepare('INSERT INTO task_logs (task_id, agent_id, message, type) VALUES (?, ?, ?, ?)')
          .run(task.id, agent.id, `Auto-retry attempt #${retries + 1}/${MAX_AUTO_RETRIES} (transient: ${errorMsg.slice(0, 100)})`, 'warning')
        db.prepare('INSERT INTO messages (sender_id, sender_name, sender_avatar, sender_color, text) VALUES (?, ?, ?, ?, ?)')
          .run('system', '🔄 Auto-Retry', '🔄', '#f59e0b', `Retrying "${task.title}" (attempt ${retries + 1}/${MAX_AUTO_RETRIES})`)
        setTimeout(() => processAgentQueue(agent.id), 10000)
      } else if (retries < MAX_AUTO_RETRIES) {
        troubleshootAndRetry(task, agent, errorMsg).catch(() => {})
      } else {
        db.prepare('INSERT INTO messages (sender_id, sender_name, sender_avatar, sender_color, text) VALUES (?, ?, ?, ?, ?)')
          .run('system', '🔧 Troubleshooter', '🔧', '#ef4444', `"${task.title}" failed ${MAX_AUTO_RETRIES} times — needs manual review.`)
      }
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

// ── Bot Generator: Output Parser ──────────────────
function parseForgeOutput(output) {
  const files = []
  // Match: ## filename.ext (or ### `filename.ext` or **filename.ext**) followed by a code block
  const regex = /(?:^#{1,3}\s+`?([a-zA-Z0-9_\-/.]+\.[a-zA-Z0-9]+)`?\s*$|^\*\*([a-zA-Z0-9_\-/.]+\.[a-zA-Z0-9]+)\*\*\s*$)\s*```[\w]*\n([\s\S]*?)```/gm
  let match
  while ((match = regex.exec(output)) !== null) {
    const filename = match[1] || match[2]
    if (filename && match[3]) files.push({ filename: filename.trim(), content: match[3] })
  }
  // Fallback: looser matching
  if (files.length === 0) {
    const fallback = /^(.+\.(?:js|jsx|ts|tsx|json|md|html|css|env|txt|yml|yaml|toml|sh))\s*\n```[\w]*\n([\s\S]*?)```/gm
    while ((match = fallback.exec(output)) !== null) {
      const filename = match[1].replace(/^[#*`\s]+/, '').replace(/[*`\s]+$/, '').trim()
      if (filename && match[2]) files.push({ filename, content: match[2] })
    }
  }
  return files
}

function parseSuggestions(output) {
  // Try to find a JSON array in the output
  const jsonMatch = output.match(/\[[\s\S]*?\{[\s\S]*?"name"[\s\S]*?\}[\s\S]*?\]/)
  if (jsonMatch) {
    try {
      const arr = JSON.parse(jsonMatch[0])
      return arr.filter(s => s.name && s.type && s.description).map(s => ({
        name: s.name, type: s.type, description: s.description,
        audience: s.audience || '', monetization: s.monetization || '', reasoning: s.reasoning || ''
      }))
    } catch (e) { /* fall through */ }
  }
  return []
}

// ── Bot Generator: ZIP Download ───────────────────
app.get('/api/tasks/:id/download', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id)
  if (!task) return res.status(404).json({ error: 'Task not found' })
  if (!task.output) return res.status(400).json({ error: 'Task has no output' })

  const files = parseForgeOutput(task.output)
  if (files.length === 0) return res.status(400).json({ error: 'No files found in task output' })

  const projectName = task.title.replace(/^Build\s+\w+:\s*/i, '').replace(/[^a-zA-Z0-9\-_ ]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'bot-package'

  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="${projectName}.zip"`)

  const archive = archiver('zip', { zlib: { level: 9 } })
  archive.on('error', () => res.status(500).end())
  archive.pipe(res)
  for (const file of files) {
    archive.append(file.content, { name: `${projectName}/${file.filename}` })
  }
  archive.finalize()
})

// ── Task Files API ────────────────────────────────
const EXT_LANG = { js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx', json: 'json', css: 'css', html: 'html', md: 'markdown', py: 'python', sh: 'bash', yml: 'yaml', yaml: 'yaml', toml: 'toml', sql: 'sql', env: 'bash', txt: 'text' }

app.get('/api/tasks/:id/files', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id)
  if (!task) return res.status(404).json({ error: 'Task not found' })
  if (!task.output) return res.json({ files: [], projectName: '' })

  const files = parseForgeOutput(task.output).map(f => {
    const ext = f.filename.split('.').pop().toLowerCase()
    return { ...f, language: EXT_LANG[ext] || 'text' }
  })
  const projectName = task.title.replace(/^Build\s+\w+:\s*/i, '').replace(/[^a-zA-Z0-9\-_ ]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'project'
  res.json({ files, projectName })
})

// ── Bot Suggestions API ───────────────────────────
app.get('/api/bot-suggestions', (req, res) => {
  const suggestions = db.prepare('SELECT * FROM bot_suggestions WHERE used = 0 ORDER BY created_at DESC LIMIT 20').all()
  res.json(suggestions)
})

app.post('/api/bot-suggestions/refresh', (req, res) => {
  const taskId = uuid()
  db.prepare(`
    INSERT INTO tasks (id, title, description, priority, agent_id, status)
    VALUES (?, ?, ?, 'high', 'scout', 'todo')
  `).run(taskId, 'Bot Opportunity Scan', `Research 5 trending bot/tool opportunities that could generate income. Consider current market trends, popular APIs, gaps in existing tools, and emerging niches.

Return your findings as a JSON array with this exact format:
[
  {
    "name": "Bot Name",
    "type": "chrome-extension|telegram-bot|discord-bot|web-app|cli-tool|api|landing-page",
    "description": "What the bot does and why it's a good opportunity (2-3 sentences)",
    "audience": "Target audience",
    "monetization": "How to make money from it",
    "reasoning": "Why this is a good opportunity right now"
  }
]

Focus on ideas that are:
- Technically feasible as a solo project
- Have clear monetization paths
- Solve real problems people are willing to pay for
- Not oversaturated in the market`)

  setTimeout(() => processAgentQueue('scout'), 2000)
  res.status(201).json({ taskId, message: 'Scout is researching bot opportunities...' })
})

app.delete('/api/bot-suggestions/:id', (req, res) => {
  db.prepare('DELETE FROM bot_suggestions WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// ══════════════════════════════════════════════════════
// ██ Agent Scorecards                                  ██
// ══════════════════════════════════════════════════════

app.get('/api/scorecards', (req, res) => {
  const scorecards = agents.map(a => buildScorecard(a.id))
  res.json(scorecards)
})

app.get('/api/agents/:id/scorecard', (req, res) => {
  const agent = agents.find(a => a.id === req.params.id)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })
  res.json(buildScorecard(req.params.id))
})

function buildScorecard(agentId) {
  const done = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE agent_id = ? AND status = 'done'").get(agentId)?.c || 0
  const failed = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE agent_id = ? AND status = 'failed'").get(agentId)?.c || 0
  const inProgress = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE agent_id = ? AND status = 'in_progress'").get(agentId)?.c || 0
  const todo = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE agent_id = ? AND status = 'todo'").get(agentId)?.c || 0
  const successRate = (done + failed) > 0 ? Math.round((done / (done + failed)) * 100) : 0

  const avgDuration = db.prepare("SELECT AVG(CAST((julianday(completed_at) - julianday(started_at)) * 86400 AS INTEGER)) as avg_sec FROM tasks WHERE agent_id = ? AND status = 'done' AND started_at IS NOT NULL AND completed_at IS NOT NULL").get(agentId)?.avg_sec || 0
  const avgTokens = db.prepare("SELECT AVG(tokens_used) as avg FROM tasks WHERE agent_id = ? AND status = 'done' AND tokens_used > 0").get(agentId)?.avg || 0
  const avgCost = db.prepare("SELECT AVG(estimated_cost) as avg FROM tasks WHERE agent_id = ? AND status = 'done' AND estimated_cost > 0").get(agentId)?.avg || 0
  const totalSpend = db.prepare("SELECT COALESCE(SUM(cost), 0) as total FROM spend_log WHERE agent_id = ?").get(agentId)?.total || 0

  // QA pass rate from Nexus reviews
  const qaTotal = db.prepare("SELECT COUNT(*) as c FROM task_logs WHERE agent_id = 'nexus' AND task_id IN (SELECT id FROM tasks WHERE agent_id = ?) AND (message LIKE '%PASS%' OR message LIKE '%FAIL%' OR message LIKE '%NEEDS WORK%')").get(agentId)?.c || 0
  const qaPassed = db.prepare("SELECT COUNT(*) as c FROM task_logs WHERE agent_id = 'nexus' AND task_id IN (SELECT id FROM tasks WHERE agent_id = ?) AND message LIKE '%PASS%'").get(agentId)?.c || 0
  const qaPassRate = qaTotal > 0 ? Math.round((qaPassed / qaTotal) * 100) : 100

  // 7-day trend
  const weekTrend = db.prepare("SELECT date(completed_at) as date, COUNT(*) as count FROM tasks WHERE agent_id = ? AND status = 'done' AND completed_at >= date('now', '-7 days') GROUP BY date(completed_at) ORDER BY date ASC").all(agentId)

  // Revenue attribution
  const revenue = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM revenue_entries WHERE agent_id = ?").get(agentId)?.total || 0

  return {
    agent_id: agentId,
    tasks: { done, failed, in_progress: inProgress, todo, total: done + failed + inProgress + todo },
    successRate,
    avgDurationSec: Math.round(avgDuration),
    avgTokens: Math.round(avgTokens),
    avgCost: parseFloat(avgCost.toFixed(4)),
    totalSpend: parseFloat(totalSpend.toFixed(4)),
    qaPassRate,
    weekTrend,
    revenue: parseFloat(revenue.toFixed(2)),
    roi: parseFloat((revenue - totalSpend).toFixed(2))
  }
}

// ══════════════════════════════════════════════════════
// ██ Approval Gates                                    ██
// ══════════════════════════════════════════════════════

app.post('/api/tasks/:id/approve', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id)
  if (!task) return res.status(404).json({ error: 'Task not found' })
  if (task.status !== 'awaiting_approval') return res.status(400).json({ error: 'Task is not awaiting approval' })

  db.prepare("UPDATE tasks SET status = 'todo', requires_approval = 0, updated_at = datetime('now') WHERE id = ?").run(task.id)
  db.prepare('INSERT INTO task_logs (task_id, agent_id, message, type) VALUES (?, ?, ?, ?)')
    .run(task.id, task.agent_id, 'Approved — queued to run', 'success')

  if (task.agent_id) {
    setTimeout(() => processAgentQueue(task.agent_id), 1000)
  }
  res.json({ ok: true })
})

app.post('/api/tasks/:id/reject', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id)
  if (!task) return res.status(404).json({ error: 'Task not found' })

  const { reason } = req.body || {}
  db.prepare("UPDATE tasks SET status = 'backlog', requires_approval = 0, updated_at = datetime('now') WHERE id = ?").run(task.id)
  db.prepare('INSERT INTO task_logs (task_id, agent_id, message, type) VALUES (?, ?, ?, ?)')
    .run(task.id, task.agent_id, `Rejected${reason ? ': ' + reason : ''}`, 'warning')
  res.json({ ok: true })
})

// ══════════════════════════════════════════════════════
// ██ Task Traces                                       ██
// ══════════════════════════════════════════════════════

app.get('/api/tasks/:id/traces', (req, res) => {
  const traces = db.prepare('SELECT * FROM task_traces WHERE task_id = ? ORDER BY step ASC, created_at ASC').all(req.params.id)
  res.json(traces)
})

// ══════════════════════════════════════════════════════
// ██ Pipelines                                         ██
// ══════════════════════════════════════════════════════

app.get('/api/pipelines', (req, res) => {
  const pipelines = db.prepare('SELECT * FROM pipelines ORDER BY created_at DESC').all()
  res.json(pipelines.map(p => ({ ...p, steps: JSON.parse(p.steps) })))
})

app.post('/api/pipelines', (req, res) => {
  const { name, description, steps } = req.body
  if (!name || !steps || !Array.isArray(steps)) return res.status(400).json({ error: 'Name and steps required' })
  const id = uuid()
  db.prepare('INSERT INTO pipelines (id, name, description, steps) VALUES (?, ?, ?, ?)').run(id, name, description || '', JSON.stringify(steps))
  const pipeline = db.prepare('SELECT * FROM pipelines WHERE id = ?').get(id)
  res.status(201).json({ ...pipeline, steps: JSON.parse(pipeline.steps) })
})

app.patch('/api/pipelines/:id', (req, res) => {
  const { name, description, steps } = req.body
  const sets = []
  const vals = []
  if (name) { sets.push('name = ?'); vals.push(name) }
  if (description !== undefined) { sets.push('description = ?'); vals.push(description) }
  if (steps) { sets.push('steps = ?'); vals.push(JSON.stringify(steps)) }
  if (sets.length === 0) return res.status(400).json({ error: 'No valid fields' })
  sets.push("updated_at = datetime('now')")
  vals.push(req.params.id)
  db.prepare(`UPDATE pipelines SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
  const pipeline = db.prepare('SELECT * FROM pipelines WHERE id = ?').get(req.params.id)
  res.json(pipeline ? { ...pipeline, steps: JSON.parse(pipeline.steps) } : null)
})

app.delete('/api/pipelines/:id', (req, res) => {
  db.prepare('DELETE FROM pipelines WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

app.post('/api/pipelines/:id/run', async (req, res) => {
  const pipeline = db.prepare('SELECT * FROM pipelines WHERE id = ?').get(req.params.id)
  if (!pipeline) return res.status(404).json({ error: 'Pipeline not found' })

  const steps = JSON.parse(pipeline.steps)
  if (steps.length === 0) return res.status(400).json({ error: 'Pipeline has no steps' })

  // Create first step task
  const firstStep = steps.find(s => s.position === 1) || steps[0]
  const taskId = uuid()
  db.prepare(`INSERT INTO tasks (id, title, description, priority, agent_id, status, pipeline_id, pipeline_step) VALUES (?, ?, ?, 'high', ?, 'todo', ?, ?)`)
    .run(taskId, `[Pipeline: ${pipeline.name}] Step 1`, firstStep.prompt_template, firstStep.agent_id, pipeline.id, 1)

  db.prepare('INSERT INTO messages (sender_id, sender_name, sender_avatar, sender_color, text) VALUES (?, ?, ?, ?, ?)')
    .run('system', '🔗 Pipeline', '🔗', '#8b5cf6', `Started pipeline "${pipeline.name}" (${steps.length} steps)`)

  setTimeout(() => processAgentQueue(firstStep.agent_id), 2000)
  res.status(201).json({ taskId, pipeline: pipeline.name, totalSteps: steps.length })
})

// ══════════════════════════════════════════════════════
// ██ Revenue Attribution                               ██
// ══════════════════════════════════════════════════════

app.get('/api/revenue', (req, res) => {
  const entries = db.prepare('SELECT * FROM revenue_entries ORDER BY date DESC, created_at DESC LIMIT 100').all()
  res.json(entries)
})

app.post('/api/revenue', (req, res) => {
  const { title, amount, source, agent_id, task_id, notes, date } = req.body
  if (!title || amount === undefined) return res.status(400).json({ error: 'Title and amount required' })
  const id = uuid()
  db.prepare('INSERT INTO revenue_entries (id, title, amount, source, agent_id, task_id, notes, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, title, amount, source || '', agent_id || null, task_id || null, notes || '', date || new Date().toISOString().slice(0, 10))
  const entry = db.prepare('SELECT * FROM revenue_entries WHERE id = ?').get(id)
  res.status(201).json(entry)
})

app.delete('/api/revenue/:id', (req, res) => {
  db.prepare('DELETE FROM revenue_entries WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

app.get('/api/revenue/summary', (req, res) => {
  const totalRevenue = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM revenue_entries').get().total
  const totalSpend = db.prepare('SELECT COALESCE(SUM(cost), 0) as total FROM spend_log').get().total

  const byAgent = db.prepare(`
    SELECT r.agent_id, COALESCE(SUM(r.amount), 0) as revenue,
    (SELECT COALESCE(SUM(s.cost), 0) FROM spend_log s WHERE s.agent_id = r.agent_id) as spend
    FROM revenue_entries r WHERE r.agent_id IS NOT NULL GROUP BY r.agent_id
  `).all()

  const bySource = db.prepare('SELECT source, SUM(amount) as total, COUNT(*) as count FROM revenue_entries GROUP BY source ORDER BY total DESC').all()

  const weekTrend = db.prepare("SELECT date, SUM(amount) as daily_revenue FROM revenue_entries WHERE date >= date('now', '-30 days') GROUP BY date ORDER BY date ASC").all()

  res.json({
    totalRevenue: parseFloat(totalRevenue.toFixed(2)),
    totalSpend: parseFloat(totalSpend.toFixed(2)),
    netROI: parseFloat((totalRevenue - totalSpend).toFixed(2)),
    byAgent,
    bySource,
    weekTrend
  })
})

// ══════════════════════════════════════════════════════
// ██ Event Triggers                                    ██
// ══════════════════════════════════════════════════════

app.get('/api/triggers', (req, res) => {
  const triggers = db.prepare('SELECT * FROM event_triggers ORDER BY created_at DESC').all()
  res.json(triggers.map(t => ({ ...t, config: JSON.parse(t.config), action: JSON.parse(t.action) })))
})

app.post('/api/triggers', (req, res) => {
  const { name, type, config, action } = req.body
  if (!name || !type || !action) return res.status(400).json({ error: 'Name, type, and action required' })
  const id = uuid()
  const triggerConfig = { ...config, secret: config?.secret || uuid() }
  db.prepare('INSERT INTO event_triggers (id, name, type, config, action) VALUES (?, ?, ?, ?, ?)')
    .run(id, name, type, JSON.stringify(triggerConfig), JSON.stringify(action))
  const trigger = db.prepare('SELECT * FROM event_triggers WHERE id = ?').get(id)
  res.status(201).json({ ...trigger, config: JSON.parse(trigger.config), action: JSON.parse(trigger.action) })
})

app.patch('/api/triggers/:id', (req, res) => {
  const { name, enabled, config, action } = req.body
  const sets = []
  const vals = []
  if (name) { sets.push('name = ?'); vals.push(name) }
  if (enabled !== undefined) { sets.push('enabled = ?'); vals.push(enabled ? 1 : 0) }
  if (config) { sets.push('config = ?'); vals.push(JSON.stringify(config)) }
  if (action) { sets.push('action = ?'); vals.push(JSON.stringify(action)) }
  if (sets.length === 0) return res.status(400).json({ error: 'No valid fields' })
  vals.push(req.params.id)
  db.prepare(`UPDATE event_triggers SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
  const trigger = db.prepare('SELECT * FROM event_triggers WHERE id = ?').get(req.params.id)
  res.json(trigger ? { ...trigger, config: JSON.parse(trigger.config), action: JSON.parse(trigger.action) } : null)
})

app.delete('/api/triggers/:id', (req, res) => {
  db.prepare('DELETE FROM event_triggers WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// Webhook receiver (public — no auth, validates secret)
app.post('/api/webhooks/:triggerId', (req, res) => {
  const trigger = db.prepare('SELECT * FROM event_triggers WHERE id = ? AND enabled = 1').get(req.params.triggerId)
  if (!trigger) return res.status(404).json({ error: 'Trigger not found or disabled' })

  const config = JSON.parse(trigger.config)
  const secret = req.headers['x-webhook-secret']
  if (config.secret && secret !== config.secret) return res.status(403).json({ error: 'Invalid secret' })

  const action = JSON.parse(trigger.action)
  const payload = JSON.stringify(req.body).slice(0, 2000)

  db.prepare("UPDATE event_triggers SET last_fired = datetime('now') WHERE id = ?").run(trigger.id)

  if (action.type === 'run_task') {
    const taskId = uuid()
    const desc = (action.prompt_template || 'Triggered by webhook').replace('{{payload}}', payload)
    db.prepare(`INSERT INTO tasks (id, title, description, priority, agent_id, status) VALUES (?, ?, ?, ?, ?, 'todo')`)
      .run(taskId, `[Trigger: ${trigger.name}]`, desc, action.priority || 'medium', action.agent_id)
    if (action.agent_id) setTimeout(() => processAgentQueue(action.agent_id), 2000)
    res.json({ ok: true, taskId })
  } else if (action.type === 'run_pipeline' && action.pipeline_id) {
    // Trigger pipeline run
    const PORT = process.env.API_PORT || process.env.PORT || 3002
    fetch(`http://localhost:${PORT}/api/pipelines/${action.pipeline_id}/run`, { method: 'POST' }).catch(() => {})
    res.json({ ok: true, pipeline_id: action.pipeline_id })
  } else {
    res.status(400).json({ error: 'Unknown action type' })
  }
})

// ══════════════════════════════════════════════════════
// ██ A/B Prompt Testing                                ██
// ══════════════════════════════════════════════════════

app.post('/api/tasks/:id/ab-test', async (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id)
  if (!task) return res.status(404).json({ error: 'Task not found' })
  if (!task.agent_id) return res.status(400).json({ error: 'No agent assigned' })

  const agent = agents.find(a => a.id === task.agent_id)
  if (!agent) return res.status(400).json({ error: 'Agent not found' })

  const { promptA, promptB } = req.body
  if (!promptA || !promptB) return res.status(400).json({ error: 'Both promptA and promptB required' })

  try {
    const abModel = getAgentModel(agent.id)
    const [responseA, responseB] = await Promise.all([
      callClaude({
        model: abModel,
        max_tokens: 2048,
        system: agent.systemPrompt,
        messages: [{ role: 'user', content: `Task: ${task.title}\n\n${promptA}` }],
      }, agent.id, task.id),
      callClaude({
        model: abModel,
        max_tokens: 2048,
        system: agent.systemPrompt,
        messages: [{ role: 'user', content: `Task: ${task.title}\n\n${promptB}` }],
      }, agent.id, task.id)
    ])

    const outputA = responseA.content.map(b => b.type === 'text' ? b.text : '').join('')
    const outputB = responseB.content.map(b => b.type === 'text' ? b.text : '').join('')

    const result = {
      promptA: { text: promptA, output: outputA, tokens: (responseA.usage?.input_tokens || 0) + (responseA.usage?.output_tokens || 0) },
      promptB: { text: promptB, output: outputB, tokens: (responseB.usage?.input_tokens || 0) + (responseB.usage?.output_tokens || 0) }
    }

    db.prepare('INSERT INTO task_logs (task_id, agent_id, message, type) VALUES (?, ?, ?, ?)')
      .run(task.id, 'nexus', `A/B test completed — A: ${result.promptA.tokens} tokens, B: ${result.promptB.tokens} tokens`, 'info')

    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════
// ██ Agent Skill Registry                              ██
// ══════════════════════════════════════════════════════

app.get('/api/agents/:id/skills', (req, res) => {
  const skills = db.prepare('SELECT * FROM agent_skills WHERE agent_id = ? ORDER BY created_at ASC').all(req.params.id)
  res.json(skills)
})

app.post('/api/agents/:id/skills', (req, res) => {
  const { name, description, type, config } = req.body
  if (!name) return res.status(400).json({ error: 'Skill name required' })
  const id = uuid()
  db.prepare('INSERT INTO agent_skills (id, agent_id, name, description, type, config) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, req.params.id, name, description || '', type || 'custom', JSON.stringify(config || {}))
  const skill = db.prepare('SELECT * FROM agent_skills WHERE id = ?').get(id)
  res.status(201).json(skill)
})

app.patch('/api/skills/:id', (req, res) => {
  const { name, description, enabled, config } = req.body
  const sets = []
  const vals = []
  if (name) { sets.push('name = ?'); vals.push(name) }
  if (description !== undefined) { sets.push('description = ?'); vals.push(description) }
  if (enabled !== undefined) { sets.push('enabled = ?'); vals.push(enabled ? 1 : 0) }
  if (config) { sets.push('config = ?'); vals.push(JSON.stringify(config)) }
  if (sets.length === 0) return res.status(400).json({ error: 'No valid fields' })
  vals.push(req.params.id)
  db.prepare(`UPDATE agent_skills SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
  const skill = db.prepare('SELECT * FROM agent_skills WHERE id = ?').get(req.params.id)
  res.json(skill)
})

app.delete('/api/skills/:id', (req, res) => {
  db.prepare('DELETE FROM agent_skills WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// ══════════════════════════════════════════════════════
// ██ TRADING — Market Data                             ██
// ══════════════════════════════════════════════════════

app.get('/api/market/quote/:symbol', async (req, res) => {
  try {
    const data = await marketData.getQuote(req.params.symbol.toUpperCase())
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/market/history/:symbol', async (req, res) => {
  try {
    const { period = '1y', interval = '1d' } = req.query
    const data = await marketData.getHistory(req.params.symbol.toUpperCase(), period, interval)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/market/indicators/:symbol', async (req, res) => {
  try {
    const data = await marketData.getIndicators(req.params.symbol.toUpperCase())
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/market/search', async (req, res) => {
  try {
    const results = await marketData.searchSymbols(req.query.q || '')
    res.json(results)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════
// ██ ANALYSIS — Multi-Lens Oracle + Ensemble           ██
// ══════════════════════════════════════════════════════

// Multi-lens analysis (5 analyst personas)
app.get('/api/analysis/:symbol', async (req, res) => {
  try {
    const result = await analysis.analyzeSymbol(req.params.symbol.toUpperCase(), callClaude)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Deterministic trade constraints
app.get('/api/analysis/:symbol/constraints', async (req, res) => {
  try {
    const result = await analysis.computeTradeConstraints(req.params.symbol.toUpperCase(), req.query.side || 'buy')
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// LLM trade decision (analysis + constraints → action)
app.post('/api/analysis/:symbol/decide', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase()
    const [analysisResult, constraints] = await Promise.all([
      analysis.analyzeSymbol(symbol, callClaude),
      analysis.computeTradeConstraints(symbol)
    ])
    const decision = await analysis.makeTradeDecision(symbol, analysisResult, constraints, callClaude)
    res.json({ analysis: analysisResult, constraints, decision })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Strategy ensemble evaluation
app.get('/api/analysis/:symbol/ensemble', async (req, res) => {
  try {
    const result = await analysis.evaluateEnsemble(req.params.symbol.toUpperCase())
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// List available analyst personas
app.get('/api/analysis/personas', async (req, res) => {
  res.json(analysis.PERSONAS.map(p => ({ id: p.id, name: p.name, icon: p.icon, description: p.description })))
})

// ══════════════════════════════════════════════════════
// ██ PROPOSALS                                         ██
// ══════════════════════════════════════════════════════

function createProposal(data) {
  const id = uuid()
  db.prepare(`INSERT INTO proposals (id, type, title, description, code_diff, proposed_by, priority, effort, source_task_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, data.type || 'feature', data.title, data.description || '', data.code_diff || '',
    data.proposed_by || 'system', data.priority || 'medium', data.effort || 'medium', data.source_task_id || null
  )
  const proposal = db.prepare('SELECT * FROM proposals WHERE id = ?').get(id)
  email.sendProposalEmail(proposal).catch(() => {})
  return proposal
}

app.get('/api/proposals', (req, res) => {
  const status = req.query.status
  const rows = status
    ? db.prepare('SELECT * FROM proposals WHERE status = ? ORDER BY created_at DESC').all(status)
    : db.prepare('SELECT * FROM proposals ORDER BY created_at DESC').all()
  res.json(rows)
})

app.patch('/api/proposals/:id', (req, res) => {
  const { status, user_notes } = req.body
  const sets = []
  const vals = []
  if (status) { sets.push('status = ?'); vals.push(status) }
  if (user_notes !== undefined) { sets.push('user_notes = ?'); vals.push(user_notes) }
  sets.push("updated_at = datetime('now')")
  vals.push(req.params.id)
  db.prepare(`UPDATE proposals SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
  const proposal = db.prepare('SELECT * FROM proposals WHERE id = ?').get(req.params.id)

  // When a feature/design proposal is approved → auto-create a Forge task
  if (status === 'approved' && proposal && ['feature', 'design', 'code'].includes(proposal.type)) {
    const taskId = uuid()
    const taskTitle = `[Proposal] ${proposal.title}`
    const taskDesc = `Implement approved proposal:\n\n${proposal.description}\n\n${proposal.code_diff ? 'Code diff:\n' + proposal.code_diff : ''}`
    db.prepare(`INSERT INTO tasks (id, title, description, status, priority, agent_id) VALUES (?, ?, ?, 'todo', ?, 'forge')`).run(
      taskId, taskTitle, taskDesc, proposal.priority || 'medium'
    )
    db.prepare("UPDATE proposals SET status = 'implemented' WHERE id = ?").run(proposal.id)
    console.log(`🔨 Created Forge task for approved proposal: ${proposal.title}`)
  }

  // When a skill proposal is approved → auto-create and assign the skill
  if (status === 'approved' && proposal && proposal.type === 'prompt' && proposal.title.startsWith('New Skill:')) {
    try {
      const skillData = JSON.parse(proposal.code_diff)
      const skillId = uuid()
      const skillName = proposal.title.replace('New Skill: ', '')
      const slug = slugify(skillName)
      db.prepare('INSERT OR IGNORE INTO skills (id, slug, name, description, skill_md, tags, source) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        skillId, slug, skillName, proposal.description || '', skillData.skill_md, JSON.stringify(skillData.tags || []), 'custom'
      )
      for (const agentId of (skillData.agents || [])) {
        if (agents.find(a => a.id === agentId)) {
          db.prepare('INSERT OR IGNORE INTO agent_skills_v2 (agent_id, skill_id) VALUES (?, ?)').run(agentId, skillId)
        }
      }
      db.prepare("UPDATE proposals SET status = 'implemented' WHERE id = ?").run(proposal.id)
      console.log(`🧩 Skill "${skillName}" created and assigned from approved proposal`)
    } catch (e) { console.error('Skill auto-install error:', e.message) }
  }

  res.json(proposal)
})

app.delete('/api/proposals/:id', (req, res) => {
  db.prepare('DELETE FROM proposals WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

app.post('/api/proposals', (req, res) => {
  try {
    const proposal = createProposal(req.body)
    res.json(proposal)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════
// ██ TRADING — Broker (Alpaca)                         ██
// ══════════════════════════════════════════════════════

app.get('/api/trading/account', async (req, res) => {
  try {
    const account = await broker.getAccount()
    res.json(account)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/trading/positions', async (req, res) => {
  try {
    const positions = await broker.getPositions()
    res.json(positions)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/trading/orders', async (req, res) => {
  try {
    const result = await broker.placeOrder(req.body)
    if (!result.ok) return res.status(400).json(result)
    res.status(201).json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/trading/orders', async (req, res) => {
  try {
    const orders = await broker.getOrders(req.query.status)
    res.json(orders)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/trading/orders/:id/cancel', async (req, res) => {
  try {
    const result = await broker.cancelOrder(req.params.id)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/trading/close/:symbol', async (req, res) => {
  try {
    const result = await broker.closePosition(req.params.symbol.toUpperCase())
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/trading/close-all', async (req, res) => {
  try {
    const result = await broker.closeAllPositions()
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/trading/market-status', async (req, res) => {
  try {
    const status = await broker.isMarketOpen()
    res.json(status)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/trading/trades', (req, res) => {
  const trades = db.prepare('SELECT * FROM trades ORDER BY created_at DESC LIMIT 100').all()
  res.json(trades)
})

app.get('/api/trading/config', (req, res) => {
  const keys = ['trading_enabled', 'trading_mode', 'max_position_size_usd', 'max_daily_trades', 'max_portfolio_percent', 'default_stop_loss_percent', 'strategy_auto_deploy', 'min_backtest_sharpe', 'min_backtest_win_rate']
  const config = {}
  for (const key of keys) config[key] = getSetting(key)
  res.json(config)
})

app.patch('/api/trading/config', (req, res) => {
  const allowed = ['trading_enabled', 'trading_mode', 'max_position_size_usd', 'max_daily_trades', 'max_portfolio_percent', 'default_stop_loss_percent', 'strategy_auto_deploy', 'min_backtest_sharpe', 'min_backtest_win_rate']
  for (const [key, value] of Object.entries(req.body)) {
    if (allowed.includes(key)) setSetting(key, String(value))
  }
  res.json({ ok: true })
})

app.get('/api/trading/watchlist', (req, res) => {
  const items = db.prepare('SELECT * FROM watchlist ORDER BY added_at DESC').all()
  res.json(items)
})

app.post('/api/trading/watchlist', (req, res) => {
  const { symbol, notes } = req.body
  if (!symbol) return res.status(400).json({ error: 'Symbol required' })
  const id = uuid()
  try {
    db.prepare('INSERT INTO watchlist (id, symbol, notes) VALUES (?, ?, ?)').run(id, symbol.toUpperCase(), notes || '')
    const item = db.prepare('SELECT * FROM watchlist WHERE id = ?').get(id)
    res.status(201).json(item)
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Symbol already in watchlist' })
    throw e
  }
})

app.delete('/api/trading/watchlist/:id', (req, res) => {
  db.prepare('DELETE FROM watchlist WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

app.get('/api/trading/portfolio-history', (req, res) => {
  const snapshots = db.prepare('SELECT * FROM portfolio_snapshots ORDER BY created_at DESC LIMIT 500').all()
  res.json(snapshots)
})

// ══════════════════════════════════════════════════════
// ██ TRADING — Strategies                              ██
// ══════════════════════════════════════════════════════

app.get('/api/strategies', (req, res) => {
  const { status } = req.query
  const strategies = status
    ? db.prepare('SELECT * FROM strategies WHERE status = ? ORDER BY created_at DESC').all(status)
    : db.prepare('SELECT * FROM strategies ORDER BY created_at DESC').all()
  res.json(strategies.map(s => ({ ...s, logic: JSON.parse(s.logic) })))
})

app.post('/api/strategies', (req, res) => {
  const { name, description, type, logic, source, source_url } = req.body
  if (!name || !logic) return res.status(400).json({ error: 'Name and logic required' })
  const id = uuid()
  db.prepare('INSERT INTO strategies (id, name, description, type, logic, source, source_url, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, name, description || '', type || 'technical', JSON.stringify(logic), source || 'manual', source_url || '', 'discovered')
  const strategy = db.prepare('SELECT * FROM strategies WHERE id = ?').get(id)
  res.status(201).json({ ...strategy, logic: JSON.parse(strategy.logic) })
})

app.patch('/api/strategies/:id', (req, res) => {
  const { name, description, type, logic, status } = req.body
  const sets = []
  const vals = []
  if (name) { sets.push('name = ?'); vals.push(name) }
  if (description !== undefined) { sets.push('description = ?'); vals.push(description) }
  if (type) { sets.push('type = ?'); vals.push(type) }
  if (logic) { sets.push('logic = ?'); vals.push(JSON.stringify(logic)) }
  if (status) { sets.push('status = ?'); vals.push(status) }
  if (sets.length === 0) return res.status(400).json({ error: 'No valid fields' })
  sets.push("updated_at = datetime('now')")
  vals.push(req.params.id)
  db.prepare(`UPDATE strategies SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
  const strategy = db.prepare('SELECT * FROM strategies WHERE id = ?').get(req.params.id)
  res.json(strategy ? { ...strategy, logic: JSON.parse(strategy.logic) } : null)
})

app.delete('/api/strategies/:id', (req, res) => {
  db.prepare('DELETE FROM strategies WHERE id = ?').run(req.params.id)
  db.prepare('DELETE FROM strategy_backtests WHERE strategy_id = ?').run(req.params.id)
  db.prepare('DELETE FROM bot_deployments WHERE strategy_id = ?').run(req.params.id)
  res.json({ ok: true })
})

app.post('/api/strategies/:id/backtest', async (req, res) => {
  try {
    const { symbol = 'SPY', period = '1y', initialCapital = 10000 } = req.body || {}
    const result = await backtest.runBacktest(req.params.id, symbol, period, initialCapital)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/strategies/:id/backtests', (req, res) => {
  const backtests = db.prepare('SELECT * FROM strategy_backtests WHERE strategy_id = ? ORDER BY created_at DESC').all(req.params.id)
  res.json(backtests.map(b => ({ ...b, equity_curve: JSON.parse(b.equity_curve || '[]'), trade_log: JSON.parse(b.trade_log || '[]') })))
})

app.get('/api/backtests/:id', (req, res) => {
  const bt = db.prepare('SELECT * FROM strategy_backtests WHERE id = ?').get(req.params.id)
  if (!bt) return res.status(404).json({ error: 'Backtest not found' })
  res.json({ ...bt, equity_curve: JSON.parse(bt.equity_curve || '[]'), trade_log: JSON.parse(bt.trade_log || '[]') })
})

app.post('/api/strategies/:id/deploy', (req, res) => {
  const strategy = db.prepare('SELECT * FROM strategies WHERE id = ?').get(req.params.id)
  if (!strategy) return res.status(404).json({ error: 'Strategy not found' })

  const { symbols = ['SPY'] } = req.body || {}
  const id = uuid()
  db.prepare('INSERT INTO bot_deployments (id, strategy_id, symbols, status) VALUES (?, ?, ?, ?)')
    .run(id, strategy.id, JSON.stringify(symbols), 'active')
  db.prepare("UPDATE strategies SET status = 'deployed', updated_at = datetime('now') WHERE id = ?").run(strategy.id)
  res.status(201).json({ id, strategy_id: strategy.id, symbols, status: 'active' })
})

app.get('/api/deployments', (req, res) => {
  const deployments = db.prepare('SELECT d.*, s.name as strategy_name, s.type as strategy_type FROM bot_deployments d LEFT JOIN strategies s ON d.strategy_id = s.id ORDER BY d.started_at DESC').all()
  res.json(deployments.map(d => ({ ...d, symbols: JSON.parse(d.symbols) })))
})

app.post('/api/deployments/:id/pause', (req, res) => {
  db.prepare("UPDATE bot_deployments SET status = 'paused' WHERE id = ?").run(req.params.id)
  res.json({ ok: true })
})

app.post('/api/deployments/:id/stop', (req, res) => {
  const dep = db.prepare('SELECT * FROM bot_deployments WHERE id = ?').get(req.params.id)
  db.prepare("UPDATE bot_deployments SET status = 'stopped', stopped_at = datetime('now') WHERE id = ?").run(req.params.id)
  if (dep) db.prepare("UPDATE strategies SET status = 'approved', updated_at = datetime('now') WHERE id = ?").run(dep.strategy_id)
  res.json({ ok: true })
})

app.get('/api/strategies/:id/performance', (req, res) => {
  const perf = db.prepare('SELECT * FROM strategy_performance WHERE strategy_id = ? ORDER BY date DESC LIMIT 30').all(req.params.id)
  res.json(perf)
})

app.get('/api/performance/leaderboard', (req, res) => {
  const leaderboard = db.prepare(`
    SELECT s.id, s.name, s.type, s.status,
      COALESCE(SUM(p.pnl), 0) as total_pnl,
      COALESCE(SUM(p.trades), 0) as total_trades,
      COALESCE(SUM(p.win_count), 0) as total_wins
    FROM strategies s
    LEFT JOIN strategy_performance p ON s.id = p.strategy_id
    WHERE s.status IN ('deployed', 'approved')
    GROUP BY s.id
    ORDER BY total_pnl DESC
  `).all()
  res.json(leaderboard)
})

// ══════════════════════════════════════════════════════
// ██ TRADING — Heartbeats                              ██
// ══════════════════════════════════════════════════════

// Strategy executor — every 5 minutes (market hours only)
registerHeartbeat('strategy-executor', 5 * 60 * 1000, async () => {
  try {
    const enabled = getSetting('trading_enabled')
    if (enabled === 'false') return

    const marketStatus = await broker.isMarketOpen()
    if (!marketStatus.isOpen) return

    const deployments = db.prepare("SELECT * FROM bot_deployments WHERE status = 'active'").all()
    for (const dep of deployments) {
      try {
        const signals = await backtest.evaluateDeploymentSignals(dep)
        for (const sig of signals) {
          if (sig.signal === 'buy') {
            const result = await broker.placeOrder({ symbol: sig.symbol, qty: 1, side: 'buy', strategyId: dep.strategy_id })
            if (result.ok) {
              db.prepare('UPDATE bot_deployments SET trades_count = trades_count + 1, last_signal = ?, last_signal_at = datetime(\'now\') WHERE id = ?')
                .run(`BUY ${sig.symbol}`, dep.id)
              console.log(`📈 Strategy executor: BUY ${sig.symbol} (deployment ${dep.id})`)
            }
          } else if (sig.signal === 'sell') {
            const result = await broker.closePosition(sig.symbol)
            if (result.ok) {
              db.prepare('UPDATE bot_deployments SET last_signal = ?, last_signal_at = datetime(\'now\') WHERE id = ?')
                .run(`SELL ${sig.symbol}`, dep.id)
              console.log(`📉 Strategy executor: SELL ${sig.symbol} (deployment ${dep.id})`)
            }
          }
        }
      } catch (e) {
        console.error(`Strategy executor failed for deployment ${dep.id}:`, e.message)
      }
    }
  } catch (e) {
    console.error('Strategy executor heartbeat failed:', e.message)
  }
})

// Order sync — every 5 minutes
registerHeartbeat('order-sync', 5 * 60 * 1000, async () => {
  try {
    const result = await broker.syncOrderFills()
    if (result.synced > 0) console.log(`🔄 Synced ${result.synced} order fills`)
  } catch (e) {
    console.error('Order sync failed:', e.message)
  }
})

// Portfolio snapshot — every hour (market hours only)
registerHeartbeat('portfolio-snapshot', 60 * 60 * 1000, async () => {
  try {
    const marketStatus = await broker.isMarketOpen()
    if (!marketStatus.isOpen) return
    await broker.takePortfolioSnapshot()
    console.log('📸 Portfolio snapshot taken')
  } catch (e) {
    console.error('Portfolio snapshot failed:', e.message)
  }
})

// Market cache cleanup — every 30 minutes
registerHeartbeat('market-cache-cleanup', 30 * 60 * 1000, () => {
  const cleaned = marketData.cleanExpiredCache()
  if (cleaned > 0) console.log(`🧹 Cleaned ${cleaned} expired cache entries`)
})

// Strategy discovery — every 24 hours
registerHeartbeat('strategy-discovery', 24 * 60 * 60 * 1000, async () => {
  try {
    const scout = agents.find(a => a.id === 'scout')
    if (!scout) return
    const taskId = uuid()
    db.prepare(`INSERT INTO tasks (id, title, description, priority, agent_id, status) VALUES (?, ?, ?, 'high', 'scout', 'todo')`)
      .run(taskId, 'Trading Strategy Discovery', `Search GitHub, Reddit r/algotrading, and X/Twitter for profitable algorithmic trading strategies. Look for:

1. **GitHub repos** with specific entry/exit rules (not just frameworks)
2. **Reddit r/algotrading** discussions about strategies with verified backtests
3. **X/Twitter** posts about algo trading bots, backtested results, and new techniques

Search terms: "algo trading bot", "RSI strategy backtest", "MACD crossover strategy", "mean reversion bot", "momentum strategy results", "trading bot github"

For each strategy found, extract:
- Clear entry and exit conditions using these indicators: rsi14, macd, sma20, sma50, sma200, ema12, ema26, bollinger_upper, bollinger_lower, price, volume
- Use operators: >, <, >=, <=

Return ONLY a JSON array:
[
  {
    "name": "Strategy Name",
    "type": "technical|momentum|mean_reversion|custom",
    "description": "What it does and why it works",
    "source": "github|reddit|x",
    "source_url": "URL where you found it",
    "logic": {
      "entry_conditions": [{"indicator": "rsi14", "operator": "<", "value": 30}],
      "exit_conditions": [{"indicator": "rsi14", "operator": ">", "value": 70}],
      "indicators": ["rsi14"],
      "stop_loss_percent": 5
    }
  }
]

Find 3-5 promising strategies with specific, testable rules.`)
    setTimeout(() => processAgentQueue('scout'), 3000)
    console.log('💓 Strategy discovery queued for Scout')
  } catch (e) {
    console.error('Strategy discovery heartbeat failed:', e.message)
  }
})

// Auto-backtest newly discovered strategies — every 6 hours
registerHeartbeat('auto-backtest', 6 * 60 * 60 * 1000, async () => {
  try {
    const discovered = db.prepare("SELECT * FROM strategies WHERE status = 'discovered' LIMIT 5").all()
    if (discovered.length === 0) return

    const minSharpe = parseFloat(getSetting('min_backtest_sharpe') || '1.0')
    const minWinRate = parseFloat(getSetting('min_backtest_win_rate') || '55')

    for (const strategy of discovered) {
      try {
        db.prepare("UPDATE strategies SET status = 'backtesting', updated_at = datetime('now') WHERE id = ?").run(strategy.id)
        const result = await backtest.runBacktest(strategy.id, 'SPY', '1y', 10000)

        if (result.sharpe_ratio >= minSharpe && result.win_rate >= minWinRate) {
          db.prepare("UPDATE strategies SET status = 'approved', updated_at = datetime('now') WHERE id = ?").run(strategy.id)
          console.log(`✅ Strategy "${strategy.name}" APPROVED — Sharpe: ${result.sharpe_ratio}, Win: ${result.win_rate}%`)

          // Auto-deploy if enabled
          const autoDeploy = getSetting('strategy_auto_deploy')
          if (autoDeploy === 'true') {
            const depId = uuid()
            db.prepare('INSERT INTO bot_deployments (id, strategy_id, symbols, status) VALUES (?, ?, ?, ?)').run(depId, strategy.id, '["SPY"]', 'active')
            db.prepare("UPDATE strategies SET status = 'deployed', updated_at = datetime('now') WHERE id = ?").run(strategy.id)
            console.log(`🚀 Auto-deployed strategy "${strategy.name}"`)
          }
        } else {
          db.prepare("UPDATE strategies SET status = 'retired', updated_at = datetime('now') WHERE id = ?").run(strategy.id)
          console.log(`❌ Strategy "${strategy.name}" RETIRED — Sharpe: ${result.sharpe_ratio}, Win: ${result.win_rate}%`)
        }
      } catch (e) {
        db.prepare("UPDATE strategies SET status = 'discovered', updated_at = datetime('now') WHERE id = ?").run(strategy.id)
        console.error(`Backtest failed for "${strategy.name}":`, e.message)
      }
    }
  } catch (e) {
    console.error('Auto-backtest heartbeat failed:', e.message)
  }
})

// ══════════════════════════════════════════════════════
// ██ SELF-IMPROVEMENT HEARTBEATS                       ██
// ══════════════════════════════════════════════════════

function canAffordSelfImprovement() {
  if (getSetting('self_improvement_enabled') !== 'true') return false
  const dailyLimit = parseFloat(getSetting('daily_limit_usd') || '5')
  const budgetPercent = parseFloat(getSetting('self_improvement_budget_percent') || '20') / 100
  const todaySpend = getTodaySpend()
  return todaySpend < dailyLimit * (1 - budgetPercent) // only if under 80% of daily limit
}

// UX Design Review — Nexus evaluates Hive UI weekly
registerHeartbeat('ux-design-review', 7 * 24 * 60 * 60 * 1000, async () => {
  if (!canAffordSelfImprovement()) return console.log('💡 Skipping UX review — budget guard')
  try {
    const taskId = uuid()
    db.prepare(`INSERT INTO tasks (id, title, description, priority, agent_id, status) VALUES (?, ?, ?, 'low', 'nexus', 'todo')`)
      .run(taskId, '[Self-Improvement] UX Design Review',
        `Review the Hive dashboard UI/UX. Consider:
- Layout, visual hierarchy, information density
- Color usage, spacing, typography
- Mobile responsiveness
- User workflow efficiency
- Missing UI elements or confusing interactions

Output your findings as a JSON array of proposals:
[{"type":"design","title":"...","description":"...","priority":"medium","effort":"medium"}]

Be specific and actionable. Focus on the highest-impact improvements.`)
    console.log('🎨 Created UX design review task')
    setTimeout(() => processAgentQueue('nexus'), 5000)
  } catch (e) { console.error('UX review heartbeat failed:', e.message) }
})

// Feature Discovery — Scout researches competing dashboards weekly
registerHeartbeat('feature-discovery', 7 * 24 * 60 * 60 * 1000, async () => {
  if (!canAffordSelfImprovement()) return console.log('💡 Skipping feature discovery — budget guard')
  try {
    const existingProposals = db.prepare("SELECT title FROM proposals WHERE status IN ('pending','approved','implemented') ORDER BY created_at DESC LIMIT 20").all()
    const existingList = existingProposals.map(p => p.title).join(', ') || 'none yet'

    const taskId = uuid()
    db.prepare(`INSERT INTO tasks (id, title, description, priority, agent_id, status) VALUES (?, ?, ?, 'low', 'scout', 'todo')`)
      .run(taskId, '[Self-Improvement] Feature Discovery',
        `Research what features top AI agent dashboards and autonomous systems have. Think about:
- Agent monitoring and observability tools
- Task orchestration patterns
- Cost optimization features
- Collaboration and communication tools
- Analytics and reporting dashboards
- Security and access control

Existing proposals (avoid duplicates): ${existingList}

Output your findings as a JSON array of proposals:
[{"type":"feature","title":"...","description":"...","priority":"medium","effort":"medium"}]

Focus on features that would make Hive more powerful and useful. Be creative but practical.`)
    console.log('🔍 Created feature discovery task')
    setTimeout(() => processAgentQueue('scout'), 5000)
  } catch (e) { console.error('Feature discovery heartbeat failed:', e.message) }
})

// Self-Assessment — Nexus reviews performance weekly + sends weekly summary email
registerHeartbeat('self-assessment', 7 * 24 * 60 * 60 * 1000, async () => {
  try {
    // Always send weekly summary regardless of budget
    const completedTasks = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status = 'done' AND completed_at >= datetime('now', '-7 days')").get().c
    const failedTasks = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status = 'failed' AND completed_at >= datetime('now', '-7 days')").get().c
    const totalSpend = db.prepare("SELECT COALESCE(SUM(cost), 0) as total FROM spend_log WHERE date >= date('now', '-7 days')").get().total
    const pendingProposals = db.prepare("SELECT COUNT(*) as c FROM proposals WHERE status = 'pending'").get().c

    let nexusAnalysis = null
    if (canAffordSelfImprovement()) {
      // Have Nexus analyze the week and propose workflow improvements
      const taskId = uuid()
      db.prepare(`INSERT INTO tasks (id, title, description, priority, agent_id, status) VALUES (?, ?, ?, 'low', 'nexus', 'todo')`)
        .run(taskId, '[Self-Improvement] Weekly Self-Assessment',
          `Review Hive's performance this week:
- Tasks completed: ${completedTasks}, Failed: ${failedTasks}
- Total spend: $${totalSpend.toFixed(2)}
- Pending proposals: ${pendingProposals}

Analyze what went well, what failed, and why. Propose improvements to:
- Agent prompts and system messages
- Task routing and priority logic
- Error handling and retry strategies
- Cost efficiency

Output your findings as a JSON array of proposals:
[{"type":"workflow","title":"...","description":"...","priority":"medium","effort":"medium"}]

Also include a brief summary paragraph at the top (before the JSON) for the weekly email.`)
      console.log('📊 Created self-assessment task')
      setTimeout(() => processAgentQueue('nexus'), 5000)
    }

    // Send weekly summary email
    email.sendWeeklySummaryEmail({
      completedTasks, failedTasks, totalSpend, pendingProposals, nexusAnalysis
    }).catch(() => {})
    console.log('📧 Sent weekly summary email')
  } catch (e) { console.error('Self-assessment heartbeat failed:', e.message) }
})

// ── Daily Project Summary (9am local) ─────────────
const dailyProjectSummaryFn = () => {
  try {
    const nexus = agents.find(a => a.id === 'nexus')
    if (!nexus) return
    const allTasks = db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all()
    const projectMap = {}
    for (const task of allTasks) {
      const match = task.title.match(/^\[([^\]]+)\]/)
      if (!match) continue
      const name = match[1]
      if (!projectMap[name]) projectMap[name] = []
      projectMap[name].push(task)
    }
    const projectSummaries = Object.entries(projectMap).map(([name, tasks]) => {
      const total = tasks.length, done = tasks.filter(t => t.status === 'done').length
      const failed = tasks.filter(t => t.status === 'failed').length
      const inProg = tasks.filter(t => t.status === 'in_progress').length
      return `- **${name}**: ${done}/${total} done (${total > 0 ? Math.round(done/total*100) : 0}%)${failed ? `, ${failed} failed` : ''}${inProg ? `, ${inProg} running` : ''}`
    }).join('\n')
    if (!projectSummaries) return
    const todaySpend = getTodaySpend()
    const yesterday = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status = 'done' AND completed_at >= datetime('now', '-1 day')").get().c
    const summaryText = `📊 **Daily Project Status**\n\n${projectSummaries}\n\n_Yesterday: ${yesterday} tasks completed | Today's spend: $${todaySpend.toFixed(2)}_`
    db.prepare('INSERT INTO messages (sender_id, sender_name, sender_avatar, sender_color, text) VALUES (?, ?, ?, ?, ?)')
      .run('nexus', nexus.name, nexus.avatar, nexus.color, summaryText)
    console.log('📊 Daily project summary posted by Nexus')
  } catch (e) { console.error('Daily project summary failed:', e.message) }
}
// Schedule for 9am local time
const _now = new Date(), _next9am = new Date(_now)
_next9am.setHours(9, 0, 0, 0)
if (_now >= _next9am) _next9am.setDate(_next9am.getDate() + 1)
setTimeout(() => {
  dailyProjectSummaryFn()
  registerHeartbeat('daily-project-summary', 24 * 60 * 60 * 1000, dailyProjectSummaryFn)
}, _next9am - _now)
console.log(`📊 Daily project summary scheduled for 9am (in ${Math.round((_next9am - _now) / 60000)}min)`)

// ── Skill Discovery Heartbeat ──────────────────────
registerHeartbeat('skill-discovery', 7 * 24 * 60 * 60 * 1000, async () => {
  if (!canAffordSelfImprovement()) return

  const existing = db.prepare('SELECT name FROM skills').all().map(s => s.name.toLowerCase())
  const id = uuid()
  const description = `Search GitHub, Reddit, X, and AI forums for new agent skills and techniques.

Currently installed skills: ${existing.join(', ') || 'none'}
DO NOT suggest skills that duplicate the above.

Search for:
- GitHub repos with prompt engineering techniques or agent frameworks
- Reddit r/ChatGPT, r/LocalLLaMA, r/artificial for new prompting patterns
- X/Twitter threads about AI agent optimization
- New research methodologies, content frameworks, sales templates

Output a JSON array of up to 5 skills:
[{"name":"Skill Name","description":"What it does","skill_md":"# Skill Name\\n\\nDetailed step-by-step instructions...","tags":["tag1"],"suggested_agents":["scout"]}]`

  db.prepare('INSERT INTO tasks (id, title, description, agent_id, priority, status) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, 'Discover skills: weekly web scan', description, 'scout', 'low', 'todo')
  console.log('🧩 Skill discovery heartbeat: created Scout task')
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
      model: getAgentModel('nexus'),
      max_tokens: 1024,
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

// ── Hive Assistant (Conversational AI) ───────────
function buildChatSnapshot() {
  const sections = []

  const agentStatuses = agents.map(a => {
    const run = activeRuns.get(a.id)
    const spend = getTodaySpend(a.id)
    const done = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE agent_id = ? AND status = 'done'").get(a.id).c
    const taskTitle = run ? db.prepare('SELECT title FROM tasks WHERE id = ?').get(run.taskId)?.title : null
    return `- ${a.name}: ${run ? `RUNNING "${taskTitle}"` : 'idle'} | $${spend.toFixed(4)} today | ${done} done`
  })
  sections.push('## Agents\n' + agentStatuses.join('\n'))

  const todayTotal = getTodaySpend()
  const monthTotal = getMonthSpend()
  const dailyLimit = getSetting('daily_limit_usd') || '5'
  const monthlyLimit = getSetting('monthly_limit_usd') || '100'
  sections.push(`## Spend\nToday: $${todayTotal.toFixed(4)} / $${dailyLimit} | Month: $${monthTotal.toFixed(4)} / $${monthlyLimit}`)

  const recent = db.prepare("SELECT title, status, agent_id, priority FROM tasks ORDER BY updated_at DESC LIMIT 10").all()
  if (recent.length) {
    sections.push('## Recent Tasks\n' + recent.map(t => `- [${t.status}] "${t.title}" (${t.agent_id})`).join('\n'))
  }

  const paused = getSetting('pause_all_agents') || 'false'
  const qa = getSetting('qa_reviews_enabled') || 'true'
  const autoTasks = getSetting('auto_tasks_enabled') || 'true'
  const trading = getSetting('trading_enabled') || 'false'
  sections.push(`## Settings\nPaused: ${paused} | QA reviews: ${qa} | Auto-tasks: ${autoTasks} | Trading: ${trading}`)

  // Skills inventory
  const allSkills = db.prepare('SELECT s.slug, s.name, s.description, GROUP_CONCAT(asv.agent_id) as assigned FROM skills s LEFT JOIN agent_skills_v2 asv ON asv.skill_id = s.id GROUP BY s.id ORDER BY s.updated_at DESC LIMIT 15').all()
  if (allSkills.length) {
    sections.push('## Skills (' + allSkills.length + ')\n' + allSkills.map(s => `- ${s.name} (${s.slug}): ${s.description || 'no desc'} [${s.assigned || 'unassigned'}]`).join('\n'))
  } else {
    sections.push('## Skills\nNo skills installed yet. Use create_skill or discover_skills to add them.')
  }

  return sections.join('\n\n')
}

const ALLOWED_SETTINGS = new Set([
  'daily_limit_usd', 'monthly_limit_usd', 'pause_all_agents', 'qa_reviews_enabled',
  'auto_tasks_enabled', 'trading_enabled', 'max_position_size_usd', 'max_daily_trades',
  'per_task_token_budget', 'max_concurrent_tasks'
])
const VALID_AGENTS = new Set(agents.map(a => a.id))

async function executeChatAction(type, payloadStr) {
  const payload = payloadStr.trim() ? JSON.parse(payloadStr) : {}
  switch (type) {
    case 'create_task': {
      if (!VALID_AGENTS.has(payload.agent_id)) return { ok: false, message: `Unknown agent: ${payload.agent_id}` }
      const id = uuid()
      db.prepare('INSERT INTO tasks (id, title, description, agent_id, priority, status) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, payload.title || 'Untitled', payload.description || '', payload.agent_id, payload.priority || 'medium', 'todo')
      return { ok: true, message: `Task created: "${payload.title}" → ${payload.agent_id}` }
    }
    case 'pause_agents':
      setSetting('pause_all_agents', 'true')
      return { ok: true, message: 'All agents paused' }
    case 'resume_agents':
      setSetting('pause_all_agents', 'false')
      return { ok: true, message: 'All agents resumed' }
    case 'update_setting': {
      if (!ALLOWED_SETTINGS.has(payload.key)) return { ok: false, message: `Setting not allowed: ${payload.key}` }
      setSetting(payload.key, String(payload.value))
      return { ok: true, message: `${payload.key} → ${payload.value}` }
    }
    case 'run_task': {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(payload.task_id)
      if (!task) return { ok: false, message: 'Task not found' }
      db.prepare("UPDATE tasks SET status = 'todo' WHERE id = ?").run(payload.task_id)
      return { ok: true, message: `Task "${task.title}" queued` }
    }
    case 'create_skill': {
      const { name, description, skill_md, tags, agents: assignTo } = payload
      if (!name || !skill_md) return { ok: false, message: 'name and skill_md required' }
      const id = uuid()
      const slug = slugify(name)
      try {
        db.prepare('INSERT INTO skills (id, slug, name, description, skill_md, tags, source) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
          id, slug, name, description || '', skill_md, JSON.stringify(tags || []), 'custom'
        )
        if (assignTo?.length) {
          for (const agentId of assignTo) {
            if (VALID_AGENTS.has(agentId)) {
              db.prepare('INSERT OR IGNORE INTO agent_skills_v2 (agent_id, skill_id) VALUES (?, ?)').run(agentId, id)
            }
          }
        }
        return { ok: true, message: `Skill "${name}" created${assignTo?.length ? ` → assigned to ${assignTo.join(', ')}` : ''}`, title: name, slug }
      } catch (e) {
        if (e.message.includes('UNIQUE')) return { ok: false, message: `Skill "${slug}" already exists` }
        return { ok: false, message: e.message }
      }
    }
    case 'assign_skill': {
      const skill = db.prepare('SELECT id FROM skills WHERE slug = ?').get(payload.slug)
      if (!skill) return { ok: false, message: `Skill "${payload.slug}" not found` }
      if (!VALID_AGENTS.has(payload.agent_id)) return { ok: false, message: `Unknown agent: ${payload.agent_id}` }
      db.prepare('INSERT OR IGNORE INTO agent_skills_v2 (agent_id, skill_id) VALUES (?, ?)').run(payload.agent_id, skill.id)
      return { ok: true, message: `Skill "${payload.slug}" assigned to ${payload.agent_id}` }
    }
    case 'discover_skills': {
      const { query, sources } = payload
      const sourceList = (sources || ['github', 'reddit', 'x']).join(', ')
      const id = uuid()
      const desc = `Search ${sourceList} for: ${query || 'new AI agent skills and techniques'}.

For each skill found, output a JSON array:
[{"name":"Skill Name","description":"What it does","skill_md":"# Skill Name\\n\\nInstructions...","tags":["tag1"],"suggested_agents":["scout"]}]

Focus on actionable techniques that can be injected as agent instructions. Look for:
- Prompt engineering patterns and frameworks
- Research methodologies
- Content creation frameworks
- Sales/outreach templates
- Trading analysis techniques
- Automation workflows`
      db.prepare('INSERT INTO tasks (id, title, description, agent_id, priority, status) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, `Discover skills: ${query || 'AI agent techniques'}`, desc, 'scout', 'medium', 'todo')
      return { ok: true, message: `Scout searching for skills: "${query || 'AI agent techniques'}"`, task_id: id }
    }
    default:
      return { ok: false, message: `Unknown action: ${type}` }
  }
}

const CHAT_SYSTEM_PROMPT = `You are Hive Assistant — the command center for an autonomous AI income agent team.
You help the user monitor, control, and direct their 6 agents: Scout (research), Forge (building), Quill (writing), Dealer (sales), Oracle (trading), Nexus (optimization).
Be concise and direct. Use markdown: **bold**, bullet lists. No fluff.

## Actions
When the user asks you to DO something, output an action block:
[ACTION:create_task]{"agent_id":"scout","title":"Research X","description":"Details...","priority":"medium"}[/ACTION]
[ACTION:pause_agents][/ACTION]
[ACTION:resume_agents][/ACTION]
[ACTION:update_setting]{"key":"daily_limit_usd","value":"10"}[/ACTION]
[ACTION:run_task]{"task_id":"uuid-here"}[/ACTION]
[ACTION:create_skill]{"name":"Skill Name","description":"What it does","skill_md":"# Skill Name\\n\\nInstructions the agent follows...","tags":["research"],"agents":["scout"]}[/ACTION]
[ACTION:assign_skill]{"slug":"skill-slug","agent_id":"scout"}[/ACTION]
[ACTION:discover_skills]{"query":"prompt engineering techniques","sources":["github","reddit","x"]}[/ACTION]

Rules: One action per response. Confirm what you'll do before the action block. Never invent task IDs.

## Skill Management
Skills are SKILL.md instruction packages that inject into agent prompts at runtime — they make agents better at specific tasks.
- **create_skill**: When you know specific instructions (e.g., a research framework, writing template). The skill_md field should contain detailed step-by-step instructions.
- **discover_skills**: When the user wants to find NEW skills from the web. This sends Scout to search GitHub, Reddit, X, and AI forums. Results appear as proposals for user approval.
- **assign_skill**: Assign an existing skill to another agent by slug.
When asked about improving agents or finding new techniques, prefer discover_skills to search the web.

## Current System State
`

app.post('/api/chat/ask', async (req, res) => {
  const { message } = req.body
  if (!message?.trim()) return res.status(400).json({ error: 'Message required' })

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  try {
    // Store user message
    db.prepare('INSERT INTO messages (sender_id, sender_name, sender_avatar, sender_color, text) VALUES (?, ?, ?, ?, ?)')
      .run('user', 'You', '👤', '#a8a29e', message.trim())

    // Load conversation history (last 20 user/assistant messages)
    const history = db.prepare("SELECT sender_id, text FROM messages WHERE sender_id IN ('user', 'hive-assistant') ORDER BY id DESC LIMIT 20").all().reverse()
    const messages = history.map(m => ({
      role: m.sender_id === 'user' ? 'user' : 'assistant',
      content: m.text.replace(/\[ACTION:\w+\].*?\[\/ACTION\]/gs, '').trim()
    })).filter(m => m.content)

    // Build system prompt with snapshot
    const snapshot = buildChatSnapshot()
    const systemPrompt = CHAT_SYSTEM_PROMPT + snapshot

    // Stream from OpenRouter
    const stream = await openai.chat.completions.create({
      model: 'anthropic/claude-haiku-4-5',
      max_tokens: 1024,
      stream: true,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
    })

    let fullText = ''
    let tokensIn = 0, tokensOut = 0

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content
      if (delta) {
        fullText += delta
        res.write(`event: token\ndata: ${JSON.stringify({ text: delta })}\n\n`)
      }
      if (chunk.usage) {
        tokensIn = chunk.usage.prompt_tokens || 0
        tokensOut = chunk.usage.completion_tokens || 0
      }
    }

    // Estimate tokens if not provided
    if (!tokensIn) tokensIn = Math.ceil((systemPrompt.length + messages.reduce((s, m) => s + m.content.length, 0)) / 4)
    if (!tokensOut) tokensOut = Math.ceil(fullText.length / 4)

    const pricing = MODEL_COSTS['anthropic/claude-haiku-4-5'] || DEFAULT_COST
    const cost = (tokensIn * pricing.input) + (tokensOut * pricing.output)
    logSpend('hive-assistant', tokensIn, tokensOut, cost, null)

    // Parse and execute actions
    const actionRegex = /\[ACTION:(\w+)\](.*?)\[\/ACTION\]/gs
    let match
    while ((match = actionRegex.exec(fullText)) !== null) {
      try {
        const result = await executeChatAction(match[1], match[2])
        res.write(`event: action\ndata: ${JSON.stringify(result)}\n\n`)
      } catch (e) {
        res.write(`event: action\ndata: ${JSON.stringify({ ok: false, message: e.message })}\n\n`)
      }
    }

    // Store assistant response (strip action blocks for display)
    const displayText = fullText.replace(/\[ACTION:\w+\].*?\[\/ACTION\]/gs, '').trim()
    db.prepare('INSERT INTO messages (sender_id, sender_name, sender_avatar, sender_color, text) VALUES (?, ?, ?, ?, ?)')
      .run('hive-assistant', 'Hive', '🐝', '#f59e0b', displayText)

    res.write(`event: done\ndata: ${JSON.stringify({ tokens_in: tokensIn, tokens_out: tokensOut, cost })}\n\n`)
    res.end()
  } catch (err) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`)
    res.end()
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

// ── Projects (auto-categorized by theme + [Prefix] support) ────
app.get('/api/projects', (req, res) => {
  const allTasks = db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all()

  // Theme definitions: name, icon, keywords (matched against lowercase title)
  const THEMES = [
    { name: 'Trading & Strategies', icon: '📈', keywords: ['trad', 'alpaca', 'backtest', 'strategy', 'swing', 'stock', 'market data', 'p&l', 'portfolio', 'ticker', 'position', 'broker', 'paper trad'] },
    { name: 'Content & Marketing', icon: '✍️', keywords: ['content', 'blog', 'seo', 'newsletter', 'write', 'article', 'copy', 'thread', 'editorial', 'keyword'] },
    { name: 'Freelance & Outreach', icon: '🤝', keywords: ['freelance', 'upwork', 'fiverr', 'proposal', 'outreach', 'client', 'gig', 'sales', 'linkedin', 'pipeline', 'cold email', 'prospect'] },
    { name: 'Products & Engineering', icon: '🛠️', keywords: ['build', 'chrome', 'extension', 'saas', 'bot', 'tool', 'dashboard', 'api', 'code', 'implement', 'deploy', 'database', 'integrate'] },
    { name: 'Revenue & Monetization', icon: '💰', keywords: ['affiliate', 'revenue', 'monetiz', 'income', 'pricing', 'stripe', 'payment', 'earnings', 'profit'] },
    { name: 'Research & Analysis', icon: '🔍', keywords: ['research', 'competi', 'landscape', 'analyz', 'document', 'benchmark', 'case study', 'survey'] },
    { name: 'Reviews & QA', icon: '🔬', keywords: ['review', 'nexus', 'score', 'prompt', 'improve', 'retro', 'standup', 'self-', 'reconcil', 'audit', 'capability', 'verification', 'quality'] },
  ]

  const projectMap = {}

  for (const task of allTasks) {
    const lower = task.title.toLowerCase()

    // First check for explicit [ProjectName] prefix
    const prefixMatch = task.title.match(/^\[([^\]]+)\]/)
    if (prefixMatch) {
      const name = prefixMatch[1]
      if (!projectMap[name]) projectMap[name] = { name, icon: '📁', tasks: [] }
      projectMap[name].tasks.push(task)
      continue
    }

    // Auto-categorize by keyword theme
    let matched = false
    for (const theme of THEMES) {
      if (theme.keywords.some(kw => lower.includes(kw))) {
        if (!projectMap[theme.name]) projectMap[theme.name] = { name: theme.name, icon: theme.icon, tasks: [] }
        projectMap[theme.name].tasks.push(task)
        matched = true
        break
      }
    }
    if (!matched) {
      if (!projectMap['Other']) projectMap['Other'] = { name: 'Other', icon: '📋', tasks: [] }
      projectMap['Other'].tasks.push(task)
    }
  }

  const projects = Object.values(projectMap).map(p => {
    const total = p.tasks.length
    const completed = p.tasks.filter(t => t.status === 'done').length
    const failed = p.tasks.filter(t => t.status === 'failed').length
    const inProgress = p.tasks.filter(t => t.status === 'in_progress').length
    const awaiting = p.tasks.filter(t => t.status === 'awaiting_approval').length
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0
    const agentIds = [...new Set(p.tasks.map(t => t.agent_id).filter(Boolean))]
    const totalCost = p.tasks.reduce((sum, t) => sum + (t.estimated_cost || 0), 0)
    return { name: p.name, icon: p.icon, total, completed, failed, inProgress, awaiting, completionPct: pct, agents: agentIds, totalCost, tasks: p.tasks }
  })
  res.json(projects.sort((a, b) => b.total - a.total))
})

// ── History / Audit Trail ─────────────────────────
app.get('/api/history', (req, res) => {
  const { search, agent, status, limit = 50, offset = 0 } = req.query
  let where = "WHERE status IN ('done', 'failed')"
  const params = []
  if (agent) { where += ' AND agent_id = ?'; params.push(agent) }
  if (status) { where += ' AND status = ?'; params.push(status) }
  if (search) { where += ' AND (title LIKE ? OR description LIKE ? OR output LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`) }
  const total = db.prepare(`SELECT COUNT(*) as c FROM tasks ${where}`).get(...params).c
  const tasks = db.prepare(`SELECT id, title, description, status, agent_id, priority, tokens_used, estimated_cost, nexus_score, created_at, started_at, completed_at, error, retries FROM tasks ${where} ORDER BY COALESCE(completed_at, updated_at) DESC LIMIT ? OFFSET ?`).all(...params, parseInt(limit), parseInt(offset))
  const enriched = tasks.map(t => ({ ...t, duration_ms: t.started_at && t.completed_at ? new Date(t.completed_at) - new Date(t.started_at) : null }))
  res.json({ tasks: enriched, total, limit: parseInt(limit), offset: parseInt(offset) })
})

// ── Global Search ─────────────────────────────────
app.get('/api/search', (req, res) => {
  const { q } = req.query
  if (!q || q.length < 2) return res.json({ tasks: [], logs: [] })
  const pattern = `%${q}%`
  const tasks = db.prepare('SELECT id, title, description, status, agent_id, created_at FROM tasks WHERE title LIKE ? OR description LIKE ? OR output LIKE ? ORDER BY updated_at DESC LIMIT 20').all(pattern, pattern, pattern)
  const logs = db.prepare(`SELECT tl.*, t.title as task_title FROM task_logs tl JOIN tasks t ON t.id = tl.task_id WHERE tl.message LIKE ? ORDER BY tl.created_at DESC LIMIT 20`).all(pattern)
  res.json({ tasks, logs })
})

// ── Pipeline Status ───────────────────────────────
app.get('/api/pipelines/:id/status', (req, res) => {
  const tasks = db.prepare('SELECT * FROM tasks WHERE pipeline_id = ? ORDER BY pipeline_step ASC').all(req.params.id)
  res.json(tasks)
})

// ══════════════════════════════════════════════════════
// ██ BUILD 2: AGENT NETWORK GRAPH                     ██
// ══════════════════════════════════════════════════════

app.get('/api/graph/nodes', (req, res) => {
  const nodes = agents.map(a => ({
    id: a.id, name: a.name, avatar: a.avatar, color: a.color, role: a.role,
    isRunning: activeRuns.has(a.id)
  }))
  res.json(nodes)
})

app.get('/api/graph/edges', (req, res) => {
  const range = req.query.range || '24h'
  const rangeMap = { '1h': '-1 hour', '24h': '-1 day', '7d': '-7 days' }
  const since = rangeMap[range] || '-1 day'
  const edges = db.prepare(`
    SELECT source_agent_id, target_agent_id, interaction_type, COUNT(*) as count
    FROM agent_interactions WHERE created_at > datetime('now', ?)
    GROUP BY source_agent_id, target_agent_id, interaction_type
  `).all(since)
  res.json(edges)
})

// ══════════════════════════════════════════════════════
// ██ BUILD 3: ANALYTICS / COST TIMELINE               ██
// ══════════════════════════════════════════════════════

app.get('/api/analytics/spend', (req, res) => {
  const range = req.query.range || '7d'
  const agent = req.query.agent
  const rangeMap = { '24h': { since: '-1 day', bucket: '%Y-%m-%d %H:00' }, '7d': { since: '-7 days', bucket: '%Y-%m-%d' }, '30d': { since: '-30 days', bucket: '%Y-%m-%d' } }
  const { since, bucket } = rangeMap[range] || rangeMap['7d']

  let query = `SELECT strftime('${bucket}', created_at) as time_bucket, agent_id, SUM(cost) as total_cost, SUM(tokens_in + tokens_out) as total_tokens, COUNT(*) as calls
    FROM spend_log WHERE created_at > datetime('now', ?)`
  const params = [since]
  if (agent) { query += ' AND agent_id = ?'; params.push(agent) }
  query += ` GROUP BY time_bucket, agent_id ORDER BY time_bucket`

  res.json(db.prepare(query).all(...params))
})

app.get('/api/analytics/spend/by-task', (req, res) => {
  const limit = parseInt(req.query.limit) || 50
  const rows = db.prepare(`
    SELECT t.id, t.title, t.agent_id, t.status, t.estimated_cost, t.tokens_used, t.completed_at
    FROM tasks t WHERE t.estimated_cost > 0 ORDER BY t.estimated_cost DESC LIMIT ?
  `).all(limit)
  res.json(rows)
})

app.get('/api/analytics/agents/summary', (req, res) => {
  const range = req.query.range || '30d'
  const rangeMap = { '24h': '-1 day', '7d': '-7 days', '30d': '-30 days' }
  const since = rangeMap[range] || '-30 days'
  const rows = db.prepare(`
    SELECT agent_id, SUM(cost) as total_cost, SUM(tokens_in + tokens_out) as total_tokens, COUNT(*) as total_calls,
    AVG(cost) as avg_cost_per_call FROM spend_log WHERE created_at > datetime('now', ?) GROUP BY agent_id
  `).all(since)
  const taskCounts = db.prepare(`
    SELECT agent_id, COUNT(*) as task_count, AVG(CASE WHEN estimated_cost > 0 THEN estimated_cost END) as avg_task_cost
    FROM tasks WHERE updated_at > datetime('now', ?) GROUP BY agent_id
  `).all(since)
  const tcMap = Object.fromEntries(taskCounts.map(t => [t.agent_id, t]))
  res.json(rows.map(r => ({ ...r, ...(tcMap[r.agent_id] || {}) })))
})

// ══════════════════════════════════════════════════════
// ██ BUILD 4: SCOUT INTELLIGENCE FEED                 ██
// ══════════════════════════════════════════════════════

app.get('/api/intel', (req, res) => {
  const { status, tag, limit } = req.query
  let query = 'SELECT * FROM intel_items WHERE 1=1'
  const params = []
  if (status && status !== 'all') { query += ' AND status = ?'; params.push(status) }
  if (tag) { query += ' AND tags LIKE ?'; params.push(`%${tag}%`) }
  query += ' ORDER BY created_at DESC LIMIT ?'
  params.push(parseInt(limit) || 50)
  res.json(db.prepare(query).all(...params))
})

app.patch('/api/intel/:id/status', async (req, res) => {
  const { status } = req.body
  if (!['new', 'bookmarked', 'sent_to_forge', 'dismissed'].includes(status)) return res.status(400).json({ error: 'Invalid status' })
  db.prepare('UPDATE intel_items SET status = ? WHERE id = ?').run(status, req.params.id)

  if (status === 'sent_to_forge') {
    const item = db.prepare('SELECT * FROM intel_items WHERE id = ?').get(req.params.id)
    if (item) {
      const taskId = uuid()
      db.prepare('INSERT INTO tasks (id, title, description, priority, agent_id, status) VALUES (?, ?, ?, ?, ?, ?)').run(
        taskId, `Build: ${item.title}`, `${item.summary}\n\nSource: ${item.source_url}`, 'high', 'forge', 'todo'
      )
    }
  }
  res.json({ ok: true })
})

// ══════════════════════════════════════════════════════
// ██ BUILD 5: NATURAL LANGUAGE COMMAND BAR             ██
// ══════════════════════════════════════════════════════

app.post('/api/commands/parse', async (req, res) => {
  const { text } = req.body
  if (!text || text.trim().length < 3) return res.status(400).json({ error: 'Command too short' })

  try {
    const agentList = agents.map(a => `${a.id}: ${a.name} (${a.role})`).join('\n')
    const response = await callClaude({
      model: getAgentModel('quill'),
      max_tokens: 512,
      system: `You parse natural language commands into structured task data for an AI agent team.

Available agents:
${agentList}

Return ONLY valid JSON (no markdown):
{
  "agent_id": "scout|forge|quill|dealer|oracle|nexus",
  "task_type": "research|build|write|sell|analyze|review",
  "title": "Clean task title",
  "description": "Expanded description",
  "priority": "low|medium|high",
  "is_query": false
}

Set is_query=true for read-only questions like "how much did we spend" or "show me...".
For queries, add a "query_type" field: "spend"|"tasks"|"intel"|"general".`,
      messages: [{ role: 'user', content: text }]
    }, 'nexus', null)

    const raw = response.content.map(b => b.type === 'text' ? b.text : '').join('')
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return res.status(400).json({ error: 'Could not parse command' })
    const parsed = JSON.parse(jsonMatch[0])

    if (parsed.is_query) {
      let answer = ''
      if (parsed.query_type === 'spend') {
        const spend = db.prepare("SELECT SUM(cost) as total FROM spend_log WHERE date = date('now')").get()
        answer = `Today's spend: $${(spend?.total || 0).toFixed(4)}`
      } else if (parsed.query_type === 'tasks') {
        const recent = db.prepare("SELECT title, status, agent_id FROM tasks ORDER BY updated_at DESC LIMIT 5").all()
        answer = recent.map(t => `[${t.status}] ${t.title}`).join('\n')
      } else {
        answer = 'Query type not supported inline. Try creating a task instead.'
      }
      return res.json({ is_query: true, answer, parsed })
    }

    const taskId = uuid()
    db.prepare('INSERT INTO tasks (id, title, description, priority, agent_id, status) VALUES (?, ?, ?, ?, ?, ?)').run(
      taskId, parsed.title, parsed.description || '', parsed.priority || 'medium', parsed.agent_id, 'todo'
    )
    res.json({ is_query: false, task: { id: taskId, ...parsed } })
  } catch (err) {
    console.error('Command parse error:', err.message)
    res.status(500).json({ error: 'Failed to parse command' })
  }
})

// ══════════════════════════════════════════════════════
// ██ BUILD 6: SKILL REGISTRY V2                       ██
// ══════════════════════════════════════════════════════

function slugify(str) { return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }

app.get('/api/skills', (req, res) => {
  const { search, tags, agent } = req.query
  let query = 'SELECT s.*, GROUP_CONCAT(DISTINCT asv.agent_id) as assigned_agents FROM skills s LEFT JOIN agent_skills_v2 asv ON asv.skill_id = s.id WHERE 1=1'
  const params = []
  if (search) { query += ' AND (s.name LIKE ? OR s.description LIKE ?)'; params.push(`%${search}%`, `%${search}%`) }
  if (tags) { query += ' AND s.tags LIKE ?'; params.push(`%${tags}%`) }
  if (agent) { query += ' AND asv.agent_id = ?' ; params.push(agent) }
  query += ' GROUP BY s.id ORDER BY s.updated_at DESC'
  res.json(db.prepare(query).all(...params))
})

app.get('/api/skills/:slug', (req, res) => {
  const skill = db.prepare('SELECT * FROM skills WHERE slug = ?').get(req.params.slug)
  if (!skill) return res.status(404).json({ error: 'Skill not found' })
  const assigned = db.prepare('SELECT * FROM agent_skills_v2 WHERE skill_id = ?').all(skill.id)
  res.json({ ...skill, assignments: assigned })
})

app.post('/api/skills', (req, res) => {
  const { name, description, skill_md, tags, requires_tools } = req.body
  if (!name || !skill_md) return res.status(400).json({ error: 'name and skill_md required' })
  const id = uuid()
  const slug = slugify(name)
  try {
    db.prepare('INSERT INTO skills (id, slug, name, description, skill_md, tags, requires_tools) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      id, slug, name, description || '', skill_md, JSON.stringify(tags || []), JSON.stringify(requires_tools || [])
    )
    res.json({ id, slug })
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Slug already exists' })
    throw e
  }
})

app.put('/api/skills/:slug', (req, res) => {
  const skill = db.prepare('SELECT * FROM skills WHERE slug = ?').get(req.params.slug)
  if (!skill) return res.status(404).json({ error: 'Skill not found' })
  const { name, description, skill_md, tags, requires_tools } = req.body
  const parts = (skill.version || '1.0.0').split('.')
  parts[2] = parseInt(parts[2] || 0) + 1
  const newVersion = parts.join('.')
  db.prepare('UPDATE skills SET name = COALESCE(?, name), description = COALESCE(?, description), skill_md = COALESCE(?, skill_md), tags = COALESCE(?, tags), requires_tools = COALESCE(?, requires_tools), version = ?, updated_at = datetime(\'now\') WHERE slug = ?').run(
    name || null, description || null, skill_md || null, tags ? JSON.stringify(tags) : null, requires_tools ? JSON.stringify(requires_tools) : null, newVersion, req.params.slug
  )
  res.json({ ok: true, version: newVersion })
})

app.delete('/api/skills/:slug', (req, res) => {
  const skill = db.prepare('SELECT id FROM skills WHERE slug = ?').get(req.params.slug)
  if (!skill) return res.status(404).json({ error: 'Skill not found' })
  db.prepare('DELETE FROM skills WHERE id = ?').run(skill.id)
  res.json({ ok: true })
})

// Agent skill assignments (V2)
app.get('/api/agents/:agentId/skills-v2', (req, res) => {
  const rows = db.prepare('SELECT s.*, asv.enabled, asv.priority FROM agent_skills_v2 asv JOIN skills s ON s.id = asv.skill_id WHERE asv.agent_id = ? ORDER BY asv.priority').all(req.params.agentId)
  res.json(rows)
})

app.post('/api/agents/:agentId/skills-v2/:skillSlug', (req, res) => {
  const skill = db.prepare('SELECT id FROM skills WHERE slug = ?').get(req.params.skillSlug)
  if (!skill) return res.status(404).json({ error: 'Skill not found' })
  try {
    db.prepare('INSERT OR REPLACE INTO agent_skills_v2 (agent_id, skill_id) VALUES (?, ?)').run(req.params.agentId, skill.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

app.delete('/api/agents/:agentId/skills-v2/:skillSlug', (req, res) => {
  const skill = db.prepare('SELECT id FROM skills WHERE slug = ?').get(req.params.skillSlug)
  if (!skill) return res.status(404).json({ error: 'Skill not found' })
  db.prepare('DELETE FROM agent_skills_v2 WHERE agent_id = ? AND skill_id = ?').run(req.params.agentId, skill.id)
  res.json({ ok: true })
})

app.patch('/api/agents/:agentId/skills-v2/:skillSlug', (req, res) => {
  const skill = db.prepare('SELECT id FROM skills WHERE slug = ?').get(req.params.skillSlug)
  if (!skill) return res.status(404).json({ error: 'Skill not found' })
  const { enabled, priority } = req.body
  if (enabled !== undefined) db.prepare('UPDATE agent_skills_v2 SET enabled = ? WHERE agent_id = ? AND skill_id = ?').run(enabled ? 1 : 0, req.params.agentId, skill.id)
  if (priority !== undefined) db.prepare('UPDATE agent_skills_v2 SET priority = ? WHERE agent_id = ? AND skill_id = ?').run(priority, req.params.agentId, skill.id)
  res.json({ ok: true })
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

// ── Serve static frontend ─────────────────────────
const distPath = join(__dirname, '..', 'dist')
if (existsSync(distPath)) {
  app.use(express.static(distPath))
  app.get('/{*splat}', (req, res) => {
    res.sendFile(join(distPath, 'index.html'))
  })
}

// ── Seed Example Pipeline ─────────────────────────
const pipelineCount = db.prepare('SELECT COUNT(*) as c FROM pipelines').get().c
if (pipelineCount === 0) {
  const pipelineId = uuid()
  const exampleSteps = [
    { position: 1, agent_id: 'scout', prompt_template: 'Research the best opportunity for a new income-generating digital product. Focus on micro-SaaS ideas with low competition. Output a detailed opportunity report with recommended product specification.' },
    { position: 2, agent_id: 'forge', prompt_template: 'Based on the following market research, build a complete MVP:\n\n{{previous_output}}\n\nDeliver complete, runnable code with package.json, README, and .env.example.' },
    { position: 3, agent_id: 'quill', prompt_template: 'Create launch content for the following product:\n\n{{previous_output}}\n\nWrite: 1) Product Hunt launch post, 2) Twitter/X thread (10 tweets), 3) Blog post (1500 words, SEO-optimized).' },
    { position: 4, agent_id: 'dealer', prompt_template: 'Find 5 potential clients or distribution channels for this product:\n\n{{previous_output}}\n\nWrite outreach messages for each. Include freelance platforms, direct outreach, and partnership angles.' }
  ]
  db.prepare('INSERT INTO pipelines (id, name, description, steps) VALUES (?, ?, ?, ?)').run(pipelineId, 'Product Launch Pipeline', 'Scout researches → Forge builds MVP → Quill creates launch content → Dealer finds distribution', JSON.stringify(exampleSteps))
  console.log('🔗 Seeded example pipeline: Product Launch Pipeline')
}

// ── Auto-prune old trace events (every 6 hours) ───
registerHeartbeat('trace-prune', 6 * 60 * 60 * 1000, () => {
  const deleted = db.prepare("DELETE FROM task_traces WHERE created_at < datetime('now', '-7 days')").run()
  if (deleted.changes > 0) console.log(`🧹 Pruned ${deleted.changes} old trace rows`)
})

const PORT = process.env.API_PORT || process.env.PORT || 3002
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🐝 Hive server running on port ${PORT}`)
  console.log(`🧠 Agent memory dir: ${MEMORY_DIR}`)
  console.log(`📋 Task queues active for ${agents.length} agents`)
  console.log(`💓 ${heartbeatJobs.length} heartbeat jobs registered`)
})
