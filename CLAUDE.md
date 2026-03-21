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
API Key:  2d14429f-beee-4b5b-92d8-b1044c974e41-c287302e-d264-4725-a829-0136e14105b9
```

### API Access
Use the API key for all Hive API calls:
```bash
curl -s "http://16.145.215.162:3002/api/tasks?token=2d14429f-beee-4b5b-92d8-b1044c974e41-c287302e-d264-4725-a829-0136e14105b9"
```

### Agent Model Routing (via OpenRouter)
- scout: qwen/qwen3-235b-a22b (web_search tool still uses perplexity/sonar-pro internally)
- forge: qwen/qwen3-235b-a22b
- quill: qwen/qwen3-235b-a22b
- dealer: anthropic/claude-haiku-4-5 (sales needs reliable function calling)
- oracle: deepseek/deepseek-r1-0528 (top reasoning model, 85% cheaper than sonnet)
- nexus: anthropic/claude-sonnet-4-5 (orchestration needs reliability)
- sentinel: qwen/qwen3-235b-a22b
- Fallbacks: qwen3 → qwen-2.5-72b-instruct, deepseek-r1-0528 → deepseek-r1

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

### The 4 Pillars
1. Ember — make perfect, add billing, get paying restaurants
2. AgentForge — build Phase 1-5, launch template marketplace
3. Trading — Oracle paper trades → proven strategy → live
4. AI Services — activates automatically at $147 MRR milestone

### Priority 1: Ember Quality Sprint
Goal: Perfect product before selling to new restaurants.
Live at: sous-frontend.vercel.app
Repos: Jmerc151/sous-frontend, Jmerc151/sous-backend
Customers: Honey Belly Korean BBQ, Shawnees

Quality bar: New restaurant signs up, gets set up, shares with
staff, staff using Kitchen Bible — all in 10 minutes, no help needed.

P0: Stripe billing (restaurants can pay)
P1: Sample data on signup (Kitchen Bible not empty)
P2: Loading skeletons everywhere
P3: Mobile touch targets 44px minimum
P4: Onboarding polish

Skills: ember-design-system, ember-mobile-first, ember-onboarding-flow,
ember-performance, ember-marketing-site, ember-qa-checklist

### Priority 2: AgentForge Build
Sellable multi-tenant AI agent platform.
Repo: Jmerc151/agentforge
Positioning: "AI companies that actually do things"
Current phase: Phase 1 — PostgreSQL schema
Build order: Schema → API → React UI → Stripe → ReAct loop
Ship template marketplace before Paperclip ClipMart launches.

### Priority 3: Trading
Oracle paper trading RSI mean reversion on 7 symbols.
Running daily 9:31am via pipeline.
Polymarket paper trading: weekly scan, $100 virtual.
Graduation to live: 60+ days paper + request_approval.

### Priority 4: AI Services (auto-activates)
Activates when: Ember $147+ MRR AND AgentForge Phase 2 done.
Nexus checks this every Sunday. Fires automatically.

### Pipelines Running
- Ember Dev Daily: 9am weekdays
- AgentForge Build: 10am Mon/Wed/Fri
- Trading Session: 9:31am weekdays
- Opportunity Scan: 9am Mondays
- Weekly Sprint: 6pm Sundays
- Daily Digest Email: 7am daily

### New Tools Added
- deep_research: multi-source research synthesis
- score_codebase: GitHub repo operability scoring
- consult_agent: quick inter-agent questions
- polymarket_get_markets: prediction market data
- polymarket_paper_trade: virtual prediction trading

### Competitive Context
Main competitors: Paperclip, CrewAI, Sim, n8n, AutoGPT
Our edge: real integrations + vertical templates + trading + Ember proof
Watch: Paperclip ClipMart launch — ship our template marketplace first

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
