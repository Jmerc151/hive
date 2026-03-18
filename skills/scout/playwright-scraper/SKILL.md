---
name: Playwright Scraper
description: Structured web scraping with Playwright for extracting pricing, features, and competitor data from target websites.
version: "1.0.0"
agents: ["scout"]
tags: ["scraping", "research", "competitor-analysis"]
requires_env: []
requires_tools: ["web_search", "http_request"]
---

# Playwright Scraper

Extract structured data from web pages for competitive intelligence and market research.

## When to Use

- Gathering competitor pricing pages
- Extracting product feature lists from SaaS landing pages
- Pulling restaurant menu data for Ember market research
- Collecting structured data from directories or listings

## Process

1. **Identify target URLs** from the task description or via web_search.
2. **Fetch each page** using http_request with a browser-like User-Agent header.
3. **Extract structured data** into JSON:
   - For pricing pages: `{ plan_name, price, billing_cycle, features[] }`
   - For feature lists: `{ product, features[], last_updated }`
   - For directories: `{ name, url, description, category }`
4. **Deduplicate** results by normalizing names and URLs.
5. **Return a markdown table** summarizing findings plus the raw JSON array.

## Output Format

Always return:
- A summary markdown table (max 20 rows)
- A JSON code block with the full structured data
- Source URLs with access timestamps

## Guardrails

- Respect robots.txt — skip pages that disallow scraping.
- Maximum 10 pages per task execution.
- Never scrape login-protected or authenticated content.
- Rate limit: wait 2 seconds between requests to the same domain.
