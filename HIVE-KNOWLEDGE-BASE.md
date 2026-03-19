# Hive Knowledge Base

> Last updated: March 19, 2026

---

## 1. What is Hive?

Hive is an autonomous AI income agent team. 7 specialized agents (Scout, Forge, Quill, Dealer, Oracle, Nexus, Sentinel) research, build, write, sell, trade, and self-improve — all orchestrated from a single command center dashboard.

**Live:** http://16.145.215.162:3002
**GitHub:** https://github.com/Jmerc151/hive
**Owner:** John Mercurio (Johnmercurio151@gmail.com)

---

## 2. Architecture

### Stack
| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite 7 + Tailwind CSS v4 |
| Backend | Express 5 + better-sqlite3 (SQLite, WAL mode) |
| LLM | OpenRouter API (multi-model routing per agent) |
| Trading | Alpaca paper trading + Yahoo Finance |
| Deployment | AWS Lightsail VM 4GB (backend, PM2, port 3002) + Netlify (frontend auto-deploy) |
| Database | SQLite (hive.db) — WAL mode, foreign keys ON |

### VM Details
- **IP:** 16.145.215.162
- **OS:** Ubuntu 24.04
- **RAM:** 4GB
- **Process Manager:** PM2 (process name: `hive`)
- **Start command:** `node --env-file=.env server/index.js`

### Key Files
| File | Purpose |
|------|---------|
| `server/index.js` | Main Express server (~9000+ lines). All API routes, ReAct loop, spend controls, agent execution, consultations, QA reviews, auto-task generation, heartbeats, pipelines, trading endpoints, skills, guardrails, graceful shutdown, health checks, dead letter queue. |
| `server/db.js` | SQLite schema (22+ tables) + default settings |
| `server/services/email.js` | Gmail notifications (nodemailer) |
| `server/services/analysis.js` | Multi-lens Oracle analysis (5 AI personas) |
| `server/services/broker.js` | Alpaca trading API wrapper |
| `server/services/backtest.js` | Strategy backtesting engine |
| `server/services/marketData.js` | Yahoo Finance data fetching |
| `agents/agents.json` | 7 agent definitions with system prompts |
| `src/App.jsx` | Main dashboard layout, routing, state management |
| `src/lib/api.js` | API client wrapper (all endpoints) |
| `memory/` | Per-agent .md files for persistent learnings |

### Database Tables (22+)
tasks, task_logs, messages, settings, spend_log, bot_suggestions, task_traces, revenue_entries, pipelines, event_triggers, agent_skills, market_data_cache, trades, watchlist, portfolio_snapshots, strategies, strategy_backtests, bot_deployments, strategy_performance, proposals, dead_letters, smoke_test_runs, smoke_tests

### Frontend Components (25+)
AgentCards, AgentScorecard, ABTestPanel, BotGenerator, ChatPanel, CreateTaskModal, DeliverablesFeed, EventTriggers, GuardrailMonitor, HistoryPanel, MCPServers, MobileNav, PipelineBuilder, ProjectsPanel, PromptReviewModal, ProposalsPanel, RevenuePanel, SearchBar, Sidebar, SkillRegistry, SmokeTestPanel, SpendDashboard, TaskBoard, TaskDetail, TraceView, TradingDashboard

---

## 3. The 7 Agents

### Scout (Market Research & Opportunity Finder)
- **Avatar:** Telescope
- **Color:** #06b6d4 (cyan)
- **Model:** anthropic/claude-haiku-4-5
- **Spend limit:** $1.50/day
- **Missions:** Ember intelligence (weekly), AgentForge market research (weekly), AI business opportunities (weekly), trading strategy research (bi-weekly)
- **Note:** `web_search` tool still uses perplexity/sonar-pro internally for search quality

### Forge (Product Builder & Developer)
- **Avatar:** Hammer & Pick
- **Color:** #3b82f6 (blue)
- **Model:** anthropic/claude-haiku-4-5
- **Spend limit:** $2.00/day
- **Missions:** Ember development (70%, GitHub PRs), AgentForge building (30%, Mon/Wed/Fri)

