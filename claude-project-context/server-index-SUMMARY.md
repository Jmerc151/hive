# server/index.js — Summary (9010 lines)

This file is too large to include directly. Here is what it contains based on project documentation:

## Overview
Main Express 5 server. Single-file backend handling all API routes, agent execution, and business logic.

## Key Systems

### Agent Execution
- **ReAct loop:** 3 steps max + retry. Agents think/act/observe in a loop.
- **callClaude():** Calls OpenRouter API with agent-specific model routing.
- **agentConsult():** Inter-agent consultation via [CONSULT:agent_id] pattern.
- **activeRuns:** In-memory Map tracking currently executing tasks.

### Spend Controls
- Daily/monthly/per-agent spend limits
- Pause capability
- Spend logging to spend_log table
- Settings keys: daily_limit_usd, monthly_limit_usd

### Auto-Task Generation
- Nexus generates follow-up tasks after completions
- Guardrails: 5/day cap, 3-deep chain limit, topic blocklist, 3-pillar enforcement

### QA Reviews
- Nexus scores completed work via reviewCompletedWork()

### Agent Memory
- Persistent .md files per agent in memory/ directory
- Auto-curated after task completion

### API Endpoints (partial list)
- Task CRUD, execution, and status management
- Agent status and configuration
- Spend tracking and analytics
- Pipeline management and execution
- Trading endpoints (Alpaca paper trading)
- Bot generator (Scout suggestions + Forge builds)
- Revenue attribution
- Event triggers (webhooks)
- Proposals (approve/reject/delete)
- Skill registry CRUD
- Push notifications (VAPID web push)
- Email notifications (nodemailer)
- Settings management
- Heartbeat registration and execution

### Heartbeats
- 15 registered heartbeats running on intervals
- Auto-unstick system: startup cleanup + 10min heartbeat for stuck tasks
- Self-improvement heartbeats (weekly, gated by 80% budget threshold)

### Security
- API key auth on all /api/* routes (Bearer token)
- Helmet security headers
- Rate limiting: 100 req/min per IP
- Approval gates (cost threshold, keyword triggers)

### Guardrails
- 3-pillar enforcement (Ember, Hive, Trading)
- BLOCKED_TOPICS list
- Fake email domain blocklist
- Revenue entry validation (real transaction IDs, $10K cap, no negatives)
- Anti-spiral protections

### Trading
- Alpaca paper trading integration
- Yahoo Finance market data
- Multi-lens Oracle analysis (5 AI personas)
- Strategy ensemble and backtesting
