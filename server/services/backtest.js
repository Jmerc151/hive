import { getHistory, getIndicators } from './marketData.js'
import { RSI, MACD, SMA, EMA, BollingerBands } from 'technicalindicators'
import db from '../db.js'

// ── Compute indicators for a bar array ────────────
function computeIndicators(bars) {
  const closes = bars.map(b => b.close)
  const highs = bars.map(b => b.high)
  const lows = bars.map(b => b.low)

  const rsi14 = RSI.calculate({ values: closes, period: 14 })
  const macd = MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 })
  const sma20 = SMA.calculate({ values: closes, period: 20 })
  const sma50 = SMA.calculate({ values: closes, period: 50 })
  const sma200 = SMA.calculate({ values: closes, period: 200 })
  const ema12 = EMA.calculate({ values: closes, period: 12 })
  const ema26 = EMA.calculate({ values: closes, period: 26 })
  const bollinger = BollingerBands.calculate({ values: closes, period: 20, stdDev: 2 })

  // Align arrays to the end (indicators have different lookback periods)
  const len = closes.length
  const pad = (arr, total) => Array(total - arr.length).fill(null).concat(arr)

  return bars.map((bar, i) => ({
    ...bar,
    rsi14: pad(rsi14, len)[i],
    macd: pad(macd, len)[i],
    sma20: pad(sma20, len)[i],
    sma50: pad(sma50, len)[i],
    sma200: pad(sma200, len)[i],
    ema12: pad(ema12, len)[i],
    ema26: pad(ema26, len)[i],
    bollinger: pad(bollinger, len)[i],
    price: bar.close
  }))
}

// ── Evaluate conditions against a bar ─────────────
function evaluateCondition(condition, bar) {
  const { indicator, operator, value } = condition

  let lhs = null
  if (indicator === 'price') lhs = bar.price
  else if (indicator === 'volume') lhs = bar.volume
  else if (indicator === 'rsi14') lhs = bar.rsi14
  else if (indicator === 'sma20') lhs = bar.sma20
  else if (indicator === 'sma50') lhs = bar.sma50
  else if (indicator === 'sma200') lhs = bar.sma200
  else if (indicator === 'ema12') lhs = bar.ema12
  else if (indicator === 'ema26') lhs = bar.ema26
  else if (indicator === 'bollinger_upper') lhs = bar.bollinger?.upper
  else if (indicator === 'bollinger_lower') lhs = bar.bollinger?.lower
  else if (indicator === 'macd_histogram') lhs = bar.macd?.histogram
  else if (indicator === 'macd_signal') lhs = bar.macd?.signal
  else if (indicator === 'macd_macd') lhs = bar.macd?.MACD

  if (lhs == null) return false

  // RHS can be a number or a reference to another indicator
  let rhs = value
  if (typeof value === 'string') {
    if (value === 'sma20') rhs = bar.sma20
    else if (value === 'sma50') rhs = bar.sma50
    else if (value === 'sma200') rhs = bar.sma200
    else if (value === 'ema12') rhs = bar.ema12
    else if (value === 'ema26') rhs = bar.ema26
    else if (value === 'bollinger_upper') rhs = bar.bollinger?.upper
    else if (value === 'bollinger_lower') rhs = bar.bollinger?.lower
    else rhs = parseFloat(value)
  }

  if (rhs == null || isNaN(rhs)) return false

  switch (operator) {
    case '>': return lhs > rhs
    case '<': return lhs < rhs
    case '>=': return lhs >= rhs
    case '<=': return lhs <= rhs
    case '==': return Math.abs(lhs - rhs) < 0.001
    case 'crosses_above': return false // needs previous bar comparison (handled separately)
    case 'crosses_below': return false
    default: return false
  }
}

function allConditionsMet(conditions, bar) {
  return conditions.every(c => evaluateCondition(c, bar))
}

