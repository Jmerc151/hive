import { getQuote, getIndicators, getHistory } from './marketData.js'
import db from '../db.js'

// ── Analyst Personas ─────────────────────────────
const PERSONAS = [
  {
    id: 'value',
    name: 'Value Investor',
    icon: '🏦',
    description: 'Seeks undervalued stocks with strong fundamentals and margin of safety',
    prompt: `You are a disciplined value investor in the tradition of Warren Buffett and Benjamin Graham.

Analyze this stock through a VALUE lens:
- Is the stock trading below intrinsic value? Look at P/E relative to growth, price vs SMA200 for long-term mean.
- Is there a margin of safety? How far is the current price from the 200-day average?
- Are the technicals showing accumulation (price near support, RSI not overbought)?
- Would you buy and hold this for 1+ years at this price?

Be skeptical of momentum. Prefer stocks that are out of favor but fundamentally sound.`
  },
  {
    id: 'momentum',
    name: 'Momentum Trader',
    icon: '🚀',
    description: 'Rides trends and breakouts using technical signals',
    prompt: `You are an aggressive momentum trader who rides trends.

Analyze this stock through a MOMENTUM lens:
- Is the price trending above key moving averages (SMA20 > SMA50 > SMA200)?
- Is RSI between 50-70 (strong but not exhausted)?
- Is MACD positive and increasing (histogram expanding)?
- Is price breaking out of Bollinger Band squeeze?
- Is there volume confirmation?

You love strong trends and hate mean reversion. Look for continuation, not reversals.`
  },
  {
    id: 'contrarian',
    name: 'Contrarian Analyst',
    icon: '🔄',
    description: 'Looks for oversold bounces and sentiment extremes',
    prompt: `You are a contrarian analyst who buys fear and sells greed.

Analyze this stock through a CONTRARIAN lens:
- Is RSI oversold (< 30) suggesting a bounce is likely?
- Has the stock pulled back to a key moving average (SMA50 or SMA200) and held?
- Is the stock near the lower Bollinger Band (potential mean reversion)?
- Is MACD showing bullish divergence (price falling but MACD rising)?
- Is everyone bearish? That might be your signal to buy.

You go against the crowd. When everyone is panicking, you get greedy.`
  },
  {
    id: 'technical',
    name: 'Technical Analyst',
    icon: '📊',
    description: 'Pure chart-based analysis using indicators and patterns',
    prompt: `You are a pure technical analyst who lets the charts speak.

Analyze this stock through a TECHNICAL lens:
- What is the trend? (Price vs SMA20, SMA50, SMA200)
- What is the momentum? (RSI14 level and direction, MACD crossover status)
- What are the key support/resistance levels? (Bollinger Bands, recent highs/lows)
- What are the EMA crossover signals? (EMA12 vs EMA26)
- What is the volatility regime? (Bollinger Band width)

No fundamental opinions. Just read the indicators objectively and score the setup.`
  },
  {
    id: 'risk',
    name: 'Risk Manager',
    icon: '🛡️',
    description: 'Evaluates downside risk, volatility, and position sizing',
    prompt: `You are a cautious risk manager focused on protecting capital.

Analyze this stock through a RISK lens:
- How volatile is this stock? (Bollinger Band width, distance from moving averages)
- Where would you place a stop-loss? (Below SMA50? Below recent low? Below lower Bollinger?)
- What's the risk/reward ratio at current price?
- Is the stock in a high-risk zone (RSI > 80, far above SMA200)?
- How correlated is this to the broader market?

You don't care about upside. You care about "how much can I lose?" and "what could go wrong?"`
  }
]

