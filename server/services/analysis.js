import { getQuote, getIndicators, getHistory } from './marketData.js'
import { RSI, MACD, SMA, EMA, BollingerBands, Stochastic, ATR, ADX, CCI, WilliamsR, MFI } from 'technicalindicators'
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

// ══════════════════════════════════════════════════════
// ██ ENSEMBLE SIGNAL ENGINE (AmpyFin/Abu-inspired)   ██
// ══════════════════════════════════════════════════════

// Built-in indicator strategies — no DB setup needed
const BUILTIN_STRATEGIES = [
  {
    id: 'rsi_mean_reversion',
    name: 'RSI Mean Reversion',
    category: 'mean_reversion',
    generate(data) {
      const { rsi14, price } = data
      if (rsi14 == null) return { signal: 'hold', confidence: 0 }
      if (rsi14 < 30) return { signal: 'buy', confidence: Math.min(100, (30 - rsi14) * 5) }
      if (rsi14 > 70) return { signal: 'sell', confidence: Math.min(100, (rsi14 - 70) * 5) }
      return { signal: 'hold', confidence: 20 }
    }
  },
  {
    id: 'macd_crossover',
    name: 'MACD Crossover',
    category: 'momentum',
    generate(data) {
      const { macd, prevMacd } = data
      if (!macd || !prevMacd) return { signal: 'hold', confidence: 0 }
      const hist = macd.histogram, prevHist = prevMacd.histogram
      if (hist == null || prevHist == null) return { signal: 'hold', confidence: 0 }
      // Crossover: histogram flips positive
      if (hist > 0 && prevHist <= 0) return { signal: 'buy', confidence: 70 }
      // Crossunder: histogram flips negative
      if (hist < 0 && prevHist >= 0) return { signal: 'sell', confidence: 70 }
      // Trending
      if (hist > 0) return { signal: 'buy', confidence: 30 }
      if (hist < 0) return { signal: 'sell', confidence: 30 }
      return { signal: 'hold', confidence: 10 }
    }
  },
  {
    id: 'bollinger_bounce',
    name: 'Bollinger Band Bounce',
    category: 'mean_reversion',
    generate(data) {
      const { price, bollinger } = data
      if (!bollinger) return { signal: 'hold', confidence: 0 }
      const { upper, lower, middle } = bollinger
      const bandWidth = upper - lower
      if (bandWidth === 0) return { signal: 'hold', confidence: 0 }
      // Price at/below lower band = buy
      if (price <= lower) return { signal: 'buy', confidence: 75 }
      if (price < lower + bandWidth * 0.1) return { signal: 'buy', confidence: 50 }
      // Price at/above upper band = sell
      if (price >= upper) return { signal: 'sell', confidence: 75 }
      if (price > upper - bandWidth * 0.1) return { signal: 'sell', confidence: 50 }
      return { signal: 'hold', confidence: 15 }
    }
  },
  {
    id: 'sma_crossover',
    name: 'SMA 20/50 Crossover',
    category: 'trend',
    generate(data) {
      const { sma20, sma50, prevSma20, prevSma50 } = data
      if (!sma20 || !sma50) return { signal: 'hold', confidence: 0 }
      // Golden cross
      if (sma20 > sma50 && prevSma20 && prevSma50 && prevSma20 <= prevSma50)
        return { signal: 'buy', confidence: 80 }
      // Death cross
      if (sma20 < sma50 && prevSma20 && prevSma50 && prevSma20 >= prevSma50)
        return { signal: 'sell', confidence: 80 }
      // Trending
      if (sma20 > sma50) return { signal: 'buy', confidence: 35 }
      if (sma20 < sma50) return { signal: 'sell', confidence: 35 }
      return { signal: 'hold', confidence: 10 }
    }
  },
  {
    id: 'stochastic_oscillator',
    name: 'Stochastic Oscillator',
    category: 'momentum',
    generate(data) {
      const { stochK, stochD } = data
      if (stochK == null || stochD == null) return { signal: 'hold', confidence: 0 }
      // Oversold + K crosses above D
      if (stochK < 20 && stochK > stochD) return { signal: 'buy', confidence: 75 }
      if (stochK < 20) return { signal: 'buy', confidence: 45 }
      // Overbought + K crosses below D
      if (stochK > 80 && stochK < stochD) return { signal: 'sell', confidence: 75 }
      if (stochK > 80) return { signal: 'sell', confidence: 45 }
      return { signal: 'hold', confidence: 15 }
    }
  },
  {
    id: 'ema_trend',
    name: 'EMA 12/26 Trend',
    category: 'trend',
    generate(data) {
      const { ema12, ema26, price } = data
      if (!ema12 || !ema26) return { signal: 'hold', confidence: 0 }
      const spread = (ema12 - ema26) / ema26 * 100
      // Strong bullish: price above both, EMA12 > EMA26
      if (price > ema12 && ema12 > ema26) return { signal: 'buy', confidence: Math.min(70, 30 + Math.abs(spread) * 10) }
      // Strong bearish
      if (price < ema12 && ema12 < ema26) return { signal: 'sell', confidence: Math.min(70, 30 + Math.abs(spread) * 10) }
      return { signal: 'hold', confidence: 20 }
    }
  },
  {
    id: 'williams_r',
    name: 'Williams %R',
    category: 'mean_reversion',
    generate(data) {
      const { williamsR } = data
      if (williamsR == null) return { signal: 'hold', confidence: 0 }
      if (williamsR < -80) return { signal: 'buy', confidence: 65 }
      if (williamsR > -20) return { signal: 'sell', confidence: 65 }
      return { signal: 'hold', confidence: 15 }
    }
  },
  {
    id: 'cci_momentum',
    name: 'CCI Momentum',
    category: 'momentum',
    generate(data) {
      const { cci } = data
      if (cci == null) return { signal: 'hold', confidence: 0 }
      if (cci < -100) return { signal: 'buy', confidence: 60 }
      if (cci > 100) return { signal: 'sell', confidence: 60 }
      if (cci > 0) return { signal: 'buy', confidence: 25 }
      return { signal: 'sell', confidence: 25 }
    }
  }
]

