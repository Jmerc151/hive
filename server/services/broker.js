import Alpaca from '@alpacahq/alpaca-trade-api'
import db from '../db.js'

// ── Alpaca Client ─────────────────────────────────
const alpaca = new Alpaca({
  keyId: process.env.ALPACA_API_KEY || '',
  secretKey: process.env.ALPACA_API_SECRET || '',
  paper: true,
  baseUrl: process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets'
})

// ── Settings Helper ───────────────────────────────
function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
  return row?.value || null
}

// ── Account Info ──────────────────────────────────
export async function getAccount() {
  const account = await alpaca.getAccount()
  return {
    equity: parseFloat(account.equity),
    buyingPower: parseFloat(account.buying_power),
    cash: parseFloat(account.cash),
    portfolioValue: parseFloat(account.portfolio_value),
    dayPnl: parseFloat(account.equity) - parseFloat(account.last_equity),
    dayPnlPercent: ((parseFloat(account.equity) - parseFloat(account.last_equity)) / parseFloat(account.last_equity) * 100),
    patternDayTrader: account.pattern_day_trader,
    tradingBlocked: account.trading_blocked,
    status: account.status
  }
}

// ── Positions ─────────────────────────────────────
export async function getPositions() {
  const positions = await alpaca.getPositions()
  return positions.map(p => ({
    symbol: p.symbol,
    qty: parseFloat(p.qty),
    side: parseFloat(p.qty) > 0 ? 'long' : 'short',
    avgEntry: parseFloat(p.avg_entry_price),
    currentPrice: parseFloat(p.current_price),
    marketValue: parseFloat(p.market_value),
    unrealizedPnl: parseFloat(p.unrealized_pl),
    unrealizedPnlPercent: parseFloat(p.unrealized_plpc) * 100,
    changeToday: parseFloat(p.change_today) * 100
  }))
}

// ── Safety Chain ──────────────────────────────────
async function safetyCheck(symbol, qty, side, price) {
  const errors = []

  // 1. Trading enabled?
  const enabled = getSetting('trading_enabled')
  if (enabled === 'false') errors.push('Trading is disabled (kill switch active)')

  // 2. Market open?
  const clock = await alpaca.getClock()
  if (!clock.is_open) errors.push('Market is closed')

  // 3. Daily trade limit
  const maxDaily = parseInt(getSetting('max_daily_trades') || '20')
  const today = new Date().toISOString().slice(0, 10)
  const todayTrades = db.prepare("SELECT COUNT(*) as c FROM trades WHERE date(created_at) = ?").get(today)?.c || 0
  if (todayTrades >= maxDaily) errors.push(`Daily trade limit reached (${todayTrades}/${maxDaily})`)

  // 4. Position size
  const maxSize = parseFloat(getSetting('max_position_size_usd') || '1000')
  const orderValue = qty * (price || 0)
  if (price && orderValue > maxSize) errors.push(`Order value $${orderValue.toFixed(2)} exceeds max position size $${maxSize}`)

  // 5. Portfolio concentration
  const maxPercent = parseFloat(getSetting('max_portfolio_percent') || '10')
  const account = await alpaca.getAccount()
  const equity = parseFloat(account.equity)
  if (price && equity > 0 && (orderValue / equity * 100) > maxPercent) {
    errors.push(`Position would be ${(orderValue / equity * 100).toFixed(1)}% of portfolio (max ${maxPercent}%)`)
  }

  return { safe: errors.length === 0, errors }
}

