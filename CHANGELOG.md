# Hive Changelog

## 2026-03-16 — Dashboard UX Overhaul (Modal-to-Panel Refactor)

- **Single activeView state** — replaced 25+ independent `show*` modal flags with one `activeView` string
- **Panel-based layout** — sidebar nav now switches the main content area instead of stacking modal overlays
- **Inline prop on 25 components** — all view components support both modal and inline rendering modes
- **View switcher** — `renderActiveView()` replaces hardcoded DeliverablesFeed + modal render blocks
- **True overlay modals** — CreateTask, TaskDetail, PromptReview, ABTest, Scorecard, Shortcuts stay as overlays
- **Sidebar active state sync** — `activeView` prop drives highlighting, removed internal `activeNav` state
- **Network graph nav** — added graph/Network item to Insights section in sidebar
- **Simplified Escape handler** — closes overlay modals first, then falls back to deliverables view

## 2026-03-16 — TraceView Polish

- **Event type filter chips** — filter by LLM, Tool, Consult, Decision, Error with count badges
- **Color-coded timeline** — green=LLM, blue=consult, orange=tool, red=error, purple=decision
- **Fullscreen toggle** — expand trace view to full viewport
- **Jump to latest** — auto-pin to bottom during live stream, floating button when scrolled up
- **Scroll detection** — unpins auto-scroll when user scrolls up to inspect earlier steps

## 2026-03-16 — Reliability Hardening

### Process Safety
- **Graceful shutdown** (SIGTERM/SIGINT) — clears heartbeats, aborts active runs, resets tasks to todo, closes DB
- **Process error handlers** — uncaughtException and unhandledRejection logged via structured logger
- **Request timeout middleware** — 30s for normal requests, 5min for task execution/sandbox/backtest

### Observability
- **Enhanced `/api/health`** — DB status, circuit breakers, queue depth, stuck tasks, recent failures, spend, memory
- **Startup self-test** — verifies DB, OpenRouter, agents, memory dir; emails alert on failure
- **Standardized logging** — key paths converted to structured JSON (heartbeats, auto-unstick, retries)

### Error Recovery
- **Dead letter queue** — permanently failed tasks tracked in `dead_letters` table with email alerts
- **Dead letter API** — `GET/POST/DELETE /api/dead-letters` for retry or dismiss

## 2026-03-16 — Frontend Polish Pass

### New Components
- **MCP Servers panel** (`MCPServers.jsx`) — manage MCP server connections, add/test/delete servers, view discovered tools per server
- **Guardrail Monitor panel** (`GuardrailMonitor.jsx`) — view blocked/warned guardrail events, filter by action type, summary stats (blocked/warned today, most-blocked tool)
- **OTLP Export button** — added to TaskDetail footer, downloads trace JSON for completed tasks

### Navigation Updates
- Added MCP Servers (◆) to Developer nav group in Sidebar
- Added Guardrails (▨) to Insights nav group in Sidebar
- Wired both panels into App.jsx with state management and Escape key handling

### CLAUDE.md Updates
- Updated "What to Build Next" — all 10 industry-grade features marked complete
- New focus areas: MCP integration testing, eval harness expansion, AgentForge MVP, Ember revenue

## 2026-03-16 — Master Plan: 3-Pillar Agent Refocus + Quality Sprint

### Agent System Prompt Overhaul (all 6 agents)
- Complete rewrite of all agent system prompts in agents.json
- Scout: 4 missions (Ember intelligence, AgentForge market research, AI opportunities, trading strategies)
- Forge: 2 missions (Ember 70% via GitHub PRs, AgentForge 30%)
- Quill: 2 missions (Ember content 60%, AgentForge content 40%) — publishes to Dev.to/Twitter/Beehiiv
- Dealer: 2 missions (AgentForge beta customers primary, content promotion secondary)
- Oracle: Paper trading RSI Mean Reversion, 60-day minimum, 7-stock universe
- Nexus: Quality review scoring, opportunity evaluation, weekly sprint planning

