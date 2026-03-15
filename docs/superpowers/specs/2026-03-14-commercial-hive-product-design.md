# Commercial Hive Product — Design Spec

## Overview

Fork the personal Hive platform into a commercial, multi-tenant AI agent orchestration product. Users sign up, pick or create AI agent teams, and run autonomous tasks via a plug-and-play dashboard. Monetized through a hybrid credits + BYO API key model.

**Target market:** Solo founders, indie hackers, small dev teams, agencies, and enterprises who want autonomous AI agents doing work for them.

**Timeline:** 6 months to launch.

---

## Business Model

### Hybrid Credits + BYO Key

**Credits mode (default):** We provide LLM access, users pay per credit.
- 1 credit = 1 agent step (1 LLM call + tool execution)
- A typical 3-step task = 3 credits
- A 3-agent pipeline = 9-15 credits
- We buy OpenRouter API access and mark up 2-3x

**BYO key mode (Pro/Team option):** Users enter their own OpenRouter or OpenAI API key.
- No credit charges for LLM calls
- Still pay the tier subscription for platform access
- Useful for power users and price-sensitive developers

### Pricing Tiers

| Tier | Price | Credits/mo | Agents | BYO Key | Features |
|------|-------|-----------|--------|---------|----------|
| Free | $0 | 50 | 2 | No | Basic dashboard, 1 pipeline, community support |
| Starter | $19/mo | 500 | 4 | No | Full dashboard, 3 pipelines, email notifications |
| Pro | $49/mo | 2,000 | Unlimited | Yes | All features, skill marketplace, priority support |
| Team | $149/mo | 10,000 | Unlimited | Yes | Multi-user (5 seats), shared workspace, API access |
| Enterprise | Custom | Unlimited | Unlimited | Yes | Self-hosted option, SSO, SLA, dedicated support |

**Overage:** Starter $0.05/credit, Pro $0.04/credit, Team $0.03/credit.

---

## Product Architecture

### Tech Stack

| Layer | Personal Hive | Commercial Product |
|-------|--------------|-------------------|
| Database | SQLite (single file) | PostgreSQL (multi-tenant) |
| Backend | Express 5, single server | Express 5, Docker, horizontal scaling |
| Frontend | React 19 + Vite + Tailwind 4 | Same (fork + rebrand) |
| LLM | OpenRouter (personal key) | OpenRouter (platform key + BYO key) |
| Auth | Session tokens + API key | Supabase Auth or custom JWT + OAuth (Google, GitHub) |
| Billing | None | Stripe Billing (subscriptions + metered usage) |
| Deploy | Lightsail + Netlify | Railway/Render (backend) + Vercel (frontend) |
| Storage | Local filesystem | S3/R2 for file outputs |

### Multi-Tenancy

Every core table gains a `workspace_id` column:
- `tasks`, `task_logs`, `task_traces`, `spend_log`, `revenue_entries`, `pipelines`, `event_triggers`, `skills`, `agent_skills_v2`, `proposals`, `intel_items`, `messages`, `settings`, `memory_embeddings`, `knowledge_documents`, `knowledge_chunks`, `eval_cases`, `eval_runs`, `guardrail_events`, `mcp_servers`, `scheduled_jobs`

New tables:
- `workspaces` — id, name, slug, owner_id, plan, credits_balance, stripe_customer_id, created_at
- `workspace_members` — workspace_id, user_id, role (owner/admin/member/viewer)
- `workspace_api_keys` — workspace_id, key_hash, label, last_used, created_at
- `credit_transactions` — workspace_id, amount, type (purchase/usage/bonus), task_id, created_at

All API queries scoped by `workspace_id` from the authenticated user's session.

### Agent System

**Base framework:** Generic agent creation with customizable:
- Name, avatar, color
- Role description (system prompt)
- Model selection (from supported models list)
- Tool access (which tools this agent can use)
- Skills (SKILL.md instruction packages)

**Pre-built agent packs (templates):**