// ── Run Backtest ──────────────────────────────────
export async function runBacktest(strategyId, symbol = 'SPY', period = '1y', initialCapital = 10000) {
  const strategy = db.prepare('SELECT * FROM strategies WHERE id = ?').get(strategyId)
  if (!strategy) throw new Error('Strategy not found')

  const logic = JSON.parse(strategy.logic)
  const bars = await getHistory(symbol, period, '1d')
  if (bars.length < 50) throw new Error('Not enough historical data')

  const enrichedBars = computeIndicators(bars)

  // Simulate
  let cash = initialCapital
  let position = 0
  let entryPrice = 0
  const trades = []
  const equityCurve = []
  let wins = 0
  let losses = 0

  const positionAmount = logic.position_amount || 1000

  for (let i = 50; i < enrichedBars.length; i++) {
    const bar = enrichedBars[i]
    const equity = cash + (position * bar.price)
    equityCurve.push({ date: bar.date, equity: Math.round(equity * 100) / 100 })

    // Check entry
    if (position === 0 && logic.entry_conditions) {
      if (allConditionsMet(logic.entry_conditions, bar)) {
        const shares = Math.floor(Math.min(positionAmount, cash) / bar.price)
        if (shares > 0) {
          position = shares
          entryPrice = bar.price
          cash -= shares * bar.price
          trades.push({ date: bar.date, side: 'buy', price: bar.price, qty: shares })
        }
      }
    }

    // Check exit
    if (position > 0 && logic.exit_conditions) {
      if (allConditionsMet(logic.exit_conditions, bar)) {
        cash += position * bar.price
        const pnl = (bar.price - entryPrice) * position
        trades.push({ date: bar.date, side: 'sell', price: bar.price, qty: position, pnl: Math.round(pnl * 100) / 100 })
        if (pnl > 0) wins++; else losses++
        position = 0
        entryPrice = 0
      }
    }

    // Stop-loss check
    if (position > 0 && entryPrice > 0) {
      const slPercent = logic.stop_loss_percent || 5
      if (bar.price <= entryPrice * (1 - slPercent / 100)) {
        cash += position * bar.price
        const pnl = (bar.price - entryPrice) * position
        trades.push({ date: bar.date, side: 'sell (stop)', price: bar.price, qty: position, pnl: Math.round(pnl * 100) / 100 })
        losses++
        position = 0
        entryPrice = 0
      }
    }
  }

  // Close any remaining position at last price
  const lastPrice = enrichedBars[enrichedBars.length - 1].price
  if (position > 0) {
    cash += position * lastPrice
    const pnl = (lastPrice - entryPrice) * position
    trades.push({ date: enrichedBars[enrichedBars.length - 1].date, side: 'sell (close)', price: lastPrice, qty: position, pnl: Math.round(pnl * 100) / 100 })
    if (pnl > 0) wins++; else losses++
    position = 0
  }

  const finalEquity = cash
  const totalReturn = ((finalEquity - initialCapital) / initialCapital * 100)
  const totalTrades = trades.filter(t => t.side.startsWith('sell')).length
  const winRate = totalTrades > 0 ? (wins / totalTrades * 100) : 0

  // Calculate Sharpe ratio (annualized, using daily returns)
  const dailyReturns = []
  for (let i = 1; i < equityCurve.length; i++) {
    dailyReturns.push((equityCurve[i].equity - equityCurve[i - 1].equity) / equityCurve[i - 1].equity)
  }
  const avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / (dailyReturns.length || 1)
  const stdDev = Math.sqrt(dailyReturns.reduce((sum, r) => sum + (r - avgReturn) ** 2, 0) / (dailyReturns.length || 1))
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev * Math.sqrt(252)) : 0

  // Max drawdown
  let peak = initialCapital
  let maxDrawdown = 0
  for (const point of equityCurve) {
    if (point.equity > peak) peak = point.equity
    const dd = (peak - point.equity) / peak * 100
    if (dd > maxDrawdown) maxDrawdown = dd
  }

  const result = {
    strategy_id: strategyId,
    symbol,
    period,
    initial_capital: initialCapital,
    final_equity: Math.round(finalEquity * 100) / 100,
    total_return: Math.round(totalReturn * 100) / 100,
    sharpe_ratio: Math.round(sharpeRatio * 100) / 100,
    max_drawdown: Math.round(maxDrawdown * 100) / 100,
    win_rate: Math.round(winRate * 100) / 100,
    total_trades: totalTrades,
    wins,
    losses,
    equity_curve: equityCurve,
    trade_log: trades
  }

  // Save to database
  const { v4: uuid } = await import('uuid')
  const backtestId = uuid()
  db.prepare(
    'INSERT INTO strategy_backtests (id, strategy_id, symbol, period, initial_capital, final_equity, total_return, sharpe_ratio, max_drawdown, win_rate, total_trades, equity_curve, trade_log) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(backtestId, strategyId, symbol, period, initialCapital, result.final_equity, result.total_return, result.sharpe_ratio, result.max_drawdown, result.win_rate, result.total_trades, JSON.stringify(equityCurve), JSON.stringify(trades))

  return { id: backtestId, ...result }
}

// ── Evaluate Live Signals for a Deployment ────────
export async function evaluateDeploymentSignals(deployment) {
  const strategy = db.prepare('SELECT * FROM strategies WHERE id = ?').get(deployment.strategy_id)
  if (!strategy) return { signal: 'none', reason: 'Strategy not found' }

  const logic = JSON.parse(strategy.logic)
  const symbols = JSON.parse(deployment.symbols)
  const signals = []

  for (const symbol of symbols) {
    try {
      const bars = await getHistory(symbol, '3mo', '1d')
      if (bars.length < 50) continue
      const enriched = computeIndicators(bars)
      const latestBar = enriched[enriched.length - 1]

      // Check current position for this symbol
      const hasPosition = db.prepare(
        "SELECT COUNT(*) as c FROM trades WHERE symbol = ? AND strategy_id = ? AND side = 'buy' AND status = 'filled' AND id NOT IN (SELECT id FROM trades WHERE symbol = ? AND strategy_id = ? AND side LIKE 'sell%' AND status = 'filled')"
      ).get(symbol, strategy.id, symbol, strategy.id)?.c > 0

      if (!hasPosition && logic.entry_conditions && allConditionsMet(logic.entry_conditions, latestBar)) {
        signals.push({ symbol, signal: 'buy', bar: latestBar })
      } else if (hasPosition && logic.exit_conditions && allConditionsMet(logic.exit_conditions, latestBar)) {
        signals.push({ symbol, signal: 'sell', bar: latestBar })
      }
    } catch (e) {
      console.error(`Signal eval failed for ${symbol}:`, e.message)
    }
  }

  return signals
}
