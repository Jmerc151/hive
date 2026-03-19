# CLAUDE.md — Hive Project Prompt

> You are working on **Hive**, an autonomous AI income agent team. 6 agents (Scout, Forge, Quill, Dealer, Oracle, Nexus) research, build, write, sell, trade, and self-improve. The platform runs on Express 5 + SQLite + React 19 + Vite + Tailwind 4, deployed on AWS Lightsail (backend, port 3002) + Netlify (frontend).

## Current Architecture

```
Frontend: React 19 + Vite + Tailwind 4 (src/)
Backend:  Express 5 + better-sqlite3 (server/)
LLM:      OpenRouter API (multi-model per agent)
Trading:  Alpaca paper trading + Yahoo Finance
Deploy:   AWS Lightsail VM (PM2, port 3002) + Netlify
DB:       SQLite (hive.db) — WAL mode, foreign keys ON
```

### Agent Model Routing (via OpenRouter)
- scout: perplexity/sonar-pro
- forge: deepseek/deepseek-r1
- quill: anthropic/claude-haiku-4-5
- dealer: anthropic/claude-haiku-4-5
- oracle: anthropic/claude-sonnet-4-5
- nexus: anthropic/claude-sonnet-4-5

### Key Files
- `server/index.js` — Main Express server (~2600 lines). All API routes, ReAct loop, spend controls, agent execution, consultations, QA reviews, auto-task generation, heartbeats, pipelines, trading endpoints.
- `server/db.js` — SQLite schema (20+ tables) + default settings.
- `server/services/` — marketData.js, broker.js, backtest.js, analysis.js, email.js
- `agents/agents.json` — 6 agent definitions with system prompts.
- `src/App.jsx` — Main dashboard layout, routing, state management.
- `src/components/` — 22 React components (see list below).
- `src/lib/api.js` — API client wrapper (~189 lines, all endpoints).
- `memory/` — Per-agent .md files for persistent learnings.
- `SYSTEM.md` — Architecture overview (keep in sync with changes).
- `CHANGELOG.md` — Feature log (prepend new entries at top).

### Existing React Components
AgentCards, AgentScorecard, ABTestPanel, BotGenerator, ChatPanel, CreateTaskModal, EventTriggers, HistoryPanel, MobileNav, PipelineBuilder, ProjectsPanel, PromptReviewModal, ProposalsPanel, RevenuePanel, SearchBar, Sidebar, SkillRegistry, SpendDashboard, TaskBoard, TaskDetail, TraceView, TradingDashboard

### Existing Database Tables
tasks, task_logs, messages, settings, spend_log, bot_suggestions, task_traces, revenue_entries, pipelines, event_triggers, agent_skills, market_data_cache, trades, watchlist, portfolio_snapshots, strategies, strategy_backtests, bot_deployments, strategy_performance, proposals

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

---

## BUILD QUEUE — What to Build Next

Build these features IN ORDER. Each builds on the previous. After completing each feature, update CHANGELOG.md and test.

---

### BUILD 1: Live SSE Trace Stream (upgrade existing TraceView)

**Why:** Currently TraceView polls every 3s. SSE streaming lets you watch agents think in real time — massive UX improvement.

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

2. Add `api.js` methods: (none needed — EventSource connects directly)

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
   - Mobile: pinch-to-zoom + touch-drag. Below 400px, fall back to a simple list view showing "scout → oracle (5x)" etc.
3. Add to Sidebar.jsx as a new nav item with 🕸️ icon.
4. Add `api.js` methods: `getGraphNodes()`, `getGraphEdges(range)`

---

### BUILD 3: Stacked Cost Timeline (upgrade existing SpendDashboard)

**Why:** Your SpendDashboard is a modal with bar chart. Upgrade to a persistent panel with Recharts stacked area chart showing cost by agent over time + cost-per-task drill-down.

**Backend changes (server/index.js):**
Add new endpoints (keep existing `/api/spend` for backwards compat):
- `GET /api/analytics/spend?range=7d&agent=scout` — time-series spend grouped by agent + time bucket (hourly for 24h, daily for 7d/30d)
- `GET /api/analytics/spend/by-task?limit=50` — per-task cost rollup
- `GET /api/analytics/agents/summary?range=30d` — aggregate stats per agent

**Frontend:**
1. `npm install recharts` — add to package.json
2. Create `src/components/CostTimeline.jsx`:
   - Recharts StackedAreaChart with each agent as a colored layer
   - Date range selector: 24h, 7d, 30d
   - Agent color map matches existing agent colors from agents.json
   - Summary cards row: per-agent totals (tokens, cost, tasks, avg latency). Horizontally scrollable on mobile.
   - Cost-per-task table below chart. Desktop: sortable table. Mobile: expandable list items.
3. Add to Sidebar.jsx as nav item with 📊 icon.
4. Keep SpendDashboard.jsx as the quick-access modal (for limit controls). CostTimeline is the deep-dive view.
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
1. In the post-completion hook (after `reviewCompletedWork` for Scout tasks), add an `extractIntelItems()` function:
   - Call Claude with Scout's output and ask it to extract structured opportunities as JSON array: `[{title, summary, source_url, confidence, tags}]`
   - INSERT each into `intel_items` table
2. Endpoints:
   - `GET /api/intel?status=new&tag=affiliate&limit=50` — list with filters
   - `PATCH /api/intel/:id/status` — update status (bookmark, dismiss, send_to_forge)
   - When status changes to `sent_to_forge`, auto-create a Forge task from the intel item