### Quill (Content Creator & Growth Engine)
- **Avatar:** Writing hand
- **Color:** #8b5cf6 (purple)
- **Model:** anthropic/claude-haiku-4-5
- **Spend limit:** $1.00/day
- **Missions:** Ember content (60%, Dev.to + Twitter), AgentForge content (40%, Dev.to + Beehiiv)

### Dealer (Sales & Client Acquisition)
- **Avatar:** Handshake
- **Color:** #3BB273 (green)
- **Model:** anthropic/claude-haiku-4-5
- **Spend limit:** $0.75/day
- **Missions:** AgentForge beta customers (primary, max 5 emails/day), content promotion (secondary)

### Oracle (Market Analyst & Trading Strategist)
- **Avatar:** Crystal ball
- **Color:** #E8C547 (gold)
- **Model:** anthropic/claude-sonnet-4-5
- **Spend limit:** $0.75/day
- **Mission:** Paper trading RSI Mean Reversion on SPY/QQQ/AAPL/NVDA/MSFT/TSLA/AMZN. Max $1000/position, max 3 trades/day.
- **Features:** Multi-lens analysis (5 AI personas), deterministic trade constraints, LLM trade decisions, strategy ensemble

### Nexus (Meta-Agent, Team Optimizer & Self-Improver)
- **Avatar:** DNA strand
- **Color:** #ec4899 (pink)
- **Model:** anthropic/claude-sonnet-4-5
- **Spend limit:** $1.00/day
- **Mission:** Quality review (score 1-10), opportunity evaluation, weekly sprint planning (Sundays)

### Sentinel (QA & Production Monitor)
- **Avatar:** Shield
- **Color:** #ef4444 (red)
- **Model:** anthropic/claude-haiku-4-5
- **Spend limit:** $0.25/day
- **Tools:** http_request, create_task, store_memory, recall_memory, send_email
- **Mission:** Investigates production failures, creates Forge tasks for real bugs, runs smoke tests

---

## 4. The 3 Business Pillars

Everything Hive does serves exactly 3 businesses. Anything else is off-topic and gets blocked by guardrails.

### Pillar 1: Ember (Restaurant Kitchen Management SaaS)
- **What:** Daily kitchen operations platform for restaurants. Checklists, shift ops, staff communication, accountability.
- **Target:** $147 MRR (3 paying restaurants)
- **Pricing:** Starter $49/mo, Professional $99/mo, Enterprise custom
- **Frontend:** React 19 + Vite → Vercel (sous-frontend.vercel.app)
- **Backend:** Express.js + PostgreSQL → Railway (sous-backend-production.up.railway.app)
- **AI:** OpenRouter API via shared `utils/ai.js`
- **Landing:** ember-landing-phi.vercel.app
- **Demo:** restaurant_id=3, Demo Kitchen, demo@ember.app / Demo123, share code DEMO123

#### Ember Features Built
- 15 kitchen ops tabs (opening, closing, prep, sidework, temps, waste, recipes, chat, schedule, events, ops, plating, 86 board, orders, staff notes)
- JWT auth with manager/staff roles
- Share link staff access (code + name capture → JWT)
- Per-line checklist completion tracking with attribution
- Admin dashboard with CRUD for all features
- Multi-tenant data model (restaurant_id on all tables)
- Feature enablement flags per restaurant
- Conversational AI onboarding (3-8 adaptive questions → personalized Kitchen Bible)
- Custom checklist types (managers create beyond opening/closing)
- Gamification (points, streaks, weekly leaderboard)
- Photo verification (optional per-item, camera capture)
- 6 smoke tests running every 30 minutes

#### Ember Competitive Position
| Competitor | Focus | Price | Our Advantage |
|-----------|-------|-------|---------------|
| MarketMan | Inventory/purchasing | $200-500/mo | Simpler, cheaper, daily ops focus |
| meez | Recipe management | $25-75/user/mo | Broader operational coverage |
| xtraCHEF (Toast) | Invoice/food cost | Bundled w/ Toast | POS-agnostic |
| Apicbase | Enterprise food mgmt | $300-800/mo | Accessible to independents |
| Galley | Institutional food service | $500+/mo | Targets restaurants, not hospitals |

