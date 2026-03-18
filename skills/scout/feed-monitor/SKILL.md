---
name: Feed Monitor
description: Monitor RSS feeds, Hacker News, Product Hunt, and Reddit for relevant opportunities and threats across the 3 business pillars.
version: "1.0.0"
agents: ["scout"]
tags: ["monitoring", "feeds", "opportunities"]
requires_env: []
requires_tools: ["web_search", "http_request", "store_memory"]
---

# Feed Monitor

Continuously scan public feeds for signals relevant to Ember, AgentForge, and Trading.

## Feed Sources

| Source | URL Pattern | Relevance |
|--------|-------------|-----------|
| Hacker News | news.ycombinator.com | AI agents, SaaS launches, restaurant tech |
| Product Hunt | producthunt.com/posts | Competitor launches, adjacent tools |
| Reddit r/SaaS | reddit.com/r/SaaS | Market sentiment, feature requests |
| Reddit r/restaurateur | reddit.com/r/restaurateur | Ember customer pain points |
| Dev.to | dev.to/t/ai | Content opportunities for Quill |

## Process

1. **Fetch each feed** via web_search or http_request.
2. **Filter for relevance** using these keywords:
   - Ember: restaurant, kitchen, food safety, menu, BOH, chef, inventory
   - AgentForge: AI agent, autonomous, multi-agent, LLM tool, agent framework
   - Trading: algorithmic trading, quantitative, market signal, RSI, mean reversion
3. **Score each item** (0-1) based on recency, engagement, and pillar alignment.
4. **Store top findings** in memory using store_memory for cross-session tracking.
5. **Output an intel briefing:**
   - Top 5 items per pillar (if available)
   - Each item: title, source, score, one-line summary, action recommendation

## Action Recommendations

Tag each finding with an action:
- `[FORGE]` — Build opportunity (send to Forge)
- `[QUILL]` — Content opportunity (send to Quill)
- `[DEALER]` — Outreach opportunity (send to Dealer)
- `[WATCH]` — Monitor, no action yet
- `[IGNORE]` — Off-topic, filter out in future
