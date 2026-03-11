# Hive Changelog

## 2026-03-11 — 10-Feature Mega Build (Session 3b)

### 1. Agent Scorecards
- `AgentScorecard.jsx` — Per-agent performance dashboard with success rate, avg duration, avg cost, QA pass rate, 7-day trend, task breakdown
- `GET /api/scorecards` + `GET /api/agents/:id/scorecard` — Aggregates tasks, logs, spend into scorecard data
- Accessible via sidebar icons (click agent's chart icon)

### 2. Approval Gates
- Tasks can require approval before running (per-task flag, cost threshold, keyword triggers)
- New `awaiting_approval` status column in TaskBoard with amber styling
- `POST /api/tasks/:id/approve` + `POST /api/tasks/:id/reject` endpoints
- Approve/Reject buttons in TaskBoard cards and TaskDetail footer
- Push notification when a task needs approval
- Configurable settings: `approval_threshold_usd`, `approval_keywords`

### 3. Per-Task Token Budget Caps
- `token_budget` field in CreateTaskModal (number input, defaults from settings)
- Token budget progress bar in TaskDetail (green/red based on usage)
- ReAct loop checks budget before each LLM call, stops gracefully when exceeded

### 4. Trace View
- `TraceView.jsx` — Vertical timeline of task execution steps
- Each trace node: step number, type icon, agent, tokens, cost, duration
- Expandable input/output summaries per step
- Summary bar: total steps, tokens, cost, duration
- New "Trace" tab in TaskDetail alongside details/logs/output
- `task_traces` table logs every LLM call, consultation, and tool use

### 5. Chained Pipelines
- `PipelineBuilder.jsx` — Visual pipeline editor with list/edit views
- Create multi-step workflows chaining agents (e.g. Scout → Quill → Dealer)
- `{{previous_output}}` template variable injects prior step's output
- Pipeline CRUD + `POST /api/pipelines/:id/run` endpoint
- Post-completion hook: when a pipeline task finishes, auto-creates next step
- Pipeline step indicator in TaskDetail

### 6. Revenue Attribution
- `RevenuePanel.jsx` — Income tracking modal with ROI calculations
- Summary cards: total revenue, total spend, net ROI
- Per-agent ROI breakdown table
- Revenue by source breakdown
- Revenue CRUD + `GET /api/revenue/summary` endpoint
- Header button: "Revenue" with dollar sign icon

### 7. Event-Based Triggers
- `EventTriggers.jsx` — Webhook trigger management UI
- Create triggers that auto-create tasks or run pipelines on webhook
- `POST /api/webhooks/:triggerId` — Public webhook receiver with secret validation
- Webhook URL displayed with copy-friendly format
- Enable/disable toggles, last-fired timestamps

### 8. A/B Prompt Testing
- `ABTestPanel.jsx` — Side-by-side prompt comparison
- Run two prompt variants in parallel, compare outputs and token efficiency
- `POST /api/tasks/:id/ab-test` endpoint
- Accessible via "A/B Test" button in TaskDetail footer for runnable tasks

### 9. Agent Skill Registry
- `SkillRegistry.jsx` — Per-agent skill management with toggle switches
- 6 skill types: web_search, code_exec, file_io, api_call, data_analysis, custom
- Skills CRUD endpoints, skills injected into agent system prompt during task execution
- Accessible via sidebar skill icon per agent

### 10. Infrastructure
- 5 new database tables: `task_traces`, `revenue_entries`, `pipelines`, `event_triggers`, `agent_skills`
- 4 new columns on tasks: `token_budget`, `requires_approval`, `pipeline_id`, `pipeline_step`
- ~20 new API methods in `api.js`
- ~20 new server endpoints in `server/index.js`
- Updated: App.jsx, TaskBoard.jsx, TaskDetail.jsx, CreateTaskModal.jsx, Sidebar.jsx, index.css

---

## 2026-03-11 — Prompt Optimizer (Session 3)

### Prompt Optimizer Feature
- **PromptReviewModal.jsx** — New modal intercepts "Run Agent" flow, shows original vs optimized prompt side-by-side
  - Nexus (meta-agent) rewrites task descriptions for clarity, structure, and AI-readability before credits are spent
  - Editable optimized prompt with Reset button
  - Three options: "Run Optimized", "Run Edited Prompt", or "Skip — Run Original"
  - Graceful error handling: if optimization fails (e.g. no API key), shows original prompt with "Skip — Run Original"
- **`POST /api/tasks/:id/optimize`** — Server endpoint calls Claude (max_tokens: 1024, charged to Nexus) to restructure prompts
  - Adds ## sections (Requirements, Deliverables, Constraints) where helpful
  - Preserves user intent, improves expression
- **App.jsx flow change** — `handleRunTask` now opens PromptReviewModal instead of running directly; `handleDirectRun` added for post-review execution
- **All run paths covered** — TaskBoard card "Run" buttons, TaskDetail "Run Agent" button, all go through review modal
- Added `optimizePrompt()` API method to `api.js`

## 2026-03-10 — Bot Generator (Session 2)

### Bot Generator Feature
- **BotGenerator.jsx** — New modal with form: bot name, type selector grid (7 types), description, advanced options (audience, monetization), Forge preview card
- **Scout Suggestions** — "Ask Scout to suggest bot ideas" button fetches AI-generated bot opportunities
  - `bot_suggestions` table in SQLite stores Scout's researched ideas
  - `POST /api/bot-suggestions/refresh` creates a Scout task to research trending bots
  - `GET /api/bot-suggestions` returns stored suggestions
  - Clicking a suggestion pre-fills the form
  - Post-task hook: when Scout completes a "Bot Opportunity" task, parses output into suggestions
- **Weekly bot scan heartbeat** — Scout auto-researches bot opportunities every 7 days
- **ZIP Download** — `GET /api/tasks/:id/download` parses Forge's markdown output, extracts code blocks, streams ZIP via `archiver`
  - `parseForgeOutput()` — two-pass regex extracts files from ## heading + code block format
  - `parseSuggestions()` — extracts JSON array from Scout output
- **Download button** in TaskDetail footer for completed Forge tasks
- **"Generate Bot" button** in dashboard header with Forge blue styling
- Added `archiver` npm dependency for ZIP generation
- Added 4 new API methods to `api.js`: `getBotSuggestions`, `refreshBotSuggestions`, `dismissSuggestion`, `downloadBot`

### Bug Fix
- Fixed PORT conflict: `API_PORT=3002` set explicitly in dev:server script, all PORT declarations now prioritize `API_PORT` over `PORT`

## 2026-03-10 — Initial Build (Session 1)

### Phase 1: Scaffold
- Created `~/hive` repo from Ember Agents fork
- Copied core pipeline: `server/index.js`, `server/db.js`, all React components, configs
- Updated `package.json` — name to `hive`, removed `@flydotio/dockerfile`
- Updated `server/db.js` — SQLite file changed to `hive.db`, added `settings` table, `spend_log` table, `tokens_used`/`estimated_cost` columns on tasks
- Updated `vite.config.js` — API proxy target changed to `localhost:3002`
- Updated `netlify.toml` — proxy target changed to `44.249.57.123:3002`
- Updated `index.html` — Hive branding, meta tags, theme color `#f59e0b`

### Phase 2: Agent Team
- Created `agents/agents.json` with 6 income-focused agents:
  - **Scout** (🔭) — Market Research & Opportunity Finder
  - **Forge** (⚒️) — Product Builder & Developer
  - **Quill** (✍️) — Content Creator & Growth Engine
  - **Dealer** (🤝) — Sales, Freelance & Client Acquisition
  - **Oracle** (🔮) — Market Analyst & Trading Strategist (ADVISORY ONLY)
  - **Nexus** (🧬) — Meta-Agent, Team Optimizer & Self-Improver
- Each agent has a 2400-3400 char system prompt covering: role, output format, consultation patterns, memory awareness, income focus, spend awareness
- Initialized empty memory files for all 6 agents

### Phase 3: Spend Controls
- Added `callClaude()` wrapper around all Anthropic API calls — tracks tokens, calculates cost, logs to `spend_log`
- Pricing: Sonnet 4 at $3/MTok input, $15/MTok output
- Added `checkSpendLimit()` — checks global pause, per-agent pause, daily limit, monthly limit, per-agent daily limit
- Spend limit hit → task pauses (stays `todo`), does NOT fail
- Added `getSetting()`, `setSetting()`, `getTodaySpend()`, `getMonthSpend()` helper functions
- Added API endpoints: `GET /api/spend`, `GET /api/settings`, `PATCH /api/settings`
- Default limits: $5/day, $100/month, 16384 tokens per task, 2 max concurrent
- Built `SpendDashboard.jsx` — today/month spend bars, per-agent breakdown, 7-day trend chart, limit controls, global pause button

### Phase 4: Nexus Self-Improvement
- QA review function updated: `sentinel` → `nexus` as the reviewer
- Nexus reviews all completed tasks (except its own, prevents loops)
- Review criteria: Quality, Actionability, Income Relevance, Accuracy, Improvement
- Added `GET /api/agents/:id/prompt` endpoint — Nexus can read any agent's system prompt
- Added weekly retrospective heartbeat (every 7 days) — auto-creates a Nexus task with week's performance data

### Phase 5: Frontend Rebranding
- Updated all 7 React components: `ember-*` CSS → `hive-*`, `fire` → `honey`, `sentinel` → `honey`
- New color theme: `#1A1A2E` background, `#16213E` surface, `#E8C547` gold accent
- Updated `App.jsx` — added Spend button in header, SpendDashboard modal
- Updated `api.js` — added `getSpend()`, `getSettings()`, `updateSettings()`, renamed storage key

### Phase 6: Server Configuration
- Server port: 3002 (shares Lightsail VM with Ember Agents on 3001)
- PM2 process name: `hive-backend`
- Heartbeat schedule:
  - Queue monitor: every 5 minutes
  - Daily standup: every 24 hours
  - Memory compaction: every 7 days (compacts memories >10KB)
  - Nexus retrospective: every 7 days (auto-generates performance review task)
- Follow-up task generation prompt updated for income focus
- Troubleshooter prompt updated for Hive context
- Standup prompt updated for income team context

### Verified Working
- Server boots on port 3002 with 6 agents, 4 heartbeat jobs
- `/api/health` returns status
- `/api/agents` returns all 6 agents with correct metadata
- `/api/spend` returns spend tracking data with limits
- Database creates all tables: tasks, task_logs, messages, settings, spend_log
- Default settings populated on first boot
