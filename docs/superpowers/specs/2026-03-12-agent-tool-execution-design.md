# Agent Tool Execution System — Design Spec

## Problem

Agents have zero real tools. The ReAct loop calls the LLM, gets text, stores it. Agents can't fetch market data, place trades, run backtests, or execute any server-side action. The only "action" is `[CONSULT:agent_id]`. Result: agents talk to each other producing text files but do no real work.

## Solution

Wire existing server services (broker, marketData, backtest, analysis) into the ReAct loop as callable tools using a text-pattern syntax that works with all models (including DeepSeek R1 and Perplexity Sonar which don't support OpenAI tool calling).

## Design

### Tool Call Syntax

Agents emit tool calls in their LLM response text:

```
[TOOL:get_indicators]{"symbol":"AAPL"}[/TOOL]
```

Server parses, executes, injects result as next user message:

```
[TOOL_RESULT:get_indicators]{"rsi14":62.3,"macd":{"value":1.2,"signal":0.8}}[/TOOL_RESULT]
```

Errors:

```
[TOOL_ERROR:get_indicators]Market data unavailable for symbol XYZ[/TOOL_ERROR]
```

### Tool Registry

A `TOOL_REGISTRY` object in `server/index.js` maps tool names to metadata and execute functions.

Each tool definition:
```js
{
  name: 'get_quote',
  description: 'Get real-time stock quote',
  params: { symbol: { type: 'string', required: true, description: 'Stock ticker symbol' } },
  agents: ['scout', 'oracle'],
  execute: async (args) => marketData.getQuote(args.symbol)
}
```

### Tools Available

| Tool | Description | Agents | Service |
|------|-------------|--------|---------|
| `get_quote` | Real-time stock quote (price, change, volume) | scout, oracle | `marketData.getQuote(symbol)` |
| `get_history` | Historical OHLCV price data | oracle | `marketData.getHistory(symbol, period, interval)` |
| `get_indicators` | Technical indicators (RSI, MACD, SMA, Bollinger) | scout, oracle | `marketData.getIndicators(symbol)` |
| `search_symbols` | Search for stock tickers by name | scout, oracle | `marketData.searchSymbols(query)` |
| `run_backtest` | Backtest a strategy on a symbol | oracle | `backtest.runBacktest(strategyId, symbol, period)` |
| `run_walkforward` | Walk-forward validation (70/30 split) | oracle | `backtest.runWalkForwardBacktest(strategyId, symbol, period)` |
| `place_order` | Place paper trade order | oracle | `broker.placeOrder({symbol, qty, side, type, limitPrice, strategyId})` |
| `get_positions` | Get all open positions | oracle | `broker.getPositions()` |
| `get_account` | Get account info (equity, buying power, P&L) | oracle | `broker.getAccount()` |
| `close_position` | Close a specific position | oracle | `broker.closePosition(symbol)` |
| `close_all_positions` | Close all open positions | oracle | `broker.closeAllPositions()` |
| `is_market_open` | Check if market is currently open | oracle | `broker.isMarketOpen()` |
| `get_orders` | Get recent orders | oracle | `broker.getOrders(status)` |
| `analyze_symbol` | Multi-lens AI analysis (5 analyst personas) | oracle | `analysis.analyzeSymbol(symbol, callClaude, agentId)` |
| `compute_trade_constraints` | Get position sizing limits | oracle | `analysis.computeTradeConstraints(symbol, side)` |
| `evaluate_ensemble` | Evaluate all strategies on a symbol | oracle | `analysis.evaluateEnsemble(symbol)` |
| `list_strategies` | List strategies by status | scout, oracle, nexus | DB query |
| `save_strategy` | Save a new discovered strategy | scout | DB insert |
| `create_task` | Create a task for any agent | nexus, scout | DB insert |
| `list_tasks` | List recent tasks by status/agent | nexus | DB query |
| `read_memory` | Read an agent's memory file | nexus | fs.readFile |
| `send_email` | Send notification email | nexus, quill | email.sendEmail() |

### ReAct Loop Changes

**File:** `server/index.js`, lines ~955-1063

1. **MAX_STEPS: 3 → 8** — agents need more steps for tool use cycles (call tool, read result, reason, call another tool)
2. **Tool-aware step processing:**
   - After each LLM call, regex parse response for `[TOOL:name]{json}[/TOOL]` patterns
   - Also continue parsing `[CONSULT:agent_id]` (existing behavior)
   - Execute all parsed tool calls (in parallel via Promise.all)
   - Inject results as a user message and continue the loop
   - If no tools AND no consults found → agent is done, break loop
3. **Tool execution:**
   - Look up tool in TOOL_REGISTRY
   - Verify agent is authorized (tool.agents includes current agentId)
   - Parse JSON args, validate required params
   - Execute with 30s timeout
   - Return result JSON (truncated to 10KB if needed)
   - Log tool call to task_traces table
4. **Safety limits:**
   - Max 5 tool calls per step
   - Max 8 total steps
   - 30s timeout per tool call
   - Results truncated to 10KB to prevent context overflow

### System Prompt Injection

When building the system prompt for `callClaude()`:

1. Query TOOL_REGISTRY for tools where `tool.agents.includes(agentId)`
2. Build a "Available Tools" section listing each tool with name, description, params
3. Add usage instructions explaining the `[TOOL:name]{json}[/TOOL]` syntax
4. Append to the agent's existing system prompt (after skills injection)

Example injected section:
```
## Available Tools

You can call tools during your work. Use this exact syntax:
[TOOL:tool_name]{"param":"value"}[/TOOL]

Wait for the result before continuing. You can call multiple tools in one response.

### Tools:
- get_quote(symbol) — Get real-time stock quote
- get_indicators(symbol) — Get technical indicators (RSI, MACD, SMA, Bollinger)
- run_backtest(strategyId, symbol, period) — Backtest a strategy
- place_order(symbol, qty, side, type, limitPrice, strategyId) — Place paper trade
...
```

### Agent Prompt Updates

Update `agents/agents.json` to remove fake capability claims and reference real tools:

- **Oracle:** Remove "you have access to..." text. Replace with "Use your tools to get real market data and place trades."
- **Scout:** Add tool awareness for `get_quote`, `get_indicators`, `save_strategy`, `search_symbols`
- **Nexus:** Add tool awareness for `list_tasks`, `create_task`, `read_memory`, `list_strategies`
- **Forge/Quill/Dealer:** Minimal changes — they don't have trading tools, but they can still use `[CONSULT:]`

### Trace Logging

Every tool call gets logged to `task_traces`:
```js
{
  task_id,
  event_type: 'tool_call',
  event_data: JSON.stringify({ tool: name, args, result_preview, duration_ms }),
  step_number,
  created_at
}
```

This integrates with the existing TraceView and SSE streaming.

### Files Changed

1. `server/index.js` — Tool registry, ReAct loop update, system prompt injection
2. `agents/agents.json` — Updated system prompts referencing real tools
3. No new dependencies needed
4. No new DB tables needed (uses existing task_traces)
