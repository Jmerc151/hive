---
name: Task Orchestrator
description: Intelligent task routing, prioritization, and dependency management for the Hive agent team.
version: "1.0.0"
agents: ["nexus"]
tags: ["orchestration", "planning", "task-management"]
requires_env: []
requires_tools: ["create_task", "recall_memory", "store_memory"]
---

# Task Orchestrator

Manage task flow across the agent team with smart routing and prioritization.

## Agent Capabilities Map

| Agent | Strengths | Best For | Avoid |
|-------|-----------|----------|-------|
| Scout | Research, web search, data gathering | Market research, competitor analysis, feed monitoring | Building, writing long content |
| Forge | Coding, building, deploying | Feature development, bug fixes, integrations | Research, sales |
| Quill | Writing, content creation, SEO | Blog posts, documentation, marketing copy | Coding, trading |
| Dealer | Sales, outreach, relationship building | Cold email, partnership outreach | Coding, research |
| Oracle | Analysis, trading, pattern recognition | Technical analysis, trade execution | Content, outreach |
| Nexus | QA, planning, coordination | Task review, sprint planning, quality scoring | Direct customer contact |

## Task Routing Rules

When creating tasks for other agents:

1. **Match task to agent strengths** — use the capabilities map above.
2. **Set correct priority:**
   - `critical` — Production down, data loss risk, security issue
   - `high` — Revenue-impacting, customer-facing, blocking other tasks
   - `medium` — Normal feature work, routine research
   - `low` — Nice-to-have, exploratory, non-urgent improvements
3. **Include context** — reference prior task IDs, memory keys, or specific URLs.
4. **Set dependencies** — if task B requires task A's output, note it in description.

## Auto-Chain Rules (RESPECT THESE)

- Terminal agents (Oracle, Dealer, Nexus) NEVER auto-chain to other agents.
- Maximum 1 level deep chaining.
- Maximum 5 auto-tasks per day.
- Allowed chains: Scout→Quill, Scout→Forge, Scout→Dealer, Quill→Dealer, Forge→Quill, Forge→Nexus.

## Weekly Sprint Planning (Sundays)

1. **Review completed tasks** — score quality 1-10, note patterns.
2. **Review stuck/failed tasks** — diagnose root cause, reassign or close.
3. **Check spend** — ensure under 80% of monthly budget.
4. **Create next week's tasks:**
   - 2-3 Ember tasks (research + build)
   - 1-2 AgentForge tasks (build + content)
   - 1 trading review task
   - 1 self-improvement task (if budget allows)
5. **Store sprint summary** in memory for historical tracking.

## Quality Scoring Rubric

When reviewing completed tasks, score on:
- **Completeness** (0-3): Did the agent finish the full task?
- **Quality** (0-3): Is the output useful and well-structured?
- **Efficiency** (0-2): Did the agent use tools effectively without wasted steps?
- **Pillar Alignment** (0-2): Does the work advance Ember, AgentForge, or Trading?

Total: /10. Below 5 = flag for review. Below 3 = reassign to different agent.
