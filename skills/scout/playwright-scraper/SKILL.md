---
name: Playwright Scraper
slug: playwright-scraper
description: Browser automation for web scraping, form filling, and multi-page data extraction. Bypasses JS-rendered sites and anti-bot measures.
version: 1.0.0
author: hive
agents: ["scout"]
tags: ["scraping", "browser", "automation", "research"]
source: clawhub-adapted
requires_env: []
requires_tools: ["web_search", "http_request"]
---

# Playwright Scraper

Headless browser automation for Scout's research missions. Extract structured data from JS-heavy sites that simple HTTP requests can't reach.

## When to Use

- Target site requires JavaScript rendering (SPAs, dashboards, dynamic content)
- Need to fill forms, click through pagination, or follow multi-step flows
- Simple `http_request` returns empty or incomplete HTML
- Scraping competitor pricing, restaurant listings, or product catalogs

## Scraping Protocol

### Step 1: Assess the Target

Before scraping, determine the approach:

| Signal | Approach |
|--------|----------|
| Static HTML, no auth | Use `http_request` directly (cheaper) |
| JS-rendered content | Use this skill's extraction patterns |
| Login required | Use `http_request` with session cookies |
| Rate-limited API | Respect limits, add delays, rotate user-agents |

### Step 2: Extract with Structure

Always extract into structured JSON. Never return raw HTML.

```json
{
  "source_url": "https://example.com/restaurants",
  "extracted_at": "2026-03-18T10:00:00Z",
  "items": [
    {
      "name": "Restaurant Name",
      "address": "123 Main St",
      "rating": 4.5,
      "price_range": "$$",
      "cuisine": "Italian"
    }
  ],
  "metadata": {
    "total_found": 25,
    "pages_scraped": 3,
    "extraction_method": "http_request"
  }
}
```

### Step 3: Validate Output

- Verify item count matches expected results
- Check for empty/null fields that indicate extraction failure
- Cross-reference a sample item against the source page

## Anti-Bot Best Practices

1. **Respect robots.txt** — Check before scraping. Skip disallowed paths.
2. **Rate limit yourself** — Max 1 request/second to any single domain.
3. **Rotate user-agents** — Vary the User-Agent header across requests.
4. **Don't scrape login-walled content** — Only extract publicly accessible data.
5. **Cache aggressively** — Store results in `market_data_cache` table. Don't re-scrape within 24h.

## Ember-Specific Patterns

For restaurant research (Ember's primary market):

- **Google Maps**: Extract name, address, rating, review count, hours, phone
- **Yelp**: Extract rating, price range, cuisine type, review highlights
- **Restaurant websites**: Extract menu items, pricing, specials, contact info
- **Delivery platforms**: Extract menu structure, pricing, delivery radius

## Output Format

Always produce a deliverable table or JSON. Never return "I found some restaurants."

```markdown
| Restaurant | Cuisine | Rating | Reviews | Price | Address |
|-----------|---------|--------|---------|-------|---------|
| Mario's   | Italian | 4.5    | 234     | $$    | 123 Main St |
| Sakura    | Japanese| 4.7    | 189     | $$$   | 456 Oak Ave |
```

## Guardrails

- **3-pillar check**: Only scrape data relevant to Ember, AgentForge, or Trading
- **No PII extraction**: Don't scrape personal email addresses, phone numbers of individuals
- **No paid content**: Don't bypass paywalls or subscription walls
- **Store results**: Always cache extracted data for other agents to reference
