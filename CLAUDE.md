# CLAUDE.md — Hive Project Prompt

> You are working on **Hive**, an autonomous AI income agent team. 6 agents (Scout, Forge, Quill, Dealer, Oracle, Nexus) research, build, write, sell, trade, and self-improve. The platform runs on Express 5 + SQLite + React 19 + Vite + Tailwind 4, deployed on AWS Lightsail (backend, port 3002) + Netlify (frontend).

---

## Workflow Discipline

### 1. Plan Before Building
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- Skip plan mode ONLY when the build spec is already detailed in this file
- If something goes sideways mid-build, STOP and re-plan immediately
- Write detailed specs upfront to reduce ambiguity

### 2. Verification Before Done
- Never mark a task complete without proving it works
- After deploy, ALWAYS verify the changed endpoint/feature works on production
- Run `node --check server/index.js` before committing backend changes
- Run `npm run build` before committing frontend changes
- Ask yourself: "Would a staff engineer approve this?"
- Check for console errors in both browser and server terminal

### 3. Simplicity First
- Make every change as simple as possible. Minimal code impact.
- No temporary fixes — find root causes. Senior developer standards.
- Only touch what's necessary. No side effects, no new bugs.
- If a fix feels hacky, pause and find the elegant solution
- Skip this for simple, obvious fixes — don't over-engineer

### 4. Autonomous Problem Solving
- When given a bug report, just fix it. Don't ask for hand-holding.
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- When a deploy fails, diagnose and fix without waiting for instructions

### 5. Use Subagents
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- One task per subagent for focused execution
- For complex problems, throw more compute at it via subagents

---

## Lessons Learned (DO NOT REPEAT)

### Deployment
- **ALWAYS `git stash` before `git pull` on VM.** The VM ALWAYS has dirty state. Never just `git pull`. This has bitten us 3+ times.
- **After every deploy, verify on production.** `curl` the changed endpoint or load the UI. The health endpoint auth bug cost us an extra deploy cycle because we didn't verify.
- **Express middleware `req.path` is relative to mount point.** Auth middleware mounted on `/api` sees `/health`, not `/api/health`. This is a common gotcha.
- **Build locally, push dist to git, then pull on VM.** The VM runs the app, it doesn't build it.

### Agents & Spend
- **Agents spiral without guardrails.** They invented a fake healthcare business and burned $72. Anti-spiral guardrails now in place.
- **Agents log fake revenue.** Revenue tool now requires real transaction IDs, blocks negative amounts, caps at $10K.
- **Agents send fake emails.** Blocked fake domains (example.com, test.com) in send_email tool.
- **OpenRouter actual spend != Hive internal tracker.** Internal tracker over-counts. Trust OpenRouter dashboard for real numbers.
- **Spend limit keys are `daily_limit_usd` and `monthly_limit_usd`** (not daily_spend_limit or monthly_spend_limit).
- **Monthly spend limit is the real blocker.** If hit, all tasks fail with 429. Check this first when debugging task failures.

### Code
- **Text-only problem was model routing.** Scout (perplexity/sonar-pro) and Forge (deepseek-r1) didn't support native function calling. Switched both to claude-haiku-4-5. Now all agents produce tool calls.
- **3 business pillars ONLY:** Ember, Hive/AgentForge, Trading. Everything else is off-topic. Agents will try to expand scope — block it.

---

## Current Architecture

```
Frontend: React 19 + Vite + Tailwind 4 (src/)
Backend:  Express 5 + better-sqlite3 (server/)
LLM:      OpenRouter API (multi-model per agent)
Trading:  Alpaca paper trading + Yahoo Finance
Deploy:   AWS Lightsail VM 4GB (PM2, port 3002) + Netlify
DB:       SQLite (hive.db) — WAL mode, foreign keys ON
VM IP:    16.145.215.162
```

### Agent Model Routing (via OpenRouter)
- scout: anthropic/claude-haiku-4-5 (web_search tool still uses perplexity/sonar-pro internally)
- forge: anthropic/claude-haiku-4-5
- quill: anthropic/claude-haiku-4-5
- dealer: anthropic/claude-haiku-4-5
- oracle: anthropic/claude-sonnet-4-5
- nexus: anthropic/claude-sonnet-4-5