// ── Multi-Lens Analysis ─────────────────────────
export async function analyzeSymbol(symbol, callClaude, agentId = 'oracle') {
  // Gather market data
  const [quote, indicators, history] = await Promise.all([
    getQuote(symbol),
    getIndicators(symbol),
    getHistory(symbol, '3mo', '1d')
  ])

  if (indicators.error) {
    throw new Error(`Not enough data for ${symbol}: ${indicators.error}`)
  }

  // Build market context that all personas share
  const marketContext = buildMarketContext(symbol, quote, indicators, history)

  // Run all personas in parallel via a single Claude call with structured output
  const response = await callClaude({
    model: 'anthropic/claude-sonnet-4-5',
    max_tokens: 2048,
    system: `You are a multi-perspective stock analysis engine. You will analyze a stock through 5 different investor personas simultaneously and produce a composite recommendation.

For each persona, provide:
- signal: "bullish", "bearish", or "neutral"
- confidence: 0-100
- reasoning: 1-2 sentences

Then produce a COMPOSITE signal by weighing all 5 perspectives.

RESPOND IN VALID JSON ONLY. No markdown, no code blocks. Just the JSON object.`,
    messages: [{
      role: 'user',
      content: `Analyze ${symbol} through these 5 lenses using the real market data below.

## Market Data
${marketContext}

## Analyst Personas

${PERSONAS.map(p => `### ${p.name} (${p.id})
${p.prompt}`).join('\n\n')}

## Required JSON Output Format
{
  "symbol": "${symbol}",
  "analyses": [
    {
      "persona_id": "value",
      "persona_name": "Value Investor",
      "signal": "bullish|bearish|neutral",
      "confidence": 0-100,
      "reasoning": "..."
    },
    ... (all 5 personas)
  ],
  "composite": {
    "signal": "bullish|bearish|neutral",
    "confidence": 0-100,
    "action": "STRONG BUY|BUY|HOLD|SELL|STRONG SELL",
    "reasoning": "2-3 sentence synthesis of all perspectives",
    "suggested_entry": null or price number,
    "suggested_stop": null or price number,
    "suggested_target": null or price number
  }
}`
    }]
  }, agentId)

  const text = response.content[0].text
  let analysis
  try {
    // Strip any markdown code fences if present
    const cleaned = text.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim()
    analysis = JSON.parse(cleaned)
  } catch (e) {
    throw new Error(`Failed to parse analysis response: ${e.message}`)
  }

  // Attach raw market data
  analysis.marketData = {
    price: quote.price,
    change: quote.change,
    changePercent: quote.changePercent,
    volume: quote.volume,
    marketCap: quote.marketCap,
    rsi14: indicators.rsi14,
    macd: indicators.macd,
    sma20: indicators.sma20,
    sma50: indicators.sma50,
    sma200: indicators.sma200,
    trend: indicators.trend,
    rsiSignal: indicators.rsiSignal
  }

  analysis.analyzedAt = new Date().toISOString()
  analysis.personas = PERSONAS.map(p => ({ id: p.id, name: p.name, icon: p.icon }))

  return analysis
}