// ── Place Order ───────────────────────────────────
export async function placeOrder({ symbol, qty, side, type = 'market', limitPrice, strategyId, stopLossPercent }) {
  // Get current price for safety check
  let price = limitPrice
  if (!price) {
    try {
      const quote = await alpaca.getLatestTrade(symbol)
      price = quote.Price || 0
    } catch { price = 0 }
  }

  const safety = await safetyCheck(symbol, qty, side, price)
  if (!safety.safe) {
    return { ok: false, errors: safety.errors }
  }

  // Place the main order
  const orderParams = {
    symbol,
    qty,
    side,
    type,
    time_in_force: 'day'
  }
  if (type === 'limit' && limitPrice) {
    orderParams.limit_price = limitPrice
  }

  const order = await alpaca.createOrder(orderParams)

  // Log to local trades table
  const { v4: uuid } = await import('uuid')
  const tradeId = uuid()
  db.prepare(
    'INSERT INTO trades (id, strategy_id, symbol, side, qty, price, order_type, alpaca_order_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(tradeId, strategyId || null, symbol, side, qty, price, type, order.id, 'submitted')

  // Auto stop-loss for buy orders
  if (side === 'buy' && price > 0) {
    const slPercent = stopLossPercent || parseFloat(getSetting('default_stop_loss_percent') || '5')
    const stopPrice = Math.round(price * (1 - slPercent / 100) * 100) / 100
    try {
      await alpaca.createOrder({
        symbol,
        qty,
        side: 'sell',
        type: 'stop',
        stop_price: stopPrice,
        time_in_force: 'gtc'
      })
    } catch (e) {
      console.error(`Stop-loss order failed for ${symbol}:`, e.message)
    }
  }

  return {
    ok: true,
    tradeId,
    orderId: order.id,
    symbol,
    side,
    qty,
    type,
    price,
    status: order.status
  }
}

// ── Close Position ────────────────────────────────
export async function closePosition(symbol) {
  const result = await alpaca.closePosition(symbol)
  return { ok: true, symbol, orderId: result.id }
}

// ── Close All ─────────────────────────────────────
export async function closeAllPositions() {
  const result = await alpaca.closeAllPositions()
  return { ok: true, closed: result.length || 0 }
}

// ── Orders ────────────────────────────────────────
export async function getOrders(status = 'all') {
  const orders = await alpaca.getOrders({ status, limit: 50 })
  return orders.map(o => ({
    id: o.id,
    symbol: o.symbol,
    qty: parseFloat(o.qty),
    side: o.side,
    type: o.type,
    status: o.status,
    filledQty: parseFloat(o.filled_qty || 0),
    filledAvgPrice: o.filled_avg_price ? parseFloat(o.filled_avg_price) : null,
    createdAt: o.created_at,
    filledAt: o.filled_at
  }))
}

export async function cancelOrder(orderId) {
  await alpaca.cancelOrder(orderId)
  return { ok: true }
}

// ── Market Status ─────────────────────────────────
export async function isMarketOpen() {
  const clock = await alpaca.getClock()
  return {
    isOpen: clock.is_open,
    nextOpen: clock.next_open,
    nextClose: clock.next_close,
    timestamp: clock.timestamp
  }
}

// ── Sync Orders → Local Trades ────────────────────
export async function syncOrderFills() {
  const pendingTrades = db.prepare("SELECT * FROM trades WHERE status IN ('submitted', 'partially_filled')").all()
  let synced = 0

  for (const trade of pendingTrades) {
    if (!trade.alpaca_order_id) continue
    try {
      const order = await alpaca.getOrder(trade.alpaca_order_id)
      if (order.status === 'filled') {
        db.prepare('UPDATE trades SET status = ?, filled_price = ?, filled_at = ? WHERE id = ?')
          .run('filled', parseFloat(order.filled_avg_price), order.filled_at, trade.id)
        synced++
      } else if (['canceled', 'expired', 'rejected'].includes(order.status)) {
        db.prepare('UPDATE trades SET status = ? WHERE id = ?').run(order.status, trade.id)
        synced++
      }
    } catch (e) {
      console.error(`Sync failed for trade ${trade.id}:`, e.message)
    }
  }
  return { synced }
}

// ── Portfolio Snapshot ────────────────────────────
export async function takePortfolioSnapshot() {
  try {
    const account = await getAccount()
    const positions = await getPositions()
    db.prepare(
      'INSERT INTO portfolio_snapshots (equity, buying_power, positions_count, positions_json) VALUES (?, ?, ?, ?)'
    ).run(account.equity, account.buyingPower, positions.length, JSON.stringify(positions))
    return { ok: true }
  } catch (e) {
    console.error('Portfolio snapshot failed:', e.message)
    return { ok: false, error: e.message }
  }
}