### Key Files
- `server/index.js` — Main Express server (~9000+ lines). All API routes, ReAct loop, spend controls, agent execution, consultations, QA reviews, auto-task generation, heartbeats, pipelines, trading endpoints, skills, guardrails, graceful shutdown, health checks, dead letter queue.
- `server/db.js` — SQLite schema (20+ tables including dead_letters) + default settings.
- `server/services/` — marketData.js, broker.js, backtest.js, analysis.js, email.js
- `agents/agents.json` — 6 agent definitions with system prompts.
- `src/App.jsx` — Main dashboard layout, routing, state management.
- `src/components/` — 24 React components (see list below).
- `src/lib/api.js` — API client wrapper (all endpoints).
- `memory/` — Per-agent .md files for persistent learnings.
- `SYSTEM.md` — Architecture overview (keep in sync with changes).
- `CHANGELOG.md` — Feature log (prepend new entries at top).

### Existing React Components
AgentCards, AgentScorecard, ABTestPanel, BotGenerator, ChatPanel, CreateTaskModal, EventTriggers, GuardrailMonitor, HistoryPanel, MCPServers, MobileNav, PipelineBuilder, ProjectsPanel, PromptReviewModal, ProposalsPanel, RevenuePanel, SearchBar, Sidebar, SkillRegistry, SpendDashboard, TaskBoard, TaskDetail, TraceView, TradingDashboard

### Existing Database Tables
tasks, task_logs, messages, settings, spend_log, bot_suggestions, task_traces, revenue_entries, pipelines, event_triggers, agent_skills, market_data_cache, trades, watchlist, portfolio_snapshots, strategies, strategy_backtests, bot_deployments, strategy_performance, proposals, dead_letters

### Existing Features (DO NOT rebuild)
- ReAct execution loop (3 steps max + retry)
- Inter-agent consultation via [CONSULT:agent_id]
- Spend controls (daily/monthly/per-agent limits, pause)
- Auto-task generation (Nexus generates follow-ups)
- QA reviews (Nexus scores completed work)
- Agent memory (persistent .md files, auto-curated)
- Trace view (per-task execution timeline, polling)
- Skill registry (per-agent CRUD, basic types)
- Spend dashboard (today/month/agent breakdown, 7-day trend)
- Chained pipelines (multi-step agent workflows)
- Approval gates (cost threshold, keyword triggers)
- Bot generator (Scout suggestions + Forge builds)
- Revenue attribution (income tracking + ROI)
- Event triggers (webhooks → auto-create tasks)
- A/B prompt testing
- Prompt optimizer (Nexus rewrites before execution)
- Trading dashboard (Alpaca paper, backtesting, strategies)
- Push notifications (VAPID web push)
- Email notifications (nodemailer)
- Projects view (auto-categorized by theme)
- History/audit trail with search
- Agent scorecards
- Graceful shutdown (SIGTERM/SIGINT with task cleanup)
- Process error handlers (uncaughtException, unhandledRejection)
- Enhanced health endpoint (`/api/health` — DB, circuits, queues, stuck tasks, spend)
- Request timeout middleware (30s normal, 5min for /run /sandbox)
- Dead letter queue (permanently failed tasks with email alerts)
- Startup self-test (DB, OpenRouter, agents, memory dir)
- Structured JSON logging via `log(level, message, meta)`
- Guardrail monitor UI
- MCP server management UI

---

## Current Focus (March 2026)

### 3 Business Pillars (ONLY these — everything else is off-topic)
1. **Ember** — Restaurant kitchen management SaaS. Get to $147 MRR (3 paying restaurants).
2. **AgentForge** — AI agent platform (Hive as a product). Build MVP, get 5 beta users.
3. **Trading** — Alpaca paper trading. 60-day paper phase, then request approval for live.

### Agent Missions
- **Scout:** 4 missions — Ember intelligence (weekly), AgentForge market research (weekly), AI business opportunities (weekly), trading strategy research (bi-weekly)
- **Forge:** 2 missions — Ember development (70%, GitHub PRs), AgentForge building (30%, Mon/Wed/Fri)
- **Quill:** 2 missions — Ember content (60%, Dev.to + Twitter), AgentForge content (40%, Dev.to + Beehiiv)
- **Dealer:** 2 missions — AgentForge beta customers (primary, max 5 emails/day), content promotion (secondary)
- **Oracle:** Paper trading RSI Mean Reversion on SPY/QQQ/AAPL/NVDA/MSFT/TSLA/AMZN. Max $1000/position, max 3 trades/day.
- **Nexus:** Quality review (score 1-10), opportunity evaluation, weekly sprint planning (Sundays)

