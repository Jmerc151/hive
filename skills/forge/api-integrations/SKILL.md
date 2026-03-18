---
name: API Integrations
slug: api-integrations
description: Patterns for integrating external APIs and services. Covers auth, error handling, rate limits, and retry logic for all connected platforms.
version: 1.0.0
author: hive
agents: ["forge"]
tags: ["api", "integrations", "services", "http"]
source: clawhub-adapted
requires_env: []
requires_tools: ["write_file", "execute_command", "http_request"]
---

# API Integrations

Standard patterns for connecting Hive to external services. Every integration follows the same error handling, retry, and caching protocol.

## Connected Services

| Service | Env Variable | Purpose | Rate Limit |
|---------|-------------|---------|------------|
| OpenRouter | `OPENROUTER_API_KEY` | LLM inference | Per-model varies |
| Stripe | `STRIPE_SECRET_KEY` | Payment links, revenue | 100 req/sec |
| Hunter.io | `HUNTER_API_KEY` | Email finder | 25 free/month |
| Gumroad | `GUMROAD_ACCESS_TOKEN` | Digital product sales | 30 req/min |
| Dev.to | `DEVTO_API_KEY` | Blog publishing | 30 req/30sec |
| Netlify | `NETLIFY_ACCESS_TOKEN` | Deploy trigger | 500 req/min |
| Alpaca | `ALPACA_API_KEY` + `ALPACA_API_SECRET` | Paper trading | 200 req/min |
| Gmail | `GMAIL_USER` + `GMAIL_APP_PASSWORD` | Email notifications | 500/day |

## Integration Pattern

Every API integration follows this structure:

```javascript
async function callExternalAPI(endpoint, options = {}) {
  const { method = 'GET', body, headers = {}, retries = 2, timeout = 10000 } = options

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeout)
      })

      if (response.status === 429) {
        // Rate limited — back off exponentially
        const wait = Math.pow(2, attempt) * 1000
        await new Promise(r => setTimeout(r, wait))
        continue
      }

      if (!response.ok) {
        throw new Error(`${response.status}: ${await response.text()}`)
      }

      return await response.json()
    } catch (err) {
      if (attempt === retries) throw err
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
    }
  }
}
```

## Auth Patterns

| Auth Type | Header Format | Services |
|-----------|--------------|----------|
| Bearer token | `Authorization: Bearer {token}` | OpenRouter, Netlify, Gumroad |
| API key header | `X-Api-Key: {key}` | Hunter.io |
| API key + secret | Custom per service | Alpaca |
| Basic auth | `Authorization: Basic {base64}` | Gmail SMTP |

## Error Handling Rules

1. **Never expose API keys in logs** — redact before logging
2. **Always check response status** before parsing body
3. **Retry on 429 and 5xx** — max 3 attempts with exponential backoff
4. **Timeout after 10s** for most calls, 30s for LLM inference
5. **Log failures** with endpoint (no auth), status code, and error message
6. **Circuit breaker** — after 5 consecutive failures to same service, pause for 5 minutes

## Caching Strategy

| Data Type | Cache Duration | Storage |
|-----------|---------------|---------|
| Search results | 24 hours | `market_data_cache` table |
| Stock quotes | 1 minute | In-memory |
| Email verification | 7 days | `market_data_cache` table |
| Blog post status | 1 hour | In-memory |

## Adding a New Integration

When Forge builds a new API integration:

1. Add env variable to `.env` on VM (via SSH)
2. Add to `ALLOWED_ORIGINS` if needed
3. Create the integration function following the pattern above
4. Add rate limit tracking
5. Add to the health endpoint check
6. Document in SYSTEM.md
7. Test with a real API call before deploying

## Guardrails

- **Never hardcode secrets** — always use environment variables
- **Respect rate limits** — track and throttle automatically
- **Validate responses** — don't trust external API data blindly
- **Log all external calls** — for debugging and spend tracking
- **Fail gracefully** — return sensible defaults when services are down