**Niche:** Daily kitchen execution for independent and small multi-unit restaurants. Zero-friction staff access via share links.

### Pillar 2: AgentForge (AI Agent Platform)
- **What:** Hive as a product — autonomous AI agent orchestration platform
- **Target:** Build MVP, get 5 beta users
- **Schedule:** Scout research + Forge building Mon/Wed/Fri

### Pillar 3: Trading (Alpaca Paper Trading)
- **What:** Algorithmic paper trading via Alpaca API
- **Target:** 60-day paper phase, then request approval for live trading
- **Account:** $100K paper account
- **Watchlist:** SPY, QQQ, AAPL, NVDA, MSFT, TSLA, AMZN
- **Strategy:** RSI Mean Reversion
- **Constraints:** Max $1000/position, max 3 trades/day
- **Status:** Active — Oracle has bought SPY and AAPL

---

## 5. How Agents Work

### ReAct Execution Loop
1. Task created (manual or auto-generated)
2. Queue auto-runs picks up task
3. Agent gets system prompt + task description + installed skills
4. ReAct loop: up to 3 steps (think → act → observe)
5. Each step can use tools (web_search, write_file, create_task, send_email, etc.)
6. Inter-agent consultation via `[CONSULT:agent_id]` syntax
7. On success: memory update → QA review (if enabled) → follow-up tasks
8. On failure: retry (max 2x) → dead letter queue with email alert

### Inter-Agent Consultation
Agents can consult each other mid-task using `[CONSULT:agent_id]`. Example: Scout researching a topic can consult Oracle for market analysis. Each consultation is logged in the `agent_interactions` table and visible in traces.

### Auto-Task Generation
Nexus generates follow-up tasks after completed work. Guardrails:
- 5 auto-tasks per day maximum
- 3-deep chain limit
- Allowed chains: scout→quill, scout→forge, scout→dealer, quill→dealer, forge→quill, forge→nexus
- Terminal agents (oracle, dealer, nexus) never auto-chain
- Deduplication: won't create task if similar exists in last 24h

### Agent Memory System
Each agent has a persistent `.md` file in the `memory/` directory. After each task:
- Agent learnings are appended to their memory file
- Memory is auto-curated to prevent bloat
- Memory is injected into the agent's context on future tasks

---

## 6. Automated Pipelines & Heartbeats

### Active Pipelines
| Pipeline | Schedule | Flow |
|----------|----------|------|
| Ember Dev Daily | 9am weekdays | Scout research → Forge build → Nexus QA |
| Trading Session | 9:31am weekdays | Oracle analyzes → places trades |
| AgentForge Build | 10am Mon/Wed/Fri | Scout research → Forge build → Quill document |
| Opportunity Scan | Sundays | Scout finds → Nexus evaluates → Forge builds MVPs |
| Weekly Sprint | Sundays | Nexus reviews week → creates next week's tasks |

### Heartbeats (24 total)
Heartbeats are recurring background jobs:
- **auto-standup** (24h) — Daily team standup
- **queue-monitor** (5m) — Process queued tasks
- **memory-compaction** (7d) — Compress agent memories
- **nexus-retrospective** (7d) — Weekly review
- **bot-opportunity-scan** (7d) — Find new opportunities
- **strategy-executor** (5m) — Execute trading strategies
- **order-sync** (5m) — Sync trading orders
- **portfolio-snapshot** (1h) — Capture portfolio state
- **market-cache-cleanup** (30m) — Clean stale market data
- **strategy-discovery** (24h) — Find new strategies
- **auto-backtest** (6h) — Run strategy backtests
- **ux-design-review** (7d) — Nexus reviews UI
- **feature-discovery** (7d) — Scout finds features to build
- **self-assessment** (7d) — Nexus self-evaluation
- **auto-unstick** (10m) — Reset stuck tasks
- **ember-smoke-test** (30m) — Run 6 production smoke tests
- Plus others (24 total)

---

## 7. Spend Controls & Guardrails

### Spend Limits
| Scope | Limit |
|-------|-------|
| Daily global | $8/day |
| Monthly global | $100/month |
| Scout | $1.50/day |
| Forge | $2.00/day |
| Quill | $1.00/day |
| Dealer | $0.75/day |
| Oracle | $0.75/day |
| Nexus | $1.00/day |
| Sentinel | $0.25/day |