### 11 Skills Seeded with Full Content
- 6 Ember skills: design-system, mobile-first, onboarding-flow, performance, marketing-site, qa-checklist
- 3 Ember dev skills: frontend-patterns, backend-patterns, github-dev-workflow
- agentforge-context: multi-tenant architecture, pricing tiers, build phases
- ai-services-playbook: future revenue stream activation rules

### 5 Automated Pipelines + Heartbeats
- Ember Dev Daily (9am weekdays): Scout → Forge → Nexus
- Trading Session (9:31am weekdays): Oracle analyzes and trades
- AgentForge Build (10am Mon/Wed/Fri): Scout → Forge → Quill
- Opportunity Scan (weekly): Scout → Nexus → Forge
- Weekly Sprint (Sundays): Nexus reviews → creates next week's tasks
- scheduleWeekdayHeartbeat() helper for Mon-Fri only scheduling

### Auto-Chain Rewrite
- Terminal agents (oracle, dealer, nexus) never chain
- Max 1 level deep, max 5 auto-tasks/day
- Explicit allowed chains with deduplication (no similar tasks in 24h)
- Max 3 pending tasks per target agent

### Tool Failure Handling
- "TOOL FAILED" message injected back to agent on failures
- Consecutive failure tracking: auto-pause + email notification on 3+ failures
- Failed steps don't count against step limit

### Daily Digest Email
- HTML email sent at 8am with Ember update, AgentForge status, trading data, top opportunity, daily schedule
- Only sends on weekdays

### Spend Limits Updated
- Global: $8/day, $100/month
- Per-agent caps: scout=$1.50, forge=$2.00, quill=$1.00, dealer=$0.75, oracle=$0.75, nexus=$1.00
- checkSpendLimit() supports both old and new setting key formats

### AI Services Auto-Activation
- Checks Ember MRR >= $147 AND AgentForge Phase 2 complete
- When triggered: enables AI services pipeline + creates Forge build task

### Database Cleanup
- Auto-deletes "Build tool based on" backlog tasks
- Auto-deletes old auto-spawned tasks older than 7 days

### CLAUDE.md Updated
- Replaced BUILD QUEUE with Current Focus (March 2026) section
- Documents 3 pillars, agent missions, pipelines, skills, spend limits, guardrails
- Updated deployment instructions (always git stash first)

---

## 2026-03-14 — GitHub Tools + Autonomous Ember Development

### Feature: GitHub API Tools (8 new tools)
- `github_list_files` — explore repo directory structure (scout, forge, quill, nexus)
- `github_read_file` — read file contents from any repo (scout, forge, quill, nexus)
- `github_write_file` — create/update files with commit messages (forge only)
- `github_create_branch` — create feature branches (forge, nexus)
- `github_create_pr` — create pull requests with descriptions (forge, nexus)
- `github_get_issues` — list/read issues from repos (scout, forge, nexus)
- `github_create_issue` — create issues for tracking work (scout, forge, nexus)
- `github_search_code` — search code across repos (scout, forge, nexus)
- Guardrails: only writes to GITHUB_OWNER repos, blocks sensitive files (.env, .key, .pem)

### Feature: Ember GitHub Dev Workflow Skill
- New skill teaching agents the autonomous development process: explore → branch → code → PR
- Documents all 3 Ember repos (sous-frontend, sous-backend, ember-landing)
- Includes code pattern guides and priority work queue

### Feature: Ember Auto-Development Heartbeat
- Every 6 hours, automatically queues Ember development work
- Rotates between: frontend audit, backend audit, fix next issue, sprint planning
- Respects budget (only runs under 80% daily spend limit)
- Agents use GitHub tools to create issues, branches, code changes, and PRs autonomously

### Updated: Ember Development Pipeline
- Step 3 (Forge) now uses GitHub tools: reads existing code, creates branch, writes files, opens PR

---

## 2026-03-14 — Ember Build-Focused Skills & Development Pipeline