**Frontend:**
1. Create `src/components/IntelFeed.jsx`:
   - Scrollable card list, newest first
   - Each card: title, summary preview (2 lines), tags as chips, confidence badge (green/yellow/red)
   - Tap to expand: full summary, source link, action buttons (Send to Forge 🔨, Bookmark ★, Dismiss ✕)
   - Filter bar: status tabs (All, New, Bookmarked), tag filter chips
   - Mobile: swipe right to bookmark, swipe left to dismiss
2. Add to Sidebar.jsx as nav item with 🔍 icon.
3. Add `api.js` methods: `getIntel(filters)`, `updateIntelStatus(id, status)`

---

### BUILD 5: Natural Language Command Bar

**Why:** Type "scout research telegram bot monetization" and it creates the task without opening CreateTaskModal. Best demo feature.

**Backend changes (server/index.js):**
1. `POST /api/commands/parse` — takes `{text}` body, calls Claude (haiku for speed) to extract:
   - `agent_id` (which agent)
   - `task_type` (research, build, write, sell, analyze, review)
   - `title` (clean task title)
   - `description` (expanded description)
   - `priority` (low/medium/high)
   - `is_query` (boolean — true if it's a read-only question like "how much did we spend today")
2. For queries (is_query=true): return inline answer from existing endpoints.
3. For tasks: create via existing task creation logic, return the created task.

**Frontend:**
1. Create `src/components/CommandBar.jsx`:
   - Text input with placeholder "Type a command... (⌘K to focus)"
   - Keyboard shortcut: Cmd+K (Mac) / Ctrl+K (Windows) to focus
   - On submit: call `/api/commands/parse`, then create task via existing API
   - Show confirmation toast: "✅ Task created: Scout → Research Telegram bot monetization" with 5s undo
   - Up-arrow recalls last 20 commands (stored in React state, not localStorage)
   - Autocomplete dropdown showing agent names when typing
   - Desktop: fixed at top of App.jsx, full width
   - Mobile: floating button that expands to bottom input bar (like a chat input)
2. Add to `App.jsx` at the top of the layout.
3. Add `api.js` method: `parseCommand(text)`

**Example commands the parser should handle:**
```
scout research telegram bot monetization strategies
forge build a landing page for the affiliate offer
show me scout's last 5 findings → routes to intel feed
how much did we spend today → returns spend data inline
run the product launch pipeline → triggers existing pipeline
pause all agents → updates setting
```

---

### BUILD 6: Hive Skill Registry V2 (ClawHub-style upgrade)

**Why:** Current SkillRegistry is basic CRUD (name, type, toggle). Upgrade to SKILL.md-based instruction packages that inject into agent prompts at runtime, with ClawHub upstream sync.

**Backend changes (server/db.js) — replace agent_skills table:**
```sql
DROP TABLE IF EXISTS agent_skills;
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
1. Skill loading in agent execution: when building the system prompt for `callClaude()`, query `agent_skills_v2 JOIN skills` for enabled skills ordered by priority. Append each skill's `skill_md` content to the system prompt.
2. CRUD endpoints:
   - `GET /api/skills?search=&tags=&agent=` — search/filter
   - `GET /api/skills/:slug` — full detail
   - `POST /api/skills` — create (generate slug from name)
   - `PUT /api/skills/:slug` — update, auto-increment version
   - `DELETE /api/skills/:slug` — cascade delete assignments
3. Agent assignment:
   - `GET /api/agents/:agentId/skills` — list assigned
   - `POST /api/agents/:agentId/skills/:skillSlug` — assign
   - `DELETE /api/agents/:agentId/skills/:skillSlug` — unassign
   - `PATCH /api/agents/:agentId/skills/:skillSlug` — toggle enabled, update priority

**Frontend:**
1. Replace `src/components/SkillRegistry.jsx` with full skill store:
   - Search bar + tag filter chips + source tabs (My Skills | ClawHub)
   - Card grid: 1-col mobile, 2-col tablet, 3-col desktop
   - Each card: name, description, author, tags, assigned agents as colored chips
   - Skill detail modal: rendered SKILL.md (use a simple markdown renderer), version, assigned agents, env requirements
2. Add skill editor (split pane or tabbed):
   - Left: textarea/code editor for SKILL.md with YAML frontmatter
   - Right: live preview
   - Template dropdown: research, builder, analyzer, monitor
3. Agent skill manager: per-agent view with drag-to-reorder priority
4. Add to Sidebar.jsx as nav item with 🧩 icon (replace or augment existing skill icon).

**SKILL.md format:**
```yaml
---
name: telegram-bot-research
description: Research Telegram bot monetization strategies
version: 1.0.0
author: john
agents: [scout]
tags: [research, telegram, monetization]
requires_tools: [web_search]
---

# Telegram Bot Monetization Research

When asked to research Telegram bot monetization:
1. Search for active affiliate programs...
2. Identify revenue models...
```

---

## Coding Standards

- **ES modules** everywhere (`import`/`export`, no `require`)
- **Tailwind 4** for all styling (use existing color tokens: `hive-100` through `hive-900`, `honey`, `danger`, etc.)
- **Dark theme** — all components use `bg-hive-800`, `border-hive-700`, `text-hive-100` etc. Match existing component style.
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
1. Start dev server: `npm run dev`
2. Open http://localhost:5173 (Vite frontend)
3. Backend runs on http://localhost:3002
4. Create a test task and verify the new feature works
5. Check mobile responsiveness (Chrome DevTools → responsive mode → 375px)
6. Verify no console errors in browser or server terminal

## Deployment

```bash
# On the VM (ssh into Lightsail):
cd ~/hive
git pull
npm install
npm run build
pm2 restart hive-backend
```

Netlify auto-deploys from GitHub on push to main.
