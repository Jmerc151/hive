---
name: Task Orchestrator
slug: task-orchestrator
description: Nexus's core task routing and prioritization engine. Manages the task queue, assigns work to agents, and enforces quality gates.
version: 1.0.0
author: hive
agents: ["nexus"]
tags: ["orchestration", "tasks", "routing", "priority", "quality"]
source: custom
requires_env: []
requires_tools: ["create_task", "store_memory", "recall_memory"]
---

# Task Orchestrator

Nexus's playbook for managing the Hive task queue. Route tasks to the right agent, enforce quality, and keep the team productive.

## Task Routing Matrix

| Task Type | Primary Agent | Fallback | Notes |
|-----------|--------------|----------|-------|
| Market research | Scout | — | Always Scout first |
| Competitor analysis | Scout | — | Scout's specialty |
| Code development | Forge | — | All coding goes to Forge |
| Deployment | Forge | — | Build + deploy |
| Blog post / content | Quill | — | All written content |
| Email outreach | Dealer | — | Max 5/day |
| Trade analysis | Oracle | — | Paper trading only |
| Quality review | Nexus | — | Self-assign |
| Task planning | Nexus | — | Self-assign |
| Bug investigation | Sentinel | Forge | Sentinel diagnoses, Forge fixes |

## Priority Framework

### Priority Levels

| Priority | SLA | Examples |
|----------|-----|---------|
| **Critical** | Execute immediately | Production down, security issue, data loss |
| **High** | Within 4 hours | Revenue-blocking bug, customer-facing issue |
| **Medium** | Within 24 hours | Feature work, research tasks, content |
| **Low** | Within 72 hours | Nice-to-have improvements, exploration |

### Priority Scoring

```
score = base_priority
if revenue_impact: score += 30
if customer_facing: score += 20
if blocks_other_work: score += 15
if time_sensitive: score += 10
if recurring_issue: score += 5
```

## Auto-Task Generation Rules

Nexus generates follow-up tasks with these constraints:

- **Max 5 auto-tasks per day** (hard cap)
- **Max 3 chain depth** (task → follow-up → follow-up, no deeper)
- **Allowed chains only**:
  - scout → quill (research → write about it)
  - scout → forge (research → build it)
  - scout → dealer (research → sell it)
  - quill → dealer (content → promote it)
  - forge → quill (build → document it)
  - forge → nexus (build → review it)
- **Terminal agents**: oracle, dealer, nexus never auto-chain
- **Dedup**: Don't create if similar task exists in last 24h

## Quality Review Protocol

After each task completes, Nexus scores it:

### Scoring Rubric (1-10)

| Score | Meaning | Action |
|-------|---------|--------|
| 9-10 | Exceptional | Log as best practice, share pattern |
| 7-8 | Good | Approve, minor feedback |
| 5-6 | Acceptable | Approve with improvement notes |
| 3-4 | Below standard | Return for rework |
| 1-2 | Failed | Return with detailed failure analysis |

### Review Checklist

- [ ] Task output is a concrete deliverable (not just "I researched this")
- [ ] Output format matches the skill's requirements
- [ ] 3-pillar alignment (Ember, AgentForge, or Trading)
- [ ] No hallucinated data or fake sources
- [ ] Tool calls were effective (not wasted steps)
- [ ] Cost was reasonable for the output quality

## Weekly Sprint Planning (Sundays)

Every Sunday, Nexus runs the sprint planning heartbeat:

1. **Review last week**: Score completed tasks, identify patterns
2. **Check metrics**: Spend vs budget, task throughput, win rates
3. **Plan next week**: Create tasks for each agent based on priorities
4. **Distribute workload**: Balance across agents, respect per-agent limits

### Sprint Template

```markdown
## Sprint Plan — Week of {Date}

### Last Week Summary
- Tasks completed: {N}
- Average quality score: {X}/10
- Spend: ${X} / ${daily_limit * 7} budget
- Key wins: {list}
- Issues: {list}

### This Week's Focus
- **Ember**: {specific goal}
- **AgentForge**: {specific goal}
- **Trading**: {specific goal}

### Task Assignments
| Agent | Task | Priority | Deadline |
|-------|------|----------|----------|
| Scout | {task} | High | Mon |
| Forge | {task} | Medium | Wed |
```

## Guardrails

- **Never assign tasks outside 3 pillars** — block off-topic requests
- **Respect agent budgets** — don't assign if agent is over daily spend limit
- **No circular chains** — A → B → A is not allowed
- **10 tasks per agent per day** — hard cap
- **Log all routing decisions** — for audit and improvement