// ── Build readable market context ────────────────
function buildMarketContext(symbol, quote, indicators, history) {
  const recent5 = history.slice(-5)
  const high52w = Math.max(...history.map(b => b.high))
  const low52w = Math.min(...history.map(b => b.low))
  const avgVolume = Math.round(history.slice(-20).reduce((s, b) => s + b.volume, 0) / 20)

  return `**${quote.name} (${symbol})**
Price: $${quote.price?.toFixed(2)} (${quote.change >= 0 ? '+' : ''}${quote.change?.toFixed(2)}, ${quote.changePercent?.toFixed(2)}%)
Market Cap: $${quote.marketCap ? (quote.marketCap / 1e9).toFixed(1) + 'B' : 'N/A'}
Volume: ${quote.volume?.toLocaleString()} (20-day avg: ${avgVolume.toLocaleString()})
52-Week Range: $${low52w.toFixed(2)} - $${high52w.toFixed(2)} (current at ${((quote.price - low52w) / (high52w - low52w) * 100).toFixed(0)}%)

**Technical Indicators:**
- RSI(14): ${indicators.rsi14?.toFixed(1)} → ${indicators.rsiSignal}
- MACD: ${indicators.macd?.MACD?.toFixed(3)} | Signal: ${indicators.macd?.signal?.toFixed(3)} | Histogram: ${indicators.macd?.histogram?.toFixed(3)}
- SMA(20): $${indicators.sma20?.toFixed(2)} (price ${quote.price > indicators.sma20 ? 'above' : 'below'})
- SMA(50): $${indicators.sma50?.toFixed(2)} (price ${quote.price > indicators.sma50 ? 'above' : 'below'})
- SMA(200): $${indicators.sma200?.toFixed(2) || 'N/A'} ${indicators.sma200 ? `(price ${quote.price > indicators.sma200 ? 'above' : 'below'})` : ''}
- EMA(12): $${indicators.ema12?.toFixed(2)} | EMA(26): $${indicators.ema26?.toFixed(2)}
- Bollinger: Upper $${indicators.bollinger?.upper?.toFixed(2)} | Middle $${indicators.bollinger?.middle?.toFixed(2)} | Lower $${indicators.bollinger?.lower?.toFixed(2)}
- Trend: ${indicators.trend}

**Recent 5 Days:**
${recent5.map(b => `${b.date}: O $${b.open?.toFixed(2)} H $${b.high?.toFixed(2)} L $${b.low?.toFixed(2)} C $${b.close?.toFixed(2)} V ${b.volume?.toLocaleString()}`).join('\n')}`
}

// ── Deterministic Constraint Computation ─────────
export async function computeTradeConstraints(symbol, side = 'buy') {
  const getSetting = (key) => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
    return row?.value || null
  }

  const constraints = {
    symbol,
    side,
    allowed: true,
    reasons: [],
    limits: {}
  }

  // Check if trading is enabled
  if (getSetting('trading_enabled') === 'false') {
    constraints.allowed = false
    constraints.reasons.push('Trading is disabled')
    return constraints
  }

  // Daily trade count
  const maxDaily = parseInt(getSetting('max_daily_trades') || '20')
  const today = new Date().toISOString().slice(0, 10)
  const todayTrades = db.prepare("SELECT COUNT(*) as c FROM trades WHERE date(created_at) = ?").get(today)?.c || 0
  constraints.limits.dailyTradesRemaining = maxDaily - todayTrades
  if (todayTrades >= maxDaily) {
    constraints.allowed = false
    constraints.reasons.push(`Daily trade limit reached (${todayTrades}/${maxDaily})`)
  }

  // Position size limit
  const maxPositionUsd = parseFloat(getSetting('max_position_size_usd') || '1000')
  constraints.limits.maxPositionUsd = maxPositionUsd

  // Portfolio concentration
  const maxPortfolioPercent = parseFloat(getSetting('max_portfolio_percent') || '10')
  constraints.limits.maxPortfolioPercent = maxPortfolioPercent

  // Get current price for share calculation
  try {
    const quote = await getQuote(symbol)
    constraints.limits.currentPrice = quote.price
    constraints.limits.maxShares = Math.floor(maxPositionUsd / quote.price)

    // Stop loss
    const slPercent = parseFloat(getSetting('default_stop_loss_percent') || '5')
    constraints.limits.stopLossPercent = slPercent
    constraints.limits.stopLossPrice = Math.round(quote.price * (1 - slPercent / 100) * 100) / 100
    constraints.limits.maxLossPerTrade = Math.round(constraints.limits.maxShares * quote.price * (slPercent / 100) * 100) / 100
  } catch (e) {
    constraints.limits.currentPrice = null
    constraints.limits.maxShares = null
  }

  return constraints
}

