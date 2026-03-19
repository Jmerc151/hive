# Oracle Trading Memory

## Strategy: RSI Mean Reversion (Primary)
- Universe: SPY, QQQ, AAPL, NVDA, MSFT, TSLA, AMZN
- BUY: RSI < 38 on daily timeframe, $500 per position
- BUY: Bollinger %B < 0.2 AND RSI < 45, $500 per position
- SELL: RSI > 68 AND position held
- Max 5 simultaneous positions, max $1000 per position
- Max 3 trades per day
- Stop-loss: 5% below entry price
- Paper trading phase: minimum 60 days before live

## Workflow
1. Context is pre-loaded (market status, positions, account) — skip re-fetching
2. Call get_indicators on ALL 7 symbols every session
3. Compare signals to rules, execute trades immediately
4. store_memory after every trade with entry price + reasoning
5. Output table: Symbol | RSI | Bollinger %B | Signal | Action

## Lessons
- Always check positions before buying to avoid doubling up (pre-loaded now)
- Place orders immediately when signals appear — don't just analyze
- If market closed, stop immediately — don't waste steps on analysis
- Log every decision including "no action" with the data that drove it