// Strategy performance weights (loaded from DB, updated after trades)
const DEFAULT_WEIGHT = 1.0

function getStrategyWeight(strategyId) {
  try {
    const row = db.prepare('SELECT avg_sharpe, avg_win_rate, pass_count, fail_count FROM strategy_meta WHERE indicator_combo = ?').get(strategyId)
    if (!row || (row.pass_count + row.fail_count) < 3) return DEFAULT_WEIGHT
    const winRate = row.pass_count / (row.pass_count + row.fail_count)
    return Math.max(0.1, (row.avg_sharpe || 0.5) * winRate * 2)
  } catch (e) {
    return DEFAULT_WEIGHT
  }
}

// Compute extended indicators for a symbol
async function computeExtendedIndicators(symbol) {
  const bars = await getHistory(symbol, '6mo', '1d')
  if (bars.length < 50) return null

  const closes = bars.map(b => b.close)
  const highs = bars.map(b => b.high)
  const lows = bars.map(b => b.low)
  const volumes = bars.map(b => b.volume)
  const len = closes.length

  const rsi14 = RSI.calculate({ values: closes, period: 14 })
  const macdData = MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 })
  const sma20 = SMA.calculate({ values: closes, period: 20 })
  const sma50 = SMA.calculate({ values: closes, period: 50 })
  const ema12 = EMA.calculate({ values: closes, period: 12 })
  const ema26 = EMA.calculate({ values: closes, period: 26 })
  const bollinger = BollingerBands.calculate({ values: closes, period: 20, stdDev: 2 })
  const stoch = Stochastic.calculate({ high: highs, low: lows, close: closes, period: 14, signalPeriod: 3 })
  const williamsRData = WilliamsR.calculate({ high: highs, low: lows, close: closes, period: 14 })
  const cciData = CCI.calculate({ high: highs, low: lows, close: closes, period: 20 })

  const latest = (arr) => arr.length > 0 ? arr[arr.length - 1] : null
  const prev = (arr) => arr.length > 1 ? arr[arr.length - 2] : null

  return {
    symbol,
    price: closes[len - 1],
    rsi14: latest(rsi14),
    macd: latest(macdData),
    prevMacd: prev(macdData),
    sma20: latest(sma20),
    sma50: latest(sma50),
    prevSma20: prev(sma20),
    prevSma50: prev(sma50),
    ema12: latest(ema12),
    ema26: latest(ema26),
    bollinger: latest(bollinger),
    stochK: latest(stoch)?.k,
    stochD: latest(stoch)?.d,
    williamsR: latest(williamsRData),
    cci: latest(cciData),
    bars
  }
}

