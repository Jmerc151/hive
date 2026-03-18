---
name: API Integrations
description: Build and maintain integrations with third-party APIs (Stripe, Hunter.io, Gumroad, Dev.to, Alpaca) following Hive's patterns.
version: "1.0.0"
agents: ["forge"]
tags: ["api", "integrations", "development"]
requires_env: []
requires_tools: ["write_file", "http_request"]
---

# API Integrations

Build reliable API integrations following Hive's established patterns.

## Connected APIs

| Service | Env Var | Purpose | Rate Limit |
|---------|---------|---------|------------|
| Stripe | STRIPE_SECRET_KEY | Payment links, revenue tracking | 100 req/s |
| Hunter.io | HUNTER_API_KEY | Email finder for outreach | 25/month (free) |
| Gumroad | GUMROAD_ACCESS_TOKEN | Digital product sales | 120 req/min |
| Dev.to | DEVTO_API_KEY | Blog publishing | 30 req/30s |
| Netlify | NETLIFY_ACCESS_TOKEN | Deploy static sites | 500 req/min |
| Alpaca | ALPACA_API_KEY + SECRET | Paper trading | 200 req/min |
| OpenRouter | OPENROUTER_API_KEY | LLM calls | Per-plan limits |

## Integration Pattern

When building a new API integration:

1. **Add to server/services/** as a standalone module (ES module, `import`/`export`).
2. **Wrap all calls** in try/catch with structured error logging:
   ```js
   try {
     const res = await fetch(url, { headers: { 'Authorization': `Bearer ${process.env.KEY}` } })
     if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`)
     return await res.json()
   } catch (err) {
     log('error', `service_name failed`, { error: err.message })
     throw err
   }
   ```
3. **Add rate limiting** — track calls per minute, back off on 429s.
4. **Register as an agent tool** in server/index.js tool definitions.
5. **Add env var** to the VM's .env file (document in deployment notes).

## Security Rules

- Never log API keys or secrets.
- Never expose keys in API responses or task output.
- Use environment variables only — no hardcoded keys.
- Validate all external API response shapes before processing.

## Testing

- Test with real API in development (no mocking).
- Verify error handling by testing with invalid keys.
- Check rate limit behavior with rapid sequential calls.