### Feature: Ember Build Skills (replaced marketing skills)
- **Ember Product Roadmap** skill — full prioritized roadmap (P0-P3) covering commercial blockers, competitive features, Toast marketplace prep, and market differentiators (assigned to Nexus, Scout)
- **Ember Backend Development** skill — sous-backend codebase patterns, controller structure, PostgreSQL conventions, auth modes, known issues to fix (assigned to Forge)
- **Ember Frontend Development** skill — sous-frontend patterns, Kitchen Bible token system vs Admin CSS, component patterns, two-UI architecture, key issues (assigned to Forge, Quill)
- **Ember Competitor Intelligence** skill — pricing/feature matrix for FreshCheq, meez, 7shifts, Jolt, MarketMan, Toast, R365; positioning strategy, table stakes features, differentiators, Toast marketplace strategy, ongoing research priorities (assigned to Scout)
- Old marketing-focused skills (ember-marketing, ember-lead-research, ember-content) are auto-cleaned on seed

### Feature: Ember Development Pipeline (replaced sales pipeline)
- 3-step build pipeline: Scout researches competitor feature/pain point → Nexus creates technical spec → Forge implements following codebase patterns
- Old Ember Sales Pipeline auto-cleaned on seed

### Feature: Intel Auto-Extraction from Scout Tasks
- `extractIntelItems()` function extracts structured opportunities from Scout research output after QA review
- Uses Claude to parse output into `{title, summary, source_url, confidence, tags}` intel items
- Auto-inserts into `intel_items` table with task reference
- Logged to task_logs for traceability

## 2026-03-14 — Agent Sandbox, A2A Protocol, Multi-User Auth

### Feature: Agent Sandbox Mode
- Side-by-side prompt comparison: run same task with current vs modified system prompt in parallel
- Auto-scoring with Claude Haiku (0-100 scale across relevance, tool usage, quality, reasoning)
- Results display with diff highlighting and per-dimension score breakdown
- `POST /api/sandbox/run` endpoint with parallel execution
- AgentSandbox.jsx panel with agent selector, prompt editor, side-by-side results

### Cleanup: react-router-dom Removed
- Removed unused react-router-dom dependency (Hive uses panel-based navigation, not routes)
- Package.json and lock file cleaned up



### Feature: A2A (Agent-to-Agent) Protocol Support
- `GET /.well-known/agent.json` — Agent Card discovery endpoint (A2A spec)
- `POST /a2a/:agentId` — JSON-RPC task submission (tasks/send, tasks/get, tasks/cancel)
- `POST /api/a2a/call` — Outbound call to external A2A agents
- `GET/POST/DELETE /api/a2a/agents` — External agent registry management
- `POST /api/a2a/agents/:id/test` — Connectivity test for registered agents
- A2A tab added to Skill Registry (Skills & Agents panel) — register, test, delete external agents
- New `a2a_agents` database table

### Feature: Multi-User Role-Based Access
- Three roles: admin (full access), operator (run/create tasks), viewer (read-only)
- Session-based auth with SHA-256 password hashing (30-day sessions)
- Login screen when no API key configured
- API key continues working as admin master key (backwards compatible)
- Role guards on sensitive endpoints: task run, settings, sandbox, task delete
- User management panel (admin only): create, edit, delete users, role assignment
- Users nav item in sidebar (admin only) with current user display and sign-out
- New `users` and `sessions` database tables
- Default admin user seeded on first boot (username: admin, password: admin)
- Auth token propagated to SSE connections and trace streams

## 2026-03-14 — Production-Grade Platform Hardening (28 Features)

### Phase 1: Critical Foundation Fixes
- LLM call timeout: 5-minute AbortController on all OpenRouter calls (no more infinite hangs)
- Webhook authentication: HMAC-SHA256 validation with `X-Hub-Signature-256` header
- Task pagination: `?page=&limit=&status=&agent_id=&search=` with total count and hasMore
- N+1 query fix: `buildAllScorecards()` — 5 queries total instead of 42
- Composite indexes: 5 new indexes on hot query paths (spend_log, tasks, proposals, memory)
- React error boundary: catches component crashes, shows recovery UI, keeps nav working
- SSE event bus: `GET /api/events/stream` replaces 3s polling with real-time push (task updates, agent status, spend changes). Green/red connection indicator in header. 30s fallback poll.
- Confirmation dialogs: destructive actions (delete task, delete skill) now require confirmation