### Active Pipelines (automated via heartbeats)
- **Ember Dev Daily** — 9am weekdays: Scout research → Forge build → Nexus QA
- **Trading Session** — 9:31am weekdays: Oracle analyzes → places trades
- **AgentForge Build** — 10am Mon/Wed/Fri: Scout research → Forge build → Quill document
- **Opportunity Scan** — Sundays: Scout finds opportunities → Nexus evaluates → Forge builds MVPs
- **Weekly Sprint** — Sundays: Nexus reviews week → creates next week's tasks

### Skills Installed (11)
Ember: design-system, mobile-first, onboarding-flow, performance, marketing-site, qa-checklist, frontend-patterns, backend-patterns, github-dev-workflow
Platform: agentforge-context, ai-services-playbook

### Spend Limits
- Global: $8/day, $100/month
- Per-agent: scout=$1.50, forge=$2.00, quill=$1.00, dealer=$0.75, oracle=$0.75, nexus=$1.00
- Smart model routing: auto-downgrade to Haiku at 80% budget

### Auto-Chain Rules
- Terminal agents (oracle, dealer, nexus) never auto-chain
- Max 1 level deep, max 5 auto-tasks/day
- Allowed chains: scout→quill, scout→forge, scout→dealer, quill→dealer, forge→quill, forge→nexus
- Dedup: won't create task if similar one exists in last 24h

### Guardrails
- 3-pillar enforcement in every agent prompt
- Blocked topics: healthcare, hipaa, hospital, ciso, credential validation, infrastructure blocker
- 5 auto-tasks/day, 3-deep chain limit, 10 tasks/agent/day
- Tool failure injection: agents get explicit "TOOL FAILED" feedback, pause on 3+ consecutive failures
- Guardrails middleware: PII detection, trade safety, path traversal, queue overflow

### What to Build Next
All 6 build queue features are implemented:
1. ~~SSE Live Trace Stream~~ — DONE (TraceView with SSE, filter chips, color-coding, fullscreen)
2. ~~Agent Network Graph~~ — DONE (react-force-graph-2d, live edge pulses)
3. ~~Stacked Cost Timeline~~ — DONE (Recharts area chart, per-task drill-down)
4. ~~Scout Intelligence Feed~~ — DONE (actionable cards, send-to-forge)
5. ~~Natural Language Command Bar~~ — DONE (Cmd+K, autocomplete, history)
6. ~~Skill Registry V2~~ — DONE (SKILL.md packages, agent assignment, priority)

Focus areas now:
- AgentForge MVP (standalone product in Jmerc151/agentforge repo)
- Ember revenue: Stripe billing, landing page, onboarding polish
- Trading optimization: strategy refinement, 60-day paper validation

---

## BUILD QUEUE — What to Build Next

Build these features IN ORDER. Each builds on the previous. After completing each feature, update CHANGELOG.md and test.

---

### BUILD 1: Live SSE Trace Stream (upgrade existing TraceView)

**Why:** Currently TraceView polls every 3s. SSE streaming lets you watch agents think in real time.

**Backend changes (server/index.js):**

1. Add an EventEmitter-based trace bus at the top of server:
```js
import { EventEmitter } from 'events'
const traceBus = new EventEmitter()
traceBus.setMaxListeners(100)
```

2. Add SSE endpoint:
```
GET /api/agents/:agentId/trace/stream — SSE connection for a specific agent
GET /api/trace/stream — SSE connection for ALL agents
```

SSE setup pattern:
```js
res.writeHead(200, {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  'X-Accel-Buffering': 'no'
})
```

Track connections in a `Map<agentId, Set<Response>>`. Heartbeat ping every 15s. Clean up on `req.on('close')`.

3. In the existing `callClaude()` function and ReAct loop, after each trace is written to `task_traces`, also emit:
```js
traceBus.emit(`trace:${agentId}`, traceEvent)
traceBus.emit('trace:*', traceEvent)
```

4. In the existing `agentConsult()` function, emit a trace event with type `consult`.

**Frontend changes:**

1. Update `src/components/TraceView.jsx`:
   - Add an `useEffect` that opens an `EventSource` connection to `/api/agents/${agentId}/trace/stream` when the task is `in_progress`
   - Fall back to the existing polling for completed tasks (historical view)
   - Add event type filter chips (horizontally scrollable)
   - Color-code events: green=llm_call, blue=consult, orange=tool, red=error
   - Add "pin to latest" auto-scroll with a "Jump to latest" button when user scrolls up
   - Add fullscreen toggle button

**Mobile:** Event rows should be single-line with expandable detail on tap. Filter chips horizontally scrollable. Fullscreen should work on mobile viewports.

**Test:** Create a task and run it. The trace should stream in real time. After completion, historical view should still work.

