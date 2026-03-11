import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dbPath = process.env.DB_PATH || join(__dirname, '..', 'hive.db')
const db = new Database(dbPath)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT DEFAULT 'backlog' CHECK(status IN ('backlog','todo','in_progress','in_review','done','failed','awaiting_approval')),
    priority TEXT DEFAULT 'medium' CHECK(priority IN ('low','medium','high','critical')),
    agent_id TEXT,
    output TEXT DEFAULT '',
    error TEXT DEFAULT '',
    retries INTEGER DEFAULT 0,
    tokens_used INTEGER DEFAULT 0,
    estimated_cost REAL DEFAULT 0,
    token_budget INTEGER DEFAULT 0,
    requires_approval INTEGER DEFAULT 0,
    pipeline_id TEXT,
    pipeline_step INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    started_at TEXT,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS task_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    agent_id TEXT,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info' CHECK(type IN ('info','success','error','warning','output')),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    sender_avatar TEXT DEFAULT '',
    sender_color TEXT DEFAULT '',
    text TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS spend_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    agent_id TEXT,
    tokens_in INTEGER,
    tokens_out INTEGER,
    cost REAL,
    task_id TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS bot_suggestions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT NOT NULL,
    audience TEXT DEFAULT '',
    monetization TEXT DEFAULT '',
    reasoning TEXT DEFAULT '',
    source TEXT DEFAULT 'scout',
    created_at TEXT DEFAULT (datetime('now')),
    used INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS task_traces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    agent_id TEXT,
    step INTEGER DEFAULT 0,
    type TEXT DEFAULT 'llm_call',
    input_summary TEXT DEFAULT '',
    output_summary TEXT DEFAULT '',
    tokens_in INTEGER DEFAULT 0,
    tokens_out INTEGER DEFAULT 0,
    cost REAL DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    model TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS revenue_entries (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    amount REAL NOT NULL,
    source TEXT DEFAULT '',
    agent_id TEXT,
    task_id TEXT,
    notes TEXT DEFAULT '',
    date TEXT DEFAULT (date('now')),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS pipelines (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    steps TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS event_triggers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    config TEXT DEFAULT '{}',
    action TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    last_fired TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS agent_skills (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    type TEXT DEFAULT 'builtin',
    config TEXT DEFAULT '{}',
    enabled INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS market_data_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    data_type TEXT NOT NULL,
    data TEXT NOT NULL,
    fetched_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_cache_lookup ON market_data_cache(symbol, data_type);

  CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY,
    strategy_id TEXT,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    qty REAL NOT NULL,
    price REAL,
    order_type TEXT DEFAULT 'market',
    alpaca_order_id TEXT,
    status TEXT DEFAULT 'pending',
    filled_price REAL,
    filled_at TEXT,
    pnl REAL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS watchlist (
    id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL UNIQUE,
    added_at TEXT DEFAULT (datetime('now')),
    notes TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    equity REAL,
    buying_power REAL,
    positions_count INTEGER,
    positions_json TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS strategies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    type TEXT DEFAULT 'technical',
    logic TEXT NOT NULL,
    source TEXT DEFAULT 'manual',
    source_url TEXT DEFAULT '',
    status TEXT DEFAULT 'discovered',
    discovered_by TEXT DEFAULT '',
    approved_by TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS strategy_backtests (
    id TEXT PRIMARY KEY,
    strategy_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    period TEXT NOT NULL,
    initial_capital REAL DEFAULT 10000,
    final_equity REAL,
    total_return REAL,
    sharpe_ratio REAL,
    max_drawdown REAL,
    win_rate REAL,
    total_trades INTEGER,
    equity_curve TEXT,
    trade_log TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS bot_deployments (
    id TEXT PRIMARY KEY,
    strategy_id TEXT NOT NULL,
    symbols TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    last_signal TEXT DEFAULT '',
    last_signal_at TEXT,
    trades_count INTEGER DEFAULT 0,
    total_pnl REAL DEFAULT 0,
    started_at TEXT DEFAULT (datetime('now')),
    stopped_at TEXT
  );

  CREATE TABLE IF NOT EXISTS strategy_performance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    strategy_id TEXT NOT NULL,
    deployment_id TEXT,
    date TEXT NOT NULL,
    pnl REAL DEFAULT 0,
    trades INTEGER DEFAULT 0,
    win_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
`)

// Migration-safe column additions
try { db.exec(`ALTER TABLE tasks ADD COLUMN tokens_used INTEGER DEFAULT 0`) } catch (e) { /* already exists */ }
try { db.exec(`ALTER TABLE tasks ADD COLUMN estimated_cost REAL DEFAULT 0`) } catch (e) { /* already exists */ }
try { db.exec(`ALTER TABLE tasks ADD COLUMN token_budget INTEGER DEFAULT 0`) } catch (e) { /* already exists */ }
try { db.exec(`ALTER TABLE tasks ADD COLUMN requires_approval INTEGER DEFAULT 0`) } catch (e) { /* already exists */ }
try { db.exec(`ALTER TABLE tasks ADD COLUMN pipeline_id TEXT`) } catch (e) { /* already exists */ }
try { db.exec(`ALTER TABLE tasks ADD COLUMN pipeline_step INTEGER DEFAULT 0`) } catch (e) { /* already exists */ }

// Default settings
const defaults = {
  daily_limit_usd: '5.00',
  monthly_limit_usd: '100.00',
  per_task_token_budget: '16384',
  max_concurrent_tasks: '2',
  pause_all_agents: 'false',
  approval_threshold_usd: '1.00',
  approval_keywords: 'deploy,publish,send,delete',
  trading_enabled: 'true',
  trading_mode: 'paper',
  max_position_size_usd: '1000',
  max_daily_trades: '20',
  max_portfolio_percent: '10',
  default_stop_loss_percent: '5',
  strategy_auto_deploy: 'false',
  min_backtest_sharpe: '1.0',
  min_backtest_win_rate: '55'
}

const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
for (const [key, value] of Object.entries(defaults)) {
  insertSetting.run(key, value)
}

export default db
