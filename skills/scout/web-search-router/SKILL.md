---
name: Web Search Router
description: Multi-strategy web search that routes queries to the optimal search approach based on intent (news, technical, local, product).
version: "1.0.0"
agents: ["scout"]
tags: ["search", "research", "intelligence"]
requires_env: []
requires_tools: ["web_search"]
---

# Web Search Router

Route search queries to the best search strategy based on detected intent.

## Query Classification

Classify each query into one of these intents before searching:

| Intent | Strategy | Example |
|--------|----------|---------|
| **news** | Search with date filters, prefer recent results | "latest AI agent frameworks 2026" |
| **technical** | Search GitHub, Stack Overflow, docs sites | "express 5 middleware patterns" |
| **local** | Include city/region qualifiers | "Portland restaurants using kitchen management software" |
| **product** | Search G2, ProductHunt, landing pages | "restaurant SaaS competitors pricing" |
| **academic** | Search arxiv, papers, research blogs | "multi-agent coordination research" |

## Process

1. **Parse the query** — extract key entities, intent, and time relevance.
2. **Select strategy** from the table above.
3. **Execute 2-3 targeted searches** with strategy-specific query reformulations.
4. **Synthesize results** — deduplicate, rank by relevance, extract key facts.
5. **Deliver structured output:**
   - Top 5 findings as bullet points with source URLs
   - Confidence score (0-1) for each finding
   - Suggested follow-up queries if results are thin

## Quality Rules

- Never report a single search result as definitive — cross-reference across sources.
- If results are sparse (< 3 quality hits), note low confidence and suggest alternative queries.
- Always include publication/update dates when available.
- Prefer primary sources over aggregator summaries.
