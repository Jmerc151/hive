---
name: Outreach Engine
description: Structured cold outreach workflow for AgentForge beta users with email finding, personalization, and follow-up sequences.
version: "1.0.0"
agents: ["dealer"]
tags: ["outreach", "sales", "email", "growth"]
requires_env: ["HUNTER_API_KEY"]
requires_tools: ["web_search", "http_request", "send_email"]
---

# Outreach Engine

Find and engage potential AgentForge beta users through structured outreach.

## Daily Limits (HARD CAPS)

- Maximum 5 emails per day (across all outreach)
- Maximum 3 new prospects researched per day
- Never email the same person twice within 7 days
- Never use fake sender names or misleading subject lines

## Prospect Qualification

Before any outreach, verify the prospect matches:

| Criteria | Required | Ideal |
|----------|----------|-------|
| Builds with AI/LLMs | Yes | — |
| Active on GitHub/Twitter | Yes | 100+ followers |
| Indie hacker or small team | Yes | 1-5 people |
| Has shipped a product | Preferred | Recently launched |
| Located in US/EU | Preferred | — |

## Outreach Sequence

### Step 1: Find (via Hunter.io)
```
GET https://api.hunter.io/v2/email-finder?domain={domain}&first_name={first}&last_name={last}&api_key={key}
```
Only use verified emails (confidence > 80%).

### Step 2: Personalize
Research the prospect (GitHub repos, recent tweets, blog posts). Reference something specific in the email. Generic templates get ignored.

### Step 3: Email Template
```
Subject: [Something specific about their work] + AI agents

Hi {first_name},

[1 sentence referencing their specific work — a repo, blog post, or product]

I'm building AgentForge — [1 sentence pitch]. We're looking for 5 beta users who build with AI.

Would you be open to a 15-min call this week?

Best,
John
```

### Step 4: Track
Store outreach in memory: prospect name, email, date sent, response status.

## Blocked Domains

NEVER send to these domains:
- example.com, test.com, fake.com, mailinator.com
- Any domain that doesn't resolve
- Personal email domains (gmail, yahoo, hotmail) unless prospect is a solo founder

## Anti-Spam Rules

- Emails must have a clear unsubscribe option
- No deceptive subject lines
- No bulk sending — every email must be individually personalized
- Stop immediately if someone asks to be removed
