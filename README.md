# Hive

Autonomous AI agent team that generates income across digital products, content, freelance services, and market trading. 6 specialized agents research, build, write, sell, trade, and self-improve — all orchestrated from a single dashboard.

## Agents

| Agent | Role | Model |
|-------|------|-------|
| Scout | Market Research & Opportunity Finder | Perplexity Sonar Pro |
| Forge | Product Builder & Developer | DeepSeek R1 |
| Quill | Content Creator & Growth Engine | Claude Haiku |
| Dealer | Sales & Client Acquisition | Claude Haiku |
| Oracle | Market Analyst & Trading Strategist | Claude Sonnet |
| Nexus | Meta-Agent — Team Optimizer | Claude Sonnet |

## Stack

- **Frontend:** React 19 + Vite + Tailwind 4
- **Backend:** Express 5 + better-sqlite3 (SQLite)
- **LLM:** OpenRouter API (multi-model routing per agent)
- **Trading:** Alpaca paper trading + Yahoo Finance
- **Deploy:** AWS Lightsail (backend, PM2) + Netlify (frontend)

## Features

- **ReAct Execution Loop** — 3-step reasoning + action cycle with automatic retries
- **Inter-Agent Consultation** — agents consult each other mid-task via `[CONSULT:agent_id]`
- **Spend Controls** — daily/monthly/per-agent limits with automatic pausing
- **Agent Network Graph** — force-directed visualization of agent collaboration
- **Cost Timeline** — stacked area chart analytics with per-agent and per-task breakdown
- **Scout Intel Feed** — actionable opportunity cards with Send to Forge / Bookmark / Dismiss
- **Command Bar** — natural language task creation via Cmd+K
- **Skill Registry** — SKILL.md instruction packages that inject into agent prompts at runtime
- **Live Trace Stream** — SSE-powered real-time view of agent reasoning steps
- **Chained Pipelines** — multi-step agent workflows
- **Trading Dashboard** — Alpaca paper trading with backtesting and strategy ensemble
- **Approval Gates** — cost threshold and keyword-based approval requirements
- **A/B Prompt Testing** — compare prompt variants head-to-head
- **Agent Scorecards** — per-agent performance metrics and trends
- **Push & Email Notifications** — VAPID web push + Gmail alerts
- **Projects View** — auto-categorized task grouping by theme
- **Agent Memory** — persistent per-agent .md files, auto-curated by Nexus

## Setup

```bash
git clone https://github.com/Jmerc151/hive.git
cd hive
npm install
```

Create a `.env` file:

```env
OPENROUTER_API_KEY=your_key
API_PORT=3002
HIVE_API_KEY=your_api_key
GMAIL_USER=your_email
GMAIL_APP_PASSWORD=your_app_password
HIVE_URL=http://localhost:3002
```

## Development

```bash
npm run dev
```

Frontend runs on `http://localhost:5173`, backend on `http://localhost:3002`.

## Production

```bash
npm run build
npm start
```

Or with PM2:

```bash
pm2 start "node --env-file=.env server/index.js" --name hive
```

## Architecture

```
React 19 (Vite)  ──proxy──▶  Express 5 + SQLite
                                    │
                              OpenRouter API
                            (6 models routed)
                                    │
                        ┌───────────┼───────────┐
                      Alpaca    Yahoo Finance  Gmail
                    (trading)   (market data)  (email)
```

## License

Private project.
