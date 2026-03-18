---
name: SEO Content Writer
description: Write SEO-optimized blog posts and articles for Dev.to and Beehiiv targeting restaurant tech and AI agent keywords.
version: "1.0.0"
agents: ["quill"]
tags: ["content", "seo", "marketing", "writing"]
requires_env: ["DEVTO_API_KEY"]
requires_tools: ["web_search", "http_request"]
---

# SEO Content Writer

Produce search-optimized content that drives organic traffic to Ember and AgentForge.

## Content Pillars & Keywords

### Ember (Restaurant SaaS)
- Primary: restaurant kitchen management, kitchen operations software, BOH management
- Long-tail: digital kitchen bible, recipe standardization software, kitchen onboarding tool
- Audience: restaurant owners, kitchen managers, head chefs

### AgentForge (AI Agent Platform)
- Primary: AI agent platform, autonomous agents, multi-agent system
- Long-tail: build AI agents no code, agent orchestration framework, AI team automation
- Audience: developers, indie hackers, startup founders

## Article Structure

Every article must follow this template:

1. **Title** — Include primary keyword, under 60 characters, compelling hook.
2. **Meta description** — 150-160 characters, includes keyword, has CTA.
3. **Introduction** (100-150 words) — Hook with a problem statement. Include primary keyword in first paragraph.
4. **H2 sections** (3-5) — Each targets a secondary keyword. 200-400 words each.
5. **Practical examples** — Code snippets, screenshots, or step-by-step guides.
6. **CTA section** — Link to Ember or AgentForge landing page.
7. **Tags** — 4 relevant Dev.to tags.

## Quality Checklist

- [ ] Primary keyword in title, H1, first paragraph, and conclusion
- [ ] At least 1 internal link to our landing page
- [ ] 800-1500 words (sweet spot for Dev.to)
- [ ] No fluff paragraphs — every section delivers value
- [ ] Includes at least 1 code block or practical example
- [ ] Readability: short paragraphs (3-4 sentences max)

## Publishing

Use Dev.to API to publish as draft first:
```
POST https://dev.to/api/articles
{ "article": { "title": "...", "body_markdown": "...", "published": false, "tags": [...] } }
```

Never auto-publish. Always create as draft for review.
