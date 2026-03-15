import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import crypto from 'node:crypto'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import db from './db.js'
import { v4 as uuid } from 'uuid'
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync, statSync, copyFileSync, readdirSync, unlinkSync } from 'fs'
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

// ── Structured Logging ────────────────────────────
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 }
const LOG_LEVEL = process.env.LOG_LEVEL || 'info'

function log(level, message, meta = {}) {
  if (LOG_LEVELS[level] < LOG_LEVELS[LOG_LEVEL]) return
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...meta
  }
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  fn(JSON.stringify(entry))
}

// ── Circuit Breaker for External APIs ─────────────
class CircuitBreaker {
  constructor(name, { threshold = 5, resetMs = 60000 } = {}) {
    this.name = name
    this.failures = 0
    this.threshold = threshold
    this.resetMs = resetMs
    this.state = 'closed'
    this.lastFailure = 0
  }

  async call(fn) {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > this.resetMs) {
        this.state = 'half-open'
      } else {
        throw new Error(`Circuit breaker "${this.name}" is open — service unavailable, retry after ${Math.ceil((this.resetMs - (Date.now() - this.lastFailure)) / 1000)}s`)
      }
    }

    try {
      const result = await fn()
      if (this.state === 'half-open') {
        this.state = 'closed'
        this.failures = 0
      }
      return result
    } catch (e) {
      this.failures++
      this.lastFailure = Date.now()
      if (this.failures >= this.threshold) {
        this.state = 'open'
        log('warn', 'circuit_breaker_opened', { name: this.name, failures: this.failures })
      }
      throw e
    }
  }

  get status() { return { name: this.name, state: this.state, failures: this.failures } }
}

const breakers = {
  openrouter: new CircuitBreaker('openrouter', { threshold: 5, resetMs: 60000 }),
  alpaca: new CircuitBreaker('alpaca', { threshold: 3, resetMs: 120000 }),
  yahoo: new CircuitBreaker('yahoo', { threshold: 5, resetMs: 60000 }),
}

// ── Security headers ─────────────────────────────
app.use(helmet({ contentSecurityPolicy: false })) // CSP off — SPA serves its own scripts

// ── Rate limiting ────────────────────────────────
app.use(rateLimit({ windowMs: 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false }))

// CORS — allow frontend
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3333,http://localhost:5173').split(',')
app.use(cors({ origin: ALLOWED_ORIGINS }))
app.use(express.json())

// ── Password hashing ────────────────────────────────
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.createHash('sha256').update(salt + password).digest('hex')
  return `${salt}:${hash}`
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':')
  const attempt = crypto.createHash('sha256').update(salt + password).digest('hex')
  return hash === attempt
}

// Seed default admin if no users exist
try {
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get()
  if (userCount.c === 0) {
    const adminId = uuid()
    db.prepare('INSERT INTO users (id, username, password_hash, role, display_name) VALUES (?, ?, ?, ?, ?)')
      .run(adminId, 'admin', hashPassword('admin'), 'admin', 'Admin')
    console.log('🔑 Default admin user created (username: admin, password: admin)')
  }
} catch (e) { /* users table may not exist yet on first boot */ }

// ── Auth middleware ───────────────────────────────
const API_KEY = process.env.HIVE_API_KEY

function authenticateRequest(req, res, next) {
  // Skip webhook endpoints and login
  if (req.path.startsWith('/webhooks/') && req.method === 'POST') return next()
  if (req.path === '/auth/login' && req.method === 'POST') return next()

  const authHeader = req.headers.authorization
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : req.query.token

  // API key check (master key = admin)
  if (API_KEY && token === API_KEY) {
    req.user = { id: 'api', role: 'admin', username: 'api', display_name: 'API Key' }
    return next()
  }

  // Session token check
  if (token) {
    const session = db.prepare("SELECT s.*, u.id as user_id, u.username, u.role, u.display_name FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.id = ? AND s.expires_at > datetime('now')").get(token)
    if (session) {
      req.user = { id: session.user_id, role: session.role, username: session.username, display_name: session.display_name }
      return next()
    }
  }

  // If no API key configured, allow open access (backwards compat)
  if (!API_KEY) {
    req.user = { id: 'anonymous', role: 'admin', username: 'anonymous', display_name: 'Anonymous' }
    return next()
  }

  res.status(401).json({ error: 'Unauthorized' })
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' })
    }
    next()
  }
}

// Apply auth globally to /api routes
app.use('/api', authenticateRequest)