// ── LLM-Assisted Trade Decision ──────────────────
export async function makeTradeDecision(symbol, analysis, constraints, callClaude, agentId = 'oracle') {
  if (!constraints.allowed) {
    return {
      action: 'HOLD',
      reasoning: `Cannot trade: ${constraints.reasons.join(', ')}`,
      quantity: 0
    }
  }

  const response = await callClaude({
    model: 'anthropic/claude-sonnet-4-5',
    max_tokens: 512,
    system: `You are a disciplined trade execution engine. Given an analysis and hard constraints, decide EXACTLY what to do. You CANNOT exceed the constraints — they are absolute limits.

RESPOND IN VALID JSON ONLY.`,
    messages: [{
      role: 'user',
      content: `## Analysis for ${symbol}
Composite Signal: ${analysis.composite.signal} (${analysis.composite.confidence}% confidence)
Action Recommendation: ${analysis.composite.action}
Reasoning: ${analysis.composite.reasoning}

Bullish analysts: ${analysis.analyses.filter(a => a.signal === 'bullish').length}/5
Bearish analysts: ${analysis.analyses.filter(a => a.signal === 'bearish').length}/5

## Hard Constraints (CANNOT exceed)
- Max shares: ${constraints.limits.maxShares}
- Max position value: $${constraints.limits.maxPositionUsd}
- Current price: $${constraints.limits.currentPrice}
- Stop loss at: $${constraints.limits.stopLossPrice} (${constraints.limits.stopLossPercent}%)
- Max loss on this trade: $${constraints.limits.maxLossPerTrade}
- Daily trades remaining: ${constraints.limits.dailyTradesRemaining}

## Respond with JSON:
{
  "action": "BUY|SELL|HOLD",
  "quantity": number (0 to ${constraints.limits.maxShares}),
  "limit_price": null or number,
  "stop_loss": ${constraints.limits.stopLossPrice},
  "reasoning": "1 sentence why",
  "confidence": 0-100
}`
    }]
  }, agentId)

  const text = response.content[0].text
  try {
    const cleaned = text.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim()
    return JSON.parse(cleaned)
  } catch (e) {
    return { action: 'HOLD', quantity: 0, reasoning: 'Failed to parse decision', confidence: 0 }
  }
}

