# Hive — Autonomous AI Income Agent Team

> Personal AI agent team that generates income across digital products, content/affiliate, freelance services, and market trading. Agents self-improve, learn from memory, and compound in quality over time.

## Architecture

```
┌────────────────────────────┐     ┌──────────────────────────────┐
│   Netlify (Frontend)       │     │   AWS Lightsail VM (Backend)  │
│   React 19 + Vite + TW4   │────▶│   Express 5 + SQLite + Claude │
│   /api/* → VM via proxy    │proxy│   PM2: hive-backend, port 3002│
└────────────────────────────┘     └──────────────────────────────┘
                                            │
                                            ▼
                                   ┌────────────────────┐
                                   │  Anthropic Claude   │
                                   │  API (Sonnet 4)     │
                                   └────────────────────┘
```

## Agent Team

| ID | Name | Avatar | Role | Color |
|----|------|--------|------|-------|
| scout | Scout | 🔭 | Market Research & Opportunity Finder | #06b6d4 |
| forge | Forge | ⚒️ | Product Builder & Developer | #3b82f6 |
| quill | Quill | ✍️ | Content Creator & Growth Engine | #8b5cf6 |
| dealer | Dealer | 🤝 | Sales, Freelance & Client Acquisition | #3BB273 |
| oracle | Oracle | 🔮 | Market Analyst & Trading Strategist (ADVISORY) | #E8C547 |
| nexus | Nexus | 🧬 | Meta-Agent — Team Optimizer & Self-Improver | #ec4899 |

## Autonomous Pipeline

```
Task created → assigned to agent → auto-queued
  │
  ▼
┌─────────────────────────────────────┐
│ ReAct Loop (3 steps max)            │
│ + Inter-agent consultation          │
│ + Spend tracking per API call       │
└─────────────┬───────────────────────┘
    ┌─────────┴─────────┐
    │ SUCCESS            │ FAILURE
    ▼                    ▼
  Memory update        Auto-troubleshoot
  Nexus QA review      Retry (max 2x)
  Follow-up tasks      Or flag manual
  Queue next
```

## Spend Controls

All Claude API calls go through `callClaude()` wrapper that:
1. Checks spend limits before calling (daily, monthly, per-agent)
2. Tracks token usage (input + output)
3. Calculates cost (Sonnet 4: $3/MTok in, $15/MTok out)
4. Logs to `spend_log` table
5. Updates `tokens_used` and `estimated_cost` on tasks

Limits hit → tasks pause (stay `todo`), don't fail. Resume on limit reset or increase.

## Heartbeat Schedule

| Job | Interval | Purpose |
|-----|----------|---------|
| queue-monitor | 5 min | Check for idle agents with pending tasks |
| auto-standup | 24 hrs | Team standup conversation |
| memory-compaction | 7 days | Compact agent memories >10KB |
| nexus-retrospective | 7 days | Generate weekly performance review task |

## Database (SQLite)

| Table | Purpose |
|-------|---------|
| tasks | All tasks with status, output, tokens, cost |
| task_logs | Per-task execution logs |
| messages | Team chat messages |
| settings | Key-value config (spend limits, pauses) |
| spend_log | Per-API-call cost tracking |

## File Structure

```
~/hive/
├── agents/agents.json     ← 6 agent definitions + system prompts
├── server/
│   ├── index.js           ← Express API + full pipeline (1050+ lines)
│   └── db.js              ← SQLite schema + settings
├── src/
│   ├── App.jsx            ← Dashboard with spend button
│   ├── components/        ← 8 React components
│   └── lib/api.js         ← API client
├── memory/                ← One .md file per agent
├── CHANGELOG.md
├── SYSTEM.md              ← This file
├── package.json
├── vite.config.js
└── netlify.toml
```

## Deployment

- **Backend:** AWS Lightsail VM, port 3002, PM2 process `hive-backend`
- **Frontend:** Netlify with `/api/*` proxy to VM
- **Shares VM** with Ember Agents (port 3001)
- **Env vars:** `ANTHROPIC_API_KEY`, `HIVE_API_KEY` (optional auth)
