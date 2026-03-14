# Hive — Autonomous AI Income Agent Team

> Personal AI agent team that generates income across digital products, content/affiliate, freelance services, and market trading. Agents self-improve, learn from memory, and compound in quality over time.

## Architecture

```
┌────────────────────────────┐     ┌──────────────────────────────┐
│   Netlify (Frontend)       │     │   AWS Lightsail VM (Backend)  │
│   React 19 + Vite + TW4   │────▶│   Express 5 + SQLite + LLM   │
│   33 React components      │proxy│   PM2: hive, port 3002        │
└────────────────────────────┘     └──────────────────────────────┘
                                           │
                                   ┌───────┴───────┐
                                   ▼               ▼
                            ┌────────────┐  ┌────────────┐
                            │ OpenRouter  │  │  Alpaca    │
                            │ Multi-model │  │  Paper     │
                            │ API         │  │  Trading   │
                            └────────────┘  └────────────┘
```

## Agent Team

| ID | Name | Avatar | Role | Model | Color |
|----|------|--------|------|-------|-------|
| scout | Scout | 🔭 | Market Research & Opportunity Finder | perplexity/sonar-pro | #06b6d4 |
| forge | Forge | ⚒️ | Product Builder & Developer | deepseek/deepseek-r1 | #3b82f6 |
| quill | Quill | ✍️ | Content Creator & Growth Engine | anthropic/claude-haiku-4-5 | #8b5cf6 |
| dealer | Dealer | 🤝 | Sales, Freelance & Client Acquisition | anthropic/claude-haiku-4-5 | #3BB273 |
| oracle | Oracle | 🔮 | Market Analyst & Trading Strategist | anthropic/claude-sonnet-4-5 | #E8C547 |
| nexus | Nexus | 🧬 | Meta-Agent — Team Optimizer & Self-Improver | anthropic/claude-sonnet-4-5 | #ec4899 |

## Autonomous Pipeline

```
Task created → assigned to agent → auto-queued
  │
  ▼
┌─────────────────────────────────────────────────────┐
│ ReAct Loop (8 steps max, 5 tools/step)              │
│ + Native function calling (Claude/GPT) or text mode │
│ + Inter-agent consultation via [CONSULT:agent_id]   │
│ + Guardrails validation before each tool call       │
│ + Checkpoint save after each step                   │
│ + Spend tracking per API call                       │
└───────────────┬─────────────────────────────────────┘
    ┌───────────┼────────────┐
    │ SUCCESS   │ PAUSED     │ FAILURE
    ▼           ▼            ▼
  Memory      Waiting for   Resume from
  update      human         checkpoint
  QA review   approval      or retry (2x)
  Auto-embed  (approve/
  Follow-ups  reject)
```

## Tool System

22 real tools in TOOL_REGISTRY, executed via ReAct loop:

| Category | Tools |
|----------|-------|
| Market Data | get_quote, get_history, get_indicators, search_symbols |
| Trading | place_order, get_positions, get_account, close_position, close_all_positions, is_market_open, get_orders |
| Analysis | analyze_symbol, compute_trade_constraints, evaluate_ensemble |
| Backtesting | run_backtest, run_walkforward |
| Strategy | list_strategies, save_strategy |
| Management | create_task, list_tasks, read_memory |
| Workflow | request_approval |
| Memory | store_memory, recall_memory, recall_hive_memory |

Native function calling for Claude/GPT models. Text-based `[TOOL:name]` fallback for DeepSeek/Perplexity.

## Spend Controls

All LLM calls go through `callClaude()` wrapper that:
1. Checks spend limits (daily, monthly, per-agent)
2. Tracks token usage + cost per model
3. Logs to `spend_log` table
4. Updates task token usage

Limits hit → tasks pause (stay `todo`), don't fail.

## Heartbeat Schedule

| Job | Interval | Purpose |
|-----|----------|---------|
| queue-monitor | 5 min | Check for idle agents with pending tasks |
| auto-standup | 24 hrs | Team standup conversation |
| memory-compaction | 7 days | Compact agent memories >10KB |
| nexus-retrospective | 7 days | Generate weekly performance review task |
| weekly-bot-scan | 7 days | Scout researches bot opportunities |
| + 9 more | various | Self-improvement, UX review, feature discovery |

14 total heartbeats registered.

## Database (SQLite — WAL mode, FK ON)