// ── Strategy Ensemble ────────────────────────────
export async function evaluateEnsemble(symbol) {
  // Get all approved/deployed strategies
  const strategies = db.prepare(
    "SELECT * FROM strategies WHERE status IN ('approved', 'deployed')"
  ).all()

  if (strategies.length === 0) {
    return { symbol, signals: [], composite: null, message: 'No approved strategies to evaluate' }
  }

  // Get market data once
  const history = await getHistory(symbol, '6mo', '1d')
  if (history.length < 50) {
    return { symbol, signals: [], composite: null, message: 'Not enough data' }
  }

  // Import backtest's computeIndicators (we need to evaluate conditions)
  const { RSI, MACD, SMA, EMA, BollingerBands } = await import('technicalindicators')

  const closes = history.map(b => b.close)
  const rsi14 = RSI.calculate({ values: closes, period: 14 })
  const macd = MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 })
  const sma20 = SMA.calculate({ values: closes, period: 20 })
  const sma50 = SMA.calculate({ values: closes, period: 50 })
  const sma200 = SMA.calculate({ values: closes, period: 200 })
  const ema12 = EMA.calculate({ values: closes, period: 12 })
  const ema26 = EMA.calculate({ values: closes, period: 26 })
  const bollinger = BollingerBands.calculate({ values: closes, period: 20, stdDev: 2 })

  const len = closes.length
  const pad = (arr, total) => Array(total - arr.length).fill(null).concat(arr)
  const latestBar = {
    ...history[len - 1],
    price: closes[len - 1],
    rsi14: pad(rsi14, len)[len - 1],
    macd: pad(macd, len)[len - 1],
    sma20: pad(sma20, len)[len - 1],
    sma50: pad(sma50, len)[len - 1],
    sma200: pad(sma200, len)[len - 1],
    ema12: pad(ema12, len)[len - 1],
    ema26: pad(ema26, len)[len - 1],
    bollinger: pad(bollinger, len)[len - 1]
  }

  // Evaluate each strategy's conditions against current data
  const signals = []
  for (const strategy of strategies) {
    try {
      const logic = JSON.parse(strategy.logic)
      const entryMet = logic.entry_conditions?.every(c => evalCondition(c, latestBar)) || false
      const exitMet = logic.exit_conditions?.every(c => evalCondition(c, latestBar)) || false

      // Get latest backtest for confidence weighting
      const bt = db.prepare('SELECT * FROM strategy_backtests WHERE strategy_id = ? ORDER BY created_at DESC LIMIT 1').get(strategy.id)

      let signal = 'neutral'
      if (entryMet && !exitMet) signal = 'bullish'
      else if (exitMet && !entryMet) signal = 'bearish'

      const weight = bt ? Math.max(0, (bt.sharpe_ratio || 0)) * (bt.win_rate || 50) / 100 : 0.5

      signals.push({
        strategy_id: strategy.id,
        strategy_name: strategy.name,
        strategy_type: strategy.type,
        signal,
        weight: Math.round(weight * 100) / 100,
        entryMet,
        exitMet,
        backtest: bt ? { sharpe: bt.sharpe_ratio, winRate: bt.win_rate, totalReturn: bt.total_return } : null
      })
    } catch (e) {
      // skip broken strategies
    }
  }

  // Compute weighted composite
  if (signals.length === 0) {
    return { symbol, signals, composite: null }
  }

  const totalWeight = signals.reduce((s, sig) => s + sig.weight, 0)
  let bullishScore = 0
  let bearishScore = 0

  for (const sig of signals) {
    const normalizedWeight = totalWeight > 0 ? sig.weight / totalWeight : 1 / signals.length
    if (sig.signal === 'bullish') bullishScore += normalizedWeight
    else if (sig.signal === 'bearish') bearishScore += normalizedWeight
  }

  const netScore = bullishScore - bearishScore // -1 to +1
  let compositeSignal = 'neutral'
  if (netScore > 0.2) compositeSignal = 'bullish'
  else if (netScore < -0.2) compositeSignal = 'bearish'

  return {
    symbol,
    price: latestBar.price,
    signals,
    composite: {
      signal: compositeSignal,
      bullishScore: Math.round(bullishScore * 100),
      bearishScore: Math.round(bearishScore * 100),
      netScore: Math.round(netScore * 100) / 100,
      strategiesEvaluated: signals.length,
      bullishCount: signals.filter(s => s.signal === 'bullish').length,
      bearishCount: signals.filter(s => s.signal === 'bearish').length,
      neutralCount: signals.filter(s => s.signal === 'neutral').length
    },
    evaluatedAt: new Date().toISOString()
  }
}

// Simple condition evaluator (mirrors backtest.js logic)
function evalCondition(condition, bar) {
  const { indicator, operator, value } = condition

  const getVal = (key) => {
    if (key === 'price') return bar.price
    if (key === 'volume') return bar.volume
    if (key === 'rsi14') return bar.rsi14
    if (key === 'sma20') return bar.sma20
    if (key === 'sma50') return bar.sma50
    if (key === 'sma200') return bar.sma200
    if (key === 'ema12') return bar.ema12
    if (key === 'ema26') return bar.ema26
    if (key === 'bollinger_upper') return bar.bollinger?.upper
    if (key === 'bollinger_lower') return bar.bollinger?.lower
    if (key === 'macd_histogram') return bar.macd?.histogram
    if (key === 'macd_signal') return bar.macd?.signal
    if (key === 'macd_macd') return bar.macd?.MACD
    return null
  }

  const lhs = getVal(indicator)
  if (lhs == null) return false

  let rhs = typeof value === 'string' ? (getVal(value) ?? parseFloat(value)) : value
  if (rhs == null || isNaN(rhs)) return false

  switch (operator) {
    case '>': return lhs > rhs
    case '<': return lhs < rhs
    case '>=': return lhs >= rhs
    case '<=': return lhs <= rhs
    case '==': return Math.abs(lhs - rhs) < 0.001
    default: return false
  }
}

export { PERSONAS }