---

### BUILD 2: Agent Network Graph

**Why:** Visualizes how agents collaborate. When Scout consults Oracle, you see it as a live edge pulse between nodes.

**Backend changes (server/db.js):**
```sql
CREATE TABLE IF NOT EXISTS agent_interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_agent_id TEXT NOT NULL,
  target_agent_id TEXT NOT NULL,
  interaction_type TEXT NOT NULL CHECK(interaction_type IN ('consult','delegate','tool_call')),
  task_id TEXT,
  payload TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_interactions_time ON agent_interactions(created_at);
```

**Backend changes (server/index.js):**
1. In `agentConsult()`, after the consultation completes, INSERT into `agent_interactions`.
2. Add endpoints:
   - `GET /api/graph/nodes` — returns all agents with current status (active if in activeRuns, idle otherwise)
   - `GET /api/graph/edges?range=24h` — returns interaction counts grouped by source→target pair
3. Emit interaction events on the SSE trace bus so the graph animates live.

**Frontend:**
1. `npm install react-force-graph-2d` — add to package.json
2. Create `src/components/AgentGraph.jsx`:
   - Fetch nodes from `/api/graph/nodes`, edges from `/api/graph/edges`
   - Agents = rounded rectangle nodes (color from agent config), tools = smaller ellipse nodes
   - Solid arrows for consult/delegate, dotted for tool_call
   - Edge thickness scales with frequency
   - Subscribe to SSE trace stream — pulse edges green on new interactions
   - Time range filter: 1h, 24h, 7d
   - Mobile: pinch-to-zoom + touch-drag. Below 400px, fall back to a simple list view.
3. Add to Sidebar.jsx as a new nav item.
4. Add `api.js` methods: `getGraphNodes()`, `getGraphEdges(range)`

---

### BUILD 3: Stacked Cost Timeline (upgrade existing SpendDashboard)

**Why:** Upgrade SpendDashboard to a persistent panel with Recharts stacked area chart showing cost by agent over time + cost-per-task drill-down.

**Backend changes (server/index.js):**
Add new endpoints (keep existing `/api/spend` for backwards compat):
- `GET /api/analytics/spend?range=7d&agent=scout` — time-series spend grouped by agent + time bucket
- `GET /api/analytics/spend/by-task?limit=50` — per-task cost rollup
- `GET /api/analytics/agents/summary?range=30d` — aggregate stats per agent

**Frontend:**
1. `npm install recharts` — add to package.json
2. Create `src/components/CostTimeline.jsx`:
   - Recharts StackedAreaChart with each agent as a colored layer
   - Date range selector: 24h, 7d, 30d
   - Summary cards row: per-agent totals. Horizontally scrollable on mobile.
   - Cost-per-task table below chart.
3. Add to Sidebar.jsx as nav item.
4. Keep SpendDashboard.jsx as the quick-access modal (for limit controls).
5. Add `api.js` methods: `getAnalyticsSpend(range, agent)`, `getSpendByTask(limit)`, `getAgentsSummary(range)`

---

### BUILD 4: Scout Intelligence Feed

**Why:** Scout finds opportunities but they're buried in task output text. Surface them as scannable cards you can act on.

**Backend changes (server/db.js):**
```sql
CREATE TABLE IF NOT EXISTS intel_items (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES tasks(id),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_url TEXT DEFAULT '',
  confidence REAL DEFAULT 0.5,
  tags TEXT DEFAULT '[]',
  status TEXT DEFAULT 'new' CHECK(status IN ('new','bookmarked','sent_to_forge','dismissed')),
  created_at TEXT DEFAULT (datetime('now'))
);
```

**Backend changes (server/index.js):**
1. In the post-completion hook for Scout tasks, add `extractIntelItems()`:
   - Call Claude to extract structured opportunities as JSON array
   - INSERT each into `intel_items` table
2. Endpoints:
   - `GET /api/intel?status=new&tag=affiliate&limit=50`
   - `PATCH /api/intel/:id/status` — when set to `sent_to_forge`, auto-create a Forge task

**Frontend:**
1. Create `src/components/IntelFeed.jsx`:
   - Scrollable card list, newest first
   - Each card: title, summary, tags as chips, confidence badge
   - Tap to expand: full summary, source link, action buttons (Send to Forge, Bookmark, Dismiss)
   - Filter bar: status tabs, tag filter chips
2. Add to Sidebar.jsx as nav item.
3. Add `api.js` methods: `getIntel(filters)`, `updateIntelStatus(id, status)`

---

### BUILD 5: Natural Language Command Bar

