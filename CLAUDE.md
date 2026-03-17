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
- scout: anthropic/claude-haiku-4-5 (web_search tool still uses perplexity/sonar-pro internally)
- forge: anthropic/claude-haiku-4-5
- quill: anthropic/claude-haiku-4-5
- dealer: anthropic/claude-haiku-4-5
- oracle: anthropic/claude-sonnet-4-5
- nexus: anthropic/claude-sonnet-4-5

### Key Files
- `server/index.js` — Main Express server (~9000+ lines). All API routes, ReAct loop, spend controls, agent execution, consultations, QA reviews, auto-task generation, heartbeats, pipelines, trading endpoints, skills, guardrails.
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
All 10 industry-grade features are implemented. Focus areas:
- MCP server integration testing (connect real MCP tools)
- Eval harness: add more test cases, run regularly
- AgentForge MVP (standalone product in Jmerc151/agentforge repo)
- Ember revenue: Stripe billing, landing page, onboarding polish

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
# On the VM (ssh into Lightsail) — ALWAYS git stash first:
cd ~/hive && git stash && git pull && pm2 restart hive --update-env
```

Build locally (`npm run build`), push dist to git, then pull on VM. The 1GB VM cannot run npm build.
Netlify auto-deploys from GitHub on push to main.
