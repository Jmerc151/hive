---
name: SEO Content Writer
slug: seo-content-writer
description: Create SEO-optimized and AEO-optimized content for Ember and AgentForge. Blog posts, landing pages, and social content that ranks and gets cited by AI assistants.
version: 1.0.0
author: hive
agents: ["quill"]
tags: ["seo", "content", "writing", "aeo", "marketing"]
source: clawhub-adapted
requires_env: ["DEVTO_API_KEY"]
requires_tools: ["web_search", "write_file", "http_request"]
---

# SEO Content Writer

Quill's playbook for creating content that ranks in search engines AND gets cited by AI assistants (Answer Engine Optimization).

## Content Strategy by Pillar

### Ember (60% of content effort)
- **Dev.to**: Technical posts about restaurant tech, kitchen management
- **Twitter/X**: Short-form tips, product updates (when connected)
- **Target keywords**: "restaurant kitchen management", "kitchen bible", "restaurant onboarding"

### AgentForge (40% of content effort)
- **Dev.to**: AI agent tutorials, autonomous agent architecture
- **Beehiiv**: Newsletter about AI agent development (when connected)
- **Target keywords**: "AI agent platform", "autonomous agents", "agent marketplace"

## SEO Writing Protocol

### Pre-Writing Research

1. **Keyword research** via `web_search`:
   - Search `"{keyword}" site:dev.to` to see existing competition
   - Search `"{keyword}" 2026` to find the latest angle
   - Identify 3-5 secondary keywords to weave in naturally

2. **Competitor analysis**:
   - Read top 3 ranking articles for the target keyword
   - Identify gaps — what do they miss?
   - Find the unique angle only Ember/AgentForge can provide

### Article Structure

```markdown
# {H1: Primary Keyword + Compelling Hook} (50-60 chars)

{Opening paragraph: State the problem, hint at the solution. 2-3 sentences.}

## {H2: First major section} (include secondary keyword)

{Content with practical examples, code snippets, or data points}

## {H2: Second major section}

{Content — aim for 300+ words per H2 section}

## {H2: Third major section}

{Content with actionable takeaways}

## Key Takeaways

{Bulleted summary — 3-5 points}

---

*{CTA: Try Ember free / Join the AgentForge beta / Subscribe to our newsletter}*
```

### AEO Optimization (Answer Engine Optimization)

Content that AI assistants cite follows these patterns:

1. **Direct answers in first paragraph** — AI pulls from the opening
2. **Structured data** — Tables, numbered lists, definition formats
3. **FAQ sections** — Question-and-answer format with clear headers
4. **Authoritative tone** — First-hand experience, specific numbers
5. **Schema-friendly markup** — Even on Dev.to, use clear heading hierarchy

### AEO Content Template

```markdown
## What is {Topic}?

{One clear sentence definition.}

{2-3 sentences expanding with specific details and numbers.}

### How {Topic} Works

1. **Step one** — {clear explanation}
2. **Step two** — {clear explanation}
3. **Step three** — {clear explanation}

### {Topic} vs {Alternative}

| Feature | {Topic} | {Alternative} |
|---------|---------|---------------|
| {Feature 1} | ✅ | ❌ |
| {Feature 2} | ✅ | ✅ |
```

## Content Quality Checklist

Before publishing any content:

- [ ] Primary keyword in H1, first paragraph, and at least 2 H2s
- [ ] 800-1500 words (sweet spot for Dev.to)
- [ ] At least 1 code snippet, table, or diagram
- [ ] Clear CTA at the end
- [ ] No fluff paragraphs — every sentence adds value
- [ ] Grammarly-clean (no typos, clear sentences)
- [ ] Unique angle — not a rehash of existing content

## Publishing via Dev.to API

```
POST https://dev.to/api/articles
Content-Type: application/json
api-key: {DEVTO_API_KEY}

{
  "article": {
    "title": "...",
    "body_markdown": "...",
    "published": true,
    "tags": ["restaurant", "saas", "ai", "management"]
  }
}
```

Max 4 tags per article on Dev.to. Choose the most relevant.

## Guardrails

- **3-pillar only**: Content must be about Ember, AgentForge, or Trading
- **No AI slop**: Don't produce generic "In today's fast-paced world..." content
- **Factual claims need sources**: Link to data, don't invent statistics
- **Max 2 articles per day**: Quality over quantity
- **No plagiarism**: Original content only. Research for inspiration, don't copy.
