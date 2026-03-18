---
name: Agent Team Orchestration
description: Coordinate multi-agent workflows, manage inter-agent consultations, resolve conflicts, and optimize team performance.
version: "1.0.0"
agents: ["nexus"]
tags: ["orchestration", "multi-agent", "coordination", "team-management"]
requires_env: []
requires_tools: ["create_task", "recall_memory", "store_memory"]
---

# Agent Team Orchestration

Coordinate the 6-agent Hive team for maximum output with minimal spend.

## Pipeline Patterns

### Sequential Pipeline
Scout → Forge → Quill → Dealer

Use when: Building a new feature end-to-end.
- Scout researches the opportunity
- Forge builds the MVP
- Quill writes marketing content
- Dealer does outreach

### Parallel Fan-Out
Scout (research A) + Scout (research B) → Nexus (synthesize)

Use when: Multiple independent research tasks that need synthesis.

### Review Loop
Any Agent → Nexus (QA) → Agent (fix) → Nexus (verify)

Use when: Quality matters more than speed (customer-facing work).

## Consultation Protocol

When agents need input from other agents:

1. **Use [CONSULT:agent_id] pattern** in task output.
2. Consultation is synchronous — the requesting agent waits for a response.
3. Keep consultations focused — ask one specific question, not open-ended.
4. Maximum 2 consultations per task execution to control costs.

## Conflict Resolution

When agents produce contradictory outputs:

1. **Identify the conflict** — which specific claims or decisions disagree?
2. **Check evidence** — which agent has stronger supporting data?
3. **Apply pillar priority** — Ember revenue > AgentForge growth > Trading experimentation.
4. **Make a decision** — document the reasoning in memory.
5. **Notify affected agents** — create follow-up tasks with the resolution.

## Performance Optimization

### Spend Efficiency
- Track cost-per-useful-output for each agent.
- Agents averaging > $0.50 per task with scores < 5/10 need prompt tuning.
- Prefer Haiku for routine tasks, reserve Sonnet for complex reasoning.

### Throughput
- Aim for 15-25 completed tasks per day across all agents.
- If backlog grows > 20 tasks, prioritize ruthlessly — close low-priority items.
- Pipeline tasks should complete within 1 hour end-to-end.

### Quality Trends
- Track weekly average scores per agent.
- Declining trend (3 weeks) = prompt needs revision or skill needs update.
- Improving trend = working — document what changed in memory.

## Emergency Protocols

- **Spend spike** (> 2x daily average): Pause all non-critical tasks, investigate.
- **Agent loop** (same task failing 3+ times): Kill task, move to dead letter queue, alert.
- **Service outage** (health check fails): Create Sentinel investigation task.
- **Off-topic drift** (agent creating non-pillar tasks): Block immediately, review guardrails.