// Generate signals from all built-in strategies for one symbol
export async function generateEnsembleSignals(symbol) {
  const data = await computeExtendedIndicators(symbol)
  if (!data) return { symbol, error: 'Not enough data', signals: [], composite: null }

  const signals = BUILTIN_STRATEGIES.map(strat => {
    const result = strat.generate(data)
    const weight = getStrategyWeight(strat.id)
    return {
      strategy_id: strat.id,
      strategy_name: strat.name,
      category: strat.category,
      signal: result.signal,
      confidence: result.confidence,
      weight: Math.round(weight * 100) / 100
    }
  })

  // AmpyFin-style weighted majority voting
  let buyScore = 0, sellScore = 0, holdScore = 0
  let totalWeight = 0

  for (const sig of signals) {
    const w = sig.weight * (sig.confidence / 100)
    totalWeight += sig.weight
    if (sig.signal === 'buy') buyScore += w
    else if (sig.signal === 'sell') sellScore += w
    else holdScore += w
  }

  // Normalize
  const total = buyScore + sellScore + holdScore || 1
  const buyPct = Math.round(buyScore / total * 100)
  const sellPct = Math.round(sellScore / total * 100)
  const holdPct = Math.round(holdScore / total * 100)

  // Determine action with confidence margin (AmpyFin pattern)
  const margin = buyScore - (sellScore + holdScore * 0.5)
  let action = 'HOLD'
  let confidence = holdPct

  if (buyPct > sellPct && buyPct > holdPct && buyScore > sellScore * 1.3) {
    action = buyPct > 60 ? 'STRONG BUY' : 'BUY'
    confidence = buyPct
  } else if (sellPct > buyPct && sellPct > holdPct && sellScore > buyScore * 1.3) {
    action = sellPct > 60 ? 'STRONG SELL' : 'SELL'
    confidence = sellPct
  }

  return {
    symbol,
    price: data.price,
    signals,
    composite: {
      action,
      buyPct,
      sellPct,
      holdPct,
      confidence,
      margin: Math.round(margin * 100) / 100,
      strategiesVoting: signals.length,
      buyCount: signals.filter(s => s.signal === 'buy').length,
      sellCount: signals.filter(s => s.signal === 'sell').length,
      holdCount: signals.filter(s => s.signal === 'hold').length
    },
    indicators: {
      rsi14: data.rsi14,
      macd_histogram: data.macd?.histogram,
      stochK: data.stochK,
      williamsR: data.williamsR,
      cci: data.cci,
      sma20: data.sma20,
      sma50: data.sma50
    },
    evaluatedAt: new Date().toISOString()
  }
}

// Scan all watchlist symbols at once
export async function scanWatchlist() {
  const watchlist = db.prepare('SELECT symbol FROM watchlist ORDER BY symbol').all()
  const defaultSymbols = ['SPY', 'QQQ', 'AAPL', 'NVDA', 'MSFT', 'TSLA', 'AMZN']
  const symbols = watchlist.length > 0 ? watchlist.map(w => w.symbol) : defaultSymbols

  const results = await Promise.allSettled(
    symbols.map(sym => generateEnsembleSignals(sym))
  )

  const scans = results
    .filter(r => r.status === 'fulfilled' && r.value.composite)
    .map(r => r.value)
    .sort((a, b) => Math.abs(b.composite.margin) - Math.abs(a.composite.margin))

  return {
    scannedAt: new Date().toISOString(),
    symbolCount: symbols.length,
    scans,
    actionable: scans.filter(s => s.composite.action !== 'HOLD')
  }
}

// Record trade outcome to update strategy weights
export function recordTradeOutcome(strategyId, won) {
  try {
    const existing = db.prepare('SELECT * FROM strategy_meta WHERE indicator_combo = ?').get(strategyId)
    if (existing) {
      if (won) {
        db.prepare('UPDATE strategy_meta SET pass_count = pass_count + 1, updated_at = datetime(\'now\') WHERE indicator_combo = ?').run(strategyId)
      } else {
        db.prepare('UPDATE strategy_meta SET fail_count = fail_count + 1, updated_at = datetime(\'now\') WHERE indicator_combo = ?').run(strategyId)
      }
    } else {
      db.prepare('INSERT INTO strategy_meta (indicator_combo, strategy_type, pass_count, fail_count) VALUES (?, ?, ?, ?)')
        .run(strategyId, 'builtin', won ? 1 : 0, won ? 0 : 1)
    }
  } catch (e) { /* ignore */ }
}

export { PERSONAS, BUILTIN_STRATEGIES }