| Pack | Agents | Use Case |
|------|--------|----------|
| Content Agency | Researcher, Writer, Editor, Publisher | Blog posts, social media, email sequences |
| Dev Team | Architect, Coder, Tester, DevOps | Code generation, PR creation, testing |
| Sales Squad | Prospector, Outreach, Closer, Account Manager | Lead gen, cold email, proposal writing |
| Trading Desk | Analyst, Strategist, Trader, Risk Manager | Market analysis, backtesting, paper trading |
| Research Lab | Scout, Analyst, Synthesizer, Reporter | Deep research, competitive analysis, reports |
| Custom | (blank) | User builds from scratch |

Users can modify any pack or start from scratch. Packs are just pre-configured agent JSON + skills.

### Credit Metering

Middleware in the execution engine:
1. Before each LLM call, check `workspace.credits_balance >= 1`
2. If insufficient credits, pause task with `insufficient_credits` status
3. After LLM call, deduct credits: `1 credit per step` (simple) or `tokens_used / 1000 * rate` (granular)
4. Log to `credit_transactions` table
5. If BYO key mode: skip credit check, route LLM call through user's API key

### Onboarding Flow

1. Sign up (email/password or OAuth with Google/GitHub)
2. Create workspace (name it)
3. Pick an agent pack or start blank
4. Connect API key (optional — skip to use credits)
5. Run a guided first task ("Have your Researcher find 5 trending AI tools")
6. See results, explore dashboard
7. Prompt to upgrade if they hit free tier limits

---

## Features: Keep vs Cut vs Add

### Keep from Personal Hive (core platform)
- ReAct execution loop (tool enforcement, evidence, retry)
- Inter-agent consultation
- Spend tracking and limits
- Real-time trace streaming (SSE)
- Agent memory (auto-curated .md files)
- Skill registry V2 (SKILL.md packages)
- Pipeline builder (chained workflows)
- Event triggers (webhooks)
- Command bar (natural language task creation)
- Mission Control dashboard
- Agent scorecards
- Eval harness (test cases)
- Knowledge base (RAG)
- Push + email notifications
- Approval gates