| Table | Purpose |
|-------|---------|
| tasks | All tasks with status, output, tokens, cost, evidence |
| task_logs | Per-task execution logs |
| task_traces | Per-step trace data (LLM calls, tools, consultations) with OTLP span IDs |
| task_checkpoints | Pause/resume checkpoints per step |
| messages | Team chat messages |
| settings | Key-value config (spend limits, trading, notifications) |
| spend_log | Per-API-call cost tracking |
| bot_suggestions | Scout-generated bot ideas |
| revenue_entries | Income tracking + agent attribution |
| pipelines | Multi-step agent workflow definitions |
| event_triggers | Webhook-based auto-task triggers |
| agent_skills | Legacy per-agent skill assignments |
| skills | SKILL.md-based instruction packages (v2) |
| agent_skills_v2 | Agent-to-skill assignments with priority |
| proposals | Agent-generated feature/improvement proposals |
| intel_items | Scout-discovered opportunities |
| agent_interactions | Consult/delegate/tool_call event log |
| market_data_cache | Cached market data with TTL |
| trades | Trade records with Alpaca order IDs |
| watchlist | Symbol watchlist |
| portfolio_snapshots | Periodic portfolio state captures |
| strategies | Trading strategy definitions |
| strategy_backtests | Backtest results with equity curves |
| strategy_performance | Daily strategy P&L tracking |
| strategy_meta | Learning loop indicator combo stats |
| bot_deployments | Active trading bot deployments |
| eval_cases | Evaluation test case definitions |
| eval_runs | Eval execution results with scoring |
| guardrail_events | Blocked/warned tool call audit log |
| mcp_servers | MCP server connection registry |
| memory_embeddings | Semantic memory vectors per agent |

31 tables total, 11 performance indexes.

## API Surface

~145 endpoints across:
- `/api/agents`, `/api/tasks`, `/api/chat` — core CRUD + execution
- `/api/spend`, `/api/settings`, `/api/analytics` — spend controls + analytics
- `/api/graph`, `/api/intel`, `/api/commands` — graph, intel feed, NL commands
- `/api/skills`, `/api/eval`, `/api/mcp` — skills, eval harness, MCP
- `/api/memory`, `/api/traces/:id/otlp` — semantic memory, OTLP export
- `/api/revenue`, `/api/pipelines`, `/api/triggers` — revenue, pipelines, webhooks
- `/api/trading`, `/api/strategies`, `/api/backtests` — trading system
- `/ap/v1/agent/tasks` — Agent Protocol standard API

Auth: Bearer token on all `/api/*` and `/ap/*` routes.

## Frontend Components (33)

AgentCards, AgentGraph, AgentScorecard, ABTestPanel, BotGenerator, ChatPanel, CommandBar, CostTimeline, CreateTaskModal, DeliverablesPanel, EvalHarness, EventTriggers, HistoryPanel, IntelFeed, LiveTraceStream, MobileNav, PipelineBuilder, ProjectsPanel, PromptReviewModal, ProposalsPanel, RevenuePanel, SearchBar, Sidebar, SkillRegistry, SkillRegistryV2, SpendDashboard, TaskBoard, TaskDetail, Toast, TraceView, TradingDashboard

## Services

| File | Purpose |
|------|---------|
| server/services/marketData.js | Yahoo Finance data fetching + caching |
| server/services/broker.js | Alpaca paper trading API wrapper |
| server/services/backtest.js | Strategy backtesting engine |
| server/services/analysis.js | Multi-lens technical analysis |
| server/services/email.js | Nodemailer/Gmail notifications |

## File Structure

```
~/hive/
├── agents/agents.json       ← 6 agent definitions + system prompts
├── server/
│   ├── index.js             ← Express API + ReAct loop + tools (~5400 lines)
│   ├── db.js                ← SQLite schema + migrations + settings (~490 lines)
│   └── services/            ← 5 service modules
├── src/
│   ├── App.jsx              ← Dashboard layout + state management
│   ├── components/          ← 33 React components
│   └── lib/api.js           ← API client (~220 lines, ~145 methods)
├── memory/                  ← One .md file per agent
├── CHANGELOG.md
├── SYSTEM.md                ← This file
├── package.json
├── vite.config.js
└── netlify.toml
```

## Deployment

- **Backend:** AWS Lightsail VM (Ubuntu 24.04, 1GB RAM), port 3002, PM2 process `hive`
- **Frontend:** Netlify with `/api/*` proxy to VM IP
- **GitHub:** Jmerc151/hive, auto-deploy on push (Netlify)
- **VM deploy:** `cd ~/hive && git pull && pm2 restart hive --update-env`
- **Build:** Done locally (VM too small), push dist to git
- **Env vars:** OPENROUTER_API_KEY, HIVE_API_KEY, GMAIL_USER, GMAIL_APP_PASSWORD, ALPACA_API_KEY, ALPACA_API_SECRET, VAPID keys (auto-generated)
