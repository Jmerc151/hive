---
name: Capability Evolver
slug: capability-evolver
description: Self-evolution engine adapted from ClawHub. Analyzes Oracle's trading history to identify strategy improvements and optimize signal detection over time.
version: 1.0.0
author: hive
agents: ["oracle"]
tags: ["meta", "self-improvement", "evolution", "trading"]
source: clawhub-adapted
requires_env: []
requires_tools: ["store_memory", "recall_memory", "http_request"]
---

# Capability Evolver

Adapted from ClawHub's #2 most-downloaded skill (35K+). Enables Oracle to analyze its own trading performance and evolve its strategies over time.

## Evolution Cycle

Run weekly (Sunday evening, after market close):

### Step 1: Collect Performance Data

Query the last 7 days of trades:
- Win/loss ratio
- Average return per trade
- Signal accuracy (did the signal predict the right direction?)
- Holding period distribution
- Which symbols performed best/worst

### Step 2: Identify Patterns

Look for:
- **Winning patterns**: Which signal combinations led to profitable trades?
- **Losing patterns**: Which signals gave false positives?
- **Missed opportunities**: Watchlist stocks that moved significantly but no signal fired
- **Timing issues**: Were entries too early/late?

### Step 3: Generate Improvement Hypotheses

```markdown
## Evolution Report — Week of {Date}

### Performance Summary
- Trades: {N} | Wins: {W} | Losses: {L} | Win Rate: {%}
- Total P&L: ${amount}
- Best trade: {symbol} +{%}
- Worst trade: {symbol} -{%}

### Patterns Identified
1. {Pattern description with data}
2. {Pattern description with data}

### Improvement Hypotheses
1. **Hypothesis**: {specific change to strategy}
   - **Evidence**: {data supporting this change}
   - **Risk**: {what could go wrong}
   - **Test**: {how to validate in next week}

### Parameter Adjustments (Proposed)
| Parameter | Current | Proposed | Reason |
|-----------|---------|----------|--------|
| RSI oversold | 30 | 28 | Too many false buys at 30 |
| Position size | $1000 | $800 | Reduce exposure on volatile names |
```

### Step 4: Apply Changes (With Review)

Changes to trading parameters require human review:

- **Auto-apply**: Memory updates, pattern logs, narrative reflections
- **Requires approval**: RSI thresholds, position sizes, watchlist changes, new indicators
- **Never auto-apply**: Adding new symbols, changing max trades/day, enabling live trading

## Evolution Memory

Store evolution state in Oracle's memory file (`memory/oracle.md`):

```markdown
## Trading Evolution Log

### Week 12 (Mar 11-17, 2026)
- Win rate: 62% (8/13 trades)
- Observation: TSLA RSI signals unreliable due to high volatility
- Action: Tightened TSLA RSI thresholds to 25/75 (from 30/70)
- Result: TBD next week

### Week 11 (Mar 4-10, 2026)
- Win rate: 55% (6/11 trades)
- Observation: Morning entries outperform afternoon entries
- Action: Prioritize 9:31 AM session, reduce 3:55 PM trades
- Result: Week 12 morning win rate improved to 70%
```

## Evolution Strategies

Borrowed from ClawHub's GEP protocol, simplified for trading:

| Strategy | When to Use | Behavior |
|----------|------------|----------|
| **Balanced** | Default | Equal weight to innovation and stability |
| **Harden** | After losing week | Focus on tightening stop-losses, reducing position sizes |
| **Innovate** | After winning week | Test new indicators, expand analysis |
| **Repair-only** | After 3+ losing days | Only fix broken signals, no new features |

## Safety Protocol

- **No self-modification of trade execution code** — only parameters and memory
- **All changes logged** — complete audit trail in memory
- **Rollback on failure** — if a parameter change leads to 3+ consecutive losses, revert
- **Human review weekly** — Nexus reviews Oracle's evolution report every Sunday
- **Paper trading only** — evolution applies to paper account exclusively

## Guardrails

- Max 2 parameter changes per week
- Never increase position size above $1,000
- Never add symbols outside the approved watchlist without approval
- Never change the max 3 trades/day limit
- Log every hypothesis, even ones not acted on