### Cut from Commercial Version
- Trading dashboard + Alpaca integration (make this a paid add-on pack)
- Revenue panel (personal income tracking — not relevant to generic users)
- Bot generator (too specific to personal Hive's monetization goals)
- Intel feed (fold into a generic "agent findings" view)
- A2A protocol (keep as hidden/advanced feature)
- Personal GitHub tools (replace with generic GitHub integration skill)

### Add for Commercial Version
- Onboarding wizard
- Stripe billing + credit metering
- Workspace settings + team management
- Agent template marketplace (browse, install, share agent configs)
- Skill marketplace (browse, install, share SKILL.md packages)
- Usage analytics (credits burned, cost breakdown, agent efficiency)
- Public API with docs (for developers building on top)
- OAuth login (Google, GitHub)
- Custom domain support (Enterprise)
- Audit log (who did what, when)
- Export/import workspace (backup + migration)

---

## Branding

### Name Research Criteria
- Short (1-2 syllables ideal)
- .com domain available (or affordable)
- No trademark conflicts with existing AI/SaaS products
- Conveys: autonomous, team, intelligence, orchestration
- Memorable and non-generic

### Name Candidates for Scout to Research
- SwarmOS, AgentForge, CrewDeck, Hivemind, Orchestr8
- Synth, Cortex, Axiom, Lattice, Nexus
- Daemon, Colony, Collective, Quorum, Assembly
- Flux, Conductor, Meridian

### Brand Identity Needs
- Logo (wordmark + icon)
- Color palette (dark theme primary, light theme option)
- Typography (display + body fonts)
- Landing page design
- Social media assets (Twitter/X, LinkedIn, Product Hunt)

---

## Agent Work Assignments

### Phase 1: Foundation (Month 1-2)

**Scout tasks:**
- Research all competitor platforms (CrewAI, LangGraph, AutoGPT, Dify, AgentGPT, OpenAI Assistants, Relevance AI, Flowise, n8n AI)
- Analyze pricing, features, reviews, complaints, market positioning
- Research name candidates — check domain availability, trademark conflicts
- Find early adopter communities (subreddits, Discord servers, Twitter accounts)
- Research BYO key vs credits models in existing products

**Forge tasks:**
- Create new GitHub repo for commercial product
- Fork core engine (ReAct loop, tool registry, guardrails)
- Implement PostgreSQL schema with workspace isolation
- Build Docker setup (docker-compose.yml)
- Build onboarding flow (signup, workspace creation, agent pack selection)
- Implement credit metering middleware

**Quill tasks:**
- Write landing page copy (hero, features, pricing, testimonials placeholder)
- Write product documentation structure (getting started, agent creation, skills, pipelines, API)
- Write README for the new repo
- Draft first blog post: "Why we built [Product Name]"

**Dealer tasks:**
- Research distribution channels (Product Hunt, Hacker News, Reddit, Twitter, IndieHackers)
- Identify potential beta testers (AI enthusiasts, indie hackers, agency owners)
- Draft cold outreach templates for beta invites
- Research partnership opportunities (OpenRouter, model providers)

**Oracle tasks:**
- Build financial model: projected costs (API, hosting, support) vs revenue at different user counts
- Analyze competitor pricing to find market sweet spot
- Research credit pricing: what markup is competitive but profitable?

**Nexus tasks:**
- Create project management structure (milestones, sprints, dependencies)
- Review all agent outputs for quality
- Identify blockers and create follow-up tasks
- Weekly retrospective: what's working, what's not

### Phase 2: Product (Month 3-4)

**Scout:** User research, beta feedback, SEO keyword research
**Forge:** Agent template system, skill marketplace, Stripe integration, API documentation
**Quill:** Tutorial content, blog posts, email drip sequences, changelog
**Dealer:** Beta program management, community building, feedback collection
**Oracle:** Usage analytics, churn analysis, pricing optimization
**Nexus:** QA reviews, cross-agent coordination, sprint planning

### Phase 3: Launch (Month 5-6)

**Scout:** PR targets, journalist outreach lists, launch platform research
**Forge:** Performance optimization, load testing, security audit, monitoring
**Quill:** Launch blog, Product Hunt listing, social content calendar
**Dealer:** Product Hunt launch coordination, partnership activations, demo scheduling
**Oracle:** Post-launch metrics dashboards, growth modeling
**Nexus:** Launch checklist management, post-launch retrospective

---

## New Hive Skills Needed

To enable the agents to work on this project autonomously, create these skills:

### 1. product-market-research (Scout)
Research competitor platforms, pricing, features, reviews. Output structured comparison reports.

### 2. brand-development (Scout + Quill)
Research names, check domains, draft brand guidelines, create messaging frameworks.

### 3. commercial-codebase (Forge)
Work in the commercial repo (not personal Hive). PostgreSQL patterns, Docker, multi-tenant architecture, Stripe integration.

### 4. landing-page-builder (Forge + Quill)
Build and iterate on the product landing page. Copy + code in the same workflow.

### 5. go-to-market (Dealer)
Research distribution channels, draft outreach, manage beta program, prepare launch materials.

### 6. financial-modeling (Oracle)
Build cost/revenue projections, analyze pricing, credit economics, unit economics.

### 7. product-sprint-manager (Nexus)
Manage the 6-month product development sprint. Track milestones, review quality, coordinate agents.

---

## New Hive Pipeline

**"Product Development Sprint"**
1. Nexus: Review current sprint status, identify priorities
2. Scout: Research assigned topics, store findings
3. Forge: Build assigned features in commercial repo
4. Quill: Write assigned content/docs
5. Dealer: Execute assigned outreach/research
6. Oracle: Analyze assigned metrics/models
7. Nexus: Review all outputs, score quality, create next sprint tasks

This pipeline runs on a schedule (daily or weekly) to keep the project moving autonomously.

---

## Implementation Order

1. Create new GitHub repo for commercial product
2. Create product development skills (7 skills above)
3. Create product sprint pipeline
4. Seed initial tasks for all 6 agents (Phase 1 work)
5. Set up auto-scheduling (heartbeat or scheduled jobs) to keep agents working
6. Monitor and course-correct weekly

---

## Success Criteria (6-month launch)

- [ ] Working multi-tenant platform with PostgreSQL
- [ ] Stripe billing with credits + BYO key support
- [ ] Onboarding flow with 3+ agent packs
- [ ] Landing page live with pricing
- [ ] Documentation site with getting started guide
- [ ] 50+ beta users signed up
- [ ] Product Hunt launch prepared
- [ ] Docker self-hosted option documented
- [ ] Public API with docs
- [ ] 5+ blog posts published
