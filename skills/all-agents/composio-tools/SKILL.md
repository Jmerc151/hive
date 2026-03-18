---
name: Composio Tools
slug: composio-tools
description: External platform integration patterns via Composio-style tool connections. Covers Stripe, Hunter.io, Gumroad, Dev.to, Netlify, Alpaca, and Gmail.
version: 1.0.0
author: hive
agents: ["scout", "forge", "quill", "dealer", "oracle", "nexus", "sentinel"]
tags: ["integrations", "tools", "api", "composio", "platforms"]
source: clawhub-adapted
requires_env: []
requires_tools: ["http_request"]
---

# Composio Tools

Hive's 50+ tools organized by platform integration. Reference for all agents to know what external capabilities are available.

## Connected Platforms

### Stripe (Payments & Revenue)
**Env**: `STRIPE_SECRET_KEY` (sk_live)

| Tool | Purpose | Used By |
|------|---------|---------|
| Create payment link | Generate Stripe checkout URLs | Dealer, Forge |
| Check balance | View current Stripe balance | Nexus |
| List transactions | Revenue tracking and attribution | Nexus |

```
# Create a payment link
POST https://api.stripe.com/v1/payment_links
Authorization: Bearer {STRIPE_SECRET_KEY}
```

### Hunter.io (Email Discovery)
**Env**: `HUNTER_API_KEY` | **Limit**: 25 verifications/month

| Tool | Purpose | Used By |
|------|---------|---------|
| Verify email | Check if email is deliverable | Dealer |
| Find email | Find email by name + domain | Dealer |
| Domain search | Find all emails at a domain | Scout, Dealer |

```
# Verify an email
GET https://api.hunter.io/v2/email-verifier?email={email}&api_key={HUNTER_API_KEY}
```

### Gumroad (Digital Products)
**Env**: `GUMROAD_ACCESS_TOKEN`

| Tool | Purpose | Used By |
|------|---------|---------|
| List products | Check product catalog | Dealer, Nexus |
| Get sales | Revenue from digital products | Nexus |
| Create product | List new digital products | Forge |

### Dev.to (Blog Publishing)
**Env**: `DEVTO_API_KEY` | **Limit**: 30 req/30sec

| Tool | Purpose | Used By |
|------|---------|---------|
| Create article | Publish blog posts | Quill |
| List articles | Check published content | Quill, Nexus |
| Get article stats | Track views, reactions | Quill, Nexus |

### Netlify (Deploy & Hosting)
**Env**: `NETLIFY_ACCESS_TOKEN`

| Tool | Purpose | Used By |
|------|---------|---------|
| Trigger deploy | Deploy frontend updates | Forge |
| Get deploy status | Check deployment progress | Forge, Sentinel |
| List sites | Inventory of hosted sites | Nexus |

### Alpaca (Paper Trading)
**Env**: `ALPACA_API_KEY` + `ALPACA_API_SECRET`

| Tool | Purpose | Used By |
|------|---------|---------|
| Place order | Execute paper trades | Oracle |
| Get positions | Check portfolio | Oracle, Nexus |
| Get account | Account balance and equity | Oracle, Nexus |
| Get bars | Historical price data | Oracle |
| Get quote | Real-time price quote | Oracle |

### Gmail (Notifications)
**Env**: `GMAIL_USER` + `GMAIL_APP_PASSWORD`

| Tool | Purpose | Used By |
|------|---------|---------|
| Send email | Notifications, outreach, alerts | All agents |

**Rules**: Max 500/day, no fake domains, approval keywords enforced.

## Not Yet Connected

| Platform | Env Variable | Purpose | Blocker |
|----------|-------------|---------|---------|
| Beehiiv | `BEEHIIV_API_KEY` | Newsletter | Needs Stripe identity verification |
| Twitter/X | `TWITTER_API_KEY` | Social posting | $100/mo — skip for now |
| Reddit | `REDDIT_CLIENT_ID` | Community engagement | Needs app approval |
| Medium | `MEDIUM_TOKEN` | Cross-posting | Not prioritized |
| Replicate | `REPLICATE_API_TOKEN` | AI image generation | Not prioritized |
| ElevenLabs | `ELEVENLABS_API_KEY` | Voice synthesis | Not prioritized |

## Tool Selection Guide

When an agent needs to interact with an external platform:

1. **Check this skill** — see if the integration exists
2. **Check env var** — is the API key configured?
3. **Use http_request** — make the API call with proper auth
4. **Handle errors** — retry on 429/5xx, fail gracefully on 4xx
5. **Log the interaction** — for spend tracking and debugging

## Adding New Integrations

When a new platform needs to be connected:

1. Obtain API key (Forge or John)
2. Add env var to `.env` on Lightsail VM
3. Add to this skill's Connected Platforms table
4. Create tool wrapper function in `server/index.js`
5. Test with a real API call
6. Update SYSTEM.md

## Guardrails

- **Never expose API keys in task output** — redact before logging
- **Respect rate limits** — check the platform's limits before calling
- **No unauthorized accounts** — never create accounts on external platforms
- **Track spend** — API calls that cost money must be logged
- **Fail gracefully** — if a platform is down, don't block the task
