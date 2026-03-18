---
name: Signal Analyzer
description: Multi-indicator technical analysis for Alpaca paper trading with RSI, MACD, volume, and sentiment signals on the approved watchlist.
version: "1.0.0"
agents: ["oracle"]
tags: ["trading", "analysis", "signals", "technical-analysis"]
requires_env: ["ALPACA_API_KEY", "ALPACA_API_SECRET"]
requires_tools: ["web_search", "http_request"]
---

# Signal Analyzer

Generate trading signals for Oracle's paper trading strategy.

## Approved Watchlist (ONLY these tickers)

SPY, QQQ, AAPL, NVDA, MSFT, TSLA, AMZN

**Never trade tickers outside this list.** Never add new tickers without explicit approval.

## Signal Framework

Analyze each ticker across 4 dimensions:

### 1. RSI Mean Reversion (Primary)
- RSI(14) below 30 → **BUY signal** (oversold)
- RSI(14) above 70 → **SELL signal** (overbought)
- RSI between 30-70 → **NEUTRAL**

### 2. MACD Crossover (Confirmation)
- MACD crosses above signal line → confirms BUY
- MACD crosses below signal line → confirms SELL
- No crossover → no confirmation

### 3. Volume Analysis
- Volume > 1.5x 20-day average → strong signal
- Volume < 0.5x 20-day average → weak signal (reduce position size)

### 4. News Sentiment
- Use web_search to check for material news (earnings, FDA, lawsuits)
- Positive catalyst → supports BUY
- Negative catalyst → supports SELL or HOLD
- No news → rely on technicals only

## Signal Output Format

```json
{
  "ticker": "AAPL",
  "signal": "BUY",
  "confidence": 0.75,
  "rsi_14": 28.5,
  "macd_crossover": true,
  "volume_ratio": 1.8,
  "sentiment": "neutral",
  "suggested_size": 500,
  "stop_loss": -3,
  "take_profit": 5,
  "reasoning": "RSI oversold with MACD bullish crossover on above-average volume"
}
```

## Risk Constraints (HARD LIMITS)

- Maximum $1,000 per position
- Maximum 3 trades per day
- Stop loss: -3% mandatory on every trade
- Never hold overnight unless signal confidence > 0.8
- Paper trading ONLY — no live trading until 60-day track record
