---
name: Signal Analyzer
slug: signal-analyzer
description: Technical analysis signal detection for Oracle's trading decisions. RSI, MACD, volume analysis, and multi-timeframe pattern recognition on watchlist stocks.
version: 1.0.0
author: hive
agents: ["oracle"]
tags: ["trading", "signals", "technical-analysis", "stocks"]
source: custom
requires_env: ["ALPACA_API_KEY", "ALPACA_API_SECRET"]
requires_tools: ["http_request", "store_memory"]
---

# Signal Analyzer

Oracle's technical analysis engine for paper trading. Detects entry/exit signals on the watchlist using RSI Mean Reversion and supporting indicators.

## Watchlist

`SPY, QQQ, AAPL, NVDA, MSFT, TSLA, AMZN`

## Primary Strategy: RSI Mean Reversion

Oracle's core strategy. Buy when oversold, sell when overbought.

### Signal Definitions

| Signal | Condition | Action |
|--------|----------|--------|
| **Strong Buy** | RSI(14) < 25 AND price above 200-day SMA | BUY with full position size |
| **Buy** | RSI(14) < 30 AND volume > 20-day avg | BUY with half position size |
| **Hold** | RSI(14) between 30-70 | No action |
| **Sell** | RSI(14) > 70 AND held for > 1 day | SELL half position |
| **Strong Sell** | RSI(14) > 80 | SELL full position |

### Supporting Indicators

Check these to confirm/deny the RSI signal:

| Indicator | Bullish | Bearish |
|-----------|---------|---------|
| MACD | MACD crosses above signal line | MACD crosses below signal line |
| Volume | Above 20-day average on buy signal | Below average (weak conviction) |
| 50/200 SMA | Price above both (uptrend) | Price below both (downtrend) |
| Bollinger Bands | Price touches lower band | Price touches upper band |

### Signal Scoring

Each signal gets a confidence score 0-100:

```
score = 0
if RSI < 30: score += 40
if MACD bullish crossover: score += 20
if volume above average: score += 15
if price > 200-day SMA: score += 15
if price near lower Bollinger: score += 10
```

- Score > 70: Strong signal, execute trade
- Score 50-70: Moderate signal, reduce position size
- Score < 50: Weak signal, skip

## Analysis Output Format

```markdown
## Signal Analysis — {Date} {Time}

### Market Overview
{1-2 sentences on overall market direction}

### Signals Detected

| Symbol | RSI(14) | MACD | Volume | Signal | Score | Action |
|--------|---------|------|--------|--------|-------|--------|
| AAPL   | 28.3    | Bull | 1.2x   | Buy    | 75    | BUY 10 shares |
| TSLA   | 72.1    | Bear | 0.8x   | Hold   | 35    | No action |

### Trade Recommendations
1. **BUY AAPL** — RSI oversold at 28.3, MACD bullish crossover, volume confirming. Buy 10 shares at market. Stop-loss at -3%.
2. No other actionable signals.

### Position Summary
| Symbol | Shares | Avg Cost | Current | P&L |
|--------|--------|----------|---------|-----|
| SPY    | 5      | $520.00  | $525.30 | +$26.50 |
```

## Trade Constraints

These are hard rules — never override:

- **Max $1,000 per position** — enforced in trade tool
- **Max 3 trades per day** — tracked in spend_log
- **Paper trading ONLY** — Alpaca paper account, no live trading
- **No options, no crypto** — equities only on the watchlist
- **Stop-loss required** — Every position must have a -5% stop-loss
- **No trading during earnings week** — Skip the symbol for 1 week around earnings date

## Data Sources

| Data | Source | Endpoint |
|------|--------|----------|
| Price/volume | Yahoo Finance | via `marketData.js` |
| Trade execution | Alpaca Paper | `ALPACA_BASE_URL/v2/orders` |
| Position info | Alpaca Paper | `ALPACA_BASE_URL/v2/positions` |
| Historical bars | Alpaca Paper | `ALPACA_BASE_URL/v2/stocks/{symbol}/bars` |

## Session Schedule

- **9:31 AM ET weekdays** — Run signal analysis on full watchlist
- **12:00 PM ET** — Mid-day check on open positions
- **3:55 PM ET** — End-of-day review, close any day-trade positions

## Guardrails

- **Paper only** — 60-day paper phase before live trading approval
- **$100K paper account** — Don't exceed 10% in any single position
- **Log every decision** — Trade rationale stored in task output for Nexus review
- **No emotional trading** — Follow signals only, never override based on "feeling"
- **Daily P&L review** — Track cumulative performance for strategy validation
