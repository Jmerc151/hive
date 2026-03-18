---
name: Web Search Router
slug: web-search-router
description: Intelligent search routing that synthesizes AI-powered search results with source citations. Routes queries to optimal search backends.
version: 1.0.0
author: hive
agents: ["scout"]
tags: ["search", "research", "routing", "intelligence"]
source: clawhub-adapted
requires_env: ["OPENROUTER_API_KEY"]
requires_tools: ["web_search"]
---

# Web Search Router

Routes Scout's research queries to the optimal search backend and synthesizes results with proper source citations.

## Search Strategy Matrix

| Query Type | Backend | Why |
|-----------|---------|-----|
| Current events, news | `web_search` (Perplexity Sonar) | Real-time index, citation-rich |
| Technical docs, APIs | `web_search` → follow links with `http_request` | Need full page content |
| Competitor analysis | `web_search` + `http_request` on results | Need deep page extraction |
| Academic/research | `web_search` with scholar-style queries | Structured abstracts |
| Price/product data | `http_request` to known APIs first | Structured data preferred |

## Query Optimization

### Before Searching

1. **Define what you need** — Write the specific question, not a vague topic
2. **Choose time scope** — Add "2026" or "last 30 days" for recency
3. **Pick the format** — Do you need facts, comparisons, trends, or contacts?

### Query Templates

**Market Research:**
```
"{product category} market size revenue 2026 {geographic region}"
"{competitor name} pricing plans features 2026"
"restaurant management software alternatives to {product} reviews"
```

**Technical Research:**
```
"{technology} best practices production deployment 2026"
"{API name} documentation endpoints authentication"
"{framework} vs {framework} performance benchmarks"
```

**Opportunity Research:**
```
"{niche} SaaS products revenue ARR bootstrapped"
"AI agent platforms marketplace 2026 comparison"
"{industry} pain points automation opportunities"
```

## Result Synthesis Protocol

After getting raw search results, synthesize into actionable intelligence:

### Structure

```markdown
## Research: {Topic}

### Key Findings
1. {Most important finding with source}
2. {Second finding with source}
3. {Third finding with source}

### Data Points
| Metric | Value | Source |
|--------|-------|--------|
| Market size | $X.XB | {url} |
| Growth rate | XX% | {url} |
| Key players | A, B, C | {url} |

### Actionable Insights
- **For Ember:** {specific recommendation}
- **For AgentForge:** {specific recommendation}
- **For Trading:** {specific recommendation}

### Sources
1. [{Title}]({url}) — {one-line summary}
2. [{Title}]({url}) — {one-line summary}
```

## Multi-Query Research

For deep research missions, chain multiple searches:

1. **Broad sweep** — Get the landscape (3-5 queries)
2. **Deep dive** — Follow promising leads with targeted queries
3. **Validation** — Cross-reference key claims across sources
4. **Synthesis** — Combine into a single deliverable

Max 10 search calls per research mission to control spend.

## Citation Rules

- Every factual claim needs a source URL
- Never fabricate URLs — only cite pages you actually visited
- If a source is behind a paywall, note it: `(paywalled)`
- Prefer primary sources over aggregator summaries

## Guardrails

- **3-pillar filter**: Discard results not relevant to Ember, AgentForge, or Trading
- **Recency bias**: Prefer 2025-2026 sources unless historical context needed
- **Cost control**: Max 10 web_search calls per task. Reuse cached results when possible.
- **No hallucinated sources**: If you can't find data, say so. Don't invent citations.
