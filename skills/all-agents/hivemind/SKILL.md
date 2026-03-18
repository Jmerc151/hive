---
name: HiveMind
slug: hivemind
description: Cross-agent knowledge sharing protocol. Enables agents to share discoveries, warnings, and best practices through a shared memory layer.
version: 1.0.0
author: hive
agents: ["scout", "forge", "quill", "dealer", "oracle", "nexus", "sentinel"]
tags: ["memory", "knowledge-sharing", "cross-agent", "collaboration"]
source: custom
requires_env: []
requires_tools: ["store_memory", "recall_memory"]
---

# HiveMind

Cross-agent knowledge sharing protocol. When one agent learns something valuable, the whole team benefits.

## Shared Memory Architecture

```
memory/
├── scout.md      # Scout-specific learnings
├── forge.md      # Forge-specific learnings
├── quill.md      # Quill-specific learnings
├── dealer.md     # Dealer-specific learnings
├── oracle.md     # Oracle-specific learnings
├── nexus.md      # Nexus-specific learnings
├── sentinel.md   # Sentinel-specific learnings
└── shared.md     # Cross-agent shared knowledge (HiveMind)
```

### shared.md Structure

```markdown
# HiveMind — Shared Knowledge

## Market Intelligence
{Scout's findings that other agents need to know}

## Technical Discoveries
{Forge's learnings about APIs, tools, platforms}

## Content Insights
{Quill's findings about what content performs well}

## Customer Signals
{Dealer's learnings from outreach responses}

## Trading Patterns
{Oracle's market observations relevant to business timing}

## System Alerts
{Sentinel's warnings about production issues}

## Cross-Agent Patterns
{Patterns that span multiple agents}
```

## Knowledge Sharing Triggers

### Auto-Share (immediately)

| Event | From | Shared As |
|-------|------|-----------|
| Competitor launches new feature | Scout | Market Intelligence |
| API endpoint changes or breaks | Forge | Technical Discovery |
| Blog post gets significant traffic | Quill | Content Insight |
| Prospect responds positively | Dealer | Customer Signal |
| Market volatility spike | Oracle | Trading Pattern |
| Production outage detected | Sentinel | System Alert |

### Promote-on-Review (weekly, by Nexus)

During Sunday sprint planning, Nexus reviews agent memories and promotes relevant learnings to shared.md:

1. Read each agent's memory file
2. Identify cross-cutting insights
3. Add to shared.md under the appropriate section
4. Remove stale entries (older than 30 days with no references)

## Knowledge Retrieval

Before starting any task, agents should check:

1. **Own memory** — `recall_memory` for agent-specific learnings
2. **Shared memory** — Check shared.md for relevant cross-agent knowledge
3. **Then research** — Only web_search if memory doesn't have the answer

### Query Pattern

```
When assigned a task about {topic}:
1. recall_memory("What do I know about {topic}?")
2. recall_memory("What has the team shared about {topic}?")
3. If insufficient → web_search("{topic}")
```

## Knowledge Deduplication

When adding to shared.md:

1. **Check for existing entries** — don't duplicate
2. **Update if newer** — replace outdated info with fresh data
3. **Link related entries** — reference existing entries instead of repeating
4. **Date everything** — every entry gets a date stamp

## Knowledge Decay

Shared knowledge has a shelf life:

| Category | Max Age | Action When Expired |
|----------|---------|---------------------|
| Market Intelligence | 14 days | Archive or refresh |
| Technical Discoveries | 90 days | Keep if still valid |
| Content Insights | 30 days | Archive metrics |
| Customer Signals | 30 days | Archive or follow up |
| Trading Patterns | 7 days | Archive (markets move fast) |
| System Alerts | 7 days | Remove if resolved |

## Inter-Agent Messaging

For urgent cross-agent communication (not just knowledge storage):

1. **Consultation** — `[CONSULT:agent_id]` for synchronous Q&A
2. **Task creation** — `create_task` for asynchronous work assignment
3. **Email alert** — `send_email` for critical issues (Sentinel → John)

## Guardrails

- **shared.md max size**: 200 lines. Archive aggressively.
- **No duplicate entries** — check before adding
- **Date every entry** — undated entries get pruned
- **No raw data dumps** — synthesize before sharing
- **Agent attribution** — every entry notes which agent contributed it