if (API_KEY) {
  console.log('🔒 Auth enabled — requests require Bearer token or session')
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

// Cost-aware model routing — downgrades expensive models when agent approaches budget
const MODEL_FALLBACKS = {
  'anthropic/claude-sonnet-4-5': 'anthropic/claude-haiku-4-5',
  'anthropic/claude-haiku-4-5': 'anthropic/claude-haiku-4-5',
  'perplexity/sonar-pro': 'perplexity/sonar-pro',
  'deepseek/deepseek-r1': 'deepseek/deepseek-r1',
}

function getSmartModel(agentId) {
  const baseModel = AGENT_MODELS[agentId] || 'anthropic/claude-haiku-4-5'

  const today = new Date().toISOString().slice(0, 10)
  const agentSpend = db.prepare("SELECT COALESCE(SUM(cost), 0) as total FROM spend_log WHERE agent_id = ? AND date = ?").get(agentId, today)
  const dailyLimit = parseFloat(db.prepare("SELECT value FROM settings WHERE key = 'daily_limit_usd'").get()?.value || '5')
  const agentLimit = dailyLimit / 6

  const spendRatio = agentSpend.total / agentLimit

  if (spendRatio > 0.8 && MODEL_FALLBACKS[baseModel] !== baseModel) {
    log('info', 'model_downgraded', { agentId, from: baseModel, to: MODEL_FALLBACKS[baseModel], spendRatio: Math.round(spendRatio * 100) })
    return MODEL_FALLBACKS[baseModel]
  }

  return baseModel
}

// Models that support native function calling via OpenRouter
const SUPPORTS_FUNCTION_CALLING = {
  'anthropic/claude-sonnet-4-5': true,
  'anthropic/claude-haiku-4-5': true,
  'openai/gpt-4o': true,
  'openai/gpt-4o-mini': true,
  // Text-only models (use [TOOL:name] syntax):
  // 'perplexity/sonar-pro': false
  // 'deepseek/deepseek-r1': false
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
  traceBus.emit('spend:update', { agent_id: agentId, cost })
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
async function callClaude(opts, agentId, taskId, externalSignal) {
  checkSpendLimit(agentId)

  // 5-minute timeout via AbortController
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 300000)

  // If caller provided an external signal, abort our controller when it fires
  if (externalSignal) {
    if (externalSignal.aborted) { clearTimeout(timeout); controller.abort(); }
    else externalSignal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  try {
    // Convert Anthropic message format → OpenAI messages array
    const messages = []
    if (opts.system) {
      messages.push({ role: 'system', content: flattenContent(opts.system) })
    }
    for (const msg of (opts.messages || [])) {
      messages.push({ role: msg.role, content: flattenContent(msg.content) })
    }

    const createOpts = {
      model: opts.model,
      messages,
      max_tokens: opts.max_tokens,
    }

    // Native function calling for supported models
    if (opts.tools && opts.tools.length > 0 && SUPPORTS_FUNCTION_CALLING[opts.model]) {
      createOpts.tools = opts.tools
      createOpts.tool_choice = 'auto'
    }

    const response = await breakers.openrouter.call(() => openai.chat.completions.create(createOpts, { signal: controller.signal }))

    const tokensIn = response.usage?.prompt_tokens || 0
    const tokensOut = response.usage?.completion_tokens || 0
    const pricing = MODEL_COSTS[opts.model] || DEFAULT_COST
    const cost = (tokensIn * pricing.input) + (tokensOut * pricing.output)

    logSpend(agentId, tokensIn, tokensOut, cost, taskId)

    if (taskId) {
      db.prepare('UPDATE tasks SET tokens_used = tokens_used + ?, estimated_cost = estimated_cost + ? WHERE id = ?')
        .run(tokensIn + tokensOut, cost, taskId)
    }

    const msg = response.choices?.[0]?.message || {}

    // Parse native tool_calls if present
    const nativeToolCalls = (msg.tool_calls || []).map(tc => ({
      name: tc.function?.name,
      args: (() => { try { return JSON.parse(tc.function?.arguments || '{}') } catch { return {} } })(),
      raw: `${tc.function?.name}(${tc.function?.arguments || '{}'})`,
      native: true,
    })).filter(tc => tc.name)

    return {
      content: [{ type: 'text', text: msg.content || '' }],
      usage: { input_tokens: tokensIn, output_tokens: tokensOut },
      nativeToolCalls,
    }
  } catch (err) {
    if (err.name === 'AbortError' || err.message?.includes('aborted')) {
      throw new Error(`LLM_TIMEOUT: ${opts.model} call for ${agentId} timed out after 5 minutes`)
    }
    throw err
  } finally {
    clearTimeout(timeout)
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
// ██ TOOL REGISTRY — Real tools for agent execution   ██
// ══════════════════════════════════════════════════════

const TOOL_REGISTRY = [
  {
    name: 'get_quote',
    description: 'Get real-time stock quote with price, change, volume, market cap',
    params: { symbol: { type: 'string', required: true, description: 'Stock ticker (e.g. AAPL, SPY)' } },
    agents: ['scout', 'oracle'],
    execute: async (args) => await marketData.getQuote(args.symbol)
  },
  {
    name: 'get_history',
    description: 'Get historical OHLCV price bars for charting and analysis',
    params: {
      symbol: { type: 'string', required: true, description: 'Stock ticker' },
      period: { type: 'string', required: false, description: 'Time period: 1w, 1mo, 3mo, 6mo, 1y, 2y (default: 1y)' },
      interval: { type: 'string', required: false, description: 'Bar interval: 1d, 1wk (default: 1d)' }
    },
    agents: ['oracle'],
    execute: async (args) => {
      const data = await marketData.getHistory(args.symbol, args.period || '1y', args.interval || '1d')
      return data.slice(-60)
    }
  },
  {
    name: 'get_indicators',
    description: 'Get technical indicators: RSI14, MACD, SMA20/50/200, EMA12/26, Bollinger Bands, trend signal',
    params: { symbol: { type: 'string', required: true, description: 'Stock ticker' } },
    agents: ['scout', 'oracle'],
    execute: async (args) => await marketData.getIndicators(args.symbol)
  },
  {
    name: 'search_symbols',
    description: 'Search for stock tickers by company name',
    params: { query: { type: 'string', required: true, description: 'Search query (e.g. "Tesla", "artificial intelligence")' } },
    agents: ['scout', 'oracle'],
    execute: async (args) => await marketData.searchSymbols(args.query)
  },
  {
    name: 'run_backtest',
    description: 'Backtest a saved strategy on a symbol. Returns Sharpe ratio, win rate, max drawdown, total return, trade count',
    params: {
      strategyId: { type: 'string', required: true, description: 'Strategy ID from strategies table' },
      symbol: { type: 'string', required: false, description: 'Ticker to test on (default: SPY)' },
      period: { type: 'string', required: false, description: 'Backtest period (default: 1y)' }
    },
    agents: ['oracle'],
    execute: async (args) => await backtest.runBacktest(args.strategyId, args.symbol || 'SPY', args.period || '1y')
  },
  {
    name: 'run_walkforward',
    description: 'Walk-forward validation with 70/30 train/test split. Detects overfitting.',
    params: {
      strategyId: { type: 'string', required: true, description: 'Strategy ID' },
      symbol: { type: 'string', required: false, description: 'Ticker (default: SPY)' },
      period: { type: 'string', required: false, description: 'Period (default: 2y)' }
    },
    agents: ['oracle'],
    execute: async (args) => await backtest.runWalkForwardBacktest(args.strategyId, args.symbol || 'SPY', args.period || '2y')
  },
  {
    name: 'place_order',
    description: 'Place a paper trade order on Alpaca. Returns trade ID and status.',
    params: {
      symbol: { type: 'string', required: true, description: 'Stock ticker' },
      qty: { type: 'number', required: true, description: 'Number of shares' },
      side: { type: 'string', required: true, description: 'buy or sell' },
      type: { type: 'string', required: false, description: 'market or limit (default: market)' },
      limitPrice: { type: 'number', required: false, description: 'Limit price (required for limit orders)' },
      strategyId: { type: 'string', required: false, description: 'Strategy ID for attribution' }
    },
    agents: ['oracle'],
    execute: async (args) => await breakers.alpaca.call(() => broker.placeOrder(args))
  },
  {
    name: 'get_positions',
    description: 'Get all open positions with P&L',
    params: {},
    agents: ['oracle'],
    execute: async () => await breakers.alpaca.call(() => broker.getPositions())
  },
  {
    name: 'get_account',
    description: 'Get account info: equity, buying power, cash, day P&L',
    params: {},
    agents: ['oracle'],
    execute: async () => await breakers.alpaca.call(() => broker.getAccount())
  },
  {
    name: 'close_position',
    description: 'Close a specific open position',
    params: { symbol: { type: 'string', required: true, description: 'Ticker to close' } },
    agents: ['oracle'],
    execute: async (args) => await breakers.alpaca.call(() => broker.closePosition(args.symbol))
  },
  {
    name: 'close_all_positions',
    description: 'Close ALL open positions immediately',
    params: {},
    agents: ['oracle'],
    execute: async () => await breakers.alpaca.call(() => broker.closeAllPositions())
  },
  {
    name: 'is_market_open',
    description: 'Check if US stock market is currently open',
    params: {},
    agents: ['oracle'],
    execute: async () => await breakers.alpaca.call(() => broker.isMarketOpen())
  },
  {
    name: 'get_orders',
    description: 'Get recent orders with status',
    params: { status: { type: 'string', required: false, description: 'Filter: open, closed, all (default: all)' } },
    agents: ['oracle'],
    execute: async (args) => await breakers.alpaca.call(() => broker.getOrders(args.status || 'all'))
  },
  {
    name: 'analyze_symbol',
    description: 'Run multi-lens AI analysis with 5 analyst personas (Value, Momentum, Contrarian, Technical, Risk). Returns composite signal and trade recommendation.',
    params: { symbol: { type: 'string', required: true, description: 'Stock ticker to analyze' } },
    agents: ['oracle'],
    execute: async (args) => await analysis.analyzeSymbol(args.symbol, callClaude, 'oracle')
  },
  {
    name: 'compute_trade_constraints',
    description: 'Get position sizing limits: max shares, max USD, stop loss price, daily trades remaining',
    params: {
      symbol: { type: 'string', required: true, description: 'Stock ticker' },
      side: { type: 'string', required: false, description: 'buy or sell (default: buy)' }
    },
    agents: ['oracle'],
    execute: async (args) => await analysis.computeTradeConstraints(args.symbol, args.side || 'buy')
  },
  {
    name: 'evaluate_ensemble',
    description: 'Evaluate all approved strategies on a symbol. Returns weighted composite signal.',
    params: { symbol: { type: 'string', required: true, description: 'Stock ticker' } },
    agents: ['oracle'],
    execute: async (args) => await analysis.evaluateEnsemble(args.symbol)
  },
  {
    name: 'list_strategies',
    description: 'List trading strategies filtered by status',
    params: { status: { type: 'string', required: false, description: 'Filter: discovered, backtesting, paper_testing, approved, deployed, retired (default: all)' } },
    agents: ['scout', 'oracle', 'nexus'],
    execute: async (args) => {
      if (args.status) {
        return db.prepare('SELECT id, name, type, status, description, entry_conditions, exit_conditions, indicators, stop_loss_percent, created_at FROM strategies WHERE status = ? ORDER BY created_at DESC LIMIT 20').all(args.status)
      }
      return db.prepare('SELECT id, name, type, status, description, entry_conditions, exit_conditions, indicators, stop_loss_percent, created_at FROM strategies ORDER BY created_at DESC LIMIT 20').all()
    }
  },
  {
    name: 'save_strategy',
    description: 'Save a newly discovered trading strategy',
    params: {
      name: { type: 'string', required: true, description: 'Strategy name' },
      type: { type: 'string', required: true, description: 'Type: momentum, mean_reversion, breakout, trend_following, etc.' },
      description: { type: 'string', required: true, description: 'What the strategy does' },
      entry_conditions: { type: 'string', required: true, description: 'JSON string of entry rules' },
      exit_conditions: { type: 'string', required: true, description: 'JSON string of exit rules' },
      indicators: { type: 'string', required: true, description: 'Comma-separated indicator list' },
      stop_loss_percent: { type: 'number', required: false, description: 'Stop loss % (default: 5)' },
      source: { type: 'string', required: false, description: 'Where found: github, reddit, x, original' },
      source_url: { type: 'string', required: false, description: 'URL of source' }
    },
    agents: ['scout'],
    execute: async (args) => {
      const id = uuid()
      db.prepare('INSERT INTO strategies (id, name, type, description, entry_conditions, exit_conditions, indicators, stop_loss_percent, source, source_url, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        id, args.name, args.type, args.description, args.entry_conditions, args.exit_conditions, args.indicators, args.stop_loss_percent || 5, args.source || 'original', args.source_url || '', 'discovered'
      )
      return { id, name: args.name, status: 'discovered', message: 'Strategy saved. It will be auto-backtested.' }
    }
  },
  {
    name: 'web_search',
    description: 'Search the web for information. Returns summarized results with source URLs. Use this for ANY research task.',
    params: {
      query: { type: 'string', required: true, description: 'Search query (be specific and detailed)' },
      focus: { type: 'string', required: false, description: 'Focus area: general, trading, github, reddit (default: general)' }
    },
    agents: ['scout', 'nexus', 'forge'],
    execute: async (args) => {
      try {
        const searchResponse = await openai.chat.completions.create({
          model: 'perplexity/sonar-pro',
          messages: [
            { role: 'system', content: 'You are a research assistant. Search the web and return factual, detailed results. Include source URLs when available. Format as structured data.' },
            { role: 'user', content: `Search for: ${args.query}${args.focus ? ` (focus on ${args.focus})` : ''}\n\nReturn the top findings as a JSON array: [{"title":"...","summary":"...","url":"...","relevance":"high/medium/low"}]` }
          ],
          max_tokens: 2000,
        })
        return { query: args.query, results: searchResponse.choices?.[0]?.message?.content || 'No results' }
      } catch (e) {
        return { query: args.query, error: e.message }
      }
    }
  },
  {
    name: 'create_task',
    description: 'Create a new task for any agent',
    params: {
      agent_id: { type: 'string', required: true, description: 'Agent to assign: scout, forge, quill, dealer, oracle, nexus' },
      title: { type: 'string', required: true, description: 'Task title' },
      description: { type: 'string', required: true, description: 'Task details' },
      priority: { type: 'string', required: false, description: 'low, medium, high, critical (default: medium)' }
    },
    agents: ['nexus', 'scout', 'forge', 'quill', 'dealer', 'oracle'],
    execute: async (args, ctx) => {
      const id = uuid()
      const parentId = ctx?.taskId || ''
      db.prepare('INSERT INTO tasks (id, title, description, agent_id, priority, status, spawned_by) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        id, args.title, args.description, args.agent_id, args.priority || 'medium', 'todo', parentId
      )
      if (args.agent_id) setTimeout(() => processAgentQueue(args.agent_id), 3000)
      return { id, title: args.title, agent_id: args.agent_id, status: 'todo', spawned_by: parentId, message: 'Task created and queued — will auto-run.' }
    }
  },
  {
    name: 'list_tasks',
    description: 'List recent tasks, optionally filtered by agent or status',
    params: {
      agent_id: { type: 'string', required: false, description: 'Filter by agent' },
      status: { type: 'string', required: false, description: 'Filter: todo, in_progress, done, failed' },
      limit: { type: 'number', required: false, description: 'Max results (default: 20)' }
    },
    agents: ['nexus'],
    execute: async (args) => {
      const conditions = []
      const params = []
      if (args.agent_id) { conditions.push('agent_id = ?'); params.push(args.agent_id) }
      if (args.status) { conditions.push('status = ?'); params.push(args.status) }
      const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''
      const limit = args.limit || 20
      return db.prepare(`SELECT id, title, agent_id, status, priority, output, created_at, completed_at FROM tasks ${where} ORDER BY created_at DESC LIMIT ?`).all(...params, limit)
    }
  },
  {
    name: 'write_file',
    description: 'Write content to a file in the workspace. For building code, scripts, templates, content.',
    params: {
      path: { type: 'string', required: true, description: 'File path relative to workspace (e.g. "output/landing-page.html")' },
      content: { type: 'string', required: true, description: 'File content to write' }
    },
    agents: ['forge', 'quill'],
    execute: async (args) => {
      const safePath = args.path.replace(/\.\./g, '').replace(/^\//, '')
      const outputDir = join(__dirname, '..', 'workspace')
      const fullPath = join(outputDir, safePath)
      const dir = dirname(fullPath)
      mkdirSync(dir, { recursive: true })
      writeFileSync(fullPath, args.content, 'utf8')
      return { path: safePath, size: args.content.length, message: `File written: ${safePath}` }
    }
  },
  {
    name: 'read_file',
    description: 'Read a file from the workspace.',
    params: { path: { type: 'string', required: true, description: 'File path relative to workspace' } },
    agents: ['forge', 'quill', 'nexus'],
    execute: async (args) => {
      const safePath = args.path.replace(/\.\./g, '').replace(/^\//, '')
      const fullPath = join(__dirname, '..', 'workspace', safePath)
      try {
        const content = readFileSync(fullPath, 'utf8')
        return { path: safePath, content: content.slice(0, 10000) }
      } catch { return { error: `File not found: ${safePath}` } }
    }
  },
  {
    name: 'send_email',
    description: 'Send an email (for outreach, notifications, reports)',
    params: {
      to: { type: 'string', required: true, description: 'Recipient email address' },
      subject: { type: 'string', required: true, description: 'Email subject line' },
      body: { type: 'string', required: true, description: 'Email body (HTML or plain text)' }
    },
    agents: ['dealer', 'quill'],
    execute: async (args) => {
      const sanitize = (str) => String(str || '').replace(/[\r\n]/g, ' ').trim()
      const to = sanitize(args.to)
      const subject = sanitize(args.subject)
      try {
        await email.sendCustomEmail(to, subject, args.body)
        return { sent: true, to, subject }
      } catch (e) {
        return { sent: false, error: e.message }
      }
    }
  },
  {
    name: 'read_memory',
    description: 'Read an agent\'s persistent memory/learnings file',
    params: { agent_id: { type: 'string', required: true, description: 'Agent ID to read memory for' } },
    agents: ['nexus'],
    execute: async (args) => {
      const memPath = join(__dirname, '..', 'memory', `${args.agent_id}.md`)
      try { return readFileSync(memPath, 'utf8') } catch { return 'No memory file found.' }
    }
  },
  {
    name: 'log_revenue',
    description: 'Record revenue earned from a sale, affiliate commission, client payment, or trading profit',
    params: {
      amount: { type: 'number', required: true, description: 'Revenue amount in USD' },
      source: { type: 'string', required: true, description: 'Revenue source: affiliate, freelance, product, trading, consulting' },
      notes: { type: 'string', required: false, description: 'Details about the revenue' }
    },
    agents: ['scout', 'forge', 'quill', 'dealer', 'oracle', 'nexus'],
    execute: async (args, ctx) => {
      const id = uuid()
      db.prepare('INSERT INTO revenue_entries (id, title, amount, source, agent_id, task_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        id, `${args.source}: $${args.amount}`, args.amount, args.source, ctx?.agentId || '', ctx?.taskId || '', args.notes || ''
      )
      return { id, amount: args.amount, source: args.source, message: `Revenue logged: $${args.amount} from ${args.source}` }
    }
  },
  {
    name: 'request_approval',
    description: 'Pause execution and request human approval before proceeding with a sensitive action (e.g. large spend, live deployment)',
    params: {
      reason: { type: 'string', required: true, description: 'Why approval is needed' },
      action_summary: { type: 'string', required: true, description: 'What you want to do next' }
    },
    agents: ['scout', 'forge', 'quill', 'dealer', 'oracle', 'nexus'],
    execute: async (args, ctx) => {
      if (ctx?.taskId) {
        db.prepare("UPDATE tasks SET status = 'paused', updated_at = datetime('now') WHERE id = ?").run(ctx.taskId)
        db.prepare('INSERT INTO task_logs (task_id, agent_id, message, type) VALUES (?, ?, ?, ?)')
          .run(ctx.taskId, ctx?.agentId || '', `⏸️ Approval requested: ${args.reason}\nProposed action: ${args.action_summary}`, 'warning')
        sendPushToAll({ title: '⏸️ Approval Needed', body: `${args.reason}: ${args.action_summary}`, tag: `approval-${ctx.taskId}` })
        email.sendApprovalEmail({ id: ctx.taskId, title: args.action_summary }, { name: ctx?.agentId || 'Agent' }).catch(() => {})
      }
      return { paused: true, message: 'Task paused — waiting for human approval. Execution will resume from checkpoint when approved.' }
    }
  },
  {
    name: 'store_memory',
    description: 'Save an important learning or insight to semantic memory for future retrieval',
    params: {
      content: { type: 'string', required: true, description: 'The learning/insight to remember (be specific and concise)' },
      tags: { type: 'string', required: false, description: 'Comma-separated tags for categorization' }
    },
    agents: ['scout', 'forge', 'quill', 'dealer', 'oracle', 'nexus'],
    execute: async (args, ctx) => {
      const tags = (args.tags || '').split(',').map(t => t.trim()).filter(Boolean)
      const stored = await storeMemoryEmbedding(ctx?.agentId || '', args.content, ctx?.taskId || '', tags)
      return stored ? { stored: true, message: 'Memory saved successfully' } : { stored: false, message: 'Failed to generate embedding' }
    }
  },
  {
    name: 'recall_memory',
    description: 'Search your own memory for relevant past learnings related to a topic',
    params: {
      query: { type: 'string', required: true, description: 'What to search for in memory' }
    },
    agents: ['scout', 'forge', 'quill', 'dealer', 'oracle', 'nexus'],
    execute: async (args, ctx) => {
      const results = await searchMemoryEmbeddings(ctx?.agentId || '', args.query, 5)
      if (results.length === 0) return { results: [], message: 'No relevant memories found' }
      return { results, message: `Found ${results.length} relevant memories` }
    }
  },
  {
    name: 'recall_hive_memory',
    description: 'Search ALL agents memory for cross-team knowledge on a topic',
    params: {
      query: { type: 'string', required: true, description: 'What to search for across all agents' }
    },
    agents: ['scout', 'forge', 'quill', 'dealer', 'oracle', 'nexus'],
    execute: async (args) => {
      const results = await searchMemoryEmbeddings(null, args.query, 5)
      if (results.length === 0) return { results: [], message: 'No relevant memories found across agents' }
      return { results, message: `Found ${results.length} memories across agents` }
    }
  },
  {
    name: 'http_request',
    description: 'Make HTTP requests to external APIs and URLs',
    params: {
      url: { type: 'string', description: 'URL to request', required: true },
      method: { type: 'string', description: 'HTTP method (GET, POST, PUT, DELETE)', required: false },
      headers: { type: 'object', description: 'Request headers as JSON object', required: false },
      body: { type: 'object', description: 'Request body as JSON object', required: false }
    },
    agents: ['scout', 'forge', 'quill', 'dealer', 'oracle', 'nexus'],
    execute: async (args) => {
      const url = args.url
      if (!url) return { error: 'url is required' }
      const blocked = /^https?:\/\/(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/i
      if (blocked.test(url)) return { error: 'Internal URLs are blocked' }
      const method = (args.method || 'GET').toUpperCase()
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30000)
      try {
        const opts = { method, signal: controller.signal, headers: { 'User-Agent': 'Hive/1.0' } }
        if (args.headers) Object.assign(opts.headers, args.headers)
        if (args.body && ['POST', 'PUT', 'PATCH'].includes(method)) {
          opts.body = JSON.stringify(args.body)
          opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/json'
        }
        const resp = await fetch(url, opts)
        const text = await resp.text()
        return { status: resp.status, body: text.slice(0, 10000) }
      } catch (e) {
        return { error: e.message }
      } finally {
        clearTimeout(timeout)
      }
    }
  },
  {
    name: 'list_workspace',
    description: 'List files and directories in the workspace',
    params: {
      path: { type: 'string', description: 'Subdirectory path within workspace (optional)', required: false }
    },
    agents: ['forge', 'quill', 'nexus'],
    execute: async (args) => {
      const { readdirSync, statSync, mkdirSync } = await import('fs')
      const { join, resolve } = await import('path')
      const wsRoot = resolve('workspace')
      try { mkdirSync(wsRoot, { recursive: true }) } catch {}
      const subpath = (args.path || '').replace(/\.\./g, '').replace(/^\//, '')
      const target = resolve(wsRoot, subpath)
      if (!target.startsWith(wsRoot)) return { error: 'Path outside workspace' }
      try {
        const entries = readdirSync(target).map(name => {
          try {
            const s = statSync(join(target, name))
            return { name, type: s.isDirectory() ? 'dir' : 'file', size: s.size, modified: s.mtime.toISOString() }
          } catch { return { name, type: 'unknown' } }
        })
        return { path: subpath || '/', entries }
      } catch (e) {
        return { error: e.message }
      }
    }
  },
  {
    name: 'execute_code',
    description: 'Execute Node.js code in the workspace directory',
    params: {
      code: { type: 'string', description: 'JavaScript code to execute', required: true }
    },
    agents: ['forge'],
    execute: async (args) => {
      if (!args.code) return { error: 'code is required' }
      const { execSync } = await import('child_process')
      const { resolve, join } = await import('path')
      const { writeFileSync, mkdirSync, unlinkSync } = await import('fs')
      const wsRoot = resolve('workspace')
      try { mkdirSync(wsRoot, { recursive: true }) } catch {}
      const tmpFile = join(wsRoot, `_exec_${Date.now()}.js`)
      try {
        writeFileSync(tmpFile, args.code)
        const result = execSync(`node "${tmpFile}"`, {
          cwd: wsRoot,
          timeout: 10000,
          maxBuffer: 1024 * 1024,
          encoding: 'utf-8',
          env: {
            PATH: process.env.PATH,
            NODE_PATH: process.env.NODE_PATH,
            HOME: wsRoot,
            NODE_NO_WARNINGS: '1',
            HTTP_PROXY: 'http://0.0.0.0:1',
            HTTPS_PROXY: 'http://0.0.0.0:1',
            NO_PROXY: '',
          }
        })
        return { stdout: (result || '').slice(0, 10000), exitCode: 0 }
      } catch (e) {
        return { stdout: (e.stdout || '').slice(0, 5000), stderr: (e.stderr || '').slice(0, 5000), exitCode: e.status || 1 }
      } finally {
        try { unlinkSync(tmpFile) } catch {}
      }
    }
  },
  {
    name: 'delete_file',
    description: 'Delete a file from the workspace directory',
    params: {
      path: { type: 'string', description: 'File path within workspace to delete', required: true }
    },
    agents: ['forge', 'nexus'],
    execute: async (args) => {
      if (!args.path) return { error: 'path is required' }
      const { unlinkSync } = await import('fs')
      const { resolve } = await import('path')
      const wsRoot = resolve('workspace')
      const safePath = (args.path || '').replace(/\.\./g, '').replace(/^\//, '')
      const target = resolve(wsRoot, safePath)
      if (!target.startsWith(wsRoot)) return { error: 'Path outside workspace' }
      try {
        unlinkSync(target)
        return { deleted: true, path: safePath }
      } catch (e) {
        return { error: e.message }
      }
    }
  },
  {
    name: 'search_knowledge',
    description: 'Search the knowledge base for relevant information on a topic',
    params: {
      query: { type: 'string', description: 'Search query', required: true },
      top_k: { type: 'number', description: 'Number of results (default 5)', required: false }
    },
    agents: ['scout', 'forge', 'quill', 'dealer', 'oracle', 'nexus'],
    execute: async (args) => {
      if (!args.query) return { error: 'query is required' }
      const results = await searchKnowledge(args.query, args.top_k || 5)
      return { results: results.map(r => ({ content: r.content, score: r.score })) }
    }
  }
]

function getAgentTools(agentId) {
  return TOOL_REGISTRY.filter(t => t.agents.includes(agentId))
}

function buildToolsPrompt(agentId) {
  const tools = getAgentTools(agentId)
  if (tools.length === 0) return ''

  let prompt = `\n\n## Available Tools

You have REAL tools. USE THEM to get real data and take real actions.

**SYNTAX — you MUST use this EXACT format:**
[TOOL:tool_name]{"param":"value"}[/TOOL]

**Example calls:**
[TOOL:get_quote]{"symbol":"AAPL"}[/TOOL]
[TOOL:list_strategies]{"status":"discovered"}[/TOOL]
[TOOL:save_strategy]{"name":"RSI Divergence","type":"mean_reversion","description":"Buy on bullish RSI divergence","entry_conditions":"[{\\"indicator\\":\\"rsi\\",\\"op\\":\\"<\\",\\"value\\":30}]","exit_conditions":"[{\\"indicator\\":\\"rsi\\",\\"op\\":\\">\\",\\"value\\":70}]","indicators":"RSI","source":"reddit"}[/TOOL]

After each tool call, you will receive a result like:
[TOOL_RESULT:get_quote]{"symbol":"AAPL","price":182.50,"change":1.2}[/TOOL_RESULT]

Then continue working with that data.

### Your Tools:\n`

  for (const tool of tools) {
    const paramList = Object.entries(tool.params).map(([k, v]) => `${k} (${v.type}${v.required ? ', required' : ''}) — ${v.description}`).join('; ')
    prompt += `- **${tool.name}** — ${tool.description}\n  Params: ${paramList || 'none'}\n`
  }

  prompt += `
### MANDATORY Rules — You MUST follow these:
1. Your FIRST response MUST contain at least one [TOOL:...] call. Text-only responses are REJECTED.
2. The format is [TOOL:name]{"key":"value"}[/TOOL] — square brackets, colon, name, then JSON args, then [/TOOL].
3. DO NOT write plans, analyses, or reports without calling tools first. Get real data, then analyze.
4. After getting tool results, take the NEXT action — don't just summarize what you got. Use create_task to delegate follow-up work.
5. You can call multiple tools per step, each on its own line.
6. If your task says "research X" → call web_search. If it says "build X" → call write_file. If it says "email X" → call send_email. If it says "analyze X" → call get_quote/get_indicators. ALWAYS match task type to tool.
7. When you find an opportunity, DON'T just describe it — create_task to assign the next step to the right agent.
`

  return prompt
}

// Build OpenAI-format function calling schema for models that support it
function buildToolsSchema(agentId) {
  const tools = getAgentTools(agentId)
  return tools.map(tool => {
    const properties = {}
    const required = []
    for (const [name, schema] of Object.entries(tool.params)) {
      properties[name] = { type: schema.type || 'string', description: schema.description || '' }
      if (schema.required) required.push(name)
    }
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: { type: 'object', properties, required }
      }
    }
  })
}

function parseToolCalls(text) {
  const toolCalls = []

  // Primary pattern: [TOOL:name]{"param":"value"}[/TOOL]
  const regex = /\[TOOL:\s*(\w+)\s*\]([\s\S]*?)\[\/TOOL\]/g
  let match
  while ((match = regex.exec(text)) !== null) {
    const parsed = tryParseArgs(match[2])
    toolCalls.push({ name: match[1], args: parsed.args, raw: match[0], parseError: parsed.error })
  }

  // Fallback: some models use ```tool or <tool> syntax
  if (toolCalls.length === 0) {
    // Try: TOOL:name followed by JSON on next line
    const altRegex = /TOOL:\s*(\w+)\s*[\]\)>}]?\s*[\n\r]*\s*(\{[^}]+\})/g
    while ((match = altRegex.exec(text)) !== null) {
      const parsed = tryParseArgs(match[2])
      if (!parsed.error) toolCalls.push({ name: match[1], args: parsed.args, raw: match[0] })
    }
  }

  // Second fallback: detect tool names in text + nearby JSON objects
  if (toolCalls.length === 0) {
    const toolNames = TOOL_REGISTRY.map(t => t.name)
    for (const toolName of toolNames) {
      // Look for patterns like: get_quote({"symbol":"AAPL"}) or get_quote {"symbol":"AAPL"}
      const fnRegex = new RegExp(`\\b${toolName}\\s*[\\(\\{]`, 'g')
      let fnMatch
      while ((fnMatch = fnRegex.exec(text)) !== null) {
        // Find the JSON object starting near this position
        const searchStart = fnMatch.index + toolName.length
        const rest = text.slice(searchStart)
        const jsonMatch = rest.match(/\{[^{}]*\}/)
        if (jsonMatch) {
          const parsed = tryParseArgs(jsonMatch[0])
          if (!parsed.error) {
            // Avoid duplicates
            const isDup = toolCalls.some(tc => tc.name === toolName && JSON.stringify(tc.args) === JSON.stringify(parsed.args))
            if (!isDup) toolCalls.push({ name: toolName, args: parsed.args, raw: `${toolName}(${jsonMatch[0]})` })
          }
        }
      }
    }
  }

  return toolCalls
}

function tryParseArgs(text) {
  const trimmed = (text || '').trim()
  if (!trimmed || trimmed === '{}') return { args: {}, error: null }
  try {
    return { args: JSON.parse(trimmed), error: null }
  } catch (e) {
    try {
      const cleaned = trimmed.replace(/'/g, '"').replace(/,\s*\}/g, '}')
      return { args: JSON.parse(cleaned), error: null }
    } catch {
      return { args: {}, error: e.message }
    }
  }
}

// ── Guardrails: validate tool calls before execution ──
function validateToolCall(toolCall, agentId, taskId) {
  const rules = []

  if (toolCall.name === 'send_email') {
    const body = (toolCall.args.body || '') + ' ' + (toolCall.args.subject || '')
    // PII patterns: SSN, credit cards
    if (/\b\d{3}-\d{2}-\d{4}\b/.test(body)) rules.push({ rule: 'pii_ssn', action: 'blocked', details: 'Email body contains SSN pattern' })
    if (/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/.test(body)) rules.push({ rule: 'pii_cc', action: 'blocked', details: 'Email body contains credit card pattern' })
  }

  if (toolCall.name === 'place_order') {
    const maxPosition = parseFloat(getSetting('max_position_size_usd') || '1000')
    const qty = parseFloat(toolCall.args.qty || 0)
    const price = parseFloat(toolCall.args.limitPrice || 0)
    if (price > 0 && qty * price > maxPosition) {
      rules.push({ rule: 'trade_size', action: 'blocked', details: `Position $${(qty * price).toFixed(0)} exceeds max $${maxPosition}` })
    }
    const maxDaily = parseInt(getSetting('max_daily_trades') || '20')
    const today = new Date().toISOString().slice(0, 10)
    const todayTrades = db.prepare("SELECT COUNT(*) as c FROM trades WHERE created_at >= ?").get(today + 'T00:00:00')?.c || 0
    if (todayTrades >= maxDaily) {
      rules.push({ rule: 'daily_trade_limit', action: 'blocked', details: `${todayTrades}/${maxDaily} daily trades reached` })
    }
  }

  if (toolCall.name === 'write_file') {
    const path = (toolCall.args.path || '').toLowerCase()
    if (path.includes('..') || path.startsWith('/etc') || path.startsWith('/usr') || path.startsWith('/var') || path.startsWith('/root')) {
      rules.push({ rule: 'path_traversal', action: 'blocked', details: `Dangerous file path: ${path}` })
    }
    if (/\.(env|key|pem|crt|p12|pfx)$/i.test(path)) {
      rules.push({ rule: 'sensitive_file', action: 'blocked', details: `Sensitive file type: ${path}` })
    }
  }

  if (toolCall.name === 'create_task') {
    const pendingCount = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status IN ('todo','in_progress')").get()?.c || 0
    if (pendingCount >= 20) {
      rules.push({ rule: 'queue_overflow', action: 'blocked', details: `${pendingCount} tasks already queued (max 20)` })
    }
  }

  // Log all guardrail events
  for (const r of rules) {
    db.prepare('INSERT INTO guardrail_events (task_id, agent_id, tool_name, rule, action, details) VALUES (?, ?, ?, ?, ?, ?)')
      .run(taskId || '', agentId || '', toolCall.name, r.rule, r.action, r.details)
  }

  const blocked = rules.find(r => r.action === 'blocked')
  if (blocked) return { allowed: false, reason: blocked.details }
  return { allowed: true, reason: null }
}

async function executeTool(toolCall, agentId, taskId) {
  const tool = TOOL_REGISTRY.find(t => t.name === toolCall.name)
  if (!tool) return { name: toolCall.name, error: `Unknown tool: ${toolCall.name}` }
  if (!tool.agents.includes(agentId)) return { name: toolCall.name, error: `Agent ${agentId} is not authorized to use ${toolCall.name}` }
  if (toolCall.parseError) return { name: toolCall.name, error: `Invalid JSON args: ${toolCall.parseError}` }

  // Guardrails check
  const guard = validateToolCall(toolCall, agentId, taskId)
  if (!guard.allowed) return { name: toolCall.name, error: `Guardrail: ${guard.reason}` }

  for (const [param, schema] of Object.entries(tool.params)) {
    if (schema.required && (toolCall.args[param] === undefined || toolCall.args[param] === null)) {
      return { name: toolCall.name, error: `Missing required param: ${param}` }
    }
  }

  try {
    const result = await Promise.race([
      tool.execute(toolCall.args, { agentId, taskId }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Tool execution timed out (30s)')), 30000))
    ])
    let resultStr = JSON.stringify(result, null, 0)
    if (resultStr.length > 10000) resultStr = resultStr.slice(0, 10000) + '...(truncated)'
    return { name: toolCall.name, resultStr }
  } catch (e) {
    return { name: toolCall.name, error: e.message }
  }
}

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
      model: getSmartModel(agent.id),
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

    log('info', 'queue_auto_run', { taskId: nextTask.id, agentId, title: nextTask.title })

    try {
      const PORT = process.env.API_PORT || process.env.PORT || 3002
      const headers = { 'Content-Type': 'application/json' }
      if (API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`
      const resp = await fetch(`http://localhost:${PORT}/api/tasks/${nextTask.id}/run`, { method: 'POST', headers })
      if (!resp.ok) {
        // Mark task as failed to prevent infinite retry loop
        const errText = await resp.text().catch(() => 'unknown error')
        log('error', 'queue_auto_run_failed', { taskId: nextTask.id, agentId, title: nextTask.title, status: resp.status, error: errText.slice(0, 200) })
        db.prepare("UPDATE tasks SET status = 'failed', error = ?, updated_at = datetime('now') WHERE id = ? AND status = 'todo'")
          .run(`Queue auto-run failed: ${resp.status}`, nextTask.id)
      }
    } catch (e) {
      log('error', 'queue_auto_run_failed', { agentId, error: e.message })
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
      model: getSmartModel(toAgentId),
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
    log('error', 'consultation_failed', { fromAgent: fromAgent.id, toAgent: toAgentId, error: err.message })
    return null
  }
}


// ── Auto Task Generation ────────────────────────────
async function generateFollowUpTasks(completedTask, agent, output) {
  try {
    // Cap: don't generate more if queue is already full
    const pendingCount = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status IN ('todo', 'in_progress')").get().c
    if (pendingCount >= 15) {
      console.log(`⏸️ Skipping follow-up generation — ${pendingCount} tasks already pending (max 15)`)
      return
    }

    const allTasks = db.prepare('SELECT title, status, agent_id FROM tasks ORDER BY created_at DESC LIMIT 30').all()
    const taskContext = allTasks.map(t => `- [${t.status}] ${t.title}`).join('\n')

    const response = await callClaude({
      model: getSmartModel('nexus'),
      max_tokens: 300,
      system: `You are a task planner for Hive, an AI agent team. Generate exactly 1 follow-up task.

Available agents:
${agents.map(a => `- ${a.id}: ${a.name} — ${a.role}`).join('\n')}

Rules:
- Generate EXACTLY 1 task, not 2 or 3
- The task must be DIRECTLY actionable — not "research" or "analyze" unless that research produces a specific deliverable
- Do NOT create tasks similar to any existing task in the list below
- Do NOT create meta-tasks (tracking systems, dashboards, frameworks, playbooks)
- Focus on tasks that DIRECTLY generate income: place a trade, submit a proposal, publish content, build a product

Respond with ONLY valid JSON array with 1 object: [{title, description, agent_id, priority}]`,
      messages: [{
        role: 'user',
        content: `Completed: "${completedTask.title}" by ${agent.name}

Output (first 1000 chars):
${output.slice(0, 1000)}

Existing tasks (DO NOT duplicate):
${taskContext}

Generate 1 follow-up task:`
      }]
    }, agent.id, completedTask.id)

    const text = response.content.map(b => b.type === 'text' ? b.text : '').join('')
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return

    const newTasks = JSON.parse(jsonMatch[0])
    const t = newTasks[0]
    if (!t?.title) return

    const validAgent = agents.find(a => a.id === t.agent_id)
    if (!validAgent) return

    // Dedup: check for similar titles
    const existingTitles = allTasks.map(t => t.title.toLowerCase())
    const newTitleLower = t.title.toLowerCase()
    const isDuplicate = existingTitles.some(existing => {
      const words = newTitleLower.split(/\s+/)
      const matchCount = words.filter(w => w.length > 3 && existing.includes(w)).length
      return matchCount >= Math.floor(words.length * 0.6)
    })
    if (isDuplicate) {
      console.log(`⏸️ Skipping duplicate follow-up: "${t.title}"`)
      return
    }

    const id = uuid()
    db.prepare(`INSERT INTO tasks (id, title, description, priority, agent_id, status) VALUES (?, ?, ?, ?, ?, 'todo')`)
      .run(id, t.title, t.description || '', t.priority || 'medium', t.agent_id)

    db.prepare('INSERT INTO messages (sender_id, sender_name, sender_avatar, sender_color, text) VALUES (?, ?, ?, ?, ?)')
      .run('system', '🧠 Task Planner', '🧠', '#a855f7', `Generated follow-up: ${t.title} → ${validAgent.name}`)

    console.log(`🧠 Follow-up: "${t.title}" → ${validAgent.name}`)
    setTimeout(() => processAgentQueue(t.agent_id), 5000)
  } catch (err) {
    log('error', 'auto_task_generation_failed', { taskId: task.id, agentId: agent.id, error: err.message })
  }
}

// ── Cross-Session Task Chains (Auto Follow-Up Scheduling) ──
async function checkAutoChain(completedTask, output) {
  try {
    if (!output || output.length < 100) return

    const chainPatterns = [
      { match: /research|discover|find|scan/i, followAgent: 'quill', prefix: 'Write content about' },
      { match: /write|content|blog|post/i, followAgent: 'dealer', prefix: 'Promote and distribute' },
      { match: /build|create|develop|code/i, followAgent: 'quill', prefix: 'Write documentation for' },
      { match: /analyze|analysis|review/i, followAgent: 'forge', prefix: 'Build tool based on' },
    ]

    const title = completedTask.title || ''
    const matchedPattern = chainPatterns.find(p => p.match.test(title))
    if (!matchedPattern) return

    const autoChainEnabled = getSetting('auto_chain_enabled')
    if (autoChainEnabled === 'false') return

    const pendingCount = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE agent_id = ? AND status IN ('backlog','todo')").get(matchedPattern.followAgent)
    if (pendingCount.c > 5) return

    const chainId = uuid()
    const chainTitle = `${matchedPattern.prefix}: ${title.slice(0, 80)}`
    const chainDesc = `Auto-chained from task ${completedTask.id}.\n\nPrevious output summary:\n${output.slice(0, 2000)}`

    db.prepare("INSERT INTO tasks (id, title, description, agent_id, status, spawned_by) VALUES (?, ?, ?, ?, 'backlog', ?)")
      .run(chainId, chainTitle, chainDesc, matchedPattern.followAgent, completedTask.id)

    log('info', 'auto_chain_created', {
      sourceTask: completedTask.id,
      chainTask: chainId,
      fromAgent: completedTask.agent_id,
      toAgent: matchedPattern.followAgent
    })

    db.prepare('INSERT INTO messages (sender_id, sender_name, sender_avatar, sender_color, text) VALUES (?, ?, ?, ?, ?)')
      .run('system', '🔗 Auto-Chain', '🔗', '#06b6d4', `Chained: ${chainTitle} → ${matchedPattern.followAgent}`)

    traceBus.emit('task:update', { id: chainId, status: 'backlog', agent_id: matchedPattern.followAgent })
  } catch (err) {
    log('error', 'auto_chain_failed', { taskId: completedTask.id, error: err.message })
  }
}

// ── Heartbeat Output Parser — routes structured output to correct tables ────────
function parseHeartbeatOutput(task, output) {
  if (!output || !task.title) return
  const title = task.title.toLowerCase()

  function extractJSON(text) {
    const match = text.match(/\[[\s\S]*?\](?=\s*$|\s*```|\s*\n\n)/m)
    if (!match) return null
    try { return JSON.parse(match[0]) } catch { return null }
  }

  // Bot opportunity scan → bot_suggestions
  if (title.includes('bot opportunity') || title.includes('bot scan') || title.includes('bot idea')) {
    const items = extractJSON(output)
    if (items && Array.isArray(items)) {
      for (const item of items.slice(0, 5)) {
        try {
          db.prepare('INSERT OR IGNORE INTO bot_suggestions (id, name, type, description, audience, monetization, reasoning, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
            uuid(), item.name || item.title || 'Untitled', item.type || 'bot', item.description || '', item.audience || '', item.monetization || '', item.reasoning || '', 'scout-heartbeat'
          )
        } catch {}
      }
    }
  }

  // Feature discovery / UX review / Self-assessment → proposals
  if (title.includes('feature discovery') || title.includes('ux review') || title.includes('ux design') || title.includes('self-assessment') || title.includes('self assessment')) {
    const items = extractJSON(output)
    const proposalType = title.includes('ux') ? 'design' : title.includes('feature') ? 'feature' : 'prompt'
    if (items && Array.isArray(items)) {
      for (const item of items.slice(0, 5)) {
        try {
          createProposal({
            type: proposalType,
            title: item.title || item.name || 'Untitled',
            description: item.description || item.summary || '',
            proposed_by: task.agent_id || 'nexus',
            priority: item.priority || 'medium',
            source_task_id: task.id
          })
        } catch {}
      }
    }
  }

  // Skill discovery → auto-create skills
  if (title.includes('skill discovery') || title.includes('discover skill')) {
    const items = extractJSON(output)
    if (items && Array.isArray(items)) {
      for (const item of items.slice(0, 3)) {
        if (!item.name || !item.description) continue
        const slug = item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        try {
          db.prepare('INSERT OR IGNORE INTO skills (id, slug, name, description, skill_md, tags, source) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
            uuid(), slug, item.name, item.description, item.skill_md || item.instructions || `# ${item.name}\n\n${item.description}`, JSON.stringify(item.tags || []), 'custom'
          )
        } catch {}
      }
    }
  }
}

// ── Intel Extraction — Extract structured opportunities from Scout output ────
async function extractIntelItems(completedTask, output) {
  try {
    const response = await callClaude({
      model: getSmartModel('scout'),
      max_tokens: 2048,
      system: `You extract structured intelligence items from Scout research output. Return a JSON array of opportunities found. Each item should have: title (short descriptive title), summary (2-3 sentence summary), source_url (URL if found, empty string if not), confidence (0.0-1.0 float), tags (array of relevant tags). Return ONLY valid JSON array, no markdown or explanation. If no opportunities found, return [].`,
      messages: [{
        role: 'user',
        content: `Extract structured opportunities from this Scout research output:\n\n**Task:** ${completedTask.title}\n\n**Output:**\n${output.slice(0, 6000)}`
      }]
    }, 'scout', completedTask.id)

    const text = response.content.map(b => b.type === 'text' ? b.text : '').join('')
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return

    const items = JSON.parse(jsonMatch[0])
    if (!Array.isArray(items) || items.length === 0) return

    const insertIntel = db.prepare('INSERT INTO intel_items (id, task_id, title, summary, source_url, confidence, tags, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    let count = 0
    for (const item of items) {
      if (!item.title || !item.summary) continue
      insertIntel.run(
        uuid(),
        completedTask.id,
        item.title.slice(0, 500),
        item.summary.slice(0, 2000),
        item.source_url || '',
        Math.min(1, Math.max(0, item.confidence || 0.5)),
        JSON.stringify(item.tags || []),
        'new'
      )
      count++
    }

    if (count > 0) {
      db.prepare('INSERT INTO task_logs (task_id, agent_id, message, type) VALUES (?, ?, ?, ?)')
        .run(completedTask.id, 'scout', `Extracted ${count} intel items from research output`, 'info')
      console.log(`🔍 Extracted ${count} intel items from task ${completedTask.id}`)
    }
  } catch (err) {
    console.error('Intel extraction failed:', err.message)
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

    // Get evidence from the task
    let evidenceData = {}
    try { evidenceData = JSON.parse(completedTask.evidence || '{}') } catch { /* empty */ }
    const toolsUsed = evidenceData.tools_used || 0
    const evidenceSummary = toolsUsed > 0
      ? `Tools used: ${toolsUsed} (${Object.entries(evidenceData.tool_breakdown || {}).map(([k, v]) => `${k}:${v}`).join(', ')})`
      : 'NO TOOLS USED — text-only output'

    const response = await callClaude({
      model: getSmartModel('nexus'),
      max_tokens: 2048,
      system: `You are Nexus, the quality reviewer for Hive. You evaluate agent work PRIMARILY on whether they used tools to produce REAL results.

## Scoring Rules (STRICT):
- **0-3/10**: Text-only output, no tools used. Agent just wrote an essay. Automatic FAIL.
- **4-5/10**: Some tool usage but mostly text. NEEDS WORK.
- **6-7/10**: Used tools but didn't create follow-up tasks or take full action. NEEDS WORK.
- **8-10/10**: Used multiple tools, created follow-up tasks, produced real deliverables. PASS.

## What Counts as Real Work:
- web_search calls with real data extracted
- write_file calls producing actual code/content files
- send_email calls sending real outreach
- place_order calls executing trades
- create_task calls delegating follow-up work
- log_revenue calls recording earnings

## What Does NOT Count:
- Writing a report about what COULD be done
- Describing opportunities without acting on them
- Planning without executing
- Making up data without calling tools

Your accumulated knowledge:
${nexusMemory.slice(-1000) || '(no prior reviews)'}

Format: **Score: X/10** then **Verdict: PASS | NEEDS WORK | FAIL** then brief explanation.`,
      messages: [{
        role: 'user',
        content: `Review this completed work:

**Task:** ${completedTask.title}
**Agent:** ${agent.name} (${agent.role})
**Evidence:** ${evidenceSummary}
**Spawned by:** ${completedTask.spawned_by || 'none (top-level task)'}

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

    // Auto-fix loop: if score < 7 and not PASS, auto-create fix task (no human approval needed)
    // Count how many "Fix issues:" retries have already been attempted for this task chain
    const originalTitle = completedTask.title.replace(/^Fix issues: /g, '')
    const fixAttempts = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE title LIKE ? AND agent_id = ? AND status IN ('done', 'failed')").get(`Fix issues: %${originalTitle}%`, agent.id).c

    if (score !== null && score < 7 && verdict !== 'PASS') {
      if (fixAttempts >= 2) {
        // Max retries reached — notify user, don't create another fix task
        db.prepare('INSERT INTO task_logs (task_id, agent_id, message, type) VALUES (?, ?, ?, ?)').run(completedTask.id, 'nexus', `Score ${score}/10 after ${fixAttempts} fix attempts — giving up. Needs human review.`, 'warning')
        sendPushToAll({ title: '⛔ Fix Failed', body: `${originalTitle} scored ${score}/10 after ${fixAttempts} retries`, tag: `review-${completedTask.id}` })
        db.prepare('INSERT INTO messages (sender_id, sender_name, sender_avatar, sender_color, text) VALUES (?, ?, ?, ?, ?)')
          .run('nexus', nexus.name, nexus.avatar, nexus.color,
            `⛔ **"${originalTitle}"** scored ${score}/10 after ${fixAttempts} fix attempts — needs your attention`)
      } else {
        // Auto-create fix task — agent fixes its own work
        const fixId = uuid()
        const fixDesc = `Nexus review scored this ${score}/10 (${verdict}). Fix the issues and try again.\n\n**Review:**\n${review.slice(0, 2000)}\n\n**Original output to improve:**\n${output.slice(0, 3000)}`
        db.prepare(`INSERT INTO tasks (id, title, description, priority, agent_id, status) VALUES (?, ?, ?, 'high', ?, 'todo')`)
          .run(fixId, `Fix issues: ${originalTitle}`, fixDesc, agent.id)

        db.prepare('INSERT INTO messages (sender_id, sender_name, sender_avatar, sender_color, text) VALUES (?, ?, ?, ?, ?)')
          .run('nexus', nexus.name, nexus.avatar, nexus.color,
            `🔁 Auto-fixing: "${originalTitle}" scored ${score}/10 — ${agent.name} retrying (attempt ${fixAttempts + 1}/2)`)

        db.prepare('INSERT INTO task_logs (task_id, agent_id, message, type) VALUES (?, ?, ?, ?)').run(completedTask.id, 'nexus', `Score ${score}/10 — auto-created fix task (attempt ${fixAttempts + 1}/2)`, 'info')
        setTimeout(() => processAgentQueue(agent.id), 5000)
      }
    }

    log('info', 'qa_review_completed', { taskId: completedTask.id, title: completedTask.title, verdict, score })

    // Extract intel items from Scout research tasks
    if (agent.id === 'scout') {
      extractIntelItems(completedTask, output)
    }
  } catch (err) {
    log('error', 'qa_review_failed', { taskId: completedTask.id, error: err.message })
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
      model: getSmartModel('nexus'),
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
    log('error', 'troubleshooting_failed', { taskId: failedTask.id, error: err.message })
  }
}


// ══════════════════════════════════════════════════════
// ██ HEARTBEAT / CRON SCHEDULER                       ██
// ══════════════════════════════════════════════════════

const heartbeatJobs = []

function notifyHeartbeatError(name, error) {
  log('error', 'heartbeat_failed', { heartbeat: name, error: error.message })
  try {
    db.prepare("INSERT INTO task_logs (task_id, agent_id, message, type) VALUES (?, ?, ?, ?)")
      .run('system', 'nexus', `Heartbeat "${name}" failed: ${error.message}`, 'error')
  } catch {}
  try {
    const sub = db.prepare("SELECT value FROM settings WHERE key = 'push_subscription'").get()
    if (sub?.value) {
      const subscription = JSON.parse(sub.value)
      webpush.sendNotification(subscription, JSON.stringify({
        title: `Heartbeat Failed: ${name}`,
        body: error.message.slice(0, 200)
      })).catch(() => {})
    }
  } catch {}
}

function registerHeartbeat(name, intervalMs, fn) {
  const id = setInterval(fn, intervalMs)
  heartbeatJobs.push({ name, id, intervalMs })
  console.log(`💓 Heartbeat registered: ${name} (every ${Math.round(intervalMs / 60000)}min)`)
}

// auto-standup removed — wasteful no-op

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
          model: 'anthropic/claude-haiku-4-5',
          max_tokens: 2048,
          system: `Compact this agent memory to the most important 50% of content. Keep the most valuable learnings — especially income-generating insights, successful strategies, and key patterns. Remove redundant or outdated entries. Preserve markdown formatting.`,
          messages: [{ role: 'user', content: memory }]
        }, agent.id, null)
        const compacted = response.content.map(b => b.type === 'text' ? b.text : '').join('')
        writeAgentMemory(agent.id, compacted)
        console.log(`🧹 Compacted memory for ${agent.name}: ${memory.length} → ${compacted.length} chars`)
      } catch (e) {
        notifyHeartbeatError(`memory-compaction:${agent.name}`, e)
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
    notifyHeartbeatError('nexus-retrospective', e)
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
    notifyHeartbeatError('bot-opportunity-scan', e)
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
      model: getSmartModel(agent.id),
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
  const { page, limit: rawLimit, status, agent_id, search } = req.query

  // Build WHERE clauses
  const conditions = []
  const params = []
  if (status) { conditions.push('status = ?'); params.push(status) }
  if (agent_id) { conditions.push('agent_id = ?'); params.push(agent_id) }
  if (search) { conditions.push('(title LIKE ? OR description LIKE ?)'); params.push(`%${search}%`, `%${search}%`) }
  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''

  // If no page param, return all (capped at 500) for backwards compat
  if (!page) {
    const tasks = db.prepare(`SELECT * FROM tasks ${where} ORDER BY created_at DESC LIMIT 500`).all(...params)
    return res.json(tasks)
  }

  const limit = Math.min(Math.max(parseInt(rawLimit) || 50, 1), 200)
  const pageNum = Math.max(parseInt(page) || 1, 1)
  const offset = (pageNum - 1) * limit

  const total = db.prepare(`SELECT COUNT(*) as c FROM tasks ${where}`).get(...params).c
  const tasks = db.prepare(`SELECT * FROM tasks ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset)

  res.json({ tasks, total, page: pageNum, limit, hasMore: offset + tasks.length < total })
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

  traceBus.emit('task:update', { id, status: agent_id ? 'todo' : 'backlog', agent_id: agent_id || null })

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

  if (fields.status) {
    traceBus.emit('task:update', { id, status: fields.status, agent_id: task.agent_id })
  }
})

app.delete('/api/tasks/:id', requireRole('admin', 'operator'), (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// ── Task Logs ──────────────────────────────────────
app.get('/api/tasks/:id/logs', (req, res) => {
  const logs = db.prepare('SELECT * FROM task_logs WHERE task_id = ? ORDER BY created_at ASC').all(req.params.id)
  res.json(logs)
})

// ── Task Resume (from checkpoint) ─────────────────────
app.post('/api/tasks/:id/resume', async (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id)
  if (!task) return res.status(404).json({ error: 'Task not found' })
  const checkpoint = db.prepare('SELECT * FROM task_checkpoints WHERE task_id = ? ORDER BY step DESC LIMIT 1').get(task.id)
  if (!checkpoint) return res.status(400).json({ error: 'No checkpoint found' })
  db.prepare("UPDATE tasks SET status = 'todo', updated_at = datetime('now') WHERE id = ?").run(task.id)
  db.prepare('INSERT INTO task_logs (task_id, agent_id, message, type) VALUES (?, ?, ?, ?)')
    .run(task.id, task.agent_id, `Task queued for resume from step ${checkpoint.step}`, 'info')
  if (task.agent_id) setTimeout(() => processAgentQueue(task.agent_id), 1000)
  res.json({ ok: true, message: `Resuming from step ${checkpoint.step}` })
})

// ── Task Approval (mid-run continue/reject) ────────────
app.post('/api/tasks/:id/approve-continue', async (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id)
  if (!task) return res.status(404).json({ error: 'Task not found' })
  if (task.status !== 'paused') return res.status(400).json({ error: 'Task is not paused' })
  db.prepare("UPDATE tasks SET status = 'todo', updated_at = datetime('now') WHERE id = ?").run(task.id)
  db.prepare('INSERT INTO task_logs (task_id, agent_id, message, type) VALUES (?, ?, ?, ?)')
    .run(task.id, task.agent_id, 'Approved to continue — resuming from checkpoint', 'success')
  if (task.agent_id) setTimeout(() => processAgentQueue(task.agent_id), 1000)
  res.json({ ok: true })
})

app.post('/api/tasks/:id/reject-continue', async (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id)
  if (!task) return res.status(404).json({ error: 'Task not found' })
  db.prepare("UPDATE tasks SET status = 'failed', updated_at = datetime('now') WHERE id = ?").run(task.id)
  db.prepare('DELETE FROM task_checkpoints WHERE task_id = ?').run(task.id)
  db.prepare('INSERT INTO task_logs (task_id, agent_id, message, type) VALUES (?, ?, ?, ?)')
    .run(task.id, task.agent_id, 'Rejected — task cancelled', 'error')
  activeRuns.delete(task.agent_id)
  traceBus.emit('task:update', { id: task.id, status: 'failed', agent_id: task.agent_id })
  traceBus.emit('agent:status', { agent_id: task.agent_id, status: 'idle' })
  res.json({ ok: true })
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
      model: getSmartModel('nexus'),
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

app.post('/api/tasks/:id/run', requireRole('admin', 'operator'), async (req, res) => {
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
  // Agents are autonomous — only gate real-money actions (live trading, real capital deployment)
  // Auto-fix tasks, research, building, writing, analysis all run without approval
  const isAutoFix = task.title.startsWith('Fix issues:')
  const approvalKeywords = (getSetting('approval_keywords') || '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean)
  const needsApproval = !isAutoFix && (
    task.requires_approval === 1 ||
    approvalKeywords.some(kw => (task.title + ' ' + task.description).toLowerCase().includes(kw))
  )

  if (needsApproval && task.status !== 'awaiting_approval') {
    db.prepare("UPDATE tasks SET status = 'awaiting_approval', updated_at = datetime('now') WHERE id = ?").run(task.id)
    db.prepare('INSERT INTO task_logs (task_id, agent_id, message, type) VALUES (?, ?, ?, ?)')
      .run(task.id, agent.id, 'Requires approval before running (real-money action detected)', 'warning')
    sendPushToAll({ title: '⏸️ Approval Required', body: task.title, tag: `approval-${task.id}`, taskId: task.id })
    email.sendApprovalEmail(task, agent).catch(() => {})
    return res.json({ ok: true, message: 'Task requires approval', awaiting_approval: true })
  }

  db.prepare("UPDATE tasks SET status = 'in_progress', started_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(task.id)
  db.prepare('INSERT INTO task_logs (task_id, agent_id, message, type) VALUES (?, ?, ?, ?)').run(task.id, agent.id, `Agent ${agent.name} started working...`, 'info')

  const abortController = new AbortController()
  activeRuns.set(agent.id, { taskId: task.id, abort: abortController })

  traceBus.emit('task:update', { id: task.id, status: 'in_progress', agent_id: agent.id })
  traceBus.emit('agent:status', { agent_id: agent.id, status: 'active', task_id: task.id })

  res.json({ ok: true, message: `Agent ${agent.name} is working on it` })

  // ── ReAct Loop (with tool execution) ─────────────
  try {
    const agentMemory = readAgentMemory(agent.id)
    const MAX_STEPS = parseInt(db.prepare("SELECT value FROM settings WHERE key = 'max_react_steps'").get()?.value || '8')
    const STEP_TIMEOUT = parseInt(db.prepare("SELECT value FROM settings WHERE key = 'step_timeout_ms'").get()?.value || '300000')
    const MAX_TOOLS_PER_STEP = 5
    let messages = []
    let fullOutput = ''
    let totalToolCalls = 0
    const toolUsageCounts = {}

    const toolsPrompt = buildToolsPrompt(agent.id)
    const agentModel = getSmartModel(agent.id)
    const toolsSchema = SUPPORTS_FUNCTION_CALLING[agentModel] ? buildToolsSchema(agent.id) : null

    // ── Checkpoint restore: resume from last saved state if available ──
    let startStep = 0
    const lastCheckpoint = db.prepare('SELECT * FROM task_checkpoints WHERE task_id = ? ORDER BY step DESC LIMIT 1').get(task.id)
    if (lastCheckpoint) {
      try {
        messages = JSON.parse(lastCheckpoint.messages_json)
        fullOutput = lastCheckpoint.full_output || ''
        Object.assign(toolUsageCounts, JSON.parse(lastCheckpoint.tool_counts_json || '{}'))
        totalToolCalls = Object.values(toolUsageCounts).reduce((a, b) => a + b, 0)
        startStep = lastCheckpoint.step + 1
        log('info', 'checkpoint_resume', { taskId: task.id, agentId: agent.id, step: lastCheckpoint.step })
        db.prepare('INSERT INTO task_logs (task_id, agent_id, message, type) VALUES (?, ?, ?, ?)')
          .run(task.id, agent.id, `Resuming from checkpoint (step ${lastCheckpoint.step})`, 'info')
      } catch (e) {
        log('error', 'checkpoint_restore_failed', { taskId: task.id, error: e.message })
        startStep = 0
      }
    }

    // Inject parent task context if this task was spawned by another
    let parentContext = ''
    if (task.spawned_by) {
      const parentTask = db.prepare('SELECT title, agent_id, output FROM tasks WHERE id = ?').get(task.spawned_by)
      if (parentTask && parentTask.output) {
        const cleanOutput = parentTask.output
          .replace(/^--- Step \d+ ---$/gm, '')
          .replace(/\[TOOL:\w+\][\s\S]*?\[\/TOOL\]/g, '')
          .replace(/\[TOOL_RESULT:\w+\][\s\S]*?\[\/TOOL_RESULT\]/g, '')
          .replace(/\[TOOL_ERROR:\w+\][\s\S]*?\[\/TOOL_ERROR\]/g, '')
          .trim()
        parentContext = `## Context from ${parentTask.agent_id}'s work\nThis task was created by ${parentTask.agent_id} after completing: "${parentTask.title}"\nKey findings:\n${cleanOutput.slice(0, 2000)}\n\nUse this context to do your work. Don't repeat what was already done — build on it.\n\n`
      }
    }

    const initialPrompt = `Task: ${task.title}

Details: ${task.description || 'No additional details.'}

${parentContext}${agentMemory ? `## Your Memory (learnings from past tasks):\n${agentMemory.slice(-2000)}\n` : ''}

## MANDATORY: Use Tools — Do NOT Just Write Text

You MUST produce REAL work using your tools. Text-only responses are REJECTED.

**Your first response MUST start with tool calls.** Examples:
- Research task → [TOOL:web_search]{"query":"..."}[/TOOL]
- Build task → [TOOL:write_file]{"path":"...","content":"..."}[/TOOL]
- Trading task → [TOOL:get_quote]{"symbol":"..."}[/TOOL]
- Outreach task → [TOOL:send_email]{"to":"...","subject":"...","body":"..."}[/TOOL]

After getting results, take the NEXT action — don't just summarize. Use [TOOL:create_task] to delegate follow-up work to other agents.

Available agents for delegation: ${agents.filter(a => a.id !== agent.id).map(a => `${a.id} (${a.name} - ${a.role})`).join(', ')}
For consultation: [CONSULT:agent_id] question

START WITH TOOL CALLS NOW.`

    if (startStep === 0) {
      messages.push({ role: 'user', content: initialPrompt })
    }

    for (let step = startStep; step < MAX_STEPS; step++) {
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

      // Inject V2 skills
      const skillsV2 = db.prepare(
        'SELECT s.name, s.skill_md FROM agent_skills_v2 asv JOIN skills s ON s.id = asv.skill_id WHERE asv.agent_id = ? AND asv.enabled = 1 ORDER BY asv.priority'
      ).all(agent.id)
      const skillsContext = skillsV2.length > 0
        ? '\n\n## Skills\n' + skillsV2.map(s => s.skill_md).join('\n\n---\n\n')
        : ''

      // RAG: inject relevant knowledge base context on step 0
      let knowledgeContext = ''
      if (step === startStep) {
        try {
          const knowledgeResults = await searchKnowledge(task.description || task.title, 3)
          if (knowledgeResults.length > 0) {
            knowledgeContext = '\n\n## Relevant Knowledge Base Context\n' + knowledgeResults.map(r => r.content).join('\n\n---\n\n')
          }
        } catch (e) {
          console.error('Knowledge retrieval failed:', e.message)
        }
      }

      const traceStart = Date.now()
      const stepTimeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Step ${step + 1} timed out after ${STEP_TIMEOUT}ms`)), STEP_TIMEOUT)
      )
      const response = await Promise.race([
        callClaude({
          model: agentModel,
          max_tokens: 4096,
          system: agent.systemPrompt + toolsPrompt + skillsContext + knowledgeContext,
          messages,
          tools: toolsSchema || undefined,
        }, agent.id, task.id, abortController.signal),
        stepTimeoutPromise
      ])

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

      traceBus.emitTrace({
        agent_id: agent.id, task_id: task.id, event_type: 'THOUGHT',
        payload: { content: stepOutput.slice(0, 500), step: step + 1, latency_ms: traceDuration, token_count: traceTokensIn + traceTokensOut, cost: traceCost, model: agentModel }
      })

      // ── Parse tool calls (hybrid: native function calling + text parsing) ──
      const nativeCalls = response.nativeToolCalls || []
      const textCalls = parseToolCalls(stepOutput)
      // Merge: native calls take priority, add text-parsed calls that aren't duplicates
      const toolCalls = [...nativeCalls]
      for (const tc of textCalls) {
        if (!toolCalls.some(nc => nc.name === tc.name && JSON.stringify(nc.args) === JSON.stringify(tc.args))) {
          toolCalls.push(tc)
        }
      }
      if (toolCalls.length > 0) {
        const nativeCount = nativeCalls.length
        const textCount = toolCalls.length - nativeCount
        log('info', 'tool_calls_parsed', { agentId: agent.id, taskId: task.id, step: step+1, total: toolCalls.length, native: nativeCount, text: textCount, tools: toolCalls.map(t => t.name) })
      } else if (stepOutput.includes('TOOL') || stepOutput.includes('tool')) {
        console.log(`⚠️ ${agent.name} step ${step+1}: output mentions 'tool' but no calls parsed. First 300 chars: ${stepOutput.slice(0, 300)}`)
      }
      const consultMatch = stepOutput.match(/\[CONSULT:(\w+)\]\s*(.+)/s)

      let hadAction = false

      // Execute tool calls (max 5 per step)
      if (toolCalls.length > 0 && step < MAX_STEPS - 1) {
        hadAction = true
        const callsToRun = toolCalls.slice(0, MAX_TOOLS_PER_STEP)
        totalToolCalls += callsToRun.length
        for (const tc of callsToRun) { toolUsageCounts[tc.name] = (toolUsageCounts[tc.name] || 0) + 1 }

        db.prepare('INSERT INTO task_logs (task_id, agent_id, message, type) VALUES (?, ?, ?, ?)')
          .run(task.id, agent.id, `Executing ${callsToRun.length} tool(s): ${callsToRun.map(c => c.name).join(', ')}`, 'info')

        const results = await Promise.all(callsToRun.map(tc => executeTool(tc, agent.id, task.id)))

        let resultsText = ''
        for (const r of results) {
          if (r.error) {
            resultsText += `[TOOL_ERROR:${r.name}]${r.error}[/TOOL_ERROR]\n\n`
            db.prepare('INSERT INTO task_traces (task_id, agent_id, step, type, input_summary, output_summary, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?)')
              .run(task.id, agent.id, step + 1, 'tool_error', r.name, r.error, 0)
          } else {
            resultsText += `[TOOL_RESULT:${r.name}]${r.resultStr}[/TOOL_RESULT]\n\n`
            db.prepare('INSERT INTO task_traces (task_id, agent_id, step, type, input_summary, output_summary, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?)')
              .run(task.id, agent.id, step + 1, 'tool_call', `${r.name}(${JSON.stringify(toolCalls.find(tc => tc.name === r.name)?.args || {}).slice(0, 200)})`, (r.resultStr || '').slice(0, 500), 0)
          }

          traceBus.emitTrace({
            agent_id: agent.id, task_id: task.id, event_type: 'TOOL',
            payload: { tool: r.name, error: r.error || null, result_preview: (r.resultStr || r.error || '').slice(0, 300), step: step + 1 }
          })
        }

        messages.push({ role: 'user', content: resultsText.trim() + '\n\nContinue working on the task with these results.' })
        // Save checkpoint after tool execution
        db.prepare('INSERT OR REPLACE INTO task_checkpoints (task_id, step, messages_json, tool_counts_json, full_output) VALUES (?, ?, ?, ?, ?)')
          .run(task.id, step, JSON.stringify(messages), JSON.stringify(toolUsageCounts), fullOutput)
        // Check if task was paused by request_approval tool
        const taskStatus = db.prepare('SELECT status FROM tasks WHERE id = ?').get(task.id)
        if (taskStatus?.status === 'paused') {
          console.log(`⏸️ ${agent.name}: task paused by request_approval — stopping execution`)
          activeRuns.delete(agent.id)
          traceBus.emit('task:update', { id: task.id, status: 'paused', agent_id: agent.id })
          traceBus.emit('agent:status', { agent_id: agent.id, status: 'idle' })
          return
        }
        continue
      }

      // Check for consultation requests
      if (consultMatch && step < MAX_STEPS - 1) {
        hadAction = true
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

      // No tools, no consults — nudge the agent to use tools on first attempt
      if (!hadAction) {
        if (step === 0 && totalToolCalls === 0) {
          // Agent produced text-only on step 1. Push it to use tools.
          console.log(`⚠️ ${agent.name}: text-only response on step 1, nudging to use tools`)
          db.prepare('INSERT INTO task_logs (task_id, agent_id, message, type) VALUES (?, ?, ?, ?)')
            .run(task.id, agent.id, 'Nudging agent — text-only response, no tools used', 'warning')
          messages.push({
            role: 'user',
            content: `STOP. You wrote a text response without using any tools. This is not acceptable. You MUST use your tools to take REAL actions. Do NOT write plans or descriptions — call tools NOW.\n\nReminder of syntax: [TOOL:tool_name]{"param":"value"}[/TOOL]\n\nYour available tools include: ${getAgentTools(agent.id).map(t => t.name).join(', ')}\n\nCall at least one tool right now.`
          })
          continue
        }
        break
      }
    }

    activeRuns.delete(agent.id)
    traceBus.emit('agent:status', { agent_id: agent.id, status: 'idle' })
    // Clean up checkpoints on successful completion
    db.prepare('DELETE FROM task_checkpoints WHERE task_id = ?').run(task.id)

    const evidence = JSON.stringify({
      tools_used: totalToolCalls,
      tool_breakdown: toolUsageCounts,
      files_created: toolUsageCounts.write_file || 0,
      emails_sent: toolUsageCounts.send_email || 0,
      trades_placed: toolUsageCounts.place_order || 0,
      tasks_created: toolUsageCounts.create_task || 0,
      web_searches: toolUsageCounts.web_search || 0,
      revenue_logged: toolUsageCounts.log_revenue || 0,
    })
    db.prepare(`UPDATE tasks SET status = 'done', output = ?, evidence = ?, completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
      .run(fullOutput.slice(0, 50000), evidence, task.id)
    db.prepare('INSERT INTO task_logs (task_id, agent_id, message, type) VALUES (?, ?, ?, ?)')
      .run(task.id, agent.id, 'Task completed successfully', 'success')

    traceBus.emit('task:update', { id: task.id, status: 'done', agent_id: agent.id })
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

    // Update memory → auto-embed → optional QA review → optional follow-ups → skill extraction → queue next
    updateAgentMemory(agent, task, fullOutput)
      .then(() => {
        // Auto-embed task summary into semantic memory
        const summary = `Task: ${task.title}\nAgent: ${agent.id}\nEvidence: ${evidence}\nOutput: ${fullOutput.slice(0, 1000)}`
        storeMemoryEmbedding(agent.id, summary, task.id, [task.agent_id, 'auto']).catch(() => {})
      })
      .then(() => {
        // Parse heartbeat outputs for feedback loops
        try { parseHeartbeatOutput(task, fullOutput) } catch (e) { console.log('Heartbeat parse error:', e.message) }
      })
      .then(() => {
        const qaEnabled = getSetting('qa_reviews_enabled') !== 'false'
        return qaEnabled ? reviewCompletedWork(task, agent, fullOutput) : null
      })
      .then(() => {
        const autoTasksEnabled = getSetting('auto_tasks_enabled') !== 'false'
        return autoTasksEnabled ? generateFollowUpTasks(task, agent, fullOutput) : null
      })
      .then(() => checkAutoChain(task, fullOutput))
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
    traceBus.emit('agent:status', { agent_id: agent.id, status: 'idle' })
    const errorMsg = err.name === 'AbortError' || err.message === 'AbortError' ? 'Stopped by user' : err.message
    db.prepare(`UPDATE tasks SET status = 'failed', error = ?, completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
      .run(errorMsg, task.id)
    db.prepare('INSERT INTO task_logs (task_id, agent_id, message, type) VALUES (?, ?, ?, ?)')
      .run(task.id, agent.id, `Task failed: ${errorMsg}`, 'error')

    traceBus.emit('task:update', { id: task.id, status: 'failed', agent_id: agent.id })
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

  traceBus.emit('task:update', { id: entry.taskId, status: 'failed', agent_id: req.params.id })
  traceBus.emit('agent:status', { agent_id: req.params.id, status: 'idle' })

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
  const scorecards = buildAllScorecards()
  res.json(scorecards)
})

app.get('/api/agents/:id/scorecard', (req, res) => {
  const agent = agents.find(a => a.id === req.params.id)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })
  const all = buildAllScorecards()
  const card = all.find(s => s.agent_id === req.params.id)
  res.json(card || buildScorecardFallback(req.params.id))
})

function buildAllScorecards() {
  // Single aggregated query for all task stats — eliminates N+1
  const taskStats = db.prepare(`
    SELECT agent_id,
      COUNT(CASE WHEN status = 'done' THEN 1 END) as done,
      COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
      COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress,
      COUNT(CASE WHEN status = 'todo' THEN 1 END) as todo,
      AVG(CASE WHEN status = 'done' AND started_at IS NOT NULL AND completed_at IS NOT NULL
        THEN CAST((julianday(completed_at) - julianday(started_at)) * 86400 AS INTEGER) END) as avg_duration,
      AVG(CASE WHEN status = 'done' AND tokens_used > 0 THEN tokens_used END) as avg_tokens,
      AVG(CASE WHEN status = 'done' AND estimated_cost > 0 THEN estimated_cost END) as avg_cost
    FROM tasks WHERE agent_id IS NOT NULL GROUP BY agent_id
  `).all()
  const taskMap = Object.fromEntries(taskStats.map(r => [r.agent_id, r]))

  // Single query for all agent spend
  const spendStats = db.prepare(`
    SELECT agent_id, COALESCE(SUM(cost), 0) as total FROM spend_log GROUP BY agent_id
  `).all()
  const spendMap = Object.fromEntries(spendStats.map(r => [r.agent_id, r.total]))

  // Single query for all QA reviews
  const qaStats = db.prepare(`
    SELECT t.agent_id,
      COUNT(*) as qa_total,
      COUNT(CASE WHEN tl.message LIKE '%PASS%' THEN 1 END) as qa_passed
    FROM task_logs tl
    JOIN tasks t ON tl.task_id = t.id
    WHERE tl.agent_id = 'nexus'
      AND (tl.message LIKE '%PASS%' OR tl.message LIKE '%FAIL%' OR tl.message LIKE '%NEEDS WORK%')
    GROUP BY t.agent_id
  `).all()
  const qaMap = Object.fromEntries(qaStats.map(r => [r.agent_id, r]))

  // Single query for all 7-day trends
  const weekTrends = db.prepare(`
    SELECT agent_id, date(completed_at) as date, COUNT(*) as count
    FROM tasks WHERE status = 'done' AND completed_at >= date('now', '-7 days')
    GROUP BY agent_id, date(completed_at) ORDER BY date ASC
  `).all()
  const trendMap = {}
  for (const r of weekTrends) {
    if (!trendMap[r.agent_id]) trendMap[r.agent_id] = []
    trendMap[r.agent_id].push({ date: r.date, count: r.count })
  }

  // Single query for all revenue
  const revenueStats = db.prepare(`
    SELECT agent_id, COALESCE(SUM(amount), 0) as total FROM revenue_entries WHERE agent_id IS NOT NULL GROUP BY agent_id
  `).all()
  const revenueMap = Object.fromEntries(revenueStats.map(r => [r.agent_id, r.total]))

  return agents.map(a => {
    const ts = taskMap[a.id] || {}
    const done = ts.done || 0
    const failed = ts.failed || 0
    const inProgress = ts.in_progress || 0
    const todo = ts.todo || 0
    const totalSpend = spendMap[a.id] || 0
    const qa = qaMap[a.id] || {}
    const qaPassRate = qa.qa_total > 0 ? Math.round((qa.qa_passed / qa.qa_total) * 100) : 100
    const revenue = revenueMap[a.id] || 0

    return {
      agent_id: a.id,
      tasks: { done, failed, in_progress: inProgress, todo, total: done + failed + inProgress + todo },
      successRate: (done + failed) > 0 ? Math.round((done / (done + failed)) * 100) : 0,
      avgDurationSec: Math.round(ts.avg_duration || 0),
      avgTokens: Math.round(ts.avg_tokens || 0),
      avgCost: parseFloat((ts.avg_cost || 0).toFixed(4)),
      totalSpend: parseFloat(totalSpend.toFixed(4)),
      qaPassRate,
      weekTrend: trendMap[a.id] || [],
      revenue: parseFloat(revenue.toFixed(2)),
      roi: parseFloat((revenue - totalSpend).toFixed(2))
    }
  })
}

// Fallback for single agent not in agents.json
function buildScorecardFallback(agentId) {
  const all = buildAllScorecards()
  return all.find(s => s.agent_id === agentId) || {
    agent_id: agentId, tasks: { done: 0, failed: 0, in_progress: 0, todo: 0, total: 0 },
    successRate: 0, avgDurationSec: 0, avgTokens: 0, avgCost: 0, totalSpend: 0,
    qaPassRate: 100, weekTrend: [], revenue: 0, roi: 0
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

// Pipeline Replay from Checkpoint
app.post('/api/pipelines/:id/replay', authenticateRequest, async (req, res) => {
  const { from_step = 0, modified_input = '' } = req.body
  const pipeline = db.prepare('SELECT * FROM pipelines WHERE id = ?').get(req.params.id)
  if (!pipeline) return res.status(404).json({ error: 'Pipeline not found' })

  let steps
  try { steps = JSON.parse(pipeline.steps || '[]') } catch { steps = [] }
  const sorted = steps.sort((a, b) => (a.position || 0) - (b.position || 0))
  if (from_step >= sorted.length) return res.status(400).json({ error: 'Invalid step index' })

  const replaySteps = sorted.slice(from_step)
  const firstStep = replaySteps[0]
  const id = uuid()
  const description = modified_input || firstStep.prompt_template || ''

  db.prepare(`INSERT INTO tasks (id, title, description, priority, agent_id, status, pipeline_id, pipeline_step) VALUES (?, ?, ?, 'high', ?, 'todo', ?, ?)`)
    .run(id, `[Replay] ${pipeline.name} — Step ${from_step + 1}`, description, firstStep.agent_id, pipeline.id, firstStep.position || from_step + 1)

  db.prepare('INSERT INTO messages (sender_id, sender_name, sender_avatar, sender_color, text) VALUES (?, ?, ?, ?, ?)')
    .run('system', '🔗 Pipeline', '🔗', '#8b5cf6', `Replaying pipeline "${pipeline.name}" from step ${from_step + 1} of ${sorted.length}`)

  traceBus.emit('task:update', { id, status: 'todo', agent_id: firstStep.agent_id })
  setTimeout(() => processAgentQueue(firstStep.agent_id), 2000)
  res.json({ task_id: id, replay_from: from_step, total_steps: sorted.length })
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

// Webhook receiver (public — no auth, validates HMAC-SHA256 signature)
app.post('/api/webhooks/:triggerId', (req, res) => {
  const trigger = db.prepare('SELECT * FROM event_triggers WHERE id = ? AND enabled = 1').get(req.params.triggerId)
  if (!trigger) return res.status(404).json({ error: 'Trigger not found or disabled' })

  const config = JSON.parse(trigger.config)

  // HMAC-SHA256 validation when trigger has a secret configured
  if (config.secret) {
    const signature = req.headers['x-hub-signature-256']
    if (!signature) return res.status(403).json({ error: 'Missing X-Hub-Signature-256 header' })

    const body = JSON.stringify(req.body)
    const expected = 'sha256=' + crypto.createHmac('sha256', config.secret).update(body).digest('hex')

    try {
      const sigBuf = Buffer.from(signature)
      const expBuf = Buffer.from(expected)
      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        return res.status(403).json({ error: 'Invalid signature' })
      }
    } catch {
      return res.status(403).json({ error: 'Invalid signature' })
    }
  }

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
    const pipeHeaders = {}
    if (API_KEY) pipeHeaders['Authorization'] = `Bearer ${API_KEY}`
    fetch(`http://localhost:${PORT}/api/pipelines/${action.pipeline_id}/run`, { method: 'POST', headers: pipeHeaders }).catch(() => {})
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
    const abModel = getSmartModel(agent.id)
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
        log('error', 'strategy_executor_failed', { deploymentId: dep.id, error: e.message })
      }
    }
  } catch (e) {
    notifyHeartbeatError('strategy-executor', e)
  }
})

// Order sync — every 5 minutes
registerHeartbeat('order-sync', 5 * 60 * 1000, async () => {
  try {
    const result = await broker.syncOrderFills()
    if (result.synced > 0) console.log(`🔄 Synced ${result.synced} order fills`)
  } catch (e) {
    notifyHeartbeatError('order-sync', e)
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
    notifyHeartbeatError('portfolio-snapshot', e)
  }
})

// Market cache cleanup — every 30 minutes
registerHeartbeat('market-cache-cleanup', 30 * 60 * 1000, () => {
  const cleaned = marketData.cleanExpiredCache()
  if (cleaned > 0) console.log(`🧹 Cleaned ${cleaned} expired cache entries`)
})

// Strategy discovery — every 12 hours (rotating targeted queries)
const STRATEGY_SEARCH_QUERIES = [
  'RSI divergence trading strategy backtested results sharpe ratio',
  'mean reversion pairs trading algorithm python github',
  'momentum breakout strategy backtested sharpe greater than 1.5',
  'quantitative trading strategies walk-forward validation github',
  'MACD histogram reversal strategy backtest win rate',
  'Bollinger Band squeeze breakout trading algorithm',
  'SMA crossover strategy 50 200 golden cross backtest',
  'volume weighted momentum strategy algorithmic trading',
  'swing trading algorithm RSI MACD combination backtest',
  'EMA crossover scalping strategy automated backtest results',
  'contrarian RSI overbought oversold mean reversion bot',
  'dual momentum strategy backtested equities ETF',
  'trend following moving average crossover strategy github',
  'statistical arbitrage pairs trading algorithm python',
  'turtle trading system automated implementation backtest',
  'Keltner Channel breakout strategy automated trading',
  'volatility breakout strategy ATR-based entry exit rules',
  'sector rotation momentum strategy backtested results',
  'overnight gap trading strategy algorithm backtest',
  'relative strength index divergence automated strategy github',
]
let strategySearchIndex = 0

registerHeartbeat('strategy-discovery', 12 * 60 * 60 * 1000, async () => {
  try {
    const scout = agents.find(a => a.id === 'scout')
    if (!scout) return

    // Rotate through search queries
    const query = STRATEGY_SEARCH_QUERIES[strategySearchIndex % STRATEGY_SEARCH_QUERIES.length]
    strategySearchIndex++

    // Get existing strategy names to avoid duplicates
    const existing = db.prepare('SELECT name FROM strategies').all().map(s => s.name.toLowerCase())
    const existingList = existing.length > 0 ? `\n\nAlready discovered strategies (DO NOT duplicate): ${existing.slice(-20).join(', ')}` : ''

    // Get learning feedback from strategy_meta
    let learningFeedback = ''
    try {
      const meta = db.prepare('SELECT indicator_combo, pass_count, fail_count FROM strategy_meta ORDER BY pass_count DESC LIMIT 10').all()
      if (meta.length > 0) {
        const insights = meta.map(m => {
          const total = m.pass_count + m.fail_count
          const rate = total > 0 ? Math.round(m.pass_count / total * 100) : 0
          return `${m.indicator_combo}: ${rate}% pass rate (${total} tested)`
        })
        learningFeedback = `\n\n## Historical Strategy Performance\nThese indicator combinations have been backtested. Focus on high pass-rate combos:\n${insights.join('\n')}`
      }
    } catch (e) { /* strategy_meta may not exist yet */ }

    const taskId = uuid()
    db.prepare(`INSERT INTO tasks (id, title, description, priority, agent_id, status) VALUES (?, ?, ?, 'high', 'scout', 'todo')`)
      .run(taskId, 'Trading Strategy Discovery', `Search GitHub, Reddit r/algotrading, and X/Twitter for profitable algorithmic trading strategies.

**Focused search query**: "${query}"

Look for:
1. **GitHub repos** with specific entry/exit rules, backtest code (Qlib, Zipline, Backtrader, custom Python)
2. **Reddit r/algotrading, r/quantfinance** — strategies with verified backtest results and Sharpe ratios > 1.0
3. **X/Twitter** — quant traders sharing algo trading strategies with performance data

For each strategy found, extract:
- Clear entry and exit conditions using these indicators: rsi14, macd_histogram, macd_signal, macd_macd, sma20, sma50, sma200, ema12, ema26, bollinger_upper, bollinger_lower, price, volume
- Use operators: >, <, >=, <=
- Value can be a number OR another indicator name (e.g., "sma50" crosses above "sma200")
${existingList}${learningFeedback}

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

Find 3-5 promising strategies with specific, testable rules. Prefer strategies with reported Sharpe > 1.0 and documented backtest results.`)
    setTimeout(() => processAgentQueue('scout'), 3000)
    console.log(`💓 Strategy discovery queued — search: "${query.slice(0, 50)}..."`)
  } catch (e) {
    notifyHeartbeatError('strategy-discovery', e)
  }
})

// ── Strategy Learning Loop Helper ─────────────────
function logStrategyMeta(strategy, passed) {
  try {
    const logic = JSON.parse(strategy.logic)
    const indicators = (logic.indicators || []).sort().join('+') || 'unknown'
    const existing = db.prepare('SELECT * FROM strategy_meta WHERE indicator_combo = ?').get(indicators)
    if (existing) {
      if (passed) {
        db.prepare("UPDATE strategy_meta SET pass_count = pass_count + 1, updated_at = datetime('now') WHERE indicator_combo = ?").run(indicators)
      } else {
        db.prepare("UPDATE strategy_meta SET fail_count = fail_count + 1, updated_at = datetime('now') WHERE indicator_combo = ?").run(indicators)
      }
    } else {
      db.prepare('INSERT INTO strategy_meta (indicator_combo, strategy_type, pass_count, fail_count) VALUES (?, ?, ?, ?)').run(
        indicators, strategy.type || 'technical', passed ? 1 : 0, passed ? 0 : 1
      )
    }
  } catch (e) { /* silently skip meta logging errors */ }
}

// Auto-backtest newly discovered strategies — every 2 hours
// Multi-symbol testing + walk-forward validation + strict thresholds
const BACKTEST_SYMBOLS = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'AMZN']
registerHeartbeat('auto-backtest', 2 * 60 * 60 * 1000, async () => {
  try {
    const discovered = db.prepare("SELECT * FROM strategies WHERE status = 'discovered' LIMIT 5").all()
    if (discovered.length === 0) return

    const minSharpe = parseFloat(getSetting('min_backtest_sharpe') || '1.5')
    const minWinRate = parseFloat(getSetting('min_backtest_win_rate') || '55')
    const maxDrawdown = 15
    const minTrades = 10 // per symbol

    for (const strategy of discovered) {
      try {
        db.prepare("UPDATE strategies SET status = 'backtesting', updated_at = datetime('now') WHERE id = ?").run(strategy.id)
        let passCount = 0
        let totalSharpe = 0
        let totalWinRate = 0
        let totalDrawdown = 0
        let symbolsTested = 0

        // Phase 1: Multi-symbol basic backtest
        for (const sym of BACKTEST_SYMBOLS) {
          try {
            const result = await backtest.runBacktest(strategy.id, sym, '1y', 10000)
            symbolsTested++
            if (result.sharpe_ratio >= minSharpe && result.win_rate >= minWinRate && result.max_drawdown <= maxDrawdown && result.total_trades >= minTrades) {
              passCount++
              totalSharpe += result.sharpe_ratio
              totalWinRate += result.win_rate
              totalDrawdown += result.max_drawdown
            }
          } catch (e) { /* symbol failed, skip */ }
        }

        if (passCount < 3) {
          db.prepare("UPDATE strategies SET status = 'retired', updated_at = datetime('now') WHERE id = ?").run(strategy.id)
          console.log(`❌ Strategy "${strategy.name}" RETIRED — passed ${passCount}/${symbolsTested} symbols`)
          logStrategyMeta(strategy, false)
          continue
        }

        // Phase 2: Walk-forward validation on SPY
        try {
          const wfResult = await backtest.runWalkForwardBacktest(strategy.id, 'SPY', '2y', 10000)
          if (!wfResult.passed) {
            db.prepare("UPDATE strategies SET status = 'retired', updated_at = datetime('now') WHERE id = ?").run(strategy.id)
            console.log(`❌ Strategy "${strategy.name}" RETIRED — walk-forward failed (overfit: ${wfResult.overfitting_score})`)
            logStrategyMeta(strategy, false)
            continue
          }
        } catch (e) {
          console.log(`⚠️ Walk-forward skipped for "${strategy.name}": ${e.message}`)
          // Don't fail strategy if walk-forward data unavailable, just proceed
        }

        // Passed both phases — approve (goes to paper_testing first if column exists)
        const avgSharpe = Math.round(totalSharpe / passCount * 100) / 100
        const avgWinRate = Math.round(totalWinRate / passCount * 100) / 100

        // Check if paper_start_date column exists
        let hasPaperCol = false
        try { db.prepare("SELECT paper_start_date FROM strategies LIMIT 0").get(); hasPaperCol = true } catch (e) {}

        if (hasPaperCol) {
          db.prepare("UPDATE strategies SET status = 'paper_testing', paper_start_date = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(strategy.id)
          // Auto-deploy to paper
          const depId = uuid()
          db.prepare('INSERT INTO bot_deployments (id, strategy_id, symbols, status) VALUES (?, ?, ?, ?)').run(depId, strategy.id, JSON.stringify(BACKTEST_SYMBOLS.slice(0, 3)), 'active')
          console.log(`📋 Strategy "${strategy.name}" → PAPER TESTING — Avg Sharpe: ${avgSharpe}, Win: ${avgWinRate}%, passed ${passCount}/${symbolsTested}`)
        } else {
          db.prepare("UPDATE strategies SET status = 'approved', updated_at = datetime('now') WHERE id = ?").run(strategy.id)
          console.log(`✅ Strategy "${strategy.name}" APPROVED — Avg Sharpe: ${avgSharpe}, Win: ${avgWinRate}%, passed ${passCount}/${symbolsTested}`)
        }
        logStrategyMeta(strategy, true)
      } catch (e) {
        db.prepare("UPDATE strategies SET status = 'discovered', updated_at = datetime('now') WHERE id = ?").run(strategy.id)
        console.error(`Backtest failed for "${strategy.name}":`, e.message)
      }
    }
  } catch (e) {
    notifyHeartbeatError('auto-backtest', e)
  }
})

// Paper trading graduation check — every 6 hours
registerHeartbeat('paper-graduation', 6 * 60 * 60 * 1000, async () => {
  try {
    const paperStrategies = db.prepare("SELECT * FROM strategies WHERE status = 'paper_testing' AND paper_start_date IS NOT NULL").all()
    if (paperStrategies.length === 0) return

    for (const strategy of paperStrategies) {
      const startDate = new Date(strategy.paper_start_date)
      const daysSincePaper = (Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24)

      // Need 30 days of paper trading
      if (daysSincePaper < 30) continue

      // Check paper trading performance
      const deployment = db.prepare("SELECT * FROM bot_deployments WHERE strategy_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1").get(strategy.id)
      if (!deployment) {
        // No deployment found, auto-deploy for paper testing
        const depId = uuid()
        db.prepare('INSERT INTO bot_deployments (id, strategy_id, symbols, status) VALUES (?, ?, ?, ?)').run(depId, strategy.id, '["SPY","QQQ","AAPL"]', 'active')
        continue
      }

      // Check if paper performance is acceptable
      const perf = db.prepare("SELECT COALESCE(SUM(pnl), 0) as total_pnl, COUNT(*) as trade_count, COALESCE(SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END), 0) as wins FROM trades WHERE strategy_id = ? AND created_at >= ?").get(strategy.id, strategy.paper_start_date)

      const backtestResult = db.prepare("SELECT * FROM strategy_backtests WHERE strategy_id = ? ORDER BY created_at DESC LIMIT 1").get(strategy.id)

      if (perf.trade_count < 5) {
        console.log(`📋 Strategy "${strategy.name}" paper testing: only ${perf.trade_count} trades in ${Math.round(daysSincePaper)} days, waiting...`)
        continue
      }

      const paperWinRate = perf.trade_count > 0 ? (perf.wins / perf.trade_count * 100) : 0

      // If performance is acceptable (win rate within 30% of backtest), graduate
      const backtestWinRate = backtestResult?.win_rate || 50
      const deviation = Math.abs(paperWinRate - backtestWinRate) / backtestWinRate

      if (deviation <= 0.3 && perf.total_pnl >= 0) {
        db.prepare("UPDATE strategies SET status = 'approved', updated_at = datetime('now') WHERE id = ?").run(strategy.id)
        // Create proposal for user
        const proposalId = uuid()
        db.prepare('INSERT INTO proposals (id, type, title, description, proposed_by, priority) VALUES (?, ?, ?, ?, ?, ?)').run(
          proposalId, 'workflow',
          `Deploy Strategy: ${strategy.name}`,
          `Strategy "${strategy.name}" has completed 30 days of paper trading.\n\nPaper results: ${perf.trade_count} trades, ${perf.wins} wins (${Math.round(paperWinRate)}%), P&L: $${perf.total_pnl.toFixed(2)}\nBacktest win rate: ${backtestWinRate}%\n\nApprove to deploy with real capital.`,
          'oracle', 'high'
        )
        console.log(`✅ Strategy "${strategy.name}" GRADUATED paper testing → approved (${perf.trade_count} trades, ${Math.round(paperWinRate)}% win, $${perf.total_pnl.toFixed(2)} P&L)`)
      } else if (daysSincePaper > 60) {
        // 60 days and still not performing — retire
        db.prepare("UPDATE strategies SET status = 'retired', updated_at = datetime('now') WHERE id = ?").run(strategy.id)
        if (deployment) {
          db.prepare("UPDATE bot_deployments SET status = 'stopped', stopped_at = datetime('now') WHERE id = ?").run(deployment.id)
        }
        console.log(`❌ Strategy "${strategy.name}" RETIRED after 60 days paper testing — underperforming`)
      }
    }
  } catch (e) {
    notifyHeartbeatError('paper-graduation', e)
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
  } catch (e) { notifyHeartbeatError('ux-design-review', e) }
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
  } catch (e) { notifyHeartbeatError('feature-discovery', e) }
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
  } catch (e) { notifyHeartbeatError('self-assessment', e) }
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
  } catch (e) { notifyHeartbeatError('daily-project-summary', e) }
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
  const { mode } = req.query
  let messages
  if (mode === 'assistant') {
    // AI chat mode: only user + assistant messages (no system/feed noise)
    messages = db.prepare("SELECT * FROM messages WHERE sender_id IN ('user', 'hive-assistant') ORDER BY created_at ASC LIMIT 200").all()
  } else if (mode === 'feed') {
    // Feed mode: only agent messages (not user/assistant chat)
    messages = db.prepare("SELECT * FROM messages WHERE sender_id NOT IN ('user', 'hive-assistant') ORDER BY created_at DESC LIMIT 200").all().reverse()
  } else {
    messages = db.prepare('SELECT * FROM messages ORDER BY created_at ASC LIMIT 200').all()
  }
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
      model: getSmartModel('nexus'),
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

  const inProgress = db.prepare("SELECT title, agent_id, updated_at FROM tasks WHERE status = 'in_progress' ORDER BY updated_at DESC LIMIT 5").all()
  if (inProgress.length) {
    sections.push('## Currently Working On\n' + inProgress.map(t => `- ${t.agent_id}: "${t.title}" (since ${t.updated_at})`).join('\n'))
  }

  // Recently completed WITH evidence — show what actually happened
  const recentDone = db.prepare("SELECT title, agent_id, output, evidence, spawned_by, completed_at FROM tasks WHERE status = 'done' ORDER BY completed_at DESC LIMIT 5").all()
  if (recentDone.length) {
    const doneLines = recentDone.map(t => {
      let ev = {}
      try { ev = JSON.parse(t.evidence || '{}') } catch { /* empty */ }
      const toolCount = ev.tools_used || 0
      let summary = 'NO OUTPUT'
      if (toolCount > 0) {
        const actions = []
        if (ev.web_searches) actions.push(`${ev.web_searches} searches`)
        if (ev.files_created) actions.push(`${ev.files_created} files`)
        if (ev.emails_sent) actions.push(`${ev.emails_sent} emails`)
        if (ev.trades_placed) actions.push(`${ev.trades_placed} trades`)
        if (ev.tasks_created) actions.push(`${ev.tasks_created} follow-ups`)
        if (ev.revenue_logged) actions.push(`${ev.revenue_logged} revenue entries`)
        summary = `REAL WORK — ${actions.join(', ') || toolCount + ' tool calls'}`
      } else if ((t.output || '').length > 500) {
        summary = 'text-only (no tools used)'
      }
      const chain = t.spawned_by ? ' [chained]' : ''
      return `- ${t.agent_id}: "${t.title}" | ${summary}${chain}`
    })
    sections.push('## Recently Completed (with evidence)\n' + doneLines.join('\n'))
  }

  // Stuck tasks — anything in_progress for more than 30 min
  const stuckTasks = db.prepare("SELECT title, agent_id, updated_at FROM tasks WHERE status = 'in_progress' AND updated_at < datetime('now', '-30 minutes') ORDER BY updated_at ASC LIMIT 5").all()
  if (stuckTasks.length) {
    sections.push('## STUCK Tasks (in_progress > 30 min)\n' + stuckTasks.map(t => `- ${t.agent_id}: "${t.title}" (since ${t.updated_at})`).join('\n'))
  }

  const todoCount = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status = 'todo'").get().c
  const failedCount = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status = 'failed'").get().c
  sections.push(`## Queue: ${todoCount} tasks waiting, ${failedCount} failed`)

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

  // Trading pipeline status
  const stratCounts = db.prepare("SELECT status, COUNT(*) as c FROM strategies GROUP BY status").all()
  const stratMap = {}
  for (const row of stratCounts) stratMap[row.status] = row.c
  const activeDeployments = db.prepare("SELECT bd.id, s.name, bd.total_pnl FROM bot_deployments bd JOIN strategies s ON s.id = bd.strategy_id WHERE bd.status = 'active'").all()
  const recentBacktests = db.prepare("SELECT sb.sharpe_ratio, sb.win_rate, sb.max_drawdown, sb.total_trades, s.name FROM strategy_backtests sb JOIN strategies s ON s.id = sb.strategy_id ORDER BY sb.created_at DESC LIMIT 3").all()

  let tradingSection = `## Trading Pipeline\nStrategies: ${stratMap.discovered || 0} discovered, ${stratMap.backtesting || 0} backtesting, ${stratMap.approved || 0} approved, ${stratMap.deployed || 0} deployed, ${stratMap.retired || 0} retired`
  if (activeDeployments.length) {
    tradingSection += '\nActive: ' + activeDeployments.map(d => `${d.name} ($${(d.total_pnl || 0).toFixed(2)} P&L)`).join(', ')
  }
  if (recentBacktests.length) {
    tradingSection += '\nRecent backtests: ' + recentBacktests.map(b => `${b.name} (Sharpe: ${b.sharpe_ratio}, Win: ${b.win_rate}%, DD: ${b.max_drawdown}%)`).join(', ')
  }
  sections.push(tradingSection)

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
    case 'find_strategies': {
      const { query, sources } = payload
      const sourceList = (sources || ['github', 'reddit', 'x']).join(', ')
      const id = uuid()
      db.prepare('INSERT INTO tasks (id, title, description, priority, agent_id, status) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, `Trading Strategy Discovery: ${query || 'find profitable strategies'}`,
          `Search ${sourceList} specifically for algorithmic trading strategies. Query: "${query || 'profitable algo trading strategies'}"

Look for:
1. **GitHub repos** with backtested strategy code (Qlib, Zipline, Backtrader, custom)
2. **Reddit r/algotrading** — strategies with verified backtest results and Sharpe ratios
3. **X/Twitter** — quant traders sharing entry/exit rules with performance data

For each strategy found, extract clear entry/exit conditions using these indicators: rsi14, macd_histogram, macd_signal, macd_macd, sma20, sma50, sma200, ema12, ema26, bollinger_upper, bollinger_lower, price, volume
Operators: >, <, >=, <=

Return ONLY a JSON array:
[{"name":"Strategy Name","type":"technical|momentum|mean_reversion|custom","description":"What it does","source":"github|reddit|x","source_url":"URL","logic":{"entry_conditions":[{"indicator":"rsi14","operator":"<","value":30}],"exit_conditions":[{"indicator":"rsi14","operator":">","value":70}],"indicators":["rsi14"],"stop_loss_percent":5}}]

Find 3-5 strategies with specific, testable rules.`, 'high', 'scout', 'todo')
      setTimeout(() => processAgentQueue('scout'), 3000)
      return { ok: true, message: `Scout searching for trading strategies: "${query || 'profitable algo strategies'}"`, task_id: id }
    }
    case 'backtest_all': {
      const discovered = db.prepare("SELECT * FROM strategies WHERE status = 'discovered' LIMIT 10").all()
      if (discovered.length === 0) return { ok: true, message: 'No discovered strategies to backtest' }

      const minSharpe = parseFloat(getSetting('min_backtest_sharpe') || '1.5')
      const minWinRate = parseFloat(getSetting('min_backtest_win_rate') || '55')
      const TEST_SYMBOLS = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'AMZN']
      let approved = 0, retired = 0

      for (const strategy of discovered) {
        try {
          db.prepare("UPDATE strategies SET status = 'backtesting', updated_at = datetime('now') WHERE id = ?").run(strategy.id)
          let passCount = 0
          for (const sym of TEST_SYMBOLS) {
            try {
              const result = await backtest.runBacktest(strategy.id, sym, '1y', 10000)
              if (result.sharpe_ratio >= minSharpe && result.win_rate >= minWinRate && result.max_drawdown <= 15 && result.total_trades >= 10) passCount++
            } catch (e) { /* symbol failed, skip */ }
          }
          if (passCount >= 3) {
            db.prepare("UPDATE strategies SET status = 'approved', updated_at = datetime('now') WHERE id = ?").run(strategy.id)
            approved++
          } else {
            db.prepare("UPDATE strategies SET status = 'retired', updated_at = datetime('now') WHERE id = ?").run(strategy.id)
            retired++
          }
        } catch (e) {
          db.prepare("UPDATE strategies SET status = 'discovered', updated_at = datetime('now') WHERE id = ?").run(strategy.id)
        }
      }
      return { ok: true, message: `Backtested ${discovered.length} strategies: ${approved} approved, ${retired} retired` }
    }
    case 'deploy_strategy': {
      const strategy = db.prepare('SELECT * FROM strategies WHERE id = ?').get(payload.strategy_id)
      if (!strategy) return { ok: false, message: 'Strategy not found' }
      if (strategy.status !== 'approved') return { ok: false, message: `Strategy status is "${strategy.status}", must be "approved"` }
      const depId = uuid()
      const symbols = payload.symbols || '["SPY"]'
      db.prepare('INSERT INTO bot_deployments (id, strategy_id, symbols, status) VALUES (?, ?, ?, ?)').run(depId, strategy.id, typeof symbols === 'string' ? symbols : JSON.stringify(symbols), 'active')
      db.prepare("UPDATE strategies SET status = 'deployed', updated_at = datetime('now') WHERE id = ?").run(strategy.id)
      return { ok: true, message: `Strategy "${strategy.name}" deployed to paper trading` }
    }
    case 'trading_report': {
      const stratCounts = db.prepare("SELECT status, COUNT(*) as c FROM strategies GROUP BY status").all()
      const pipeline = {}
      for (const row of stratCounts) pipeline[row.status] = row.c

      const activeDeployments = db.prepare("SELECT bd.*, s.name as strategy_name FROM bot_deployments bd JOIN strategies s ON s.id = bd.strategy_id WHERE bd.status = 'active'").all()
      const recentTrades = db.prepare("SELECT * FROM trades ORDER BY created_at DESC LIMIT 10").all()
      const totalPnl = db.prepare("SELECT COALESCE(SUM(pnl), 0) as total FROM trades WHERE pnl IS NOT NULL").get().total

      let positions = []
      try { positions = await broker.getPositions() } catch (e) { /* no broker */ }

      let account = null
      try { account = await broker.getAccount() } catch (e) { /* no broker */ }

      const report = {
        pipeline_summary: pipeline,
        active_deployments: activeDeployments.length,
        deployment_names: activeDeployments.map(d => d.strategy_name),
        total_pnl: Math.round(totalPnl * 100) / 100,
        recent_trades: recentTrades.length,
        open_positions: positions.length,
        account_equity: account?.equity || 'N/A',
        buying_power: account?.buying_power || 'N/A'
      }
      return { ok: true, message: `**Trading Report**\n- Pipeline: ${JSON.stringify(pipeline)}\n- Active deployments: ${activeDeployments.length} (${activeDeployments.map(d => d.strategy_name).join(', ') || 'none'})\n- Total P&L: $${report.total_pnl}\n- Open positions: ${positions.length}\n- Account equity: $${report.account_equity}`, data: report }
    }
    case 'execution_report': {
      // Pull REAL execution evidence — tasks with actual tool results
      const realWork = db.prepare("SELECT agent_id, title, output, completed_at FROM tasks WHERE status = 'done' AND output LIKE '%TOOL_RESULT%' ORDER BY completed_at DESC LIMIT 10").all()
      const textOnly = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status = 'done' AND (output IS NULL OR output NOT LIKE '%TOOL_RESULT%')").get().c
      const totalDone = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status = 'done'").get().c
      const stuck = db.prepare("SELECT agent_id, title, updated_at FROM tasks WHERE status = 'in_progress' ORDER BY updated_at ASC LIMIT 5").all()
      const failed = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status = 'failed'").get().c

      let msg = `**Execution Report — The Real Picture**\n`
      msg += `- Total completed: ${totalDone} tasks\n`
      msg += `- Tasks with REAL tool execution: ${realWork.length} (these actually did something)\n`
      msg += `- Tasks with text-only output: ${textOnly} (wrote text but didn't use tools)\n`
      msg += `- Failed: ${failed}\n`
      msg += `- Currently stuck: ${stuck.length}\n\n`

      if (realWork.length > 0) {
        msg += `**Tasks that actually executed tools:**\n`
        for (const t of realWork.slice(0, 5)) {
          msg += `- ${t.agent_id}: "${t.title}" (${t.completed_at})\n`
        }
      }
      if (stuck.length > 0) {
        msg += `\n**Stuck tasks (need attention):**\n`
        for (const t of stuck) {
          msg += `- ${t.agent_id}: "${t.title}" (stuck since ${t.updated_at})\n`
        }
      }
      return { ok: true, message: msg }
    }
    case 'unstick_agents': {
      // Reset stuck in_progress tasks back to todo
      const stuck = db.prepare("SELECT id, agent_id, title FROM tasks WHERE status = 'in_progress' AND updated_at < datetime('now', '-30 minutes')").all()
      for (const t of stuck) {
        db.prepare("UPDATE tasks SET status = 'todo', updated_at = datetime('now') WHERE id = ?").run(t.id)
        activeRuns.delete(t.agent_id)
      }
      return { ok: true, message: `Reset ${stuck.length} stuck tasks back to queue: ${stuck.map(t => `${t.agent_id}:"${t.title}"`).join(', ') || 'none stuck'}` }
    }
    default:
      return { ok: false, message: `Unknown action: ${type}` }
  }
}

const CHAT_SYSTEM_PROMPT = `You are Hive — the user's AI operations manager. Talk like a real person, not a dashboard. You oversee 6 AI agents: Scout (research), Forge (building), Quill (writing), Dealer (sales), Oracle (trading), Nexus (optimization).

Your personality:
- Talk naturally like a sharp, friendly manager giving status updates over coffee
- Say "we" not "the agents" — you're part of the team
- Keep it brief — 2-4 sentences for simple questions, short bullet lists for complex ones
- Use casual language: "Scout's been grinding on..." not "Scout has been executing..."

## CRITICAL HONESTY RULES — DO NOT BREAK THESE:
- NEVER claim an agent did something unless you see EVIDENCE in the data below (tool results, output content, real metrics)
- If a task has "minimal output" or "text output only" — that means it did NOT actually execute. Be honest: "that task ran but didn't produce real results"
- If a task says "NO OUTPUT" — it failed silently. Say so.
- If you see STUCK tasks — flag them immediately
- When asked "what have the bots done?" — ONLY report tasks with "REAL WORK" evidence. Everything else is just text the agent wrote, not actual work.
- NEVER make up claims about agents sending emails, executing trades, deploying code, or publishing content unless you see real tool execution results proving it
- If things aren't working, say so DIRECTLY: "honestly most recent tasks failed to execute properly" is better than inventing success stories
- The user can handle the truth. Lying loses trust.

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
[ACTION:find_strategies]{"query":"momentum breakout strategies","sources":["github","reddit","x"]}[/ACTION]
[ACTION:backtest_all]{}[/ACTION]
[ACTION:deploy_strategy]{"strategy_id":"uuid-here"}[/ACTION]
[ACTION:trading_report]{}[/ACTION]
[ACTION:execution_report]{}[/ACTION]
[ACTION:unstick_agents]{}[/ACTION]

Rules: One action per response. Confirm what you'll do before the action block. Never invent task IDs.
When the user asks "what have the bots done" or "show me results" — use execution_report FIRST to get real data, then summarize honestly.
When tasks are stuck in_progress for too long — use unstick_agents to reset them.

## Skill Management
Skills are SKILL.md instruction packages that inject into agent prompts at runtime — they make agents better at specific tasks.
- **create_skill**: When you know specific instructions (e.g., a research framework, writing template). The skill_md field should contain detailed step-by-step instructions.
- **discover_skills**: When the user wants to find NEW skills from the web. This sends Scout to search GitHub, Reddit, X, and AI forums. Results appear as proposals for user approval.
- **assign_skill**: Assign an existing skill to another agent by slug.
When asked about improving agents or finding new techniques, prefer discover_skills to search the web.

## Trading Pipeline
- **find_strategies**: Send Scout to search GitHub, Reddit, X for algo trading strategies. Returns structured strategies that get auto-backtested.
- **backtest_all**: Immediately backtest all discovered strategies on 5 symbols (SPY, QQQ, AAPL, MSFT, AMZN) with strict thresholds.
- **deploy_strategy**: Deploy an approved strategy to paper trading.
- **trading_report**: Get full trading pipeline status — strategy counts, deployments, P&L, positions.
When asked about trading, strategies, or making money with stocks, use these actions.

## Current System State
`

// ── Global SSE Event Stream — real-time dashboard updates ────────
const sseClients = new Set()

app.get('/api/events/stream', authenticateRequest, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  })

  const send = (event, data) => {
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`) } catch {}
  }

  send('connected', { time: new Date().toISOString() })
  sseClients.add(send)

  const onTaskUpdate = (data) => send('task_update', data)
  const onAgentStatus = (data) => send('agent_status', data)
  const onSpendUpdate = (data) => send('spend_update', data)

  traceBus.on('task:update', onTaskUpdate)
  traceBus.on('agent:status', onAgentStatus)
  traceBus.on('spend:update', onSpendUpdate)

  const heartbeat = setInterval(() => {
    try { res.write(': keepalive\n\n') } catch {}
  }, 15000)

  req.on('close', () => {
    clearInterval(heartbeat)
    sseClients.delete(send)
    traceBus.off('task:update', onTaskUpdate)
    traceBus.off('agent:status', onAgentStatus)
    traceBus.off('spend:update', onSpendUpdate)
  })
})

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
        res.write(`data: ${JSON.stringify({ token: delta })}\n\n`)
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
        res.write(`data: ${JSON.stringify({ action: result })}\n\n`)
      } catch (e) {
        res.write(`data: ${JSON.stringify({ action: { ok: false, message: e.message } })}\n\n`)
      }
    }

    // Store assistant response (strip action blocks for display)
    const displayText = fullText.replace(/\[ACTION:\w+\].*?\[\/ACTION\]/gs, '').trim()
    db.prepare('INSERT INTO messages (sender_id, sender_name, sender_avatar, sender_color, text) VALUES (?, ?, ?, ?, ?)')
      .run('hive-assistant', 'Hive', '🐝', '#f59e0b', displayText)

    res.write(`data: ${JSON.stringify({ done: true, tokens_in: tokensIn, tokens_out: tokensOut, cost })}\n\n`)
    res.end()
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`)
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

