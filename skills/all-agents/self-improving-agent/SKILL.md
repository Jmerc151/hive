---
name: Self-Improving Agent
slug: self-improving-agent
description: "Adapted from ClawHub's #1 most-starred skill (90K+ downloads). Logs errors, corrections, and learnings to structured files for continuous improvement across sessions."
version: 1.0.0
author: hive
agents: ["scout", "forge", "quill", "dealer", "oracle", "nexus", "sentinel"]
tags: ["meta", "self-improvement", "learning", "memory", "core"]
source: clawhub-adapted
requires_env: []
requires_tools: ["store_memory", "recall_memory"]
---

# Self-Improving Agent

Adapted from ClawHub's most-starred skill by @pskoett (90K+ downloads, 132 stars). Every Hive agent uses this skill to learn from errors and improve across sessions.

## Core Concept

AI agents have no persistent memory by default — every task starts fresh. This skill turns each agent into its own curator, automatically documenting failures, corrections, and discoveries as they happen.

## Memory Structure

Each agent maintains structured learnings in its memory file (`memory/{agent_id}.md`):

```markdown
## Learnings

### Errors
| Date | Error | Root Cause | Fix | Status |
|------|-------|-----------|-----|--------|
| 2026-03-18 | web_search returned empty | Query too broad | Added specific keywords | resolved |

### Corrections
| Date | What I Did Wrong | What's Right | Category |
|------|-----------------|-------------|----------|
| 2026-03-18 | Used outdated pricing data | Always verify with web_search | knowledge_gap |

### Best Practices
| Date | Pattern | When to Use | Source |
|------|---------|-------------|--------|
| 2026-03-18 | Always include source URLs | Any research output | user_feedback |

### Feature Requests
| Date | Description | Priority | Status |
|------|------------|----------|--------|
| 2026-03-18 | Support PDF extraction | medium | pending |
```

## When to Log

### Immediate Logging (during task execution)

| Situation | Action | Category |
|-----------|--------|----------|
| Tool call fails | Log to Errors with exact error message | error |
| User corrects output | Log to Corrections with before/after | correction |
| Found a better approach mid-task | Log to Best Practices | best_practice |
| Knowledge was outdated | Log to Corrections | knowledge_gap |
| Repeated the same mistake | Bump priority to `high` | recurring |

### Post-Task Review (after task completion)

1. **What went well?** — Log any new technique that worked
2. **What went wrong?** — Log any errors or wasted steps
3. **What was surprising?** — Log any unexpected findings
4. **Would I do it differently next time?** — Log the improved approach

## Entry Format

Each learning entry must include:

```markdown
### {Category}: {Brief Title}
- **Date**: {ISO date}
- **Context**: {What was happening when this occurred}
- **Detail**: {Specific description of the learning}
- **Action**: {What to do differently next time}
- **Status**: pending | resolved | promoted
- **Priority**: low | medium | high | critical
```

## Priority Guidelines

| Priority | Criteria |
|----------|---------|
| **Critical** | Data loss, wrong trades executed, emails sent to wrong people |
| **High** | Recurring issue (3+ times), blocks task completion |
| **Medium** | Quality issue, suboptimal approach, minor inaccuracy |
| **Low** | Style preference, minor optimization, nice-to-know |

## Promotion System

When a learning proves broadly applicable:

1. **Agent memory** (default) — stays in `memory/{agent_id}.md`
2. **Cross-agent memory** — add to `memory/shared.md` if relevant to multiple agents
3. **System rules** — propose addition to agent system prompts via Nexus review

### Promotion Criteria

- Used successfully 3+ times → promote to system rules
- Applies to 2+ agents → promote to shared memory
- Domain-specific → keep in agent memory

## Recurring Pattern Detection

When the same error appears 3+ times:

1. **Flag it** as `high` priority
2. **Analyze root cause** — is it a code bug, a data issue, or a process gap?
3. **Propose a fix** — either a tool change, prompt change, or guardrail
4. **Create a task** — assign to Forge if it needs a code fix

## Simplify & Harden

After every 10 tasks, run a simplification pass:

1. **Merge similar entries** — combine duplicates
2. **Archive resolved items** — move to an archive section
3. **Identify patterns** — group related learnings
4. **Update best practices** — promote proven patterns

Keep the active learnings section under 50 entries. Archive the rest.

## Integration with Existing Hive Memory

This skill extends Hive's existing `memory/*.md` files:

- `memory/scout.md` — Scout's research learnings
- `memory/forge.md` — Forge's build learnings
- `memory/quill.md` — Quill's content learnings
- `memory/dealer.md` — Dealer's outreach learnings
- `memory/oracle.md` — Oracle's trading learnings (+ evolution log)
- `memory/nexus.md` — Nexus's orchestration learnings
- `memory/sentinel.md` — Sentinel's monitoring learnings
- `memory/shared.md` — Cross-agent learnings

## Guardrails

- **Max 50 active entries per agent** — archive older ones
- **Don't log sensitive data** — no API keys, passwords, or PII in learnings
- **Don't log every success** — only log patterns worth repeating
- **Honest logging** — log actual failures, not sanitized versions
- **Weekly cleanup** — Nexus reviews and prunes stale entries during sprint planning
