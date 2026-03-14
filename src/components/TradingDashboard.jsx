import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { SkeletonList } from './Skeleton'

const TABS = ['overview', 'analysis', 'positions', 'strategies', 'trades', 'watchlist']

export default function TradingDashboard({ agents, onClose }) {
  const [tab, setTab] = useState('overview')
  const [account, setAccount] = useState(null)
  const [positions, setPositions] = useState([])
  const [strategies, setStrategies] = useState([])
  const [deployments, setDeployments] = useState([])
  const [trades, setTrades] = useState([])
  const [watchlist, setWatchlist] = useState([])
  const [marketStatus, setMarketStatus] = useState(null)
  const [config, setConfig] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [newSymbol, setNewSymbol] = useState('')
  const [backtesting, setBacktesting] = useState(null)
  const [analysisSymbol, setAnalysisSymbol] = useState('')
  const [analysisResult, setAnalysisResult] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [ensemble, setEnsemble] = useState(null)

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 15000)
    return () => clearInterval(interval)
  }, [])

  async function loadData() {
    try {
      const [acct, pos, strats, deps, trds, wl, ms, cfg] = await Promise.all([
        api.getTradingAccount().catch(() => null),
        api.getPositions().catch(() => []),
        api.getStrategies().catch(() => []),
        api.getDeployments().catch(() => []),
        api.getTradeHistory().catch(() => []),
        api.getWatchlist().catch(() => []),
        api.getMarketStatus().catch(() => null),
        api.getTradingConfig().catch(() => ({}))
      ])
      setAccount(acct)
      setPositions(pos)
      setStrategies(strats)
      setDeployments(deps)
      setTrades(trds)
      setWatchlist(wl)
      setMarketStatus(ms)
      setConfig(cfg)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleBacktest(strategyId) {
    setBacktesting(strategyId)
    try {
      await api.runBacktest(strategyId, { symbol: 'SPY', period: '1y' })
      await loadData()
    } catch (e) {
      alert('Backtest failed: ' + e.message)
    } finally {
      setBacktesting(null)
    }
  }

  async function handleDeploy(strategyId) {
    try {
      await api.deployStrategy(strategyId)
      await loadData()
    } catch (e) { alert('Deploy failed: ' + e.message) }
  }

  async function handlePauseDeployment(depId) {
    await api.pauseDeployment(depId)
    await loadData()
  }

  async function handleStopDeployment(depId) {
    await api.stopDeployment(depId)
    await loadData()
  }

  async function handleClosePosition(symbol) {
    if (!confirm(`Close ${symbol} position?`)) return
    await api.closePosition(symbol)
    await loadData()
  }

  async function handleAddWatchlist(e) {
    e.preventDefault()
    if (!newSymbol.trim()) return
    await api.addToWatchlist({ symbol: newSymbol.trim().toUpperCase() })
    setNewSymbol('')
    await loadData()
  }

  async function handleRemoveWatchlist(id) {
    await api.removeFromWatchlist(id)
    await loadData()
  }

  async function handleToggleTrading() {
    const newVal = config.trading_enabled === 'true' ? 'false' : 'true'
    await api.updateTradingConfig({ trading_enabled: newVal })
    setConfig(prev => ({ ...prev, trading_enabled: newVal }))
  }

  async function handleAnalyze(e) {
    e.preventDefault()
    if (!analysisSymbol.trim()) return
    const sym = analysisSymbol.trim().toUpperCase()
    setAnalyzing(true)
    setAnalysisResult(null)
    setEnsemble(null)
    try {
      const [result, ens] = await Promise.all([
        api.analyzeSymbol(sym),
        api.getEnsemble(sym).catch(() => null)
      ])
      setAnalysisResult(result)
      setEnsemble(ens)
    } catch (e) {
      alert('Analysis failed: ' + e.message)
    } finally {
      setAnalyzing(false)
    }
  }

  const signalColor = (s) => s === 'bullish' ? 'text-green-400' : s === 'bearish' ? 'text-red-400' : 'text-hive-400'
  const signalBg = (s) => s === 'bullish' ? 'bg-green-500/20 border-green-500/30' : s === 'bearish' ? 'bg-red-500/20 border-red-500/30' : 'bg-hive-600/50 border-hive-500/30'
  const actionBg = (a) => {
    if (a?.includes('BUY')) return 'bg-green-500/20 text-green-400'
    if (a?.includes('SELL')) return 'bg-red-500/20 text-red-400'
    return 'bg-hive-600/50 text-hive-300'
  }

  const pnlColor = (v) => v > 0 ? 'text-green-400' : v < 0 ? 'text-red-400' : 'text-hive-400'
  const pnlSign = (v) => v > 0 ? '+' : ''
  const statusBadge = (status) => {
    const colors = { discovered: 'bg-blue-500/20 text-blue-400', backtesting: 'bg-yellow-500/20 text-yellow-400', approved: 'bg-green-500/20 text-green-400', deployed: 'bg-purple-500/20 text-purple-400', paused: 'bg-orange-500/20 text-orange-400', retired: 'bg-red-500/20 text-red-400' }
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-hive-600 text-hive-300'}`}>{status}</span>
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-hive-800 border border-hive-700 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-5 border-b border-hive-700 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📈</span>
            <div>
              <h2 className="text-lg font-semibold">Trading Dashboard</h2>
              <div className="flex items-center gap-2 text-xs text-hive-400">
                {marketStatus && (
                  <span className={`flex items-center gap-1 ${marketStatus.isOpen ? 'text-green-400' : 'text-red-400'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${marketStatus.isOpen ? 'bg-green-400' : 'bg-red-400'}`} />
                    Market {marketStatus.isOpen ? 'Open' : 'Closed'}
                  </span>
                )}
                <span>Paper Trading</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleToggleTrading} className={`px-3 py-1 rounded-lg text-xs font-medium ${config.trading_enabled === 'true' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
              {config.trading_enabled === 'true' ? '🟢 Trading On' : '🔴 Trading Off'}
            </button>
            <button onClick={onClose} className="text-hive-400 hover:text-hive-200 text-xl" aria-label="Close trading dashboard">&times;</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-3 border-b border-hive-700 shrink-0">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${tab === t ? 'bg-hive-700 text-honey border-b-2 border-honey' : 'text-hive-400 hover:text-hive-200'}`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? <SkeletonList count={3} /> :
           error ? <div className="text-center text-red-400 py-8">Error: {error}<br/><span className="text-xs text-hive-500">Make sure ALPACA_API_KEY is set on the server</span></div> :

          tab === 'overview' ? (
            <div className="space-y-4">
              {/* Account cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-hive-700/50 rounded-lg p-3">
                  <div className="text-xs text-hive-400">Equity</div>
                  <div className="text-lg font-semibold">${account?.equity?.toLocaleString() || '—'}</div>
                </div>
                <div className="bg-hive-700/50 rounded-lg p-3">
                  <div className="text-xs text-hive-400">Buying Power</div>
                  <div className="text-lg font-semibold">${account?.buyingPower?.toLocaleString() || '—'}</div>
                </div>
                <div className="bg-hive-700/50 rounded-lg p-3">
                  <div className="text-xs text-hive-400">Day P&L</div>
                  <div className={`text-lg font-semibold ${pnlColor(account?.dayPnl)}`}>
                    {account ? `${pnlSign(account.dayPnl)}$${Math.abs(account.dayPnl).toFixed(2)}` : '—'}
                  </div>
                </div>
                <div className="bg-hive-700/50 rounded-lg p-3">
                  <div className="text-xs text-hive-400">Positions</div>
                  <div className="text-lg font-semibold">{positions.length}</div>
                </div>
              </div>

              {/* Active deployments */}
              <div>
                <h3 className="text-sm font-medium text-hive-300 mb-2">Active Deployments</h3>
                {deployments.filter(d => d.status === 'active').length === 0 ? (
                  <p className="text-sm text-hive-500">No active deployments. Deploy a strategy to start trading.</p>
                ) : (
                  <div className="space-y-2">
                    {deployments.filter(d => d.status === 'active').map(dep => (
                      <div key={dep.id} className="flex items-center justify-between bg-hive-700/30 rounded-lg p-3 border border-hive-700">
                        <div>
                          <div className="text-sm font-medium">{dep.strategy_name || 'Unknown'}</div>
                          <div className="text-xs text-hive-400">{dep.symbols?.join(', ')} · {dep.trades_count} trades</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {dep.last_signal && <span className="text-xs text-hive-400">{dep.last_signal}</span>}
                          <button onClick={() => handlePauseDeployment(dep.id)} className="text-xs px-2 py-1 bg-orange-500/20 text-orange-400 rounded hover:bg-orange-500/30">Pause</button>
                          <button onClick={() => handleStopDeployment(dep.id)} className="text-xs px-2 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30">Stop</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Strategy summary */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-hive-700/50 rounded-lg p-3">
                  <div className="text-2xl font-semibold">{strategies.filter(s => s.status === 'discovered').length}</div>
                  <div className="text-xs text-hive-400">Discovered</div>
                </div>
                <div className="bg-hive-700/50 rounded-lg p-3">
                  <div className="text-2xl font-semibold text-green-400">{strategies.filter(s => s.status === 'approved' || s.status === 'deployed').length}</div>
                  <div className="text-xs text-hive-400">Approved</div>
                </div>
                <div className="bg-hive-700/50 rounded-lg p-3">
                  <div className="text-2xl font-semibold text-red-400">{strategies.filter(s => s.status === 'retired').length}</div>
                  <div className="text-xs text-hive-400">Retired</div>
                </div>
              </div>
            </div>
          ) :

          tab === 'analysis' ? (
            <div className="space-y-4">
              {/* Search */}
              <form onSubmit={handleAnalyze} className="flex gap-2">
                <input type="text" value={analysisSymbol} onChange={e => setAnalysisSymbol(e.target.value)} placeholder="Enter symbol (e.g. AAPL, TSLA, NVDA)" className="flex-1 bg-hive-900 border border-hive-600 rounded-lg px-3 py-2 text-sm text-hive-100 placeholder:text-hive-500 focus:outline-none focus:ring-2 focus:ring-honey/50" />
                <button type="submit" disabled={analyzing} className="px-4 py-2 bg-honey text-white rounded-lg text-sm font-medium hover:bg-honey-dim disabled:opacity-50">
                  {analyzing ? 'Analyzing...' : 'Analyze'}
                </button>
              </form>

              {analyzing && (
                <div className="text-center py-8">
                  <div className="text-hive-400 text-sm">Running 5 analyst personas on {analysisSymbol.toUpperCase()}...</div>
                  <div className="text-xs text-hive-500 mt-1">Value · Momentum · Contrarian · Technical · Risk</div>
                </div>
              )}

              {analysisResult && (
                <>
                  {/* Composite verdict */}
                  <div className={`rounded-lg p-4 border ${signalBg(analysisResult.composite?.signal)}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl font-bold">{analysisResult.symbol}</span>
                        <span className="text-sm text-hive-400">${analysisResult.marketData?.price?.toFixed(2)}</span>
                        <span className={`text-sm ${pnlColor(analysisResult.marketData?.changePercent)}`}>
                          {analysisResult.marketData?.changePercent >= 0 ? '+' : ''}{analysisResult.marketData?.changePercent?.toFixed(2)}%
                        </span>
                      </div>
                      <span className={`text-lg font-bold px-3 py-1 rounded-lg ${actionBg(analysisResult.composite?.action)}`}>
                        {analysisResult.composite?.action}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className={signalColor(analysisResult.composite?.signal)}>
                        {analysisResult.composite?.signal?.toUpperCase()} ({analysisResult.composite?.confidence}%)
                      </span>
                    </div>
                    <p className="text-sm text-hive-300 mt-2">{analysisResult.composite?.reasoning}</p>
                    {analysisResult.composite?.suggested_entry && (
                      <div className="flex gap-4 mt-2 text-xs text-hive-400">
                        <span>Entry: ${analysisResult.composite.suggested_entry}</span>
                        {analysisResult.composite.suggested_stop && <span>Stop: ${analysisResult.composite.suggested_stop}</span>}
                        {analysisResult.composite.suggested_target && <span>Target: ${analysisResult.composite.suggested_target}</span>}
                      </div>
                    )}
                  </div>

                  {/* Persona breakdown */}
                  <div>
                    <h3 className="text-sm font-medium text-hive-300 mb-2">Analyst Breakdown</h3>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                      {analysisResult.analyses?.map(a => (
                        <div key={a.persona_id} className={`rounded-lg p-3 border ${signalBg(a.signal)}`}>
                          <div className="flex items-center gap-1.5 mb-1">
                            <span>{analysisResult.personas?.find(p => p.id === a.persona_id)?.icon || '📊'}</span>
                            <span className="text-xs font-medium truncate">{a.persona_name}</span>
                          </div>
                          <div className={`text-sm font-bold ${signalColor(a.signal)}`}>
                            {a.signal?.toUpperCase()}
                          </div>
                          <div className="text-xs text-hive-400 mt-0.5">{a.confidence}% confident</div>
                          <p className="text-xs text-hive-400 mt-1 line-clamp-3">{a.reasoning}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Key indicators */}
                  <div>
                    <h3 className="text-sm font-medium text-hive-300 mb-2">Key Indicators</h3>
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-center">
                      {[
                        { label: 'RSI(14)', value: analysisResult.marketData?.rsi14?.toFixed(1), signal: analysisResult.marketData?.rsiSignal },
                        { label: 'Trend', value: analysisResult.marketData?.trend },
                        { label: 'SMA20', value: '$' + analysisResult.marketData?.sma20?.toFixed(2) },
                        { label: 'SMA50', value: '$' + analysisResult.marketData?.sma50?.toFixed(2) },
                        { label: 'SMA200', value: analysisResult.marketData?.sma200 ? '$' + analysisResult.marketData.sma200.toFixed(2) : 'N/A' },
                        { label: 'MACD', value: analysisResult.marketData?.macd?.histogram?.toFixed(3) }
                      ].map(ind => (
                        <div key={ind.label} className="bg-hive-700/50 rounded-lg p-2">
                          <div className="text-xs text-hive-500">{ind.label}</div>
                          <div className="text-sm font-medium">{ind.value}</div>
                          {ind.signal && <div className={`text-xs ${ind.signal === 'oversold' ? 'text-green-400' : ind.signal === 'overbought' ? 'text-red-400' : 'text-hive-400'}`}>{ind.signal}</div>}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Strategy ensemble */}
                  {ensemble?.signals?.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-hive-300 mb-2">Strategy Ensemble ({ensemble.composite?.strategiesEvaluated} strategies)</h3>
                      <div className={`rounded-lg p-3 border mb-2 ${signalBg(ensemble.composite?.signal)}`}>
                        <div className="flex items-center justify-between">
                          <span className={`font-bold ${signalColor(ensemble.composite?.signal)}`}>
                            Ensemble: {ensemble.composite?.signal?.toUpperCase()}
                          </span>
                          <span className="text-xs text-hive-400">
                            Bull {ensemble.composite?.bullishCount} · Bear {ensemble.composite?.bearishCount} · Neutral {ensemble.composite?.neutralCount}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        {ensemble.signals.map(s => (
                          <div key={s.strategy_id} className="flex items-center justify-between text-xs bg-hive-700/30 rounded px-3 py-1.5">
                            <span className="font-medium">{s.strategy_name}</span>
                            <div className="flex items-center gap-2">
                              {s.backtest && <span className="text-hive-500">Sharpe {s.backtest.sharpe} · WR {s.backtest.winRate}%</span>}
                              <span className={`font-medium ${signalColor(s.signal)}`}>{s.signal.toUpperCase()}</span>
                              <span className="text-hive-500">w:{s.weight}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {!analysisResult && !analyzing && (
                <div className="text-center text-hive-500 py-8">
                  <p className="text-sm">Enter a ticker symbol to run multi-lens analysis.</p>
                  <p className="text-xs mt-1">5 AI analyst personas evaluate simultaneously: Value, Momentum, Contrarian, Technical, and Risk.</p>
                </div>
              )}
            </div>
          ) :

          tab === 'positions' ? (
            <div className="space-y-3">
              {positions.length === 0 ? (
                <p className="text-center text-hive-500 py-8">No open positions</p>
              ) : (
                <div className="overflow-x-auto -mx-5 px-5">
                  <table className="min-w-full text-xs sm:text-sm">
                    <thead>
                      <tr className="text-xs text-hive-400 border-b border-hive-700">
                        <th className="text-left py-2">Symbol</th>
                        <th className="text-right py-2">Qty</th>
                        <th className="text-right py-2">Avg Entry</th>
                        <th className="text-right py-2">Current</th>
                        <th className="text-right py-2">P&L</th>
                        <th className="text-right py-2">P&L %</th>
                        <th className="text-right py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map(p => (
                        <tr key={p.symbol} className="border-b border-hive-700/50">
                          <td className="py-2 font-medium">{p.symbol}</td>
                          <td className="py-2 text-right">{p.qty}</td>
                          <td className="py-2 text-right">${p.avgEntry?.toFixed(2)}</td>
                          <td className="py-2 text-right">${p.currentPrice?.toFixed(2)}</td>
                          <td className={`py-2 text-right ${pnlColor(p.unrealizedPnl)}`}>{pnlSign(p.unrealizedPnl)}${Math.abs(p.unrealizedPnl).toFixed(2)}</td>
                          <td className={`py-2 text-right ${pnlColor(p.unrealizedPnlPercent)}`}>{pnlSign(p.unrealizedPnlPercent)}{Math.abs(p.unrealizedPnlPercent).toFixed(2)}%</td>
                          <td className="py-2 text-right">
                            <button onClick={() => handleClosePosition(p.symbol)} className="text-xs px-2 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30">Close</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) :

          tab === 'strategies' ? (
            <div className="space-y-3">
              {strategies.length === 0 ? (
                <p className="text-center text-hive-500 py-8">No strategies yet. Scout will discover them automatically, or create one manually.</p>
              ) : strategies.map(s => (
                <div key={s.id} className="bg-hive-700/30 rounded-lg p-4 border border-hive-700">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{s.name}</span>
                      {statusBadge(s.status)}
                      <span className="text-xs text-hive-500 bg-hive-700/50 px-1.5 py-0.5 rounded">{s.type}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {(s.status === 'discovered' || s.status === 'approved') && (
                        <button onClick={() => handleBacktest(s.id)} disabled={backtesting === s.id} className="text-xs px-2 py-1 bg-honey/20 text-honey rounded hover:bg-honey/30 disabled:opacity-50">
                          {backtesting === s.id ? 'Running...' : 'Backtest'}
                        </button>
                      )}
                      {s.status === 'approved' && (
                        <button onClick={() => handleDeploy(s.id)} className="text-xs px-2 py-1 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30">Deploy</button>
                      )}
                    </div>
                  </div>
                  {s.description && <p className="text-xs text-hive-400 mb-2">{s.description}</p>}
                  <div className="flex items-center gap-3 text-xs text-hive-500">
                    <span>Source: {s.source}</span>
                    {s.source_url && <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="text-honey hover:underline">Link</a>}
                    <span>{new Date(s.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          ) :

          tab === 'trades' ? (
            <div className="space-y-2">
              {trades.length === 0 ? (
                <p className="text-center text-hive-500 py-8">No trades yet</p>
              ) : (
                <div className="overflow-x-auto -mx-5 px-5">
                  <table className="min-w-full text-xs sm:text-sm">
                    <thead>
                      <tr className="text-xs text-hive-400 border-b border-hive-700">
                        <th className="text-left py-2">Time</th>
                        <th className="text-left py-2">Symbol</th>
                        <th className="text-left py-2">Side</th>
                        <th className="text-right py-2">Qty</th>
                        <th className="text-right py-2">Price</th>
                        <th className="text-right py-2">P&L</th>
                        <th className="text-left py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trades.map(t => (
                        <tr key={t.id} className="border-b border-hive-700/50">
                          <td className="py-2 text-xs text-hive-400">{new Date(t.created_at).toLocaleString()}</td>
                          <td className="py-2 font-medium">{t.symbol}</td>
                          <td className={`py-2 ${t.side === 'buy' ? 'text-green-400' : 'text-red-400'}`}>{t.side.toUpperCase()}</td>
                          <td className="py-2 text-right">{t.qty}</td>
                          <td className="py-2 text-right">${t.filled_price?.toFixed(2) || t.price?.toFixed(2) || '—'}</td>
                          <td className={`py-2 text-right ${pnlColor(t.pnl)}`}>{t.pnl != null ? `${pnlSign(t.pnl)}$${Math.abs(t.pnl).toFixed(2)}` : '—'}</td>
                          <td className="py-2 text-xs">{t.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) :

          tab === 'watchlist' ? (
            <div className="space-y-3">
              <form onSubmit={handleAddWatchlist} className="flex gap-2">
                <input type="text" value={newSymbol} onChange={e => setNewSymbol(e.target.value)} placeholder="Add symbol (e.g. AAPL)" className="flex-1 bg-hive-900 border border-hive-600 rounded-lg px-3 py-2 text-sm text-hive-100 placeholder:text-hive-500 focus:outline-none focus:ring-2 focus:ring-honey/50" />
                <button type="submit" className="px-4 py-2 bg-honey text-white rounded-lg text-sm font-medium hover:bg-honey-dim">Add</button>
              </form>
              {watchlist.length === 0 ? (
                <p className="text-center text-hive-500 py-8">Watchlist empty. Add symbols to track.</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {watchlist.map(w => (
                    <div key={w.id} className="bg-hive-700/30 rounded-lg p-3 border border-hive-700 flex items-center justify-between">
                      <div>
                        <div className="font-medium text-sm">{w.symbol}</div>
                        {w.notes && <div className="text-xs text-hive-500">{w.notes}</div>}
                      </div>
                      <button onClick={() => handleRemoveWatchlist(w.id)} className="text-hive-500 hover:text-red-400 text-sm">&times;</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