**Why:** Type "scout research telegram bot monetization" and it creates the task without opening CreateTaskModal.

**Backend changes (server/index.js):**
1. `POST /api/commands/parse` — calls Claude (haiku) to extract: agent_id, task_type, title, description, priority, is_query
2. For queries: return inline answer from existing endpoints.
3. For tasks: create via existing task creation logic.

**Frontend:**
1. Create `src/components/CommandBar.jsx`:
   - Text input with Cmd+K / Ctrl+K focus
   - On submit: call parse, create task, show confirmation toast with 5s undo
   - Up-arrow recalls last 20 commands (React state only)
   - Autocomplete dropdown showing agent names
   - Desktop: fixed at top of App.jsx
   - Mobile: floating button that expands to bottom input bar
2. Add to `App.jsx` at the top of the layout.
3. Add `api.js` method: `parseCommand(text)`

---

### BUILD 6: Hive Skill Registry V2 (ClawHub-style upgrade)

**Why:** Current SkillRegistry is basic CRUD. Upgrade to SKILL.md-based instruction packages that inject into agent prompts at runtime.

**Backend changes (server/db.js) — replace agent_skills table:**
```sql
CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  version TEXT DEFAULT '1.0.0',
  author TEXT DEFAULT 'john',
  skill_md TEXT NOT NULL,
  tags TEXT DEFAULT '[]',
  source TEXT DEFAULT 'custom' CHECK(source IN ('custom','clawhub','marketplace')),
  clawhub_ref TEXT,
  requires_env TEXT DEFAULT '[]',
  requires_tools TEXT DEFAULT '[]',
  downloads INTEGER DEFAULT 0,
  is_published INTEGER DEFAULT 0,
  sha256 TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_skills_v2 (
  agent_id TEXT NOT NULL,
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  enabled INTEGER DEFAULT 1,
  priority INTEGER DEFAULT 0,
  installed_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (agent_id, skill_id)
);
```

**Backend changes (server/index.js):**
1. Skill loading in `callClaude()`: append enabled skills' `skill_md` to system prompt.
2. CRUD endpoints for skills.
3. Agent assignment endpoints.

**Frontend:**
1. Replace `SkillRegistry.jsx` with full skill store: search, tag filters, card grid.
2. Skill editor with SKILL.md textarea + live preview.
3. Agent skill manager with drag-to-reorder priority.

---

## Coding Standards

- **ES modules** everywhere (`import`/`export`, no `require`)
- **Tailwind 4** for all styling — use existing design system tokens (see `src/index.css` for `--color-*` custom properties). Light Apple-inspired theme with glass morphism, thin borders, subtle shadows.
- **Mobile-first** — every new component must work on 375px width. Use existing `MobileNav.jsx` pattern for bottom navigation.
- **API pattern** — all new endpoints follow existing `request()` wrapper in `api.js`. Add new methods to the `api` export object.
- **SQLite** — use `db.prepare().run/get/all()` pattern. Migrations via try/catch ALTER TABLE.
- **No new dependencies** unless specified (recharts and react-force-graph-2d are approved). Everything else should use what's already installed.
- **Concise** — don't pad code with excessive comments. Self-documenting names. Match existing code density.
- **Error handling** — wrap all async operations in try/catch. Return sensible error JSON from endpoints.
- **Update CHANGELOG.md** after each feature — prepend at top with date and feature list.
- **Update SYSTEM.md** if architecture changes (new tables, new services, new deployment config).

## Git Workflow

```bash
# After each feature:
git add -A
git commit -m "feat: [feature name] — [brief description]"
git push origin main
```

## Testing

After building each feature:
1. `node --check server/index.js` — syntax check backend
2. `npm run build` — verify frontend compiles
3. Start dev server: `npm run dev`
4. Open http://localhost:5173 (Vite frontend)
5. Backend runs on http://localhost:3002
6. Create a test task and verify the new feature works
7. Check mobile responsiveness (Chrome DevTools → responsive mode → 375px)
8. Verify no console errors in browser or server terminal

## Deployment

```bash
# Local: build and push
npm run build && git add -A && git commit -m "feat: ..." && git push origin main

# On the VM (ssh into Lightsail) — ALWAYS git stash first:
cd ~/hive && git stash && git pull && pm2 restart hive --update-env

# ALWAYS verify after deploy:
curl -s http://16.145.215.162:3002/api/health | head -c 200
```

The 4GB VM runs the app but doesn't build it. Build locally, push, pull on VM.
Netlify auto-deploys frontend from GitHub on push to main.