### Phase 2: Production Reliability
- API retry logic: exponential backoff (1s, 2s) for 5xx and 429 errors, immediate fail for 4xx
- Heartbeat error notifications: `notifyHeartbeatError()` logs to task_logs + sends push notification on failure
- execute_code sandbox: stripped env vars (no API keys leaked), proxy set to dead address
- Email header injection prevention: `\r\n` stripped from to/subject fields
- Configurable MAX_STEPS: read from settings (default 8), per-step 5-minute timeout

### Phase 3: Core Infrastructure
- **RAG Knowledge Base**: Upload documents (text/URL), auto-chunk into ~500-token segments with overlap, embed via OpenRouter, cosine similarity search. `search_knowledge` tool available to all agents. Auto-injects relevant context into ReAct loop. 6 API endpoints + full KnowledgeBase.jsx panel.
- Structured logging: JSON-formatted `log(level, message, meta)` replacing 14 key console.log calls
- Circuit breakers: OpenRouter (5 failures/60s), Alpaca (3 failures/120s), Yahoo (5 failures/60s) — auto-open on repeated failures, half-open test after reset period
- Automated DB backups: daily heartbeat, WAL checkpoint + file copy, 7-day retention

### Phase 4: Competitive Differentiators
- **Cost-aware model routing**: `getSmartModel()` auto-downgrades from Sonnet to Haiku when agent exceeds 80% of daily budget share. All 14 callClaude sites updated.
- **Scheduled agent jobs**: User-configurable cron (`0 9 * * 1-5` = weekdays 9am). Full cron parser with wildcards/ranges/steps. ScheduledJobs.jsx panel with preset chips.
- **Cognitive memory dashboard**: MemoryDashboard.jsx — browse/search/delete agent memories with per-agent tabs, semantic search, tag display, source task links.
- **Pipeline replay**: Replay completed pipelines from any step with modified inputs. ReplayModal in PipelineBuilder.
- **Cross-session task chains**: `checkAutoChain()` auto-creates follow-up tasks (research→write, write→promote, build→document, analyze→build). Respects per-agent queue limits.

### Phase 5: Polish
- Loading skeletons: `SkeletonCard`, `SkeletonList`, `SkeletonChart` replacing "Loading..." text
- Keyboard shortcuts: `N` new task, `Esc` close panels, `?` shortcuts help overlay
- Responsive tables: horizontal scroll wrappers on TradingDashboard tables
- PWA manifest: installable on mobile with bee icon, Hive theme colors
- Accessibility: ARIA labels on 7 icon-only buttons, `role="search"` on command bar

## 2026-03-14 — Agent Effectiveness Upgrade

### Agent Prompt Overhaul (all 6 agents)
- Memory protocol: all agents now `recall_memory` before work and `store_memory` after
- Structured output guidance: agents produce JSON arrays for downstream parsing
- Scout: added recall_memory, recall_hive_memory, store_memory, list_strategies references
- Forge: removed incorrect send_email reference, added web_search, read_file, execute_code, list_workspace, delete_file
- Quill: added read_file, recall_memory, store_memory, list_workspace
- Dealer: added recall_memory, store_memory with outreach tracking
- Oracle: added recall_memory, store_memory with trade decision logging
- Nexus: added web_search, recall_hive_memory, softened follow-up task creation

### 4 New Tools
- `http_request` (all agents) — external API calls with internal IP blocking, 30s timeout, 10KB response limit
- `list_workspace` (forge/quill/nexus) — directory listing restricted to workspace/
- `execute_code` (forge only) — Node.js execution with 10s timeout, temp file cleanup
- `delete_file` (forge/nexus) — workspace-restricted file deletion with path traversal protection

### Heartbeat Feedback Loops
- `parseHeartbeatOutput()` — routes structured JSON from heartbeat outputs to correct tables
- Bot opportunity scan → auto-inserts into `bot_suggestions` table
- Feature discovery → auto-creates proposals (type=feature)
- UX design review → auto-creates proposals (type=design)
- Self-assessment → auto-creates proposals (type=prompt)
- Skill discovery → auto-creates skills with generated slugs
- Removed `auto-standup` heartbeat (wasteful token burn)
- Memory compaction now uses `claude-haiku-4-5` (cheaper, avoids circular reasoning)