- Smart model routing: auto-downgrade to Haiku at 80% budget
- Self-improvement tasks only run when daily spend < 80% of limit
- Settings keys: `daily_limit_usd` and `monthly_limit_usd`

### Guardrails
- **3-pillar enforcement** injected into every agent system prompt
- **Blocked topics:** healthcare, hipaa, hospital, ciso, credential validation, infrastructure blocker
- **Task limits:** 5 auto-tasks/day, 3-deep chain limit, 10 tasks/agent/day
- **Tool safety:** Fake email domain blocklist (example.com, test.com), PII detection, trade safety, path traversal prevention
- **Revenue protection:** Requires real transaction IDs, blocks negative amounts, caps at $10K
- **Approval keywords:** "withdraw funds, delete all, send email, email outreach, cold email, contact restaurant"

---

## 8. Platform Integrations

### Connected (API keys on VM)
| Service | Purpose | Notes |
|---------|---------|-------|
| OpenRouter | LLM API | Multi-model routing |
| Alpaca | Paper trading | $100K paper account |
| Stripe | Payments & revenue | sk_live key |
| Hunter.io | Email finder | 25 free/month |
| Gumroad | Digital product sales | |
| Dev.to | Blog publishing | Free |
| Netlify | Deploy landing pages | |
| Gmail | Notifications | Johnmercurio151@gmail.com |

### Not Connected
| Service | Reason |
|---------|--------|
| Beehiiv | Needs Stripe identity verification |
| Twitter/X | $100/mo — skipping |
| Reddit | Needs app approval |
| LinkedIn | Restrictive OAuth |
| Medium | Need MEDIUM_TOKEN |
| Replicate | Need REPLICATE_API_TOKEN |

### 50+ Agent Tools Available
Including: web_search, write_file, read_file, create_task, send_email, search_skills, install_skill, http_request, store_memory, recall_memory, and many more.

---

## 9. Security

- **API Key Auth:** Mandatory Bearer token on all `/api/*` routes
- **API Key:** `2d14429f-beee-4b5b-92d8-b1044c974e41-c287302e-d264-4725-a829-0136e14105b9`
- **Helmet:** Security headers (HSTS, X-Frame-Options, CSP off for SPA)
- **Rate limiting:** 100 req/min per IP
- **VAPID keys:** Auto-generated on first boot
- **Webhook secrets:** Full UUID, header-only (no query string)
- **Request timeout:** 30s normal, 5min for /run and /sandbox endpoints
- **Production API key** baked into frontend build via `.env.production` (VITE_API_KEY)

---

## 10. Frontend Design System

### Theme: Light Apple-Inspired
Overhauled from dark theme to light Apple-inspired theme (March 14-15, 2026). Reference mockup: `~/Downloads/hive_v2.html`

### Design Tokens (src/index.css @theme block)
- **Surfaces:** page=#e8e8ed, s1=#efeff4, s2=#f5f5f8, s3=#fafafc, card=#f8f8fb
- **Typography:** t1=#1c1c1e, t2=#48484a, t3=#8e8e93, t4=#aeaeb2, t5=#c7c7cc
- **Agent colors (muted):** scout=#d4790a, forge=#5a5a60, quill=#28a745, dealer=#c0292a, oracle=#8040b8, nexus=#8e8e93
- **Borders:** 0.5px solid rgba(0,0,0,0.07)
- **Fonts:** Bebas Neue (display/headings) + system font (body)
- **Style:** Glass morphism, thin borders, subtle shadows

### Layout
- Default main view: DeliverablesFeed (not chat+taskboard split)
- Feed shows: tabs (All/Emails/Documents/Trades/Code/Reports), completed deliverable cards, generating shimmer cards (max 3)
- Right panel (214px): KPI grid, agent progress bars, recent list
- Agent tiles: 27x27 rounded squares with Bebas Neue single letters (S, F, Q, D, O, N)

---

## 11. Existing Features (Complete List)