app.patch('/api/settings', requireRole('admin'), (req, res) => {
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

// ── Deliverables — finished agent work with real output ──
app.get('/api/deliverables', (req, res) => {
  const { agent, limit = 30, offset = 0 } = req.query
  let where = "WHERE status = 'done' AND LENGTH(output) > 200"
  const params = []
  if (agent) { where += ' AND agent_id = ?'; params.push(agent) }

  const total = db.prepare(`SELECT COUNT(*) as c FROM tasks ${where}`).get(...params).c
  const tasks = db.prepare(`SELECT id, title, agent_id, output, evidence, spawned_by, tokens_used, estimated_cost, nexus_score, completed_at FROM tasks ${where} ORDER BY completed_at DESC LIMIT ? OFFSET ?`).all(...params, parseInt(limit), parseInt(offset))

  const deliverables = tasks.map(t => {
    const output = t.output || ''
    const hasTools = output.includes('[TOOL_RESULT')
    const hasCode = output.includes('```')
    const hasFiles = /(?:^#{1,3}\s+`?[\w\-/.]+\.\w+`?\s*$)/m.test(output)

    // Determine type
    let type = 'text'
    if (hasFiles || hasCode) type = 'code'
    if (t.agent_id === 'quill') type = 'content'
    if (t.agent_id === 'oracle' && hasTools) type = 'analysis'
    if (t.agent_id === 'scout') type = 'research'
    if (t.agent_id === 'dealer') type = 'outreach'

    // Clean output for display — strip ReAct step headers
    let cleanOutput = output
      .replace(/^--- Step \d+ ---$/gm, '')
      .replace(/\[TOOL:[\w]+\][\s\S]*?\[\/TOOL\]/g, '')
      .replace(/\[TOOL_RESULT:[\w]+\]([\s\S]*?)\[\/TOOL_RESULT\]/g, '**Tool Result:** $1')
      .replace(/\[TOOL_ERROR:[\w]+\][\s\S]*?\[\/TOOL_ERROR\]/g, '')
      .replace(/\[CONSULT:\w+\]\s*/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    let ev = {}
    try { ev = JSON.parse(t.evidence || '{}') } catch { /* empty */ }

    return {
      id: t.id,
      title: t.title,
      agent_id: t.agent_id,
      type,
      has_tools: hasTools || (ev.tools_used || 0) > 0,
      has_code: hasCode,
      output_length: output.length,
      output: cleanOutput,
      tokens_used: t.tokens_used,
      cost: t.estimated_cost,
      score: t.nexus_score,
      completed_at: t.completed_at,
      evidence: ev,
      spawned_by: t.spawned_by || null
    }
  })

  res.json({ deliverables, total })
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
      model: getSmartModel('quill'),
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
    log('error', 'command_parse_failed', { error: err.message })
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
    status: 'ok',
    uptime: process.uptime(),
    agents: agents.length,
    activeRuns: activeRuns.size,
    heartbeats: heartbeatJobs.length,
    circuits: Object.values(breakers).map(b => b.status),
    memory: process.memoryUsage(),
    dbSize: (() => { try { return statSync('hive.db').size } catch { return 0 } })()
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

// ── Automated database backup (every 24 hours) ───
registerHeartbeat('db-backup', 24 * 60 * 60 * 1000, async () => {
  const backupDir = join(__dirname, '..', 'backups')
  try { mkdirSync(backupDir, { recursive: true }) } catch {}

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const backupPath = join(backupDir, `hive-${timestamp}.db`)

  try {
    db.pragma('wal_checkpoint(TRUNCATE)')
    copyFileSync(join(__dirname, '..', 'hive.db'), backupPath)
    log('info', 'db_backup_created', { path: backupPath })

    // Keep only last 7 backups
    const backups = readdirSync(backupDir)
      .filter(f => f.startsWith('hive-') && f.endsWith('.db'))
      .sort()

    while (backups.length > 7) {
      const old = backups.shift()
      try { unlinkSync(join(backupDir, old)) } catch {}
    }
  } catch (e) {
    notifyHeartbeatError('db-backup', e)
  }
})

// ── Seed Core Trading Skills ─────────────────────
// ══════════════════════════════════════════════════════
// ██ EVALUATION HARNESS — Automated agent testing      ██
// ══════════════════════════════════════════════════════

app.get('/api/eval/cases', (req, res) => {
  const cases = db.prepare('SELECT * FROM eval_cases ORDER BY created_at DESC').all()
  res.json(cases)
})

app.post('/api/eval/cases', (req, res) => {
  const { name, agent_id, input_prompt, expected_tools, expected_keywords, max_cost } = req.body
  if (!name || !agent_id || !input_prompt) return res.status(400).json({ error: 'name, agent_id, input_prompt required' })
  const id = uuid()
  db.prepare('INSERT INTO eval_cases (id, name, agent_id, input_prompt, expected_tools, expected_keywords, max_cost) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, name, agent_id, input_prompt, JSON.stringify(expected_tools || []), JSON.stringify(expected_keywords || []), max_cost || 0.50)
  res.json({ id, name, agent_id })
})

app.delete('/api/eval/cases/:id', (req, res) => {
  db.prepare('DELETE FROM eval_cases WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

app.post('/api/eval/run/:caseId', async (req, res) => {
  const evalCase = db.prepare('SELECT * FROM eval_cases WHERE id = ?').get(req.params.caseId)
  if (!evalCase) return res.status(404).json({ error: 'Eval case not found' })

  const runId = uuid()
  db.prepare("INSERT INTO eval_runs (id, eval_case_id, status) VALUES (?, ?, 'running')").run(runId, evalCase.id)
  res.json({ runId, status: 'running' })

  // Run eval async
  try {
    const agent = agents.find(a => a.id === evalCase.agent_id)
    if (!agent) throw new Error('Agent not found')

    const taskId = uuid()
    db.prepare("INSERT INTO tasks (id, title, description, agent_id, status, token_budget) VALUES (?, ?, ?, ?, 'in_progress', ?)").run(
      taskId, `[Eval] ${evalCase.name}`, evalCase.input_prompt, agent.id, 8192
    )

    const start = Date.now()
    const toolsPrompt = buildToolsPrompt(agent.id)
    const evalMessages = [{ role: 'user', content: evalCase.input_prompt }]
    let output = ''
    const toolsUsed = {}

    // Run 3 steps max for eval
    for (let step = 0; step < 3; step++) {
      const response = await callClaude({
        model: getSmartModel(agent.id),
        max_tokens: 2048,
        system: agent.systemPrompt + toolsPrompt,
        messages: evalMessages,
        tools: SUPPORTS_FUNCTION_CALLING[getSmartModel(agent.id)] ? buildToolsSchema(agent.id) : undefined,
      }, agent.id, taskId)

      const text = response.content.map(b => b.text || '').join('')
      output += text
      evalMessages.push({ role: 'assistant', content: text })

      const nativeCalls = response.nativeToolCalls || []
      const textCalls = parseToolCalls(text)
      const allCalls = [...nativeCalls, ...textCalls]
      for (const tc of allCalls) toolsUsed[tc.name] = (toolsUsed[tc.name] || 0) + 1

      if (allCalls.length > 0) {
        const results = await Promise.all(allCalls.slice(0, 3).map(tc => executeTool(tc, agent.id, taskId)))
        const resultsText = results.map(r => r.error ? `[TOOL_ERROR:${r.name}]${r.error}[/TOOL_ERROR]` : `[TOOL_RESULT:${r.name}]${r.resultStr}[/TOOL_RESULT]`).join('\n')
        evalMessages.push({ role: 'user', content: resultsText })
      } else {
        break
      }
    }

    const duration = Date.now() - start
    const costRow = db.prepare('SELECT estimated_cost FROM tasks WHERE id = ?').get(taskId)
    const cost = costRow?.estimated_cost || 0

    // Score: check expected tools and keywords
    const expectedTools = JSON.parse(evalCase.expected_tools || '[]')
    const expectedKeywords = JSON.parse(evalCase.expected_keywords || '[]')
    let score = 0
    const toolNames = Object.keys(toolsUsed)
    const toolMatch = expectedTools.length === 0 ? 1 : expectedTools.filter(t => toolNames.includes(t)).length / expectedTools.length
    const kwMatch = expectedKeywords.length === 0 ? 1 : expectedKeywords.filter(kw => output.toLowerCase().includes(kw.toLowerCase())).length / expectedKeywords.length
    score = Math.round(((toolMatch * 0.7) + (kwMatch * 0.3)) * 100) / 100

    const passed = score >= 0.7 && toolMatch >= 0.5
    const failReason = !passed ? `Tool match: ${(toolMatch * 100).toFixed(0)}%, Keyword match: ${(kwMatch * 100).toFixed(0)}%` : ''

    db.prepare('UPDATE eval_runs SET status = ?, actual_tools = ?, actual_output = ?, score = ?, cost = ?, duration_ms = ?, failure_reason = ? WHERE id = ?')
      .run(passed ? 'passed' : 'failed', JSON.stringify(toolNames), output.slice(0, 5000), score, cost, duration, failReason, runId)

    // Clean up eval task
    db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId)
  } catch (e) {
    db.prepare("UPDATE eval_runs SET status = 'failed', failure_reason = ? WHERE id = ?").run(e.message, runId)
  }
})

app.post('/api/eval/run-all', async (req, res) => {
  const cases = db.prepare('SELECT * FROM eval_cases').all()
  if (cases.length === 0) return res.json({ message: 'No eval cases', results: [] })

  const results = []
  for (const c of cases) {
    const runId = uuid()
    db.prepare("INSERT INTO eval_runs (id, eval_case_id, status) VALUES (?, ?, 'pending')").run(runId, c.id)
    results.push({ runId, caseId: c.id, name: c.name })
  }
  res.json({ message: `Running ${cases.length} eval cases`, results })

  // Run sequentially in background
  for (const r of results) {
    try {
      const resp = await fetch(`http://localhost:${PORT}/api/eval/run/${r.caseId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' }
      })
      if (!resp.ok) console.error(`Eval run failed for ${r.name}`)
    } catch (e) {
      console.error(`Eval error for ${r.name}:`, e.message)
    }
  }
})

app.get('/api/eval/history', (req, res) => {
  const { case_id, limit } = req.query
  let q = 'SELECT er.*, ec.name as case_name, ec.agent_id FROM eval_runs er JOIN eval_cases ec ON ec.id = er.eval_case_id'
  const params = []
  if (case_id) { q += ' WHERE er.eval_case_id = ?'; params.push(case_id) }
  q += ' ORDER BY er.created_at DESC LIMIT ?'
  params.push(parseInt(limit) || 50)
  res.json(db.prepare(q).all(...params))
})

// Seed default eval cases
const existingCases = db.prepare('SELECT COUNT(*) as c FROM eval_cases').get().c
if (existingCases === 0) {
  const defaultCases = [
    { name: 'Scout: Research AI Tools', agent_id: 'scout', input_prompt: 'Research the top 3 trending AI tools this week and create follow-up tasks', expected_tools: ['web_search', 'create_task'], expected_keywords: ['AI'] },
    { name: 'Forge: Build Express Server', agent_id: 'forge', input_prompt: 'Build a minimal Express.js hello world server with package.json', expected_tools: ['write_file'], expected_keywords: ['express', 'server'] },
    { name: 'Quill: Write Blog Post', agent_id: 'quill', input_prompt: 'Write a short blog post about AI productivity tools', expected_tools: ['web_search', 'write_file'], expected_keywords: ['productivity'] },
    { name: 'Dealer: Find Freelance Jobs', agent_id: 'dealer', input_prompt: 'Find AI/automation freelance opportunities and draft outreach', expected_tools: ['web_search'], expected_keywords: ['freelance'] },
    { name: 'Oracle: Analyze AAPL', agent_id: 'oracle', input_prompt: 'Analyze AAPL stock — get current price, indicators, and make a recommendation', expected_tools: ['get_quote', 'get_indicators'], expected_keywords: ['AAPL'] },
    { name: 'Nexus: Review Agent Work', agent_id: 'nexus', input_prompt: 'Review the most recent completed tasks and score their quality', expected_tools: ['list_tasks'], expected_keywords: ['score'] },
  ]
  for (const c of defaultCases) {
    db.prepare('INSERT INTO eval_cases (id, name, agent_id, input_prompt, expected_tools, expected_keywords) VALUES (?, ?, ?, ?, ?, ?)').run(
      uuid(), c.name, c.agent_id, c.input_prompt, JSON.stringify(c.expected_tools), JSON.stringify(c.expected_keywords)
    )
  }
  console.log('🧪 Seeded 6 default eval cases')
}

// ══════════════════════════════════════════════════════
// ██ MCP CLIENT BRIDGE — External tool integration     ██
// ══════════════════════════════════════════════════════

// MCP server registry (lightweight — no MCP SDK dependency required for basic HTTP/SSE)
const mcpClients = new Map()

app.get('/api/mcp/servers', (req, res) => {
  const servers = db.prepare('SELECT * FROM mcp_servers ORDER BY created_at DESC').all()
  const enriched = servers.map(s => ({
    ...s,
    connected: mcpClients.has(s.id),
    tools: mcpClients.get(s.id)?.tools || []
  }))
  res.json(enriched)
})

app.post('/api/mcp/servers', (req, res) => {
  const { name, transport, command, args, url } = req.body
  if (!name || !transport) return res.status(400).json({ error: 'name, transport required' })
  const id = uuid()
  db.prepare('INSERT INTO mcp_servers (id, name, transport, command, args, url) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, name, transport, command || '', JSON.stringify(args || []), url || '')
  res.json({ id, name, transport })
})

app.delete('/api/mcp/servers/:id', (req, res) => {
  mcpClients.delete(req.params.id)
  db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

app.post('/api/mcp/servers/:id/test', async (req, res) => {
  const server = db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(req.params.id)
  if (!server) return res.status(404).json({ error: 'Server not found' })

  if (server.transport === 'sse' && server.url) {
    try {
      const resp = await fetch(server.url, { signal: AbortSignal.timeout(5000) })
      res.json({ connected: resp.ok, status: resp.status })
    } catch (e) {
      res.json({ connected: false, error: e.message })
    }
  } else {
    res.json({ connected: false, message: 'stdio transport — requires local process management' })
  }
})

app.get('/api/mcp/tools', (req, res) => {
  const allTools = []
  for (const [serverId, client] of mcpClients) {
    for (const tool of (client.tools || [])) {
      allTools.push({ ...tool, serverId })
    }
  }
  res.json(allTools)
})

// ══════════════════════════════════════════════════════
// ██ SEMANTIC MEMORY — Vector search for agents        ██
// ══════════════════════════════════════════════════════

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1)
}

async function embedText(text) {
  try {
    const response = await openai.embeddings.create({
      model: 'openai/text-embedding-3-small',
      input: text.slice(0, 8000),
    })
    return response.data?.[0]?.embedding || null
  } catch (e) {
    console.error('Embedding failed:', e.message)
    return null
  }
}

async function storeMemoryEmbedding(agentId, content, taskId, tags) {
  const embedding = await embedText(content)
  if (!embedding) return null
  db.prepare('INSERT INTO memory_embeddings (agent_id, content, embedding, tags, source_task_id) VALUES (?, ?, ?, ?, ?)')
    .run(agentId, content.slice(0, 5000), JSON.stringify(embedding), JSON.stringify(tags || []), taskId || '')
  return true
}

async function searchMemoryEmbeddings(agentId, query, topK = 5) {
  const queryEmbed = await embedText(query)
  if (!queryEmbed) return []
  const where = agentId ? 'WHERE agent_id = ?' : ''
  const params = agentId ? [agentId] : []
  const rows = db.prepare(`SELECT * FROM memory_embeddings ${where} ORDER BY created_at DESC LIMIT 200`).all(...params)

  const scored = rows.map(row => {
    try {
      const emb = JSON.parse(row.embedding)
      return { ...row, score: cosineSimilarity(queryEmbed, emb) }
    } catch { return { ...row, score: 0 } }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK).filter(s => s.score > 0.3).map(s => ({
    content: s.content,
    agent_id: s.agent_id,
    score: Math.round(s.score * 100) / 100,
    created_at: s.created_at,
    tags: s.tags,
  }))
}

// ══════════════════════════════════════════════════════
// ██ RAG KNOWLEDGE BASE — Document chunking + search   ██
// ══════════════════════════════════════════════════════

function chunkText(text, maxTokens = 500) {
  const words = text.split(/\s+/)
  const chunks = []
  const wordsPerChunk = Math.floor(maxTokens * 0.75)
  const overlap = Math.floor(wordsPerChunk * 0.1)

  for (let i = 0; i < words.length; i += wordsPerChunk - overlap) {
    const chunk = words.slice(i, i + wordsPerChunk).join(' ')
    if (chunk.trim()) chunks.push(chunk.trim())
  }
  return chunks
}

async function processDocument(docId) {
  const doc = db.prepare('SELECT * FROM knowledge_documents WHERE id = ?').get(docId)
  if (!doc) return

  db.prepare("UPDATE knowledge_documents SET status = 'processing' WHERE id = ?").run(docId)

  try {
    const chunks = chunkText(doc.content)

    for (let i = 0; i < chunks.length; i++) {
      const chunkId = uuid()
      const embedding = await embedText(chunks[i])

      db.prepare('INSERT INTO knowledge_chunks (id, document_id, content, embedding, chunk_index, token_count) VALUES (?, ?, ?, ?, ?, ?)')
        .run(chunkId, docId, chunks[i], embedding ? JSON.stringify(embedding) : '', i, Math.ceil(chunks[i].split(/\s+/).length * 1.3))
    }

    db.prepare("UPDATE knowledge_documents SET status = 'ready', chunk_count = ? WHERE id = ?").run(chunks.length, docId)
    console.log(`📚 Document "${doc.title}" processed: ${chunks.length} chunks`)
  } catch (e) {
    db.prepare("UPDATE knowledge_documents SET status = 'failed' WHERE id = ?").run(docId)
    console.error('Document processing failed:', e.message)
  }
}

async function searchKnowledge(query, topK = 5) {
  const queryEmbed = await embedText(query)
  if (!queryEmbed) return []

  const chunks = db.prepare("SELECT id, document_id, content, embedding FROM knowledge_chunks WHERE embedding != ''").all()

  const scored = chunks.map(chunk => {
    try {
      const embedding = JSON.parse(chunk.embedding)
      return { ...chunk, score: cosineSimilarity(queryEmbed, embedding) }
    } catch { return null }
  }).filter(Boolean)

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK).filter(s => s.score > 0.3).map(({ id, document_id, content, score }) => ({ id, document_id, content, score: Math.round(score * 100) / 100 }))
}

app.get('/api/memory/search', async (req, res) => {
  const { query, agent_id, top_k } = req.query
  if (!query) return res.status(400).json({ error: 'query required' })
  const results = await searchMemoryEmbeddings(agent_id || null, query, parseInt(top_k) || 5)
  res.json(results)
})

app.get('/api/memory/entries', (req, res) => {
  const { agent_id, limit } = req.query
  const where = agent_id ? 'WHERE agent_id = ?' : ''
  const params = agent_id ? [agent_id] : []
  const entries = db.prepare(`SELECT id, agent_id, content, tags, source_task_id, created_at FROM memory_embeddings ${where} ORDER BY created_at DESC LIMIT ?`).all(...params, parseInt(limit) || 50)
  res.json(entries)
})

// ── Knowledge Base CRUD ──────────────────────────────
app.get('/api/knowledge', (req, res) => {
  const docs = db.prepare('SELECT * FROM knowledge_documents ORDER BY created_at DESC').all()
  res.json(docs)
})

app.post('/api/knowledge', async (req, res) => {
  try {
    const { title, content, source_type = 'text', source_url = '' } = req.body
    if (!title || !content) return res.status(400).json({ error: 'Title and content required' })

    const id = uuid()
    db.prepare('INSERT INTO knowledge_documents (id, title, source_type, source_url, content) VALUES (?, ?, ?, ?, ?)')
      .run(id, title, source_type, source_url, content)

    processDocument(id).catch(e => console.error('Async doc processing failed:', e.message))

    res.json({ id, status: 'pending' })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.delete('/api/knowledge/:id', (req, res) => {
  db.prepare('DELETE FROM knowledge_documents WHERE id = ?').run(req.params.id)
  res.json({ deleted: true })
})

app.get('/api/knowledge/:id/chunks', (req, res) => {
  const chunks = db.prepare('SELECT id, content, chunk_index, token_count FROM knowledge_chunks WHERE document_id = ? ORDER BY chunk_index').all(req.params.id)
  res.json(chunks)
})

app.post('/api/knowledge/search', async (req, res) => {
  try {
    const { query, topK = 5 } = req.body
    if (!query) return res.status(400).json({ error: 'Query required' })
    const results = await searchKnowledge(query, topK)
    res.json(results)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/knowledge/import-url', async (req, res) => {
  try {
    const { url, title } = req.body
    if (!url) return res.status(400).json({ error: 'URL required' })

    const response = await fetch(url, { signal: AbortSignal.timeout(30000) })
    const text = await response.text()
    const content = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100000)

    const id = uuid()
    db.prepare('INSERT INTO knowledge_documents (id, title, source_type, source_url, content) VALUES (?, ?, ?, ?, ?)')
      .run(id, title || url, 'url', url, content)

    processDocument(id).catch(e => console.error('URL doc processing failed:', e.message))
    res.json({ id, status: 'pending' })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ══════════════════════════════════════════════════════
// ██ OPENTELEMETRY TRACE EXPORT                        ██
// ══════════════════════════════════════════════════════

app.get('/api/traces/:taskId/otlp', (req, res) => {
  const traces = db.prepare('SELECT * FROM task_traces WHERE task_id = ? ORDER BY step ASC, created_at ASC').all(req.params.taskId)
  if (traces.length === 0) return res.json({ resourceSpans: [] })

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.taskId)
  const traceId = req.params.taskId.replace(/-/g, '').slice(0, 32).padEnd(32, '0')

  const spans = traces.map((t, i) => {
    const spanId = (t.span_id || uuid().replace(/-/g, '').slice(0, 16)).padEnd(16, '0')
    const parentSpanId = t.parent_span_id || (t.type !== 'llm_call' && i > 0 ? traces[i - 1].span_id || '' : '')
    const startNanos = new Date(t.created_at + 'Z').getTime() * 1_000_000
    const endNanos = startNanos + (t.duration_ms || 0) * 1_000_000

    return {
      traceId,
      spanId,
      parentSpanId: parentSpanId || undefined,
      name: t.type,
      kind: t.type === 'llm_call' ? 3 : 2, // CLIENT=3, INTERNAL=2
      startTimeUnixNano: String(startNanos),
      endTimeUnixNano: String(endNanos),
      attributes: [
        { key: 'agent.id', value: { stringValue: t.agent_id || '' } },
        { key: 'task.id', value: { stringValue: t.task_id } },
        { key: 'step', value: { intValue: t.step } },
        { key: 'model', value: { stringValue: t.model || '' } },
        { key: 'tokens.input', value: { intValue: t.tokens_in || 0 } },
        { key: 'tokens.output', value: { intValue: t.tokens_out || 0 } },
        { key: 'cost', value: { doubleValue: t.cost || 0 } },
        { key: 'input', value: { stringValue: (t.input_summary || '').slice(0, 500) } },
        { key: 'output', value: { stringValue: (t.output_summary || '').slice(0, 500) } },
      ],
      status: { code: t.type === 'tool_error' ? 2 : 1 }, // ERROR=2, OK=1
    }
  })

  res.json({
    resourceSpans: [{
      resource: {
        attributes: [
          { key: 'service.name', value: { stringValue: 'hive' } },
          { key: 'service.version', value: { stringValue: '1.0.0' } },
          { key: 'task.title', value: { stringValue: task?.title || '' } },
          { key: 'agent.id', value: { stringValue: task?.agent_id || '' } },
        ]
      },
      scopeSpans: [{
        scope: { name: 'hive.agent.traces', version: '1.0.0' },
        spans,
      }]
    }]
  })
})

// ══════════════════════════════════════════════════════
// ██ AGENT PROTOCOL API — Standard agent interface     ██
// ══════════════════════════════════════════════════════

app.get('/ap/v1/agent/tasks', (req, res) => {
  const { page, page_size } = req.query
  const limit = parseInt(page_size) || 20
  const offset = ((parseInt(page) || 1) - 1) * limit
  const tasks = db.prepare('SELECT * FROM tasks ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset)
  res.json({
    tasks: tasks.map(t => ({
      task_id: t.id,
      input: t.description || t.title,
      additional_input: { title: t.title, agent_id: t.agent_id, priority: t.priority },
      status: t.status === 'done' ? 'completed' : t.status === 'in_progress' ? 'running' : t.status,
      output: t.output || null,
      artifacts: [],
      created_at: t.created_at,
    })),
    pagination: { total: db.prepare('SELECT COUNT(*) as c FROM tasks').get().c, page: parseInt(page) || 1, page_size: limit }
  })
})

app.post('/ap/v1/agent/tasks', (req, res) => {
  const { input, additional_input } = req.body
  if (!input) return res.status(400).json({ error: 'input required' })
  const id = uuid()
  const agentId = additional_input?.agent_id || 'scout'
  const title = additional_input?.title || input.slice(0, 200)
  db.prepare("INSERT INTO tasks (id, title, description, agent_id, status) VALUES (?, ?, ?, ?, 'todo')").run(id, title, input, agentId)
  setTimeout(() => processAgentQueue(agentId), 2000)
  res.status(201).json({
    task_id: id,
    input,
    status: 'created',
    created_at: new Date().toISOString(),
  })
})

app.get('/ap/v1/agent/tasks/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id)
  if (!task) return res.status(404).json({ error: 'Task not found' })
  res.json({
    task_id: task.id,
    input: task.description || task.title,
    additional_input: { title: task.title, agent_id: task.agent_id, priority: task.priority, evidence: task.evidence },
    status: task.status === 'done' ? 'completed' : task.status === 'in_progress' ? 'running' : task.status,
    output: task.output || null,
    artifacts: [],
    created_at: task.created_at,
    updated_at: task.updated_at,
  })
})

app.get('/ap/v1/agent/tasks/:id/steps', (req, res) => {
  const traces = db.prepare('SELECT * FROM task_traces WHERE task_id = ? ORDER BY step ASC, created_at ASC').all(req.params.id)
  res.json({
    steps: traces.map(t => ({
      step_id: String(t.id),
      task_id: t.task_id,
      name: t.type,
      status: 'completed',
      input: t.input_summary,
      output: t.output_summary,
      additional_output: { tokens_in: t.tokens_in, tokens_out: t.tokens_out, cost: t.cost, duration_ms: t.duration_ms, model: t.model },
      created_at: t.created_at,
    }))
  })
})

app.post('/ap/v1/agent/tasks/:id/steps', async (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id)
  if (!task) return res.status(404).json({ error: 'Task not found' })
  if (task.status === 'in_progress') return res.status(409).json({ error: 'Task already running' })
  db.prepare("UPDATE tasks SET status = 'todo', updated_at = datetime('now') WHERE id = ?").run(task.id)
  if (task.agent_id) setTimeout(() => processAgentQueue(task.agent_id), 1000)
  res.json({ step_id: uuid(), task_id: task.id, status: 'queued' })
})

app.get('/ap/v1/agent/tasks/:id/artifacts', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id)
  if (!task) return res.status(404).json({ error: 'Task not found' })
  let evidence = {}
  try { evidence = JSON.parse(task.evidence || '{}') } catch {}
  const artifacts = []
  if (task.output) artifacts.push({ artifact_id: `${task.id}-output`, file_name: 'output.txt', relative_path: 'output.txt' })
  if (evidence.files_created) artifacts.push({ artifact_id: `${task.id}-files`, file_name: 'files', relative_path: 'files/', metadata: { count: evidence.files_created } })
  res.json({ artifacts })
})

// ══════════════════════════════════════════════════════
// ██ SKILL IMPORT/EXPORT                               ██
// ══════════════════════════════════════════════════════

app.get('/api/skills/:slug/export', (req, res) => {
  const skill = db.prepare('SELECT * FROM skills WHERE slug = ?').get(req.params.slug)
  if (!skill) return res.status(404).json({ error: 'Skill not found' })

  // Build SKILL.md with frontmatter
  const assignedAgents = db.prepare('SELECT agent_id FROM agent_skills_v2 WHERE skill_id = ?').all(skill.id).map(r => r.agent_id)
  let tags = []
  try { tags = JSON.parse(skill.tags || '[]') } catch {}
  let requiresTools = []
  try { requiresTools = JSON.parse(skill.requires_tools || '[]') } catch {}

  const frontmatter = [
    '---',
    `name: ${skill.name}`,
    `slug: ${skill.slug}`,
    `description: ${skill.description}`,
    `version: ${skill.version}`,
    `author: ${skill.author || 'john'}`,
    `agents: [${assignedAgents.join(', ')}]`,
    `tags: [${tags.join(', ')}]`,
    `requires_tools: [${requiresTools.join(', ')}]`,
    '---',
    '',
  ].join('\n')

  res.setHeader('Content-Type', 'text/markdown')
  res.setHeader('Content-Disposition', `attachment; filename="${skill.slug}.skill.md"`)
  res.send(frontmatter + skill.skill_md)
})

app.post('/api/skills/import', (req, res) => {
  const { content } = req.body
  if (!content) return res.status(400).json({ error: 'content required' })

  // Parse YAML frontmatter
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!fmMatch) return res.status(400).json({ error: 'Invalid SKILL.md — missing frontmatter' })

  const frontmatter = fmMatch[1]
  const skillMd = fmMatch[2].trim()

  const getName = (key) => {
    const m = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
    return m ? m[1].trim() : ''
  }
  const getArray = (key) => {
    const m = frontmatter.match(new RegExp(`^${key}:\\s*\\[(.*)\\]$`, 'm'))
    return m ? m[1].split(',').map(s => s.trim()).filter(Boolean) : []
  }

  const name = getName('name')
  const slug = getName('slug') || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-')
  const description = getName('description')
  const version = getName('version') || '1.0.0'
  const author = getName('author') || 'imported'
  const agentIds = getArray('agents')
  const tags = getArray('tags')
  const requiresTools = getArray('requires_tools')

  if (!name || !skillMd) return res.status(400).json({ error: 'name and skill content required' })

  // Upsert skill
  const existing = db.prepare('SELECT id FROM skills WHERE slug = ?').get(slug)
  const skillId = existing?.id || uuid()
  if (existing) {
    db.prepare('UPDATE skills SET name=?, description=?, version=?, author=?, skill_md=?, tags=?, requires_tools=?, source=?, updated_at=datetime(\'now\') WHERE id=?')
      .run(name, description, version, author, skillMd, JSON.stringify(tags), JSON.stringify(requiresTools), 'custom', skillId)
  } else {
    db.prepare('INSERT INTO skills (id, slug, name, description, version, author, skill_md, tags, requires_tools, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(skillId, slug, name, description, version, author, skillMd, JSON.stringify(tags), JSON.stringify(requiresTools), 'custom')
  }

  // Assign to agents
  for (const agentId of agentIds) {
    db.prepare('INSERT OR IGNORE INTO agent_skills_v2 (agent_id, skill_id) VALUES (?, ?)').run(agentId, skillId)
  }

  res.json({ id: skillId, slug, name, agents: agentIds })
})

app.post('/api/skills/import-url', async (req, res) => {
  const { url } = req.body
  if (!url) return res.status(400).json({ error: 'url required' })
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!resp.ok) return res.status(400).json({ error: `Failed to fetch: ${resp.status}` })
    const content = await resp.text()
    // Inline the import logic
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
    if (!fmMatch) return res.status(400).json({ error: 'Invalid SKILL.md — missing frontmatter' })
    const frontmatter = fmMatch[1]
    const skillMd = fmMatch[2].trim()
    const getName = (key) => { const m = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'm')); return m ? m[1].trim() : '' }
    const getArray = (key) => { const m = frontmatter.match(new RegExp(`^${key}:\\s*\\[(.*)\\]$`, 'm')); return m ? m[1].split(',').map(s => s.trim()).filter(Boolean) : [] }
    const name = getName('name')
    const slug = getName('slug') || name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    if (!name || !skillMd) return res.status(400).json({ error: 'name and content required' })
    const skillId = uuid()
    db.prepare('INSERT OR REPLACE INTO skills (id, slug, name, description, version, author, skill_md, tags, requires_tools, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(skillId, slug, name, getName('description'), getName('version') || '1.0.0', getName('author') || 'imported', skillMd, JSON.stringify(getArray('tags')), JSON.stringify(getArray('requires_tools')), 'custom')
    for (const agentId of getArray('agents')) {
      db.prepare('INSERT OR IGNORE INTO agent_skills_v2 (agent_id, skill_id) VALUES (?, ?)').run(agentId, skillId)
    }
    res.json({ id: skillId, slug, name, source: url })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ══════════════════════════════════════════════════════
// ██ GUARDRAIL EVENTS ENDPOINT                         ██
// ══════════════════════════════════════════════════════

app.get('/api/guardrails/events', (req, res) => {
  const { limit } = req.query
  const events = db.prepare('SELECT * FROM guardrail_events ORDER BY created_at DESC LIMIT ?').all(parseInt(limit) || 50)
  res.json(events)
})

function seedTradingSkills() {
  const existingCount = db.prepare('SELECT COUNT(*) as c FROM skills').get().c
  if (existingCount >= 3) return // Already seeded

  const TRADING_SKILLS = [
    {
      slug: 'alpaca-trading-pro',
      name: 'Alpaca Trading Pro',
      description: 'Advanced Alpaca order execution, position sizing, risk management, and trailing stops',
      tags: ['trading', 'alpaca', 'execution'],
      agents: ['oracle', 'dealer'],
      skill_md: `# Alpaca Trading Pro

## Order Execution
When executing trades through Alpaca:
1. **Market orders** for high-liquidity symbols (SPY, QQQ, AAPL) — fast fills, minimal slippage
2. **Limit orders** for mid/low-cap stocks — set limit 0.1-0.5% above/below current price
3. **Stop-loss orders** — always set on entry. Default 5%, tighten to 3% for volatile stocks
4. **Trailing stops** — use 2-3% trail for momentum plays, 5% for swing trades

## Position Sizing (Fixed Fractional)
- Never risk more than 2% of portfolio on a single trade
- Position size = (Portfolio * 0.02) / (Entry - StopLoss)
- Maximum single position: 10% of portfolio
- Scale in: enter 50% at signal, add 50% on confirmation

## Risk Rules
- Maximum 5 concurrent positions
- Maximum 3 trades per day to avoid overtrading
- No trading in first 15min or last 15min of session (volatile)
- If portfolio drops 3% in a day, stop all new entries
- Check correlation — don't hold 3+ tech stocks simultaneously

## Order Flow
1. Check market status (must be open)
2. Verify buying power
3. Calculate position size
4. Place order with stop-loss
5. Log trade with strategy reference
6. Monitor for exit signals`
    },
    {
      slug: 'technical-analysis-master',
      name: 'Technical Analysis Master',
      description: 'RSI, MACD, Bollinger, SMA/EMA crossovers, volume analysis, chart pattern recognition',
      tags: ['trading', 'analysis', 'indicators'],
      agents: ['oracle'],
      skill_md: `# Technical Analysis Master

## Indicator Signals

### RSI (14-period)
- **Oversold**: RSI < 30 → potential buy (confirm with price action)
- **Overbought**: RSI > 70 → potential sell or tighten stops
- **RSI Divergence**: Price makes new low but RSI makes higher low → strong reversal signal
- **Hidden divergence**: Price makes higher low, RSI makes lower low → trend continuation

### MACD (12/26/9)
- **Bullish crossover**: MACD line crosses above signal line → buy signal
- **Bearish crossover**: MACD line crosses below signal line → sell signal
- **Histogram expansion**: Increasing momentum in current direction
- **Zero-line cross**: MACD crossing zero confirms trend change

### Moving Averages
- **Golden Cross**: SMA50 crosses above SMA200 → long-term bullish
- **Death Cross**: SMA50 crosses below SMA200 → long-term bearish
- **Price vs SMA20**: Above = short-term bullish, below = bearish
- **EMA12/26 crossover**: Fast trend signals (use with RSI confirmation)

### Bollinger Bands (20, 2σ)
- **Squeeze**: Bands narrowing → breakout imminent (direction unknown)
- **Walk the band**: Price riding upper band = strong uptrend
- **Mean reversion**: Price at lower band + RSI < 35 → buy signal
- **Band width**: Use as volatility filter — skip trades when width < 2%

## Multi-Indicator Confirmation
Strong buy: RSI < 35 + MACD bullish crossover + price near SMA support
Strong sell: RSI > 70 + MACD bearish crossover + price at resistance
Never trade on a single indicator alone. Require 2+ confirmations.`
    },
    {
      slug: 'strategy-backtesting',
      name: 'Strategy Backtesting',
      description: 'Designing testable strategies, walk-forward validation, avoiding overfitting, performance metrics',
      tags: ['trading', 'backtesting', 'validation'],
      agents: ['oracle'],
      skill_md: `# Strategy Backtesting

## Designing Testable Strategies
Every strategy MUST have:
1. **Clear entry conditions** — specific indicator values (e.g., RSI < 30 AND price > SMA200)
2. **Clear exit conditions** — profit target OR indicator signal (e.g., RSI > 70)
3. **Stop-loss** — always include, typically 3-7%
4. **Position sizing** — fixed dollar amount or percentage of portfolio

## Avoiding Overfitting
- **Minimum 100 trades** in backtest period — fewer = unreliable statistics
- **Walk-forward validation** — train on 70%, validate on 30%. If validation Sharpe is less than 60% of training Sharpe, strategy is overfit
- **Multi-symbol testing** — strategy must work on 3+ different symbols
- **Parameter sensitivity** — vary each parameter ±20%. If results collapse, it's curve-fitted
- **Avoid too many conditions** — max 3 entry conditions, 2 exit conditions. More = overfitting

## Key Metrics
- **Sharpe Ratio** > 1.5 = good, > 2.0 = excellent (below 1.0 = reject)
- **Win Rate** > 55% for trend strategies, > 45% acceptable if reward:risk > 2:1
- **Max Drawdown** < 15% = acceptable, > 25% = too risky
- **Profit Factor** > 1.5 (total profits / total losses)
- **Total Trades** > 100 for statistical significance

## Walk-Forward Process
1. Split historical data: 70% training, 30% validation
2. Optimize on training period
3. Run UNCHANGED strategy on validation period
4. Compare metrics — validation should be within 40% of training
5. If validated, run on paper for 30 days before live capital`
    },
    {
      slug: 'crypto-defi-trading',
      name: 'Crypto & DeFi Trading',
      description: 'DEX trading, yield farming, liquidity provision, token safety analysis',
      tags: ['crypto', 'defi', 'trading'],
      agents: ['scout', 'oracle'],
      skill_md: `# Crypto & DeFi Trading

## Token Safety Checks (ALWAYS before trading)
1. Contract verified on block explorer
2. Liquidity locked (check lock period)
3. No mint function / renounced ownership
4. Token age > 7 days minimum
5. Minimum $500K liquidity pool
6. No suspicious holder concentration (top wallet < 10%)

## DEX Trading
- Use limit orders on DEX aggregators (1inch, Jupiter) when possible
- Set slippage tolerance: 0.5% for stables, 1-2% for majors, 3-5% for small caps
- Check gas fees — don't trade if fees > 2% of position size
- Use MEV protection (Flashbots on ETH, Jito on SOL)

## Yield Farming
- Only farm on audited protocols (TVL > $10M)
- Impermanent loss calculation: always model worst-case 50% price divergence
- Compound frequency: daily for high APR, weekly for moderate
- Monitor pool TVL — exit if dropping > 20% in 24h

## Research Signals
- Track whale wallets (>$1M movements)
- Monitor new token listings on major CEXs
- Watch DeFi TVL trends across chains
- Follow governance proposals that affect tokenomics`
    },
    {
      slug: 'prediction-markets',
      name: 'Prediction Markets',
      description: 'Polymarket/Kalshi strategies, event-driven trading, weather arbitrage',
      tags: ['prediction', 'polymarket', 'kalshi'],
      agents: ['scout', 'dealer'],
      skill_md: `# Prediction Markets

## Platform Overview
- **Polymarket**: Crypto-native, wide range of events, higher liquidity
- **Kalshi**: CFTC-regulated, US-focused, economic events, Fed decisions

## Core Strategies

### Information Edge
1. Identify events where you have faster/better information than the market
2. Weather events: NOAA updates every 6 hours — market reacts slowly
3. Economic data: Fed meeting minutes, CPI releases — trade the "expected vs actual" gap
4. Political events: poll aggregators update faster than prediction markets

### Market Making
1. Place both YES and NO orders with 3-5% spread
2. Only on high-volume markets (>$100K daily volume)
3. Manage inventory — don't get stuck on one side
4. Exit all positions 24h before resolution (avoid settlement risk)

### Arbitrage Detection
1. Compare same event across Polymarket vs Kalshi
2. If YES on Platform A + NO on Platform B < $1.00 → guaranteed profit
3. Account for fees (2% on Polymarket, varies on Kalshi)
4. Speed matters — automate detection, manual execution

## Risk Management
- Maximum 10% of bankroll on single event
- Diversify across 5+ uncorrelated events
- Never hold to resolution if you can lock in profit early
- Track resolution accuracy of each market type`
    },
    {
      slug: 'whale-tracking',
      name: 'Whale Tracking',
      description: 'On-chain whale monitoring, smart money following, large wallet alerts',
      tags: ['crypto', 'whales', 'on-chain'],
      agents: ['scout'],
      skill_md: `# Whale Tracking

## What to Monitor
1. **Large transfers** — wallets moving >$1M in tokens to/from exchanges
2. **Exchange inflows** — large deposits to exchanges signal potential selling
3. **Exchange outflows** — large withdrawals signal accumulation
4. **Smart money wallets** — track wallets with >70% historical win rate
5. **New wallet creation** — large new wallets on a token = institutional interest

## Signal Interpretation
- **Whale buys on DEX**: Bullish — especially if multiple whales in 24h
- **Whale moves to exchange**: Bearish — likely preparing to sell
- **Whale moves from exchange to cold storage**: Very bullish — long-term hold
- **Cluster buying**: 3+ whales buying same token in 48h = strong signal

## Data Sources
- Etherscan/block explorers for transaction monitoring
- Whale Alert / Arkham Intelligence for labeled wallets
- DEX Screener for large swap monitoring
- Nansen for smart money tracking

## Research Workflow
1. Identify unusual large transactions (>$500K)
2. Check wallet history — is this a known smart money wallet?
3. Check the token fundamentals — why might whales be accumulating?
4. Cross-reference with technical analysis
5. Report findings with confidence score (low/medium/high)
6. Include source URLs and wallet addresses`
    },
    {
      slug: 'market-sentiment',
      name: 'Market Sentiment Analysis',
      description: 'Social media sentiment, fear/greed index, news impact analysis',
      tags: ['sentiment', 'analysis', 'social'],
      agents: ['scout', 'oracle'],
      skill_md: `# Market Sentiment Analysis

## Sentiment Sources
1. **Fear & Greed Index**: <25 = extreme fear (contrarian buy), >75 = extreme greed (contrarian sell)
2. **Twitter/X volume**: Unusual spike in mentions = potential move incoming
3. **Reddit sentiment**: r/wallstreetbets, r/stocks, r/cryptocurrency — track bullish/bearish ratio
4. **News headlines**: Major financial outlets (Bloomberg, Reuters, CNBC)
5. **Options flow**: Put/call ratio >1.2 = bearish sentiment, <0.7 = bullish

## Analysis Framework
1. **Quantify sentiment**: Rate each source -1 (bearish) to +1 (bullish)
2. **Weight by reliability**: News (0.3) + Options flow (0.3) + Social (0.2) + Fear/Greed (0.2)
3. **Contrarian signals**: When composite > +0.8, consider reducing exposure (everyone's bullish)
4. **Confirmation**: Sentiment should CONFIRM technical signals, not override them

## News Impact Categories
- **High impact**: Fed decisions, earnings beats/misses, regulatory actions → trade within 1 hour
- **Medium impact**: Analyst upgrades/downgrades, sector rotation → trade within 24 hours
- **Low impact**: General market commentary → no immediate action

## Research Workflow
1. Check Fear & Greed Index daily
2. Scan top trending tickers on social platforms
3. Monitor breaking financial news
4. Calculate composite sentiment score
5. Flag divergences (bullish technicals + bearish sentiment = caution)
6. Report with supporting evidence and URLs`
    },
    {
      slug: 'risk-management',
      name: 'Risk Management',
      description: 'Position sizing (Kelly criterion), portfolio correlation, drawdown rules, stop-loss strategies',
      tags: ['trading', 'risk', 'portfolio'],
      agents: ['oracle', 'dealer'],
      skill_md: `# Risk Management

## Position Sizing

### Kelly Criterion (Modified)
- Kelly % = (Win Rate × Avg Win / Avg Loss - (1 - Win Rate)) / (Avg Win / Avg Loss)
- **Use Half-Kelly**: divide result by 2 for safety margin
- Example: 60% win rate, 2:1 reward:risk → Kelly = 20%, Half-Kelly = 10%
- Maximum single position: 10% of portfolio regardless of Kelly

### Fixed Fractional
- Risk 1-2% of portfolio per trade
- Position size = (Portfolio × Risk%) / (Entry - StopLoss)
- Reduce to 0.5% during high-volatility periods (VIX > 25)

## Portfolio Rules
1. **Correlation check**: Max 3 highly correlated positions (same sector/asset class)
2. **Sector exposure**: No more than 30% in any single sector
3. **Cash reserve**: Always maintain 20% cash for opportunities
4. **Drawdown circuit breaker**: If portfolio drops 10% from peak, reduce all positions by 50%
5. **Daily loss limit**: Stop trading if daily loss exceeds 3% of portfolio

## Stop-Loss Strategies
- **Fixed percentage**: 5% for swing trades, 3% for day trades
- **ATR-based**: 2× ATR(14) below entry — adapts to volatility
- **Support-based**: Place stop just below nearest support level
- **Trailing**: Move stop to breakeven after 3% gain, trail by 3% thereafter
- **Time-based**: Exit if no profit after 5 trading days (momentum died)

## Review Cadence
- Daily: check all open positions and stop levels
- Weekly: portfolio correlation and sector exposure review
- Monthly: strategy performance metrics and risk-adjusted returns`
    }
  ]

  const insertSkill = db.prepare('INSERT OR IGNORE INTO skills (id, slug, name, description, skill_md, tags, source) VALUES (?, ?, ?, ?, ?, ?, ?)')
  const assignSkill = db.prepare('INSERT OR IGNORE INTO agent_skills_v2 (agent_id, skill_id) VALUES (?, ?)')

  for (const skill of TRADING_SKILLS) {
    const id = uuid()
    insertSkill.run(id, skill.slug, skill.name, skill.description, skill.skill_md, JSON.stringify(skill.tags), 'custom')
    const savedSkill = db.prepare('SELECT id FROM skills WHERE slug = ?').get(skill.slug)
    if (savedSkill) {
      for (const agentId of skill.agents) {
        assignSkill.run(agentId, savedSkill.id)
      }
    }
  }
  console.log('🧩 Seeded 8 core trading skills')
}

seedTradingSkills()

// ── Seed Ember/Kitchen Bible Marketing Skills ────────
function seedEmberSkills() {
  const existing = db.prepare("SELECT id FROM skills WHERE slug = 'ember-product-roadmap'").get()
  if (existing) return

  // Clean out old marketing-focused Ember skills if they exist
  const oldSlugs = ['ember-marketing', 'ember-lead-research', 'ember-content']
  for (const slug of oldSlugs) {
    const old = db.prepare('SELECT id FROM skills WHERE slug = ?').get(slug)
    if (old) {
      db.prepare('DELETE FROM agent_skills_v2 WHERE skill_id = ?').run(old.id)
      db.prepare('DELETE FROM skills WHERE id = ?').run(old.id)
    }
  }

  const EMBER_SKILLS = [
    {
      slug: 'ember-product-roadmap',
      name: 'Ember Product Roadmap',
      description: 'Complete roadmap for making Kitchen Bible commercial-grade and getting listed on Toast marketplace',
      tags: ['ember', 'roadmap', 'product', 'toast'],
      agents: ['nexus', 'scout'],
      skill_md: `# Ember Product Roadmap

## Product Overview
Ember (Kitchen Bible) is a restaurant kitchen management SaaS. Managers use the web dashboard; staff access the "Kitchen Bible" via share link. AI-powered onboarding generates cuisine-specific content.

**URLs:**
- Landing: https://ember-landing-phi.vercel.app
- App: https://sous-frontend.vercel.app
- Backend: https://sous-backend-production.up.railway.app

**Tech:** React 19 + Vite + Tailwind (frontend), Express.js + PostgreSQL (backend), deployed on Vercel + Railway.
**Customer:** Honey Belly Korean BBQ (paying). **Pricing:** $49/mo Starter, $99/mo Pro, $199+ Enterprise.

---

## P0 — Commercial Blockers (Must fix first)

1. **Stripe billing integration** — $49 Starter / $99 Pro / $199+ Enterprise, 14-day free trial. No billing = no new customers.
2. **Connect landing page to app signup** — ember-landing-phi.vercel.app must link to sous-frontend.vercel.app signup flow seamlessly.
3. **Add pricing section to landing page** — visitors need to see plans before signing up.
4. **Security hardening** — Helmet middleware, rate limiting on auth endpoints, input validation on all forms.
5. **Fix photo uploads** — replace base64 storage with Cloudinary cloud storage. Base64 bloats the DB and breaks on large images.
6. **Persist onboarding chat sessions** — currently stored in-memory Map, dies on every deploy. Must persist to PostgreSQL.
7. **Password reset flow** — forgot password email with reset link. Basic table stakes.
8. **Fix share_code column** — missing from schema migrations, was manually added to prod. Add to migrations properly.
9. **Fix user_id: 1 hardcode** — JWT tokens hardcode user_id: 1. Must use actual authenticated user ID.
10. **Unify design system** — login page is red, Kitchen Bible is green. Looks like two different products. Pick one palette.
11. **Mobile responsive dashboard** — admin/dashboard pages are desktop-only. Managers use phones. Must be responsive.

## P1 — Competitive Features

1. **Temperature logging** — health inspectors require it. Table stakes for kitchen software.
2. **Completion reporting dashboard** — % of checklists done today. #1 thing managers check every morning.
3. **Recipe costing** — what does each dish cost to make? Critical for menu pricing.
4. **Multi-location dashboard** — see all locations at a glance. Required for Pro/Enterprise tiers.
5. **CSV/PDF export** — reports for accountants, health inspectors, corporate.
6. **Staff training tracker** — who was trained on what, when, signed off by whom.
7. **Offline checklist support** — service worker for when kitchens lose wifi (common in basements/walk-ins).

## P2 — Toast Marketplace Prep

1. **Toast API integration** — OAuth 2.0, REST API for data sync.
2. **Employee sync** — Toast Labor API auto-populates Ember staff directory.
3. **Menu item sync** — Toast Menus API populates Kitchen Bible recipes automatically.
4. **Partner application** — apply at pos.toasttab.com/partners/integration-partner-application.
5. **Reference customers** — need 2-3 Toast restaurant customers using Ember before applying.

## P3 — Market Differentiators (things NO competitor has)

1. **Health inspection prep mode** — checklist of everything an inspector looks for, one-tap evidence collection (photos, temps, dates).
2. **Gamified compliance** — streaks, leaderboards for completing daily checklists. Staff compete to not miss tasks.
3. **Food waste root-cause analysis** — not just "we wasted $X" but WHY (over-prep, spoilage, wrong order, dropped).
4. **Menu change propagation** — change a recipe and auto-update cost, training docs, allergens, prep lists across the system.
5. **SMS/WhatsApp notifications** — push checklist reminders without requiring app install.`
    },
    {
      slug: 'ember-backend-patterns',
      name: 'Ember Backend Development',
      description: 'Sous-backend codebase patterns, API structure, database schema for Kitchen Bible',
      tags: ['ember', 'backend', 'express', 'postgresql'],
      agents: ['forge'],
      skill_md: `# Ember Backend Development — sous-backend

## Tech Stack
- **Runtime:** Node.js + Express.js
- **Database:** PostgreSQL on Railway (pg library, connection via DATABASE_URL)
- **Auth:** JWT (jsonwebtoken) + bcrypt password hashing
- **AI:** Anthropic SDK for onboarding chat
- **Email:** nodemailer (for password reset, notifications)

## File Structure
\`\`\`
server.js              — Main Express app, middleware, route registration
controllers/           — 22 controller files (one per resource)
middleware/            — Auth middleware, error handler
migrations/           — PostgreSQL migration files (run in order)
utils/errors.js       — AppError/ValidationError classes (exist but underused)
\`\`\`

## Key Controllers
- **authController.js** — signup, login, staff PIN auth, share link auth
- **checklistController.js** — CRUD for checklists, line items, completion tracking
- **recipesController.js** — recipe CRUD with ingredients, steps, photos
- **onboardingChatController.js** — AI conversation flow using Anthropic SDK
- **tempController.js** — temperature log entries
- **wasteController.js** — food waste tracking
- **inventoryController.js** — ingredient inventory
- **scheduleController.js** — staff scheduling

## Three Access Modes
1. **Manager login** — email + password, full dashboard access
2. **Staff PIN** — 4-digit PIN, Kitchen Bible access only
3. **Share link** — unique code, read-only Kitchen Bible (zero friction)

## Restaurant Data Isolation
Every query MUST filter by \`req.restaurantId\`. This is set by auth middleware from the JWT token. Never query without restaurant scoping.

## API Pattern
\`\`\`js
// Controller pattern (every controller follows this)
export const getItems = async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM items WHERE restaurant_id = $1 ORDER BY created_at DESC',
      [req.restaurantId]
    )
    res.json(rows)
  } catch (err) {
    console.error('Error:', err)  // TODO: migrate to Winston logger
    res.status(500).json({ error: 'Internal server error' })
  }
}
\`\`\`

## Known Issues to Fix
- **Error handling:** AppError/ValidationError classes exist in utils/errors.js but controllers use raw try/catch with console.error. Migrate to structured error classes.
- **Logger:** Winston is configured but most controllers use console.error. Migrate to logger.
- **Onboarding chat:** Sessions stored in in-memory Map — dies on every deploy. Must persist to PostgreSQL.
- **Photo uploads:** Returns base64 strings. Needs Cloudinary integration (upload to cloud, store URL).
- **user_id hardcode:** JWT tokens set user_id: 1. Must use actual user ID from auth.
- **share_code column:** Missing from migration files, was manually added to prod DB.

## Environment Variables
\`\`\`
DATABASE_URL          — PostgreSQL connection string (Railway)
JWT_SECRET            — JWT signing secret
ANTHROPIC_API_KEY     — For AI onboarding chat
CORS_ORIGIN           — Frontend URL for CORS
GMAIL_USER            — For email notifications
GMAIL_APP_PASSWORD    — Gmail app password
\`\`\`

## Database Conventions
- All tables have \`restaurant_id\` column for multi-tenancy
- Timestamps: \`created_at\` and \`updated_at\` with DEFAULT NOW()
- UUIDs for primary keys (uuid_generate_v4())
- Soft deletes where appropriate (is_deleted boolean)
- Migrations run sequentially, named with number prefix`
    },
    {
      slug: 'ember-frontend-patterns',
      name: 'Ember Frontend Development',
      description: 'Sous-frontend codebase patterns, component system, Kitchen Bible UX for Ember',
      tags: ['ember', 'frontend', 'react', 'kitchen-bible'],
      agents: ['forge', 'quill'],
      skill_md: `# Ember Frontend Development — sous-frontend

## Tech Stack
- **Framework:** React 19 + Vite
- **Styling:** Tailwind CSS + inline style tokens (Kitchen Bible) + App.css (Admin)
- **Routing:** React Router v7
- **State:** useState/useEffect (no Redux, no Context)
- **API:** fetch wrapper in api.js, JWT token in localStorage

## Two Distinct UIs

### Kitchen Bible (staff-facing)
- **Mobile-first**, dark green theme
- **Token system:** tokens.js exports C (colors) and S (styles) objects — all inline styles
- **16 tabs** in KitchenBible.jsx: Opening, Closing, Recipes, Plating, Prep, Sidework, Temps, Order, Schedule, Events, Ops, 86'd, Notes, Waste, Chat, Leaderboard
- **Shared components:** shared.jsx exports Header, NavBar (floating pill navigation), Row, Badge, PostCard, Spinner
- **Accessed via share link** — no login required for staff

### Admin/Dashboard (manager-facing)
- **Desktop-oriented** (NOT mobile responsive — this needs fixing)
- Uses CSS classes from App.css, NOT the token system
- This design split (tokens vs CSS classes) needs unifying

## Component Patterns
\`\`\`jsx
// Kitchen Bible component pattern
import { C, S } from '../tokens'
import { Header, Row, Badge } from '../shared'

export default function TempsTab({ restaurant }) {
  const [temps, setTemps] = useState([])
  // ... fetch and render with inline styles using C and S
  return (
    <div style={S.page}>
      <Header title="Temperature Logs" />
      {temps.map(t => <Row key={t.id} style={S.row}>...</Row>)}
    </div>
  )
}
\`\`\`

## Auth Flow
1. LoginPage — email/password signup or login
2. Staff join via share link (no auth needed)
3. OnboardingChat.jsx — AI conversation flow for new restaurants:
   - Asks about cuisine, size, priorities
   - Feature selection checkboxes
   - AI generates content (checklists, recipes, etc.)
   - Review screen before applying to restaurant

## Key Issues to Fix
- **Admin pages not mobile responsive** — kitchen.css is mobile-first but App.css only has one @media query. Managers use phones.
- **Design system split** — Login page is red, Kitchen Bible is green, Admin is different again. Needs one unified palette.
- **No offline support** — Kitchen Bible should work offline via service worker (kitchens lose wifi frequently).
- **Base64 photos** — Photo uploads return base64, need Cloudinary URLs instead.

## File Structure
\`\`\`
src/
  App.jsx              — Main app, routing, layout
  api.js               — fetch wrapper, all API calls
  tokens.js            — C (colors) and S (styles) for Kitchen Bible
  shared.jsx           — Shared Kitchen Bible components
  components/
    KitchenBible.jsx   — Main Kitchen Bible container (16 tabs)
    LoginPage.jsx      — Auth flow
    OnboardingChat.jsx — AI onboarding conversation
    Dashboard.jsx      — Manager dashboard
    ...tab components  — One per Kitchen Bible tab
\`\`\``
    },
    {
      slug: 'ember-competitor-intel',
      name: 'Ember Competitor Intelligence',
      description: 'Restaurant kitchen software competitive landscape — what to watch, steal, and avoid',
      tags: ['ember', 'competitors', 'research', 'restaurant-tech'],
      agents: ['scout'],
      skill_md: `# Ember Competitor Intelligence

## Key Competitors & Pricing
| Competitor | Price/mo | Focus |
|---|---|---|
| FreshCheq | ~$60 | Checklists, food safety, temp logging |
| meez | $49+ | Recipe management, costing, training |
| 7shifts | $40-135 | Staff scheduling, labor management |
| Jolt | $90-296 | Checklists, temp logging, training |
| MarketMan | $199-249 | Inventory, purchasing, recipe costing |
| Toast | $69-300+ | Full POS + restaurant management suite |
| Restaurant365 | $249-499+ | Accounting, inventory, scheduling, BI |

## Ember's Positioning
- **Price sweet spot:** $49-99/mo — cheaper than Jolt/MarketMan/R365, comparable to meez/FreshCheq
- **Target:** Independent restaurants and small chains (1-20 locations)
- **Core value:** Checklists + recipes + training + daily ops in ONE tool

## Ember's Unique Advantages
1. **AI onboarding** — NO competitor generates cuisine-specific content via AI conversation. This is a genuine moat.
2. **Share link access** — Staff open a link on their phone. No app download, no account creation, no training. Zero friction.
3. **Price point** — Full kitchen ops for $49/mo undercuts Jolt ($90+) and MarketMan ($199+).

## Table Stakes Features (must have to compete)
- Temperature logging (FreshCheq, Jolt have it — health inspectors require it)
- Recipe costing (meez's core feature — every kitchen software needs this)
- Completion reporting (% done today — managers check this first thing)
- Photo verification (prove tasks were done, not just checked off)
- Multi-location dashboard (required for any customer with 2+ locations)
- Offline mode (kitchens lose wifi — Jolt has offline support)
- CSV/PDF export (for health inspectors, accountants, corporate)

## Differentiators to Build (things nobody has)
1. **Health inspection prep mode** — no competitor offers a dedicated "inspector is coming" checklist with evidence collection
2. **Gamified compliance** — streaks and leaderboards for checklist completion (7shifts has some gamification for scheduling, nobody for kitchen ops)
3. **Food waste root-cause analysis** — competitors track waste amounts but not WHY
4. **Menu change propagation** — change a recipe, auto-update everything downstream
5. **SMS/WhatsApp notifications** — push reminders without app install

## Toast Marketplace Strategy
- **Revenue share:** Toast takes ~30% of marketplace revenue
- **Timeline:** 6-12 months from application to listing
- **Requirements:** Working integration, reference customers on Toast POS, security review
- **Key integrations:** Employee sync (Labor API), menu sync (Menus API), order data
- **Critical:** Need 2-3 Toast restaurant customers as references before applying

## Research Priorities (what Scout should regularly check)
1. New features competitors announce (blog posts, changelogs, Product Hunt)
2. Restaurant tech trends (NRA Show announcements, industry publications)
3. Toast marketplace new listings and popular integrations
4. Restaurant operator forums — Reddit r/restaurantowners, r/KitchenConfidential, Yelp business forums
5. Customer complaints about competitors (opportunities for Ember)
6. Pricing changes from competitors
7. New entrants in the restaurant kitchen ops space`
    }
  ]

  const insertSkill = db.prepare('INSERT OR IGNORE INTO skills (id, slug, name, description, skill_md, tags, source) VALUES (?, ?, ?, ?, ?, ?, ?)')
  const assignSkill = db.prepare('INSERT OR IGNORE INTO agent_skills_v2 (agent_id, skill_id) VALUES (?, ?)')

  for (const skill of EMBER_SKILLS) {
    const id = uuid()
    insertSkill.run(id, skill.slug, skill.name, skill.description, skill.skill_md, JSON.stringify(skill.tags), 'custom')
    const savedSkill = db.prepare('SELECT id FROM skills WHERE slug = ?').get(skill.slug)
    if (savedSkill) {
      for (const agentId of skill.agents) {
        assignSkill.run(agentId, savedSkill.id)
      }
    }
  }
  console.log('🔧 Seeded 4 Ember/Kitchen Bible build-focused skills')
}

seedEmberSkills()

// ── Seed Ember Sales Pipeline ────────────────────────
function seedEmberPipeline() {
  // Clean out old sales pipeline if it exists
  const oldPipeline = db.prepare("SELECT id FROM pipelines WHERE name = 'Ember Sales Pipeline'").get()
  if (oldPipeline) {
    db.prepare('DELETE FROM pipelines WHERE id = ?').run(oldPipeline.id)
  }

  const existing = db.prepare("SELECT id FROM pipelines WHERE name = 'Ember Development Pipeline'").get()
  if (existing) return

  const pipelineId = uuid()
  const steps = [
    { position: 1, agent_id: 'scout', prompt_template: 'Research how competitors handle this specific feature or restaurant pain point. Check FreshCheq, meez, Jolt, MarketMan, Toast, and Restaurant365. Document what they do well, what they miss, and what restaurant operators complain about. Search Reddit r/restaurantowners, r/KitchenConfidential, and restaurant tech forums for real user feedback. Output a structured analysis with competitor approaches, gaps, and recommended approach for Ember.' },
    { position: 2, agent_id: 'nexus', prompt_template: 'Based on Scout\'s competitive research, create a technical specification for implementing this feature in Ember. Include: database schema changes (PostgreSQL), API endpoints needed (Express.js controllers), frontend components (React + Tailwind), and integration points with existing Kitchen Bible tabs. Follow sous-backend patterns (controller pattern, restaurant_id scoping, JWT auth) and sous-frontend patterns (tokens.js for Kitchen Bible, App.css for admin). Prioritize mobile-first for Kitchen Bible components.\n\nResearch:\n{{previous_output}}' },
    { position: 3, agent_id: 'forge', prompt_template: 'Implement the feature based on Nexus\'s technical spec. Follow sous-backend patterns: controllers in controllers/ folder, pg query with restaurant_id scoping, proper error handling. Follow sous-frontend patterns: use tokens.js C/S system for Kitchen Bible components, React Router v7, useState/useEffect for state. Test the implementation and document any issues found.\n\nTechnical Spec:\n{{previous_output}}' }
  ]

  db.prepare('INSERT INTO pipelines (id, name, description, steps) VALUES (?, ?, ?, ?)').run(
    pipelineId,
    'Ember Development Pipeline',
    'Scout researches competitor feature/pain point → Nexus creates technical spec → Forge implements following codebase patterns',
    JSON.stringify(steps)
  )
  console.log('🔗 Seeded Ember Development Pipeline')
}

seedEmberPipeline()

// ── Scheduled Jobs — Cron Scheduler ──────────────────
function matchesCron(expression, date) {
  const [min, hour, dom, month, dow] = expression.split(' ')
  const matchField = (field, value) => {
    if (field === '*') return true
    if (field.includes(',')) return field.split(',').some(f => matchField(f, value))
    if (field.includes('-')) {
      const [a, b] = field.split('-').map(Number)
      return value >= a && value <= b
    }
    if (field.includes('/')) {
      const [, step] = field.split('/')
      return value % parseInt(step) === 0
    }
    return parseInt(field) === value
  }
  return matchField(min, date.getMinutes()) && matchField(hour, date.getHours()) &&
    matchField(dom, date.getDate()) && matchField(month, date.getMonth() + 1) &&
    matchField(dow, date.getDay())
}

setInterval(() => {
  const now = new Date()
  const jobs = db.prepare("SELECT * FROM scheduled_jobs WHERE enabled = 1").all()

  for (const job of jobs) {
    if (matchesCron(job.cron_expression, now)) {
      const lastRun = job.last_run ? new Date(job.last_run) : null
      if (lastRun && (now - lastRun) < 60000) continue

      const id = uuid()
      db.prepare("INSERT INTO tasks (id, title, description, agent_id, status) VALUES (?, ?, ?, ?, 'todo')")
        .run(id, job.task_title, job.task_description || '', job.agent_id)

      db.prepare("UPDATE scheduled_jobs SET last_run = ? WHERE id = ?").run(now.toISOString(), job.id)

      log('info', 'scheduled_job_triggered', { jobId: job.id, jobName: job.name, taskId: id, agentId: job.agent_id })
      traceBus.emit('task:update', { id, status: 'todo', agent_id: job.agent_id })

      setTimeout(() => processAgentQueue(job.agent_id), 500)
    }
  }
}, 60000)

app.get('/api/scheduled-jobs', (req, res) => {
  const jobs = db.prepare('SELECT * FROM scheduled_jobs ORDER BY created_at DESC').all()
  res.json(jobs)
})

app.post('/api/scheduled-jobs', (req, res) => {
  const { name, agent_id, task_title, task_description, cron_expression, enabled } = req.body
  if (!name || !agent_id || !task_title || !cron_expression) {
    return res.status(400).json({ error: 'name, agent_id, task_title, and cron_expression required' })
  }
  const id = uuid()
  db.prepare('INSERT INTO scheduled_jobs (id, name, agent_id, task_title, task_description, cron_expression, enabled) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, name, agent_id, task_title, task_description || '', cron_expression, enabled !== false ? 1 : 0)
  res.json({ id })
})

app.patch('/api/scheduled-jobs/:id', (req, res) => {
  const job = db.prepare('SELECT * FROM scheduled_jobs WHERE id = ?').get(req.params.id)
  if (!job) return res.status(404).json({ error: 'Job not found' })
  const fields = ['name', 'agent_id', 'task_title', 'task_description', 'cron_expression', 'enabled']
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      const val = f === 'enabled' ? (req.body[f] ? 1 : 0) : req.body[f]
      db.prepare(`UPDATE scheduled_jobs SET ${f} = ? WHERE id = ?`).run(val, req.params.id)
    }
  }
  res.json({ updated: true })
})

app.delete('/api/scheduled-jobs/:id', (req, res) => {
  db.prepare('DELETE FROM scheduled_jobs WHERE id = ?').run(req.params.id)
  res.json({ deleted: true })
})

// ── Memory Dashboard — DELETE endpoint ──────────────
app.delete('/api/memory/:id', (req, res) => {
  db.prepare('DELETE FROM memory_embeddings WHERE id = ?').run(req.params.id)
  res.json({ deleted: true })
})

// ── Agent Sandbox — Run prompt A/B comparison ──────────
app.post('/api/sandbox/run', requireRole('admin', 'operator'), async (req, res) => {
  const { agent_id, task_description, modified_prompt, max_steps = 3 } = req.body
  if (!agent_id || !task_description) return res.status(400).json({ error: 'agent_id and task_description required' })

  const agent = agents.find(a => a.id === agent_id)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })

  const currentPrompt = agent.systemPrompt + buildToolsPrompt(agent_id)
  const testPrompt = modified_prompt || currentPrompt

  const runWithPrompt = async (systemPrompt, label) => {
    const taskId = uuid()
    const startTime = Date.now()

    db.prepare("INSERT INTO tasks (id, title, description, agent_id, status) VALUES (?, ?, ?, ?, 'in_progress')")
      .run(taskId, `[Sandbox:${label}] ${task_description.slice(0, 80)}`, task_description, agent_id)

    try {
      const model = getAgentModel(agent_id)
      const messages = [{ role: 'user', content: task_description }]
      let fullOutput = ''
      let toolsUsed = []
      let totalTokens = 0
      let totalCost = 0

      const toolsSchema = SUPPORTS_FUNCTION_CALLING[model] ? buildToolsSchema(agent_id) : undefined

      for (let step = 0; step < max_steps; step++) {
        const response = await callClaude({
          model,
          max_tokens: 2048,
          system: systemPrompt,
          messages,
          tools: toolsSchema,
        }, agent_id, taskId)

        const tokensIn = response.usage?.input_tokens || 0
        const tokensOut = response.usage?.output_tokens || 0
        const pricing = MODEL_COSTS[model] || DEFAULT_COST
        const stepCost = (tokensIn * pricing.input) + (tokensOut * pricing.output)
        totalTokens += tokensIn + tokensOut
        totalCost += stepCost

        const text = response.content?.map(b => b.type === 'text' ? b.text : '').join('') || ''
        fullOutput += text + '\n'
        messages.push({ role: 'assistant', content: text })

        // Parse tool calls (hybrid: native + text)
        const nativeCalls = response.nativeToolCalls || []
        const textCalls = parseToolCalls(text)
        const allTools = [...nativeCalls]
        for (const tc of textCalls) {
          if (!allTools.some(nc => nc.name === tc.name && JSON.stringify(nc.args) === JSON.stringify(tc.args))) {
            allTools.push(tc)
          }
        }

        if (allTools.length === 0) break

        toolsUsed.push(...allTools.map(t => t.name))

        // Execute tools (max 3 per step in sandbox)
        for (const tool of allTools.slice(0, 3)) {
          try {
            const result = await executeTool(tool, agent_id, taskId)
            const resultStr = result.resultStr || result.error || 'no result'
            messages.push({ role: 'user', content: `[TOOL_RESULT:${tool.name}]${resultStr.slice(0, 2000)}[/TOOL_RESULT]` })
            fullOutput += `\n[Tool: ${tool.name}] ${resultStr.slice(0, 200)}\n`
          } catch (e) {
            messages.push({ role: 'user', content: `[TOOL_ERROR:${tool.name}]${e.message}[/TOOL_ERROR]` })
          }
        }
      }

      const duration = Date.now() - startTime

      db.prepare("UPDATE tasks SET status = 'done', output = ?, tokens_used = ?, estimated_cost = ?, completed_at = datetime('now') WHERE id = ?")
        .run(fullOutput.slice(0, 50000), totalTokens, totalCost, taskId)

      return {
        label,
        task_id: taskId,
        output: fullOutput.trim(),
        tools_used: [...new Set(toolsUsed)],
        tokens: totalTokens,
        cost: totalCost,
        duration_ms: duration
      }
    } catch (e) {
      db.prepare("UPDATE tasks SET status = 'failed', output = ? WHERE id = ?").run(e.message, taskId)
      return { label, task_id: taskId, error: e.message, tools_used: [], tokens: 0, cost: 0, duration_ms: Date.now() - startTime }
    }
  }

  try {
    const [current, modified] = await Promise.all([
      runWithPrompt(currentPrompt, 'current'),
      runWithPrompt(testPrompt, 'modified')
    ])

    // Auto-score with LLM evaluation
    let scoring = null
    try {
      const scoreResponse = await callClaude({
        model: 'anthropic/claude-haiku-4-5',
        max_tokens: 512,
        system: 'You are a quality evaluator. Compare two agent outputs for the same task. Score each 1-10 on: tool_usage (did it use tools effectively?), relevance (does output match the task?), actionability (is the output actionable?). Return ONLY valid JSON: {"current": {"tool_usage": N, "relevance": N, "actionability": N}, "modified": {"tool_usage": N, "relevance": N, "actionability": N}, "winner": "current"|"modified"|"tie", "reason": "brief explanation"}',
        messages: [{ role: 'user', content: `Task: ${task_description}\n\nCurrent output:\n${current.output?.slice(0, 3000) || current.error}\n\nModified output:\n${modified.output?.slice(0, 3000) || modified.error}` }]
      }, 'nexus', null)

      const scoreText = scoreResponse.content?.map(b => b.text || '').join('') || ''
      const jsonMatch = scoreText.match(/\{[\s\S]*\}/)
      if (jsonMatch) scoring = JSON.parse(jsonMatch[0])
    } catch (e) {
      log('warn', 'sandbox_scoring_failed', { error: e.message })
    }

    res.json({ current, modified, scoring })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ══════════════════════════════════════════════════════
// ██ A2A PROTOCOL ENDPOINTS                            ██
// ══════════════════════════════════════════════════════

// Agent Card discovery (A2A spec — outside /api prefix, no auth required)
app.get('/.well-known/agent.json', (req, res) => {
  const agentCards = agents.map(a => ({
    name: a.name,
    description: a.description,
    url: `${req.protocol}://${req.get('host')}/a2a/${a.id}`,
    capabilities: { streaming: false, pushNotifications: false },
    skills: [{ id: a.id, name: a.role, description: a.description }]
  }))
  res.json({
    name: 'Hive Agent Team',
    description: 'Autonomous AI income agent team — research, build, write, sell, trade, self-improve',
    url: `${req.protocol}://${req.get('host')}/a2a`,
    version: '1.0.0',
    capabilities: { streaming: false, pushNotifications: false },
    agents: agentCards,
    authentication: { schemes: ['bearer'] }
  })
})

// A2A task submission (JSON-RPC per A2A spec)
app.post('/a2a/:agentId', authenticateRequest, async (req, res) => {
  const { method, params, id: rpcId } = req.body
  const agent = agents.find(a => a.id === req.params.agentId)
  if (!agent) return res.json({ jsonrpc: '2.0', error: { code: -32601, message: 'Agent not found' }, id: rpcId })

  if (method === 'tasks/send') {
    const taskId = uuid()
    const message = params?.message?.parts?.map(p => p.text || '').join('\n') || params?.input || ''
    db.prepare("INSERT INTO tasks (id, title, description, agent_id, status) VALUES (?, ?, ?, ?, 'todo')")
      .run(taskId, `[A2A] ${message.slice(0, 80)}`, message, agent.id)
    traceBus.emit('task:update', { id: taskId, status: 'todo', agent_id: agent.id })
    res.json({ jsonrpc: '2.0', result: { id: taskId, status: { state: 'submitted' }, artifacts: [] }, id: rpcId })
  } else if (method === 'tasks/get') {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(params?.id)
    if (!task) return res.json({ jsonrpc: '2.0', error: { code: -32602, message: 'Task not found' }, id: rpcId })
    const stateMap = { backlog: 'submitted', todo: 'submitted', in_progress: 'working', done: 'completed', failed: 'failed', paused: 'input-required', awaiting_approval: 'input-required', in_review: 'working' }
    res.json({ jsonrpc: '2.0', result: { id: task.id, status: { state: stateMap[task.status] || 'unknown' }, artifacts: task.output ? [{ parts: [{ type: 'text', text: task.output }] }] : [] }, id: rpcId })
  } else if (method === 'tasks/cancel') {
    db.prepare("UPDATE tasks SET status = 'failed' WHERE id = ?").run(params?.id)
    res.json({ jsonrpc: '2.0', result: { id: params?.id, status: { state: 'canceled' } }, id: rpcId })
  } else {
    res.json({ jsonrpc: '2.0', error: { code: -32601, message: `Unknown method: ${method}` }, id: rpcId })
  }
})

// A2A outbound — call external A2A agent
app.post('/api/a2a/call', requireRole('admin', 'operator'), async (req, res) => {
  const { agent_url, message } = req.body
  if (!agent_url || !message) return res.status(400).json({ error: 'agent_url and message required' })
  try {
    const response = await fetch(agent_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tasks/send', params: { message: { role: 'user', parts: [{ type: 'text', text: message }] } }, id: uuid() }),
      signal: AbortSignal.timeout(30000)
    })
    const result = await response.json()
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// A2A external agent management
app.get('/api/a2a/agents', (req, res) => {
  res.json(db.prepare('SELECT * FROM a2a_agents ORDER BY created_at DESC').all())
})

app.post('/api/a2a/agents', requireRole('admin', 'operator'), async (req, res) => {
  const { url, name } = req.body
  if (!url) return res.status(400).json({ error: 'url required' })
  let agentCard = {}
  try {
    const cardUrl = new URL('/.well-known/agent.json', url).href
    const cardResp = await fetch(cardUrl, { signal: AbortSignal.timeout(10000) })
    if (cardResp.ok) agentCard = await cardResp.json()
  } catch {}
  const id = uuid()
  db.prepare('INSERT INTO a2a_agents (id, name, description, url, agent_card) VALUES (?, ?, ?, ?, ?)')
    .run(id, name || agentCard.name || 'External Agent', agentCard.description || '', url, JSON.stringify(agentCard))
  res.json({ id, agent_card: agentCard })
})

app.delete('/api/a2a/agents/:id', requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM a2a_agents WHERE id = ?').run(req.params.id)
  res.json({ deleted: true })
})

app.post('/api/a2a/agents/:id/test', requireRole('admin', 'operator'), async (req, res) => {
  const agent = db.prepare('SELECT * FROM a2a_agents WHERE id = ?').get(req.params.id)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })
  try {
    const response = await fetch(agent.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tasks/send', params: { message: { role: 'user', parts: [{ type: 'text', text: 'Hello from Hive — connectivity test' }] } }, id: uuid() }),
      signal: AbortSignal.timeout(15000)
    })
    const result = await response.json()
    db.prepare("UPDATE a2a_agents SET last_contacted = datetime('now') WHERE id = ?").run(req.params.id)
    res.json({ success: true, result })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

// ══════════════════════════════════════════════════════
// ██ AUTH / USER MANAGEMENT ENDPOINTS                  ██
// ══════════════════════════════════════════════════════

// Login (no auth required — register it before the global middleware catches it)
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' })
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username)
  if (!user || !verifyPassword(password, user.password_hash)) return res.status(401).json({ error: 'Invalid credentials' })
  const sessionId = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(sessionId, user.id, expiresAt)
  db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id)
  res.json({ token: sessionId, user: { id: user.id, username: user.username, role: user.role, display_name: user.display_name } })
})

app.post('/api/auth/logout', (req, res) => {
  const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : req.query.token
  if (token) db.prepare('DELETE FROM sessions WHERE id = ?').run(token)
  res.json({ success: true })
})

app.get('/api/auth/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' })
  res.json(req.user)
})

// User management (admin only)
app.get('/api/users', requireRole('admin'), (req, res) => {
  const users = db.prepare('SELECT id, username, role, display_name, created_at, last_login FROM users ORDER BY created_at').all()
  res.json(users)
})

app.post('/api/users', requireRole('admin'), (req, res) => {
  const { username, password, role = 'viewer', display_name = '' } = req.body
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' })
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
  if (existing) return res.status(409).json({ error: 'Username already exists' })
  const id = uuid()
  db.prepare('INSERT INTO users (id, username, password_hash, role, display_name) VALUES (?, ?, ?, ?, ?)')
    .run(id, username, hashPassword(password), role, display_name)
  res.json({ id, username, role, display_name })
})

app.patch('/api/users/:id', requireRole('admin'), (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  if (req.body.role) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(req.body.role, req.params.id)
  if (req.body.display_name !== undefined) db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(req.body.display_name, req.params.id)
  if (req.body.password) db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(req.body.password), req.params.id)
  res.json({ updated: true })
})

app.delete('/api/users/:id', requireRole('admin'), (req, res) => {
  if (req.params.id === req.user?.id) return res.status(400).json({ error: 'Cannot delete yourself' })
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id)
  res.json({ deleted: true })
})

// One-time cleanup: purge excessive todo tasks (keep newest 15)
const todoCount = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status = 'todo'").get().c
if (todoCount > 15) {
  const keep = db.prepare("SELECT id FROM tasks WHERE status = 'todo' ORDER BY created_at DESC LIMIT 15").all().map(r => r.id)
  if (keep.length > 0) {
    const placeholders = keep.map(() => '?').join(',')
    const deleted = db.prepare(`DELETE FROM tasks WHERE status = 'todo' AND id NOT IN (${placeholders})`).run(...keep)
    console.log(`🧹 Cleaned up ${deleted.changes} excess todo tasks (kept newest 15)`)
  }
}

const PORT = process.env.API_PORT || process.env.PORT || 3002
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🐝 Hive server running on port ${PORT}`)
  console.log(`🧠 Agent memory dir: ${MEMORY_DIR}`)
  console.log(`📋 Task queues active for ${agents.length} agents`)
  console.log(`💓 ${heartbeatJobs.length} heartbeat jobs registered`)
})
