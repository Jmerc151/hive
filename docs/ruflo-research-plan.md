# Ruflo Research Plan — What They're Doing & What We Can Use

**Date:** 2026-03-23
**Repo:** [ruvnet/ruflo](https://github.com/ruvnet/ruflo) (22.5k stars, 2.4k forks)
**Status:** Production-ready v3.5.31, TypeScript, 5,900+ commits

---

## What Is Ruflo?

Ruflo (formerly claude-flow) is an **enterprise AI agent orchestration platform** built on top of Claude Code. It turns Claude Code into a multi-agent development environment with 60+ specialized agents, swarm coordination, self-learning memory, and 215+ MCP tools. Built by rUv (ruvnet).

**Think of it as:** What Hive does for income generation, Ruflo does for software engineering — multi-agent coordination with specialized roles, memory, and intelligent routing.

---

## What Ruflo Does Well (Features Worth Studying)

### 1. Swarm Intelligence & Agent Coordination
- **Hierarchical swarms**: Queen agent coordinates worker agents (like our Nexus → agents pattern but more sophisticated)
- **Topology options**: Hierarchical, Mesh (peer-to-peer), Ring (sequential chain), Star (hub-spoke)
- **Consensus mechanisms**: Majority voting, Byzantine Fault Tolerant (f < n/3), weighted voting (queen votes 3x)
- **Anti-drift**: Frequent checkpoint validation, shared memory namespace, coordinator reviews all outputs

### 2. Self-Learning Memory System
- **Vector-based memory** with HNSW indexing (~61 microsecond search, 16,400 QPS)
- **Multi-scope**: Project-level, file-level, and cross-project user-level patterns
- **Learning loop**: RETRIEVE → JUDGE → DISTILL → CONSOLIDATE → ROUTE
- **Cross-agent knowledge transfer**: agents share learnings automatically
- Hive currently uses flat .md files per agent — Ruflo's approach is far more sophisticated

### 3. Intelligent Task Routing (Q-Learning)
- Routes tasks by complexity without wasting expensive LLM calls:
  - **Simple tasks** → WASM Agent Booster (<1ms, 352x faster than LLM)
  - **Medium tasks** → Haiku/Sonnet (~500ms)
  - **Complex tasks** → Opus + multi-agent swarm (2-5s)
- Uses reinforcement learning (9 RL algorithms) to improve routing over time
- **Token savings**: 30-50% reduction through caching, pattern reuse, optimal batching

### 4. Multi-Provider Failover & Cost Optimization
- Auto-routes to cheapest model meeting quality thresholds
- Automatic provider switching on unavailability (Anthropic, OpenAI, Google, Ollama)
- Claims up to 85% cost reduction vs single-provider
- Hive already does basic fallback (qwen3 → qwen-2.5) but could be much smarter

### 5. Hooks System (17 Lifecycle Hooks)
- **pre-task / post-task**: Intercept task lifecycle
- **on-agent-spawn**: Initialize agents with context
- **on-consensus**: Finalize decisions
- Enables automatic context-triggered worker dispatching

### 6. Plugin Architecture
- Plugin SDK for custom workers, hooks, providers, security modules
- IPFS-based decentralized marketplace for sharing plugins
- Extensible without modifying core

### 7. Security (AIDefence)
- Prompt injection blocking
- Input validation, path traversal prevention
- Command injection detection
- Credential handling with bcrypt

### 8. GitHub Integration Suite
- 13 specialized agents for repo management
- Automated PR management, code review, release coordination
- Checkpoint releases via hooks

---

## What We Should Take for Hive (Prioritized)

### Phase 1: Quick Wins (1-2 days each)

#### 1A. Smart Task Routing by Complexity
**What**: Before sending a task to an agent, classify its complexity and route to the appropriate model tier.
**Why**: We're burning OpenRouter credits sending simple tasks to expensive models. Oracle uses deepseek-r1 for everything — simple lookups don't need that.
**How**:
- Add a `classifyComplexity(task)` function in `server/index.js`
- Simple keyword/pattern matching first (no ML needed)
- Route: simple → cheapest model, medium → default, complex → best model
- Track routing decisions in `task_traces` for optimization
**Ruflo parallel**: Their Q-Learning router, but we start with rules-based

#### 1B. Enhanced Agent Memory with SQLite
**What**: Upgrade agent memory from flat .md files to structured SQLite storage with search.
**Why**: Current .md files are append-only blobs. Agents can't efficiently search past learnings. Ruflo's vector memory is their secret weapon.
**How**:
- New `agent_memory` table: `id, agent_id, category, content, embedding_hash, score, created_at, last_used`
- Keep .md files as human-readable exports, but query from SQLite
- Add memory search endpoint: `GET /api/agents/:id/memory?q=...`
- Simple keyword matching first, upgrade to embeddings later
**Ruflo parallel**: Their multi-scope memory system

#### 1C. Provider Failover with Cost Awareness
**What**: Auto-failover between providers based on availability AND cost.
**Why**: When OpenRouter has issues or a model is down, tasks just fail. Ruflo auto-switches.
**How**:
- Extend model routing in `server/index.js` with failover chain per agent
- Add cost-per-token tracking to `spend_log`
- If primary model fails, try fallback automatically (we have fallbacks defined but they're not automatic enough)
- Log failover events for analysis
**Ruflo parallel**: Their multi-provider failover system

### Phase 2: Medium Effort (3-5 days each)

#### 2A. Agent Consensus for High-Stakes Decisions
**What**: For important decisions (spending money, sending emails, trading), require multiple agents to agree.
**Why**: Agents have spiraled before (the $72 healthcare incident). Ruflo's consensus prevents this.
**How**:
- New `consensus_requests` table
- When a task involves high-stakes tools (send_email, execute_trade, spend > $X), trigger consensus
- Query 2-3 agents for approval before executing
- Majority vote required, Nexus gets weighted vote
- Ties go to "deny" (safe default)
**Ruflo parallel**: Their Byzantine Fault Tolerant consensus

#### 2B. Task Lifecycle Hooks
**What**: Pre-task and post-task hooks that run automatically.
**Why**: We manually handle pre/post logic scattered through the ReAct loop. Hooks make it composable.
**How**:
- New `task_hooks` table: `id, event (pre_task|post_task|on_fail), agent_id, action, config`
- Hook runner in the ReAct loop: before step 1, run pre-hooks; after completion, run post-hooks
- Built-in hooks: auto-memory-save (post), cost-check (pre), notification (post)
- Custom hooks configurable per agent
**Ruflo parallel**: Their 17-hook lifecycle system

#### 2C. Cross-Agent Knowledge Sharing
**What**: When one agent learns something useful, automatically share it with relevant agents.
**Why**: Currently Scout might discover a market insight that Oracle needs, but there's no automatic sharing. Agents are siloed.
**How**:
- Tag memory entries with topics/categories
- When agent saves a memory, check if other agents subscribe to that topic
- Push relevant memories to subscribed agents' context
- Use the existing consultation system as the transport layer
**Ruflo parallel**: Their cross-agent knowledge transfer

### Phase 3: Bigger Bets (1-2 weeks each)

#### 3A. Swarm Mode for Complex Tasks
**What**: Allow Nexus to spawn a coordinated swarm of agents for complex multi-step tasks.
**Why**: Currently tasks are 1 agent, 3 steps max. Complex tasks like "build a landing page" need multiple agents working together.
**How**:
- Nexus becomes the "queen" — decomposes complex tasks into subtasks
- Spawns multiple agents working in parallel (existing pipeline infra can support this)
- Shared context namespace for the swarm
- Nexus aggregates results and handles conflicts
- Auto-dissolve swarm when task completes
**Ruflo parallel**: Their hierarchical swarm with queen/worker pattern

#### 3B. Reinforcement Learning Router
**What**: Replace rules-based routing (Phase 1A) with actual RL that learns from outcomes.
**Why**: Rules are static. RL adapts to what actually works — which models perform best for which task types.
**How**:
- Track: task_type, model_used, success/fail, cost, time, quality_score
- Simple Q-table (not neural): state = task_type, action = model_choice
- Update Q-values based on reward = quality / cost
- Epsilon-greedy exploration (10% random to discover better routes)
- Store Q-table in SQLite, update after each task completion
**Ruflo parallel**: Their Q-Learning router with 9 RL algorithms

#### 3C. MCP Server for Hive
**What**: Expose Hive's capabilities as MCP tools so Claude Code can directly interact with Hive.
**Why**: Ruflo's power comes from MCP integration. If Hive exposes MCP tools, any Claude Code session can create tasks, check agents, query memory.
**How**:
- New `server/mcp.js` — MCP server exposing key Hive operations
- Tools: create_task, check_agent_status, query_memory, get_spend, run_pipeline
- Follows MCP spec for tool definitions
- Can be used from Claude Code CLI or any MCP client
**Ruflo parallel**: Their 215+ MCP tools

---

## What We Should NOT Take from Ruflo

| Ruflo Feature | Why Skip It |
|---|---|
| 60+ agent types | Overkill. Our 6+5 agents cover our use cases. Quality > quantity. |
| WASM Agent Booster | We don't do code transforms. Our agents do business tasks. |
| Neural architecture (SONA, EWC++) | Massive complexity for marginal gain at our scale. |
| Hyperbolic embeddings | Academic flex. Simple keyword/embedding search is fine for us. |
| IPFS plugin marketplace | We're not a platform play (yet). AgentForge is our platform. |
| Docker/Nginx setup | We're on Lightsail + PM2. No need to change infra. |
| 87+ MCP tools | We need maybe 10-15 MCP tools max for our use cases. |

---

## Implementation Priority & Timeline

```
Week 1:  1A (Smart Routing) + 1B (SQLite Memory)
Week 2:  1C (Provider Failover) + 2B (Task Hooks)
Week 3:  2A (Consensus) + 2C (Knowledge Sharing)
Week 4:  3A (Swarm Mode) — design + prototype
Week 5:  3B (RL Router) — after enough routing data collected
Week 6:  3C (MCP Server) — after core features stable
```

## Expected Impact

| Metric | Current | After Ruflo Ideas |
|---|---|---|
| Cost per task | ~$0.05 avg | ~$0.02-0.03 (smart routing) |
| Agent spiral risk | Medium (guardrails) | Low (consensus + anti-drift) |
| Memory recall | Poor (grep .md files) | Good (SQLite + search) |
| Complex task capability | 1 agent, 3 steps | Multi-agent swarms |
| Provider resilience | Basic fallback | Auto-failover with cost optimization |
| Knowledge sharing | Manual (consultations) | Automatic cross-agent transfer |

---

## Sources
- [ruvnet/ruflo on GitHub](https://github.com/ruvnet/ruflo)
- [Ruflo Wiki](https://github.com/ruvnet/ruflo/wiki)
- [Ruflo Releases](https://github.com/ruvnet/ruflo/releases)
- [Ruflo Quick Start](https://github.com/ruvnet/ruflo/wiki/Quick-Start)
- [SkillsLLM - Ruflo](https://skillsllm.com/skill/ruflo)