- ReAct execution loop (3 steps max + retry)
- Inter-agent consultation via [CONSULT:agent_id]
- Spend controls (daily/monthly/per-agent limits, pause)
- Auto-task generation with guardrails
- QA reviews (Nexus scores completed work 1-10)
- Agent memory (persistent .md files, auto-curated)
- Trace view (per-task execution timeline)
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
- Email notifications (nodemailer, weekly summary)
- Projects view (auto-categorized by theme)
- History/audit trail with search
- Agent scorecards
- Graceful shutdown (SIGTERM/SIGINT with task cleanup)
- Process error handlers (uncaughtException, unhandledRejection)
- Enhanced health endpoint (/api/health — DB, circuits, queues, stuck tasks, spend)
- Request timeout middleware (30s normal, 5min for /run /sandbox)
- Dead letter queue (permanently failed tasks with email alerts)
- Startup self-test (DB, OpenRouter, agents, memory dir)
- Structured JSON logging
- Guardrail monitor UI
- MCP server management UI
- Smoke test suite (6 tests, 30min interval, email alerts)
- Auto-unstick system (resets orphaned in_progress tasks)
- DeliverablesFeed (main dashboard view)
- Command bar (Cmd+K)
- Knowledge base (document store)
- Schedule view
- Network graph view

---

## 12. Skills System

### Installed Skills (20+)
**Ember skills:** design-system, mobile-first, onboarding-flow, performance, marketing-site, qa-checklist, frontend-patterns, backend-patterns, github-dev-workflow
**Trading skills:** Scout has installed additional trading-related skills
**Hive commercial:** agentforge-context, ai-services-playbook, plus others
**General:** Various operational skills

### How Skills Work
1. Skills are stored as SKILL.md files with YAML frontmatter
2. Skills are loaded into the `skills` table in SQLite
3. Assigned to agents via `agent_skills_v2` junction table
4. At runtime, enabled skills' content is appended to the agent's system prompt in `callClaude()`
5. Agents can discover and install new skills via `search_skills` and `install_skill` tools

---

## 13. Smoke Tests (Production Monitoring)

6 deterministic HTTP tests running every 30 minutes (zero LLM cost):

| # | Test | Target |
|---|------|--------|
| 1 | Backend health | sous-backend-production.up.railway.app/health |
| 2 | Frontend loads | sous-frontend.vercel.app (HTML returned) |
| 3 | Staff join page | sous-frontend.vercel.app/join/HONEYBELLY |
| 4 | Staff access API | POST /auth/staff-access/HONEYBELLY (not 500) |
| 5 | Login endpoint | POST /auth/login with bad creds → 401 (not 500) |
| 6 | Onboarding chat | POST /api/onboarding/chat/start (not 500, 404 accepted) |

- On failure: immediate email alert
- On 2+ consecutive failures: auto-creates Sentinel investigation task

---

## 14. Deployment Procedures

### Local Build & Push
```bash
npm run build && git add -A && git commit -m "feat: ..." && git push origin main
```

### VM Deploy (ALWAYS git stash first!)
```bash
cd ~/hive && git stash && git pull && pm2 restart hive --update-env
```
**CRITICAL:** The VM ALWAYS has dirty state. Never just `git pull`. Always `git stash` first.

### Verify After Deploy
```bash
curl -s http://16.145.215.162:3002/api/health | head -c 200
```

### Netlify
Frontend auto-deploys from GitHub on push to main.

### Ember (separate deployment)
- Frontend: Vercel auto-deploy from GitHub (Jmerc151/sous-frontend)
- Backend: Railway auto-deploy from GitHub (Jmerc151/sous-backend)
- Railway project: **innovative-respect** (NOT victorious-solace)

---

## 15. Settings State (Current)

| Setting | Value |
|---------|-------|
| auto_tasks_enabled | true |
| qa_reviews_enabled | false (saves cost) |
| queue_auto_run | true |
| email_on_completion | false |
| email_on_approval | false |
| email_on_proposal | false |
| email weekly summary | true |
| daily_limit_usd | 50 |
| monthly_limit_usd | 200 |
| trading_enabled | true |
| approval_keywords | withdraw funds, delete all, send email, email outreach, cold email, contact restaurant |

---

## 16. Known Issues & Critical Lessons

