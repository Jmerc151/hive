---
name: Agent Team Orchestration
slug: agent-team-orchestration
description: "Adapted from ClawHub's agent-team-orchestration skill. Multi-agent coordination with defined roles, task lifecycles, handoff protocols, and review workflows."
version: 1.0.0
author: hive
agents: ["nexus"]
tags: ["orchestration", "multi-agent", "coordination", "handoffs", "review"]
source: clawhub-adapted
requires_env: []
requires_tools: ["create_task", "store_memory", "recall_memory"]
---

# Agent Team Orchestration

Production playbook for running Hive's 7-agent team. Adapted from ClawHub's agent-team-orchestration skill by @arminnaimi.

## Hive Team Roles

| Agent | Role | Model | Purpose |
|-------|------|-------|---------|
| **Scout** | Researcher | claude-haiku-4-5 | Find information, analyze markets, monitor competitors |
| **Forge** | Builder | claude-haiku-4-5 | Write code, build features, deploy |
| **Quill** | Writer | claude-haiku-4-5 | Create content, blog posts, documentation |
| **Dealer** | Seller | claude-haiku-4-5 | Outreach, sales, lead generation |
| **Oracle** | Trader | claude-sonnet-4-5 | Analyze signals, execute paper trades |
| **Nexus** | Orchestrator | claude-sonnet-4-5 | Route tasks, review quality, plan sprints |
| **Sentinel** | Monitor | claude-haiku-4-5 | QA, production monitoring, failure investigation |

### Role Boundaries

Every agent has ONE primary role. Overlap causes confusion:

- Scout NEVER writes final content (that's Quill)
- Forge NEVER does outreach (that's Dealer)
- Oracle NEVER researches non-trading topics (that's Scout)
- Nexus NEVER executes — only routes and reviews

## Task Lifecycle

```
CREATED → ASSIGNED → IN_PROGRESS → REVIEW → DONE | FAILED
```

### State Transition Rules

| Transition | Who Triggers | Requirements |
|-----------|-------------|-------------|
| Created → Assigned | Nexus | Agent available, under daily limit |
| Assigned → In Progress | Agent | Agent picks up task |
| In Progress → Review | Agent | Deliverable produced |
| Review → Done | Nexus | Quality score >= 5/10 |
| Review → In Progress | Nexus | Quality score < 5, rework needed |
| Any → Failed | System/Nexus | 3 retries exhausted, permanent failure |

## Handoff Protocol

When work passes between agents (via consultation or chained tasks):

### Required Handoff Fields

1. **What was done** — Summary of completed work
2. **Artifacts** — Exact file paths, URLs, or data produced
3. **How to verify** — Test commands or acceptance criteria
4. **Known issues** — Anything incomplete or risky
5. **Next action** — Clear instruction for receiving agent

### Consultation Pattern (via [CONSULT:agent_id])

```
[CONSULT:scout] I need current pricing data for Toast, Square for Restaurants,
and MarketMan. Return a comparison table with: product name, starter plan price,
key features, and last verified date.
```

Good consultations are:
- Specific about what data/artifact is needed
- Clear about the output format expected
- Bounded in scope (not "tell me everything about X")

Bad consultations:
- "What do you think about this?" (too vague)
- "Research everything about restaurants" (too broad)
- Consulting terminal agents (oracle, dealer) for non-specialty tasks

## Pipeline Coordination

For multi-step pipelines (e.g., Ember Dev Daily):

```
Scout Research → Forge Build → Nexus QA
```

### Pipeline Rules

1. Each step must complete before the next starts
2. If any step fails, the pipeline halts (no skip-ahead)
3. Each step's output becomes the next step's input context
4. Nexus monitors pipeline progress and intervenes on stalls
5. Max pipeline duration: 2 hours

## Cross-Agent Reviews

Prevent quality drift with cross-role reviews:

| Reviewer | Reviews | Focus |
|----------|---------|-------|
| Nexus | All completed tasks | Quality score, 3-pillar alignment |
| Sentinel | Failed tasks | Root cause, bug vs config vs transient |
| Scout | Forge's market assumptions | Are the market claims accurate? |
| Forge | Quill's technical content | Are code examples correct? |

## Conflict Resolution

When agents disagree or produce conflicting outputs:

1. **Nexus decides** — as orchestrator, Nexus has final say on priorities
2. **Data wins** — if there's conflicting information, the one with citations wins
3. **Escalate to human** — if the conflict affects strategy or spend, flag for John

## Common Pitfalls

- Spawning tasks without clear deliverable requirements
- No review step → quality drift within 3-5 tasks
- Agents doing work outside their role
- Not commenting on task progress (silent execution)
- Nexus doing execution work instead of orchestrating
- Circular consultations (A consults B consults A)

## Guardrails

- **3-pillar enforcement** in every task assignment
- **10 tasks/agent/day** hard cap
- **5 auto-tasks/day** generation limit
- **3-deep chain limit** on follow-up tasks
- **No self-assignment** except for Nexus (QA) and Sentinel (monitoring)
