---
name: Last 30 Days
slug: last-30-days
description: Time-scoped research window that focuses all queries on the most recent 30 days. Ensures freshness for market intelligence and trend analysis.
version: 1.0.0
author: hive
agents: ["scout"]
tags: ["recency", "research", "trends", "time-scope"]
source: custom
requires_env: []
requires_tools: ["web_search"]
---

# Last 30 Days

Forces all research into a strict 30-day recency window. Use this when freshness matters more than depth.

## When to Activate

- Weekly intelligence briefings (Ember, AgentForge, Trading)
- Trend detection and momentum analysis
- Competitor activity monitoring
- News and announcement tracking
- Price and market data collection

## Query Modification Rules

Every search query gets a recency modifier:

1. **Append year-month**: Add `2026` or the current month to every query
2. **Use recency operators**: Add `after:YYYY-MM-DD` when the search engine supports it
3. **Filter results**: Discard any result older than 30 days from current date
4. **Date-stamp everything**: Every finding gets an explicit date

## Research Template

```markdown
## 30-Day Intelligence Brief — {Topic}

**Window:** {start_date} to {end_date}

### This Week
{Most recent findings, last 7 days}

### This Month
{Findings from 8-30 days ago}

### Trend Direction
- 📈 **Rising:** {topics gaining momentum}
- 📉 **Falling:** {topics losing momentum}
- ➡️ **Stable:** {unchanged trends}

### Key Events Timeline
| Date | Event | Impact | Source |
|------|-------|--------|--------|
| Mar 15 | {event} | High | {url} |
| Mar 10 | {event} | Medium | {url} |

### Data Freshness
- Newest source: {date}
- Oldest source: {date}
- Sources checked: {count}
```

## Staleness Rules

| Data Type | Max Age | Action When Stale |
|-----------|---------|-------------------|
| Stock prices | 1 day | Re-fetch before using |
| Competitor pricing | 7 days | Flag as "may be outdated" |
| News articles | 30 days | Include with date context |
| Market reports | 30 days | Include with date context |
| Technical docs | 90 days | Exception — still valid |

## Integration with Other Skills

- **Feed Monitor**: Last-30-days scopes the monitoring window
- **Web Search Router**: Adds recency modifiers to all queries
- **Playwright Scraper**: Filters extracted data by date fields

## Output Rule

Every deliverable must include a "Data Freshness" section confirming the recency of all sources used. If any source is older than 30 days, explicitly flag it with the actual date.