### Deployment
- **ALWAYS `git stash` before `git pull` on VM.** This has bitten us 3+ times.
- **After every deploy, verify on production.** curl the changed endpoint or load the UI.
- **Express middleware `req.path` is relative to mount point.** Auth middleware on `/api` sees `/health`, not `/api/health`.
- **Build locally, push dist to git, then pull on VM.** The VM runs the app, doesn't build it.

### Agents
- **Agents spiral without guardrails.** They invented a fake healthcare business and burned $72.
- **Agents log fake revenue.** Revenue tool now requires real transaction IDs.
- **Agents send fake emails.** Blocked fake domains in send_email tool.
- **OpenRouter actual spend != Hive internal tracker.** Trust OpenRouter dashboard.
- **Monthly spend limit is the real blocker.** If hit, all tasks fail with 429.

### Code
- **Text-only problem was model routing.** Perplexity and DeepSeek didn't support function calling. Switched to claude-haiku-4-5.
- **Express SPA catch-all eats API routes.** `app.get('/{*splat}')` must come AFTER all API routes.
- **SQLite FK constraint ordering matters.** Parent row must INSERT before child rows.
- **Node v24 auto-loads .env files.** No need for `--env-file=.env` flag.
- **Stuck tasks root cause:** `activeRuns` is in-memory Map — PM2 restarts clear it but DB still shows `in_progress`. Fixed with startup cleanup + auto-unstick heartbeat.

---

## 17. Build Queue (What's Next)

In priority order:
1. **SSE Live Trace Stream** — Upgrade TraceView from 3s polling to real-time EventSource
2. **Agent Network Graph** — Visualize agent collaboration with react-force-graph-2d
3. **Stacked Cost Timeline** — Recharts stacked area chart for spend-by-agent over time
4. **Scout Intelligence Feed** — Surface Scout findings as actionable cards
5. **Natural Language Command Bar** — Type commands like "scout research X" with Cmd+K
6. **Skill Registry V2** — SKILL.md-based packages with ClawHub sync

---

## 18. Environment Variables (.env on Lightsail)

| Variable | Purpose |
|----------|---------|
| ANTHROPIC_API_KEY | Anthropic API (legacy) |
| OPENROUTER_API_KEY | LLM routing (primary) |
| HIVE_API_KEY | Dashboard auth |
| GMAIL_USER | Email notifications |
| GMAIL_APP_PASSWORD | Email notifications |
| HIVE_URL | Self-reference URL |
| ALLOWED_ORIGINS | CORS origins |
| API_PORT | 3002 |
| ALPACA_API_KEY | Paper trading |
| ALPACA_API_SECRET | Paper trading |
| ALPACA_BASE_URL | Paper trading endpoint |
| STRIPE_SECRET_KEY | Payments |
| HUNTER_API_KEY | Email finder |
| GUMROAD_ACCESS_TOKEN | Digital sales |
| DEVTO_API_KEY | Blog publishing |
| NETLIFY_ACCESS_TOKEN | Deploy pages |
| VAPID keys | Auto-generated on boot |

---

## 19. Quick Reference

### URLs
- **Hive Dashboard:** http://16.145.215.162:3002
- **Hive Health:** http://16.145.215.162:3002/api/health
- **Hive Landing:** http://16.145.215.162:3002/landing
- **Ember Frontend:** https://sous-frontend.vercel.app
- **Ember Backend:** https://sous-backend-production.up.railway.app
- **Ember Landing:** https://ember-landing-phi.vercel.app
- **GitHub (Hive):** https://github.com/Jmerc151/hive
- **GitHub (Ember FE):** https://github.com/Jmerc151/sous-frontend
- **GitHub (Ember BE):** https://github.com/Jmerc151/sous-backend

### Coding Standards
- ES modules everywhere (import/export, no require)
- Tailwind 4 for all styling
- Mobile-first (375px minimum)
- SQLite: `db.prepare().run/get/all()` pattern
- Error handling: try/catch on all async operations
- No unnecessary dependencies (recharts and react-force-graph-2d approved)

### Git Workflow
```bash
git add -A && git commit -m "feat: [name] — [description]" && git push origin main
```
