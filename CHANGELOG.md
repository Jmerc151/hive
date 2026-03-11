# Hive Changelog

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