### Visual Pipeline Builder
- Full rewrite of PipelineBuilder.jsx with @xyflow/react
- Custom node types: AgentNode (avatar, role, prompt), StartNode, EndNode
- Drag-and-drop from agent palette sidebar
- PromptEditor modal for double-click editing
- Bidirectional conversion: react-flow JSON ↔ pipeline steps format
- Mobile fallback: list-based editor below 768px
- Dark theme with Hive design system colors

## 2026-03-14 — Industry-Grade Platform Upgrade (10 Features)

### 1. Native Function Calling (Hybrid Mode)
- OpenRouter native `tool_calls` for Claude and GPT-4o models
- `buildToolsSchema()` generates OpenAI-format tool definitions from TOOL_REGISTRY
- Text-based `[TOOL:name]` fallback for DeepSeek R1 and Perplexity Sonar
- Hybrid merging: native + text tool calls deduplicated per step

### 2. Task Checkpointing + Pause/Resume
- `task_checkpoints` table stores messages, tool counts, output per step
- Failed tasks resume from last checkpoint via `POST /api/tasks/:id/resume`
- Checkpoints auto-deleted on task completion
- TaskDetail shows "Resume from Checkpoint" button for failed tasks

### 3. Mid-Run Approval (Human-in-the-Loop)
- New `paused` task status with orange UI badge
- `request_approval` tool — any agent can pause for human review
- `POST /api/tasks/:id/approve-continue` and `reject-continue` endpoints
- Push + email notifications on approval requests
- TaskDetail shows Approve/Reject buttons for paused tasks

### 4. Guardrails Middleware
- `validateToolCall()` pre-execution validation on all tool calls
- PII detection: blocks emails containing SSN/credit card patterns
- Trade safety: enforces max position size and daily trade limits
- Path traversal: blocks write_file outside /workspace/ and /tmp/
- Queue overflow: blocks create_task when >20 pending tasks
- `guardrail_events` table logs all blocked/warned actions

### 5. Evaluation Harness
- `EvalHarness.jsx` — test case management UI with pass/fail badges
- `eval_cases` + `eval_runs` tables for structured testing
- 6 seeded test cases (one per agent) with expected tools/keywords
- Scoring: 70% tool match + 30% keyword match
- `POST /api/eval/run/:caseId`, `POST /api/eval/run-all`, `GET /api/eval/history`
- Added to Sidebar as nav item with 🧪 icon

### 6. MCP Client Bridge
- `mcp_servers` table for Model Context Protocol server registry
- CRUD endpoints: `GET/POST/DELETE /api/mcp/servers`
- `POST /api/mcp/servers/:id/test` — test connection and list tools
- `GET /api/mcp/tools` — aggregate tools across all connected servers

### 7. Semantic Memory (Vector Embeddings)
- `memory_embeddings` table with per-agent vector storage
- `embedText()` via OpenRouter's text-embedding-3-small model
- `cosineSimilarity()` JS implementation for retrieval (top-K, threshold 0.3)
- New tools: `store_memory`, `recall_memory`, `recall_hive_memory` (cross-agent)
- Auto-embeds task summaries on completion
- `GET /api/memory/search`, `GET /api/memory/entries` endpoints

### 8. OpenTelemetry Trace Export
- `trace_id`, `span_id`, `parent_span_id` columns on task_traces
- `GET /api/traces/:taskId/otlp` — returns OTLP-compatible JSON
- Compatible with Langfuse, Arize Phoenix, and any OTLP collector
- ResourceSpans format with service name, span attributes, status codes

### 9. Agent Protocol API
- Standard REST API at `/ap/v1/agent/tasks` following Agent Protocol spec
- `GET/POST` tasks, `GET` steps (maps to task_traces), `POST` execute step
- `GET /ap/v1/agent/tasks/:id/artifacts` — task outputs and files
- Same Bearer token auth as main API

### 10. Skill Import/Export
- `GET /api/skills/:slug/export` — returns SKILL.md with YAML frontmatter
- `POST /api/skills/import` — parse and create skill from pasted SKILL.md
- `POST /api/skills/import-url` — fetch SKILL.md from URL and import
- Import/Export buttons added to SkillRegistryV2 UI

