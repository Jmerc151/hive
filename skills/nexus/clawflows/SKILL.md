---
name: ClawFlows
slug: clawflows
description: "Deterministic workflow pipelines adapted from ClawFlows.com. Chain agent skills into automated multi-step sequences — zero LLM tokens for orchestration."
version: 1.0.0
author: hive
agents: ["nexus"]
tags: ["workflows", "pipelines", "automation", "deterministic", "orchestration"]
source: clawhub-adapted
requires_env: []
requires_tools: ["create_task"]
---

# ClawFlows

Deterministic workflow pipelines for Hive. Adapted from ClawFlows.com — the automation registry for OpenClaw agents.

## Concept

ClawFlows chains multiple agent tasks into automated pipelines WITHOUT burning LLM tokens on orchestration. The pipeline runner is pure logic — it only calls agents when actual work needs doing.

## Pipeline Architecture

```
Trigger → Step 1 (Agent A) → Step 2 (Agent B) → Step 3 (Agent C) → Output
```

Each step:
- Receives the previous step's output as input context
- Executes its assigned skill
- Passes structured output to the next step
- Fails the pipeline on error (no silent skip)

## Active Pipelines

### Ember Dev Daily (Weekdays 9AM)
```yaml
pipeline: ember-dev-daily
trigger: cron 0 9 * * 1-5
steps:
  - agent: scout
    skill: feed-monitor
    input: "Check Ember competitor updates, restaurant tech news"
    timeout: 15m
  - agent: forge
    skill: deploy-automation
    input: "{previous.output} — Build any needed features or fixes"
    timeout: 30m
  - agent: nexus
    skill: task-orchestrator
    input: "{previous.output} — Review quality of today's work"
    timeout: 10m
```

### Trading Session (Weekdays 9:31AM)
```yaml
pipeline: trading-session
trigger: cron 31 9 * * 1-5
steps:
  - agent: oracle
    skill: signal-analyzer
    input: "Analyze watchlist: SPY, QQQ, AAPL, NVDA, MSFT, TSLA, AMZN"
    timeout: 10m
  - agent: oracle
    skill: signal-analyzer
    input: "{previous.output} — Execute any recommended trades"
    timeout: 10m
```

### AgentForge Build (Mon/Wed/Fri 10AM)
```yaml
pipeline: agentforge-build
trigger: cron 0 10 * * 1,3,5
steps:
  - agent: scout
    skill: web-search-router
    input: "Research latest AI agent platform trends and features"
    timeout: 15m
  - agent: forge
    skill: api-integrations
    input: "{previous.output} — Build AgentForge features"
    timeout: 30m
  - agent: quill
    skill: seo-content-writer
    input: "{previous.output} — Document new features for Dev.to"
    timeout: 15m
```

### Opportunity Scan (Sundays)
```yaml
pipeline: opportunity-scan
trigger: cron 0 10 * * 0
steps:
  - agent: scout
    skill: web-search-router
    input: "Find new business opportunities in Ember, AgentForge, Trading"
    timeout: 20m
  - agent: nexus
    skill: task-orchestrator
    input: "{previous.output} — Evaluate opportunities, create tasks for viable ones"
    timeout: 15m
```

### Weekly Sprint (Sundays)
```yaml
pipeline: weekly-sprint
trigger: cron 0 18 * * 0
steps:
  - agent: nexus
    skill: task-orchestrator
    input: "Review this week's completed tasks, score quality, plan next week"
    timeout: 20m
```

## Pipeline Definition Format

```yaml
pipeline: {slug}
trigger: cron {expression} | webhook {url} | manual
max_duration: 60m
on_failure: halt | continue | retry(2)
steps:
  - agent: {agent_id}
    skill: {skill_slug}
    input: "{context template with {previous.output} substitution}"
    timeout: {duration}
    required: true  # false = pipeline continues on failure
```

## Step Output Passing

Each step produces structured output that flows to the next:

```json
{
  "step": "scout-research",
  "status": "completed",
  "output": "## Research Findings\n...",
  "artifacts": ["intel_item_123", "market_data_456"],
  "duration_ms": 45000,
  "cost_usd": 0.12
}
```

The `{previous.output}` template variable in the next step's input gets replaced with the prior step's `output` field.

## Creating New Pipelines

When Nexus needs a new automated workflow:

1. Define the trigger (cron, webhook, or manual)
2. List the steps with agent assignments and skills
3. Set timeouts for each step (be generous — agents sometimes need time)
4. Define failure behavior (halt is safest default)
5. Test with a manual run before enabling the cron trigger

## Pipeline Monitoring

Each pipeline run gets logged to `task_traces` with:
- Pipeline name and trigger
- Per-step status, duration, and cost
- Total pipeline duration and cost
- Success/failure with error details

## Guardrails

- **Max pipeline duration**: 2 hours (kill after that)
- **Max steps per pipeline**: 5 (keep it simple)
- **No nested pipelines** — a pipeline step cannot trigger another pipeline
- **Cost tracking** — each step's LLM cost is tracked and attributed to the pipeline
- **Spend limit respected** — pipeline halts if agent hits daily spend limit mid-run
- **Dedup** — won't run a pipeline if the same one completed in the last 4 hours
