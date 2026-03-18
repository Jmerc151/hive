---
name: Agent Mode Upgrades
slug: agent-mode-upgrades
description: Enhanced execution modes for all agents. Defines focused mode, deep research mode, creative mode, and audit mode for different task types.
version: 1.0.0
author: hive
agents: ["scout", "forge", "quill", "dealer", "oracle", "nexus", "sentinel"]
tags: ["modes", "execution", "enhancement", "focus", "meta"]
source: custom
requires_env: []
requires_tools: []
---

# Agent Mode Upgrades

Enhanced execution modes that modify agent behavior for specific task types. Agents activate modes based on task requirements.

## Available Modes

### Focused Mode (Default)
Standard execution. 3-step ReAct loop, normal guardrails.

**When**: Regular tasks, routine work
**Behavior**: Standard tool usage, balanced quality/speed

### Deep Research Mode
Extended research with higher quality standards.

**When**: Market analysis, competitive intelligence, opportunity evaluation
**Behavior**:
- Use 5+ search queries instead of 1-2
- Cross-reference findings from 3+ sources
- Produce detailed tables with citations for every claim
- Spend up to 2x normal step budget on research quality
- Always include a "Confidence Assessment" section:

```markdown
### Confidence Assessment
| Finding | Confidence | Basis |
|---------|-----------|-------|
| Market size $2.1B | High | 3 concordant sources |
| Growth rate 15% | Medium | 2 sources, 1 outdated |
| Competitor pricing | Low | 1 source, unverified |
```

### Creative Mode
Expanded creative latitude for content and product ideas.

**When**: Content creation, product naming, feature brainstorming, marketing copy
**Behavior**:
- Generate 3-5 alternatives before selecting the best
- A/B test headlines and hooks
- Use unconventional angles and analogies
- Break from templates when the content benefits
- Include a "Why This Angle" section explaining creative choices

### Audit Mode
Strict verification and fact-checking mode.

**When**: QA reviews, financial data verification, production monitoring
**Behavior**:
- Verify every claim independently
- Check every URL is reachable
- Validate every number against its source
- Produce a verification matrix:

```markdown
### Verification Matrix
| Claim | Source | Verified | Method |
|-------|--------|----------|--------|
| Revenue $147 MRR target | CLAUDE.md | ✅ | Direct reference |
| 3 restaurants needed | CLAUDE.md | ✅ | Direct reference |
| Toast pricing $69/mo | toast.com | ⚠️ | Last checked Mar 10 |
```

### Sprint Mode
Rapid execution for time-sensitive work.

**When**: Production incidents, urgent bug fixes, time-boxed tasks
**Behavior**:
- Skip optional research steps
- Go straight to action
- Produce minimum viable output
- Flag anything skipped for follow-up
- Max execution time: 5 minutes

## Mode Selection

Agents auto-select modes based on task signals:

| Task Signal | Mode |
|------------|------|
| Contains "research", "analyze", "investigate" | Deep Research |
| Contains "write", "create content", "draft" | Creative |
| Contains "review", "audit", "verify", "QA" | Audit |
| Contains "urgent", "fix", "broken", "down" | Sprint |
| Default / no signal | Focused |

## Mode Stacking

Modes can be combined when needed:

- **Deep Research + Audit** = Verified deep research (for Oracle's trading analysis)
- **Creative + Focused** = Creative but efficient (for Quill's routine content)
- **Sprint + Audit** = Quick but verified (for Sentinel's incident response)

Never stack more than 2 modes — complexity kills speed.

## Mode-Specific Cost Budgets

| Mode | Max Steps | Max Tool Calls | Model |
|------|-----------|---------------|-------|
| Focused | 3 | 10 | Agent's default |
| Deep Research | 3 | 15 | Agent's default |
| Creative | 3 | 8 | Agent's default |
| Audit | 3 | 12 | Agent's default |
| Sprint | 2 | 5 | Agent's default |

## Output Quality by Mode

| Mode | Min Output Length | Required Sections |
|------|------------------|-------------------|
| Focused | 200 words | Summary, Results |
| Deep Research | 500 words | Summary, Results, Sources, Confidence |
| Creative | 300 words | Options, Selected, Rationale |
| Audit | 300 words | Findings, Verification Matrix |
| Sprint | 100 words | Action Taken, Status |

## Guardrails

- **Mode doesn't override safety** — all guardrails active in every mode
- **3-pillar check still applies** — even in Sprint mode
- **Spend limits respected** — Deep Research doesn't get extra budget
- **Log the mode** — task output should note which mode was used
- **Nexus can override** — if a task is using the wrong mode, Nexus reassigns