### Infrastructure
- 6 new database tables, 3 new columns on task_traces
- 20+ new API methods in api.js
- `paused` status added to tasks CHECK constraint
- 11 new performance indexes on hot query paths
- ~500 lines added to server/index.js

## 2026-03-12 — Agent Tool Execution System

### Real Tools for Agents
- **TOOL_REGISTRY** — 22 real tools wired into the ReAct loop: market data, trading, backtesting, analysis, strategy management, task creation, memory access
- **Text-pattern tool calling** — `[TOOL:name]{args}[/TOOL]` syntax works with all models (DeepSeek R1, Perplexity Sonar, Claude)
- **ReAct loop upgraded** — MAX_STEPS 3→8, tool parsing + parallel execution, 30s timeout per tool, 5 tools/step limit, 10KB result truncation
- **Agent authorization** — each tool has an allowed agents list (Oracle gets trading tools, Scout gets research + save_strategy, Nexus gets task/memory management)
- **Tool trace logging** — all tool calls logged to task_traces with SSE streaming for real-time visibility
- **Updated agent prompts** — Oracle, Scout, Nexus system prompts now reference real tool syntax instead of fake capability claims

### Tools Available
- Market data: get_quote, get_history, get_indicators, search_symbols
- Trading: place_order, get_positions, get_account, close_position, close_all_positions, is_market_open, get_orders
- Analysis: analyze_symbol, compute_trade_constraints, evaluate_ensemble
- Backtesting: run_backtest, run_walkforward
- Strategy: list_strategies, save_strategy
- Management: create_task, list_tasks, read_memory

## 2026-03-11 — BUILD 2-6: Full Feature Suite

### BUILD 2: Agent Network Graph
- `AgentGraph.jsx` — Force-directed graph visualization of agent interactions using react-force-graph-2d
- Custom canvas-rendered nodes with agent colors, avatars, and name labels
- Directional edges with thickness scaling by interaction frequency, animated particles
- Time range filter (1h, 24h, 7d), auto-refresh every 10s
- Mobile fallback: simple list view below 500px
- `agent_interactions` table tracks consult/delegate/tool_call events
- `GET /api/graph/nodes` + `GET /api/graph/edges?range=` endpoints

### BUILD 3: Stacked Cost Timeline
- `CostTimeline.jsx` — Recharts stacked area chart showing cost by agent over time
- Date range selector (24h, 7d, 30d), custom dark-themed tooltip
- Agent summary cards row (cost, tokens, tasks per agent), horizontally scrollable
- Cost-per-task table with desktop table / mobile list views
- `GET /api/analytics/spend`, `GET /api/analytics/spend/by-task`, `GET /api/analytics/agents/summary` endpoints

### BUILD 4: Scout Intelligence Feed
- `IntelFeed.jsx` — Right-side slide-in panel showing Scout-discovered opportunities
- Card list with title, summary, tags, confidence badges (green/yellow/red)
- Expand cards for full details + action buttons: Send to Forge, Bookmark, Dismiss
- Status filter tabs (All, New, Bookmarked)
- `intel_items` table, `GET /api/intel` + `PATCH /api/intel/:id/status` endpoints
- Auto-creates Forge task when intel sent to forge

### BUILD 5: Natural Language Command Bar
- `CommandBar.jsx` — ⌘K-activated command input for creating tasks via natural language
- Agent name autocomplete, command history (up/down arrows), tab completion
- Desktop: inline bar in header. Mobile: floating button → bottom sheet
- Color-coded toasts for success/info/error feedback
- `POST /api/commands/parse` endpoint using Claude haiku for fast NL parsing

### BUILD 6: Skill Registry V2
- `SkillRegistryV2.jsx` — SKILL.md-based instruction packages that inject into agent prompts
- Skill list with search, card grid (1/2/3 col responsive), create/edit/delete
- SKILL.md editor with YAML frontmatter, template dropdown (research/builder/analyzer)
- Per-agent skill assignment with toggle and priority
- `skills` + `agent_skills_v2` tables, full CRUD endpoints
- Skill content appended to agent system prompts at runtime

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
