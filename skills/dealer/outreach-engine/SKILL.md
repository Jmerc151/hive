---
name: Outreach Engine
slug: outreach-engine
description: Multi-channel outreach automation for AgentForge beta customers and Ember restaurant leads. Email sequences, follow-ups, and lead tracking.
version: 1.0.0
author: hive
agents: ["dealer"]
tags: ["outreach", "email", "sales", "leads", "abm"]
source: clawhub-adapted
requires_env: ["HUNTER_API_KEY", "GMAIL_USER", "GMAIL_APP_PASSWORD"]
requires_tools: ["send_email", "http_request", "web_search", "store_memory"]
---

# Outreach Engine

Dealer's playbook for finding and contacting real prospects for AgentForge and Ember. Every email must be personalized, relevant, and to a verified address.

## Campaign Targets

### AgentForge Beta (Primary)
- **Goal**: 5 beta users
- **ICP**: AI developers, indie hackers, small agency founders
- **Channels**: Email, Dev.to comments, product hunt
- **Max**: 5 emails/day

### Ember Restaurants (Secondary)
- **Goal**: 3 paying restaurants at $49/mo
- **ICP**: Independent restaurant owners/managers in Portland
- **Channels**: Email only (requires approval keyword gate)
- **Max**: 3 emails/day

## Lead Research Protocol

Before any outreach:

1. **Find the person** — Use `web_search` to find real decision-makers
2. **Verify the email** — Use Hunter.io API to validate:
   ```
   GET https://api.hunter.io/v2/email-verifier?email={email}&api_key={HUNTER_API_KEY}
   ```
   Only proceed if `result` is `deliverable` or `risky` (never `undeliverable`)
3. **Research their context** — Find something specific about their work to personalize
4. **Log the lead** — Store in memory with status tracking

## Email Templates

### AgentForge Beta Invite

```
Subject: {Name}, building AI agents? Try our platform free

Hi {Name},

I saw your {specific thing — blog post, GitHub repo, tweet}.
Looks like you're already building with AI agents.

We're launching AgentForge — a platform where autonomous agents
research, build, and sell for you. Currently in closed beta with
{X} users.

Would you want early access? It's free during beta.

— John
```

### Ember Restaurant Outreach

```
Subject: Kitchen management for {Restaurant Name}

Hi {Name},

I noticed {specific observation about their restaurant — menu,
reviews, online presence}.

We built Ember to help independent restaurants like yours manage
kitchen operations — recipes, prep lists, staff training — all
in one place. Your kitchen staff can access everything from their
phone via a simple share link.

Would a quick demo be useful? Free for 30 days.

— John
```

## Outreach Rules

### DO
- Personalize every email with something specific about the recipient
- Verify email addresses before sending
- Wait 3+ days between emails to the same person
- Track opens/responses in memory
- A/B test subject lines across batches

### DON'T
- Send to @example.com, @test.com, or any fake domain
- Send more than 5 emails total per day
- Send follow-ups if they asked to stop
- Use aggressive sales language ("limited time", "act now")
- CC or BCC multiple recipients
- Send identical emails to multiple people

## Lead Tracking

Store lead status in memory:

```json
{
  "leads": [
    {
      "name": "Jane Smith",
      "email": "jane@company.com",
      "company": "TechCorp",
      "campaign": "agentforge-beta",
      "status": "emailed",
      "emails_sent": 1,
      "last_contact": "2026-03-18",
      "response": null
    }
  ]
}
```

Status values: `researched` → `verified` → `emailed` → `responded` → `converted` | `declined` | `no_response`

## Follow-Up Cadence

| Day | Action |
|-----|--------|
| 0 | Initial outreach email |
| 4 | Follow-up if no response (different angle) |
| 10 | Final follow-up (softer ask) |
| — | Move to `no_response`, don't contact again |

Max 3 emails per lead. Ever.

## Guardrails

- **5 emails/day hard cap** — enforced in send_email tool
- **Email domain blocklist**: example.com, test.com, fake.com, mailinator.com
- **Approval keyword gate**: "cold email", "contact restaurant", "email outreach" require approval
- **Real people only**: Every recipient must be a real, verified person
- **No spam**: Personalized, relevant, opt-out respected
- **Hunter.io budget**: 25 free verifications/month — use wisely
