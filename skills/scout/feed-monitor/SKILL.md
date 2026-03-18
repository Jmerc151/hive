---
name: Feed Monitor
slug: feed-monitor
description: Monitor RSS feeds, news sources, and competitor pages for changes. Surface new opportunities as intel items for the team.
version: 1.0.0
author: hive
agents: ["scout"]
tags: ["monitoring", "feeds", "intelligence", "alerts"]
source: clawhub-adapted
requires_env: []
requires_tools: ["web_search", "http_request", "store_memory"]
---

# Feed Monitor

Continuous monitoring of key information sources. Detects changes, new content, and emerging opportunities across Scout's watch list.

## Watch List Categories

### Ember (Restaurant SaaS)
- Restaurant tech news (Nation's Restaurant News, Restaurant Business Online)
- Competitor product updates (Toast, Square for Restaurants, MarketMan)
- Kitchen management trends and pain points
- Portland restaurant scene (local market)

### AgentForge (AI Agent Platform)
- AI agent framework releases (LangChain, CrewAI, AutoGen, OpenClaw)
- ClawHub trending skills (weekly check)
- AI developer community discussions (HN, Reddit r/LocalLLaMA, r/OpenClaw)
- Competing platforms (Relevance AI, AgentOps, Composio)

### Trading
- Market-moving news for watchlist stocks (SPY, QQQ, AAPL, NVDA, MSFT, TSLA, AMZN)
- Fed announcements, earnings calendars
- Technical analysis pattern alerts

## Monitoring Protocol

### Per-Source Check

1. **Fetch** — `http_request` to the source URL
2. **Extract** — Pull headlines, dates, key content
3. **Compare** — Check against last known state in `store_memory`
4. **Filter** — Apply 3-pillar relevance filter
5. **Score** — Rate confidence 0.0-1.0 based on source reliability and relevance
6. **Emit** — Create intel items for high-scoring findings

### Intel Item Format

```json
{
  "title": "Toast launches AI kitchen assistant feature",
  "summary": "Toast announced an AI-powered kitchen assistant that auto-generates prep lists. Direct competitor to Ember's Kitchen Bible feature.",
  "source_url": "https://example.com/article",
  "confidence": 0.85,
  "tags": ["ember", "competitor", "product-launch"],
  "recommended_action": "sent_to_forge"
}
```

## Frequency Schedule

| Source Type | Check Frequency | Via |
|------------|----------------|-----|
| Competitor product pages | Weekly | Heartbeat: ember-intelligence |
| AI agent news | Weekly | Heartbeat: agentforge-research |
| Market news (trading) | Bi-weekly | Heartbeat: trading-research |
| ClawHub trending | Weekly | Manual or heartbeat |
| HN front page | On-demand | Task assignment |

## Change Detection

When monitoring a page over time:

1. Store a content hash in memory after each check
2. On next check, compare new hash to stored hash
3. If changed, extract the diff (new items only)
4. Only surface genuinely new content — don't re-alert on known items

## Output Requirements

Every feed monitor run must produce:

```markdown
## Feed Monitor Report — {Date}

### New Findings ({count})
{Numbered list of new items with title, one-line summary, source, confidence score}

### Watchlist Status
| Source | Last Checked | Status | Changes |
|--------|-------------|--------|---------|
| Toast blog | 2026-03-18 | ✅ OK | No changes |
| HN AI | 2026-03-18 | ⚠️ New | 3 new items |

### Recommended Actions
- [ ] {Action item for specific agent}
```

## Guardrails

- Max 15 HTTP requests per monitoring run
- Don't monitor personal social media accounts
- Respect rate limits and robots.txt
- Cache results to avoid redundant fetches
- Only alert on genuinely actionable findings (confidence > 0.6)
