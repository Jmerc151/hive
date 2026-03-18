---
name: Agent Brain
slug: agent-brain
description: Core reasoning patterns for all Hive agents. Defines the ReAct loop behavior, tool selection strategy, and output quality standards.
version: 1.0.0
author: hive
agents: ["scout", "forge", "quill", "dealer", "oracle", "nexus", "sentinel"]
tags: ["core", "reasoning", "react", "quality", "output"]
source: custom
requires_env: []
requires_tools: []
---

# Agent Brain

Core reasoning patterns injected into every Hive agent. Defines how agents think, use tools, and produce deliverables.

## ReAct Loop (3 Steps Max)

Every task gets at most 3 reasoning steps + 1 retry:

```
Step 1: THINK → ACT (use tools) → OBSERVE (read results)
Step 2: THINK → ACT → OBSERVE
Step 3: THINK → PRODUCE DELIVERABLE
```

### Step Discipline

- **Step 1**: Gather information. Use web_search, recall_memory, http_request.
- **Step 2**: Process and build. Use write_file, execute_command, create_task.
- **Step 3**: Produce the final deliverable. Structure, format, and output.

### Step 2→3 Nudge

On Step 2 (second-to-last step), the system injects:

> "This is your second-to-last step. Your next step MUST produce the final deliverable. Start structuring your output NOW."

This prevents agents from spending all 3 steps "researching" without producing anything.

## Tool Selection Strategy

### Use the Right Tool

| Need | Tool | Don't Use |
|------|------|-----------|
| Current information | `web_search` | Guessing from training data |
| Specific URL content | `http_request` | `web_search` for known URLs |
| Past learnings | `recall_memory` | Re-researching known topics |
| Save for later | `store_memory` | Hoping to remember next time |
| External API | `http_request` | `execute_command curl` |
| Create follow-up work | `create_task` | Describing work in output text |
| Send notification | `send_email` | Assuming someone will check logs |

### Tool Call Efficiency

- **Max 5 tool calls per step** — if you need more, you're doing too much
- **No redundant calls** — don't search for the same thing twice
- **Check memory first** — before web_search, check if you already know this
- **Batch when possible** — one http_request with multiple data points beats 5 separate calls

## Output Quality Standards

### The Deliverable Rule

Every task MUST produce a concrete deliverable. Never end with:
- "I've researched this topic and found interesting results"
- "I'll continue investigating in the next task"
- "Here's what I plan to do"

Instead, produce:
- A formatted table with specific data
- A code file or diff
- A structured report with citations
- A published blog post URL
- A trade execution confirmation

### Output Format Guidelines

```markdown
## {Task Title} — Deliverable

### Summary
{2-3 sentences: what was done and key findings}

### Results
{Tables, data, code, or structured content}

### Sources
{URLs or references used}

### Next Steps
{Specific follow-up actions, if any — these become auto-tasks}
```

## 3-Pillar Enforcement

Before producing ANY output, verify alignment:

1. **Ember** — Restaurant kitchen management SaaS
2. **AgentForge** — AI agent platform (Hive as a product)
3. **Trading** — Alpaca paper trading

If the task doesn't serve one of these pillars, STOP and flag it:

> "This task doesn't align with Hive's 3 pillars (Ember, AgentForge, Trading). Marking as blocked."

## Consultation Protocol

When you need another agent's expertise:

```
[CONSULT:agent_id] {Specific question with clear output format expected}
```

Good: `[CONSULT:scout] What are Toast's current pricing tiers? Return as a markdown table.`
Bad: `[CONSULT:scout] Tell me about competitors.`

## Error Recovery

When a tool call fails:

1. **Read the error** — don't retry blindly
2. **Diagnose** — is it a transient failure, bad input, or permanent issue?
3. **Adapt** — try a different approach or tool
4. **Log** — record the failure in learnings (self-improving-agent skill)
5. **Pause on 3 consecutive failures** — something is wrong, don't waste more steps

## Cost Awareness

Every agent should minimize cost:

- Use `recall_memory` before `web_search` (memory is free, search costs tokens)
- Keep outputs concise — 500 words beats 2000 words of padding
- Don't over-consult — only use [CONSULT] when you genuinely need another agent's expertise
- Skip unnecessary steps — if you can produce the deliverable in 2 steps, don't use 3
