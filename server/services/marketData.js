import YahooFinance from 'yahoo-finance2'
import { RSI, MACD, SMA, EMA, BollingerBands } from 'technicalindicators'
import db from '../db.js'

const yahooFinance = new YahooFinance()

// ── Cache helpers ─────────────────────────────────
function getCached(symbol, dataType, ttlMinutes = 5) {
  const row = db.prepare(
    "SELECT data FROM market_data_cache WHERE symbol = ? AND data_type = ? AND expires_at > datetime('now')"
  ).get(symbol, dataType)
  return row ? JSON.parse(row.data) : null
}

function setCache(symbol, dataType, data, ttlMinutes = 5) {
  db.prepare('DELETE FROM market_data_cache WHERE symbol = ? AND data_type = ?').run(symbol, dataType)
  db.prepare(
    "INSERT INTO market_data_cache (symbol, data_type, data, expires_at) VALUES (?, ?, ?, datetime('now', ? || ' minutes'))"
  ).run(symbol, dataType, JSON.stringify(data), String(ttlMinutes))
}

// ── Quote ─────────────────────────────────────────
export async function getQuote(symbol) {
  const cached = getCached(symbol, 'quote', 5)
  if (cached) return cached

  const quote = await yahooFinance.quote(symbol)
  const data = {
    symbol: quote.symbol,
    price: quote.regularMarketPrice,
    change: quote.regularMarketChange,
    changePercent: quote.regularMarketChangePercent,
    high: quote.regularMarketDayHigh,
    low: quote.regularMarketDayLow,
    open: quote.regularMarketOpen,
    previousClose: quote.regularMarketPreviousClose,
    volume: quote.regularMarketVolume,
    marketCap: quote.marketCap,
    name: quote.shortName || quote.longName || symbol,
    marketState: quote.marketState,
    fetchedAt: new Date().toISOString()
  }
  setCache(symbol, 'quote', data, 5)
  return data
}

// ── Historical OHLCV ──────────────────────────────
export async function getHistory(symbol, period = '1y', interval = '1d') {
  const cacheKey = `history_${period}_${interval}`
  const cached = getCached(symbol, cacheKey, 60)
  if (cached) return cached

  const periodMap = {
    '1w': 7, '1mo': 30, '3mo': 90, '6mo': 180, '1y': 365, '2y': 730, '5y': 1825
  }
  const days = periodMap[period] || 365
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  const result = await yahooFinance.chart(symbol, {
    period1: startDate.toISOString().slice(0, 10),
    interval
  })

  const bars = result.quotes.map(q => ({
    date: q.date.toISOString().slice(0, 10),
    open: q.open,
    high: q.high,
    low: q.low,
    close: q.close,
    volume: q.volume
  })).filter(b => b.close != null)

  setCache(symbol, cacheKey, bars, 60)
  return bars
}

// ── Technical Indicators ──────────────────────────
export async function getIndicators(symbol) {
  const cached = getCached(symbol, 'indicators', 15)
  if (cached) return cached

  const bars = await getHistory(symbol, '6mo', '1d')
  const closes = bars.map(b => b.close)
  const highs = bars.map(b => b.high)
  const lows = bars.map(b => b.low)

  if (closes.length < 50) {
    return { error: 'Not enough data for indicators', bars: closes.length }
  }

  const rsi14 = RSI.calculate({ values: closes, period: 14 })
  const macd = MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 })
  const sma20 = SMA.calculate({ values: closes, period: 20 })
  const sma50 = SMA.calculate({ values: closes, period: 50 })
  const sma200 = SMA.calculate({ values: closes, period: 200 })
  const ema12 = EMA.calculate({ values: closes, period: 12 })
  const ema26 = EMA.calculate({ values: closes, period: 26 })
  const bollinger = BollingerBands.calculate({ values: closes, period: 20, stdDev: 2 })

  const latest = (arr) => arr.length > 0 ? arr[arr.length - 1] : null

  const data = {
    symbol,
    price: closes[closes.length - 1],
    rsi14: latest(rsi14),
    macd: latest(macd),
    sma20: latest(sma20),
    sma50: latest(sma50),
    sma200: latest(sma200),
    ema12: latest(ema12),
    ema26: latest(ema26),
    bollinger: latest(bollinger),
    trend: closes[closes.length - 1] > (latest(sma50) || 0) ? 'bullish' : 'bearish',
    rsiSignal: (latest(rsi14) || 50) < 30 ? 'oversold' : (latest(rsi14) || 50) > 70 ? 'overbought' : 'neutral',
    fetchedAt: new Date().toISOString()
  }

  setCache(symbol, 'indicators', data, 15)
  return data
}

// ── Symbol Search ─────────────────────────────────
export async function searchSymbols(query) {
  const result = await yahooFinance.search(query)
  return (result.quotes || []).filter(q => q.quoteType === 'EQUITY').slice(0, 10).map(q => ({
    symbol: q.symbol,
    name: q.shortname || q.longname || q.symbol,
    exchange: q.exchange,
    type: q.quoteType
  }))
}

// ── Cache Cleanup ─────────────────────────────────
export function cleanExpiredCache() {
  const result = db.prepare("DELETE FROM market_data_cache WHERE expires_at <= datetime('now')").run()
  return result.changes
}
