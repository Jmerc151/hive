# CLAUDE.md — Hive: Your AI Income Agent Team

> Copy this file as `CLAUDE.md` into the root of your cloned Hive repo. Claude Code reads it automatically and will know how to help you set up, run, customize, and build with Hive.

---

## What Is Hive?

Hive is an **autonomous AI agent dashboard** — a team of AI agents that research, build, write, sell, trade, and self-improve to generate income. You give them missions, they execute using real tools (web search, code writing, email, trading, GitHub PRs, etc.). Think of it as your AI employee team that works 24/7.

### The 7 Agents
| Agent | Emoji | Role | What They Actually Do |
|-------|-------|------|----------------------|
| **Scout** | 🔭 | Research & Intelligence | Searches the web, finds business opportunities, researches competitors, gathers market data |
| **Forge** | ⚒️ | Product Builder | Writes real code, creates GitHub PRs, builds features, deploys landing pages |
| **Quill** | ✍️ | Content Writer | Writes blog posts, tweets, marketing copy, publishes to Dev.to |
| **Dealer** | 🤝 | Sales & Outreach | Finds leads, sends emails, does outreach (with guardrails so it doesn't spam) |
| **Oracle** | 📊 | Trading & Analysis | Paper trades stocks via Alpaca, analyzes markets, backtests strategies |
| **Nexus** | 🧠 | Strategy & QA | Reviews other agents' work, scores quality, plans weekly sprints, evaluates opportunities |
| **Sentinel** | 🛡️ | QA & Monitoring | Monitors production apps, investigates failures, creates bug fix tasks |

---

## First-Time Setup

### Prerequisites
- **Node.js 22+** (check with `node --version`)
- **An OpenRouter API key** — go to https://openrouter.ai, create account, add $5-10 credits, copy your API key
- **Git** installed

### Step 1: Clone and Install

```bash
git clone https://github.com/Jmerc151/hive.git
cd hive
npm install
```

### Step 2: Create Your `.env` File

Create a file called `.env` in the project root (the `hive/` folder). This is where all your API keys go. **Start with just the essentials:**

```env
# REQUIRED — Agents won't work without this
OPENROUTER_API_KEY=your-openrouter-api-key-here

# REQUIRED — Protects your dashboard from unauthorized access
# Generate a random one: just mash your keyboard or use a UUID generator
HIVE_API_KEY=pick-any-random-string-as-your-password

# Server config
API_PORT=3002
HIVE_URL=http://localhost:3002
ALLOWED_ORIGINS=http://localhost:3333
```

**That's it for now.** You can add more keys later as you need them (see "Optional API Keys" below).

### Step 3: Start Hive

```bash
npm run dev
```

This starts two things:
- **Backend** at http://localhost:3002 (the brain — Express server + SQLite database)
- **Frontend** at http://localhost:3333 (the dashboard — React app)

### Step 4: Open Your Dashboard

1. Go to **http://localhost:3333** in your browser
2. It will ask for your API key — enter the `HIVE_API_KEY` you put in `.env`
3. You're in! You'll see the agent dashboard with all 7 agents

### Step 5: Run Your First Task

1. Click the **"+"** button to create a new task
2. Pick an agent (start with **Scout** — it's the safest, just searches the web)
3. Give it a title like: "Research the top 5 AI SaaS tools launched this month"
4. Add a description with more detail about what you want
5. Click Create — then click the **Run** button on the task
6. Watch the **Trace View** to see the agent think, search, and produce output in real time

---

## How Hive Actually Works

### The ReAct Loop
When an agent runs a task, it follows a loop:
1. **Think** — Reads the task, decides what to do
2. **Act** — Calls a tool (web_search, write_file, send_email, etc.)
3. **Observe** — Reads the tool result
4. Repeat up to 3 times, then produce final output

### Agent Tools (50+)
Agents have real tools — not just chat. They can:
- `web_search` — Search the internet (uses Perplexity internally)
- `deep_research` — Multi-source research synthesis
- `write_file` / `read_file` — Create and read files on disk
- `create_task` — Create tasks for OTHER agents (agents collaborate!)
- `consult_agent` — Ask another agent a quick question mid-task
- `send_email` — Send real emails (requires Gmail setup)
- `store_memory` / `recall_memory` — Remember things between tasks
- `http_request` — Call any API
- `stripe_create_link` — Create Stripe payment links
- `github_write_file` / `github_create_pr` — Push code to GitHub
- `netlify_deploy` — Deploy websites
- `get_quote` / `place_trade` — Stock trading via Alpaca
- And many more...

### Pipelines (Automated Workflows)
Pipelines chain agents together on a schedule:
- Example: Every morning at 9am → Scout researches → Forge builds → Nexus reviews
- Create them in the **Pipeline Builder** in the dashboard

### Heartbeats (Scheduled Tasks)
Recurring tasks that run automatically. Examples:
- Smoke tests every 30 minutes
- Trading session at market open
- Weekly sprint planning on Sundays

### Spend Controls (IMPORTANT!)
Agents cost real money via OpenRouter API calls. Hive has built-in guardrails:
- **Daily limit:** $8/day (all agents combined)
- **Monthly limit:** $100/month
- **Per-agent limits:** Each agent has its own cap
- You can change these in **Settings** on the dashboard

**Monitor your spend:** Check the **Spend Dashboard** in the sidebar. Also check your actual spend at https://openrouter.ai/activity — the internal tracker slightly over-counts.

---

## Making Money with Hive — How to Use It

This is the whole point. Here's the playbook we've developed:

### Step 1: Define Your Business Pillars (Do This First!)

Before you let agents loose, decide on 2-3 business ideas you want to pursue. **Agents will try to expand scope** — having clear pillars keeps them focused.

Example pillars:
- A SaaS product (agents research market, build features, write content, do outreach)
- A trading strategy (Oracle paper trades, you graduate to live when proven)
- Digital products (agents create and sell via Gumroad/Stripe)

**Open the ChatPanel** (chat icon in sidebar) and brainstorm with the agents. Tell Nexus your skills, interests, and goals — it'll help you pick pillars.

### Step 2: Set Up Agent Missions

Edit `agents/agents.json` to customize each agent's system prompt with YOUR specific missions. The system prompt tells the agent what to focus on.

Example: If your pillar is a fitness app:
- Scout: "Research fitness app market, competitor weaknesses, Reddit complaints about existing apps"
- Forge: "Build the fitness app features, create GitHub PRs"
- Quill: "Write fitness content for the blog, social media posts"
- Dealer: "Find personal trainers and gym owners who'd pay for this"

### Step 3: Create Pipelines

Set up automated daily/weekly workflows:
1. Go to **Pipeline Builder** in the sidebar
2. Create a pipeline like: "Morning Research" → Scout researches → Forge builds → Nexus reviews
3. Set a schedule (e.g., 9am weekdays)

### Step 4: Monitor and Guide

Check the dashboard daily:
- **Task Board** — See what agents are working on
- **Spend Dashboard** — Watch your costs
- **Proposals** — Agents will propose ideas; approve or reject them
- **Intel Feed** — Scout surfaces opportunities as actionable cards

### Income Generation Ideas
- **SaaS products** — Scout finds pain points, Forge builds, Dealer sells
- **Digital products** — Forge builds, Quill writes sales copy, sell via Gumroad
- **Content/affiliate** — Quill writes SEO content, monetize with affiliates
- **Trading** — Oracle paper trades, prove strategy, go live
- **Freelance automation** — Use agents to handle client work faster
- **AI consulting** — Use Hive as proof of concept, sell AI services

### Step 5: Create Detailed Roadmaps

For each pillar, have Nexus create a detailed roadmap:
1. Create a task for Nexus: "Create a 30-day roadmap for [your project]. Break it into weekly milestones with specific tasks for each agent."
2. Review the output, refine it
3. Create the tasks from the roadmap
4. Set up pipelines to execute them automatically

---

## Optional API Keys (Add When Ready)

Add these to your `.env` as you need them:

```env
# Email notifications (Gmail)
# Go to Google Account → Security → App Passwords → Generate one
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=your-16-char-app-password

# Stock trading (Alpaca — start with paper trading!)
# Sign up at https://alpaca.markets, get paper trading keys
ALPACA_API_KEY=your-alpaca-key
ALPACA_API_SECRET=your-alpaca-secret
ALPACA_BASE_URL=https://paper-api.alpaca.markets

# Stripe (for creating payment links and selling)
# https://dashboard.stripe.com/apikeys
STRIPE_SECRET_KEY=sk_test_...

# Dev.to (free blog publishing)
# https://dev.to/settings/extensions → Generate API Key
DEVTO_API_KEY=your-devto-key

# Hunter.io (find real email addresses for outreach)
# https://hunter.io/api-keys — 25 free searches/month
HUNTER_API_KEY=your-hunter-key

# Gumroad (sell digital products)
# https://app.gumroad.com/settings/advanced → Application API
GUMROAD_ACCESS_TOKEN=your-gumroad-token

# Netlify (deploy landing pages)
# https://app.netlify.com/user/applications#personal-access-tokens
NETLIFY_ACCESS_TOKEN=your-netlify-token
```

**Don't add keys you don't need yet.** Start with just `OPENROUTER_API_KEY` and `HIVE_API_KEY`. Add others as your projects require them.

---

## Architecture (For When You Want to Modify Things)

```
hive/
├── server/
│   ├── index.js          — Main server (~9000+ lines). ALL routes, agent execution, tools
│   ├── db.js             — SQLite schema (20+ tables, auto-created on first run)
│   ├── traceBus.js       — EventEmitter for real-time SSE streaming
│   ├── routes/sse.js     — SSE endpoints for live trace streaming
│   └── services/         — marketData.js, broker.js, backtest.js, analysis.js, email.js
├── agents/
│   └── agents.json       — Agent definitions (edit this to customize agent missions!)
├── memory/               — Per-agent .md files (agents remember things here)
├── src/
│   ├── App.jsx           — Main dashboard layout
│   ├── components/       — 47 React components
│   └── lib/api.js        — Frontend API client
├── dist/                 — Built frontend (auto-generated by `npm run build`)
├── hive.db               — SQLite database (auto-created on first run)
├── CHANGELOG.md          — Feature log
└── SYSTEM.md             — Architecture docs
```

### Tech Stack
- **Backend:** Express 5, ES modules (`import`/`export`), SQLite via `better-sqlite3`
- **Frontend:** React 19, Vite, Tailwind 4, Recharts (charts), react-force-graph-2d (network graph)
- **AI:** OpenRouter API via `openai` SDK. Agents use Claude Haiku 4.5 (fast/cheap) or Claude Sonnet 4.5 (smart/expensive)
- **Auth:** API key in `Authorization: Bearer` header on all `/api/*` routes
- **Database:** SQLite file (`hive.db`) — zero setup, auto-creates all tables on first run

---

## Coding Standards (If You Build Features)

- **ES modules** — use `import`/`export`, never `require`
- **Tailwind 4** — use existing design tokens in `src/index.css`
- **Mobile-first** — every component must work at 375px width
- **SQLite pattern** — `db.prepare().run/get/all()`
- **Error handling** — wrap async in try/catch, return JSON errors
- **After changes:** run `node --check server/index.js` and `npm run build` to verify

---

## Common Commands

```bash
# Start dev mode (frontend + backend)
npm run dev

# Build frontend for production
npm run build

# Check backend syntax
node --check server/index.js

# Start production server (serves built frontend)
npm start
```

---

## Guardrails & Safety (Already Built In)

Hive has learned some hard lessons. These guardrails are already active:

- **Spend limits** — Daily and monthly caps prevent runaway costs
- **Topic blocklist** — Agents can't create tasks about blocked topics
- **Auto-task cap** — Max 5 auto-generated tasks per day
- **Chain depth limit** — Agents can only chain 3 levels deep
- **Fake email blocking** — Agents can't email fake/test domains
- **Revenue validation** — Agents can't log fake revenue
- **Auto-unstick** — Tasks stuck >15 minutes get automatically reset

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "OPENROUTER_API_KEY not set" | Add it to `.env` and restart the server |
| Blank dashboard | Enter your `HIVE_API_KEY` in the auth prompt |
| Tasks stuck in "in_progress" | Restart the server — auto-unstick runs on startup |
| Agent produces text-only output (no tool calls) | Check the agent's model in `agents.json` — must be a model that supports function calling |
| "429 Too Many Requests" | You hit a spend limit. Check Settings → increase daily/monthly limit |
| Port 3002 already in use | Change `API_PORT` in `.env` |
| Frontend not loading | Make sure you're going to http://localhost:3333 (not 3002) in dev mode |

---

## Tips from Experience

1. **Start small.** Give Scout a simple research task first. Watch the trace. Understand how it works before going big.
2. **Set low spend limits initially.** $3/day, $30/month. Increase as you trust the system.
3. **Agents will try to expand scope.** They'll propose random businesses. Reject anything outside your pillars.
4. **Check OpenRouter dashboard** for real spend. The internal tracker slightly over-counts.
5. **Customize agent prompts.** The default prompts are tuned for our businesses. Edit `agents/agents.json` to match YOUR goals.
6. **Use Nexus for planning.** Create a task: "Plan a 4-week roadmap for [your idea]." It's the strategist.
7. **Use Scout before building.** Always research first. "Is there demand for X?" before "Build X."
8. **Approve proposals carefully.** Agents propose ideas in the Proposals panel. Read them. Reject the bad ones.
9. **Memory is persistent.** Agents store learnings in `memory/*.md` files. Check these to see what they've learned.
10. **Pipelines are powerful.** A daily pipeline of Scout → Forge → Nexus can ship features while you sleep.

---

## Brainstorming Income Ideas (Do This On Day 1)

This is the most important section. Before you touch code or configure agents, you need to figure out WHAT to build. Here's exactly how:

### The Brainstorm Session

Create these tasks in this order. Wait for each to finish before the next:

**Task 1 — Scout: Personal Inventory**
```
Title: "Brainstorm business opportunities based on my background"
Agent: Scout
Description: "Search for profitable SaaS, digital product, and service business ideas in these areas: [LIST YOUR SKILLS, INTERESTS, INDUSTRY EXPERIENCE]. For each idea, find: market size, existing competitors, what they charge, gaps in their product, and effort to build an MVP. Output as a ranked table with revenue potential."
```

**Task 2 — Nexus: Evaluate Top Ideas**
```
Title: "Evaluate the top 5 business ideas from Scout's research"
Agent: Nexus
Description: "Review Scout's recent research output. Score each idea on: (1) Revenue potential, (2) Time to first dollar, (3) Technical complexity, (4) Competition level, (5) Your ability to differentiate. Recommend the top 2-3 as business pillars with reasoning."
```

**Task 3 — Scout: Deep Dive on Winners**
```
Title: "Deep research on [WINNING IDEA]: competitors, pricing, target customers"
Agent: Scout
Description: "Do a comprehensive competitive analysis of [WINNING IDEA]. Find: every competitor and what they charge, their weakest reviews on G2/Capterra/Reddit, features users are begging for, who the ideal customer is (job title, company size, pain points), and what a realistic MVP would look like."
```

### What Makes a Good Business Pillar

From our experience, the best Hive projects have:
- **Narrow focus** — "Kitchen management for restaurants" beats "Business management software"
- **Clear buyer** — You can describe the exact person who pays. "Restaurant owners with 20-50 staff" not "anyone who runs a business"
- **$50-200/mo price point** — High enough to be real revenue, low enough that SMBs can afford it
- **Content moat** — Quill can write content that drives organic traffic
- **Automatable outreach** — Dealer can find and email real prospects
- **Buildable by Forge** — The agents can actually build it via GitHub PRs

### Red Flags (Avoid These)
- "AI for enterprise" — Too broad, sales cycle too long
- Anything requiring massive upfront capital
- Hardware/physical products — Agents can't ship boxes
- Ideas that need heavy regulation compliance (healthcare, finance, etc.)
- Marketplaces — Two-sided markets are brutal to bootstrap

---

## Building Your Roadmap (After Brainstorming)

Once you've picked your 2-3 pillars, use Nexus to build a real execution plan:

### Create the Master Roadmap

```
Title: "Create 90-day execution roadmap for [YOUR PROJECT]"
Agent: Nexus
Description: "Build a detailed 90-day roadmap broken into 3 phases:

PHASE 1 (Days 1-30): Foundation
- What needs to be built for a working MVP?
- What research needs to happen first?
- What content should we start publishing?

PHASE 2 (Days 31-60): Launch
- How do we get our first 5 users?
- What's the outreach strategy?
- What features are must-have vs nice-to-have?

PHASE 3 (Days 61-90): Revenue
- How do we convert free users to paid?
- What's the pricing strategy?
- What should we double down on vs cut?

For EACH week, list specific tasks with the agent responsible (Scout, Forge, Quill, Dealer). Output as a structured weekly breakdown I can turn into pipeline tasks."
```

### Turn Roadmap Into Pipelines

After Nexus produces the roadmap:

1. **Create weekly tasks** from the roadmap milestones
2. **Set up pipelines** for recurring work:
   - "Daily Dev Sprint" — Scout research → Forge build → Nexus QA (weekday mornings)
   - "Content Pipeline" — Scout topic research → Quill writes → Dealer promotes (3x/week)
   - "Outreach Pipeline" — Scout find leads → Dealer email (daily, max 5 emails/day)
   - "Weekly Review" — Nexus reviews everything → plans next week (Sundays)
3. **Set up heartbeats** for automated recurring tasks in the Schedule panel

### Updating Agent Missions

Once you have your pillars, edit `agents/agents.json` to give each agent clear missions tied to YOUR business:

```json
{
  "id": "scout",
  "systemPrompt": "You are Scout. You have 3 missions:\n\nMISSION 1 — [YOUR PRODUCT] INTELLIGENCE (weekly):\nResearch [your target market]. Find pain points, competitors, pricing...\n\nMISSION 2 — [YOUR SECOND PILLAR] (weekly):\n...\n\nMISSION 3 — OPPORTUNITY SCANNING (weekly):\nFind new business opportunities related to [your skills/interests]..."
}
```

The key is being SPECIFIC. Don't say "research business opportunities." Say "Search Reddit r/[your_niche] for complaints about [competitor]. Find threads with 50+ upvotes about missing features."

---

## Day-by-Day Getting Started Guide

### Day 1: Setup + Brainstorm
- [ ] Clone repo, install, create `.env`, start Hive
- [ ] Run your first Scout task (simple research to test it works)
- [ ] Watch the Trace View to understand how agents think
- [ ] Run the brainstorm tasks above to find your business pillars
- [ ] Set spend limits low ($3/day, $30/month)

### Day 2: Deep Research
- [ ] Have Scout deep-dive your top 2-3 ideas
- [ ] Have Nexus evaluate and rank them
- [ ] Pick your 2-3 pillars
- [ ] Start customizing agent prompts in `agents/agents.json`

### Day 3: Roadmap + Pipelines
- [ ] Have Nexus create your 90-day roadmap
- [ ] Create your first pipeline (Scout → Forge → Nexus)
- [ ] Set up a daily heartbeat for your primary pillar
- [ ] Start monitoring the dashboard regularly

### Day 4: Content + Outreach
- [ ] Have Quill write your first blog post (publish to Dev.to if relevant)
- [ ] Have Scout find 10 target customers with contact info
- [ ] Set up Gmail app password for email notifications
- [ ] Start reviewing Proposals panel daily

### Day 5+: Iterate
- [ ] Review agent outputs daily — reject bad ideas, approve good ones
- [ ] Check spend dashboard — adjust limits as needed
- [ ] Refine agent prompts based on output quality
- [ ] Add more API keys as needed (Stripe, Hunter.io, Alpaca)
- [ ] Create new pipelines for workflows that should be automated

---

## Trading Setup (Optional)

If one of your pillars involves stock trading:

1. Sign up at https://alpaca.markets (free paper trading account)
2. Get your API keys from the dashboard
3. Add to `.env`: `ALPACA_API_KEY`, `ALPACA_API_SECRET`, `ALPACA_BASE_URL=https://paper-api.alpaca.markets`
4. Oracle will scan SPY, QQQ, AAPL, NVDA, MSFT, TSLA, AMZN for RSI signals
5. **ALWAYS start with paper trading.** Prove the strategy works over 60+ days before considering real money.
6. Oracle follows RSI Mean Reversion: buys when RSI < 32 (oversold), sells when RSI > 72 (overbought)
7. Guardrails: max $1000/position, max 3 trades/day

---

## What Claude Code Can Help You With

Ask your Claude Code to:
- "Help me brainstorm business ideas using Hive" → It'll guide you through the process above
- "Customize my agent prompts for [your business]" → It'll edit `agents/agents.json`
- "Create a pipeline for [daily research / content / outreach]" → It'll set it up via the API
- "Build a new feature for the dashboard" → It'll write React components + Express endpoints
- "Debug why [agent] is producing bad output" → It'll check traces, prompts, and tool configs
- "Deploy Hive to a cloud server" → It'll help with AWS/Lightsail/Railway setup
- "Create a roadmap for [project]" → It'll create the right Nexus tasks
- "Add a new tool for agents" → It'll add it to server/index.js
- "Check what agents did today" → It'll query the API and summarize

---

## Key Lessons (Learned the Hard Way)

1. **Agents spiral without guardrails.** They'll invent fake businesses and burn money. Keep topic blocklists and spend limits tight.
2. **Agents log fake revenue.** Revenue validation requires real transaction IDs. Don't trust revenue numbers without proof.
3. **Agents send fake emails.** Fake domains (example.com, test.com) are blocked in the send_email tool.
4. **Check OpenRouter dashboard for real spend.** Internal tracker over-counts by 10-30%.
5. **Monthly spend limit is the real blocker.** If you hit it, ALL tasks fail with 429. Check this first when debugging.
6. **Start with 2-3 pillars, not 10.** Focus beats breadth. Agents will try to expand — block it.
7. **Customize prompts early.** The default prompts are for someone else's business. Make them yours.
8. **Research before building.** Every good product starts with Scout finding a real problem.
9. **Review proposals carefully.** Agents propose ideas daily. Most are noise. Approve only the best.
10. **Pipelines > manual tasks.** The real power is automated workflows that run while you sleep.
