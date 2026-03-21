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
    status TEXT DEFAULT 'backlog' CHECK(status IN ('backlog','todo','in_progress','in_review','done','failed','awaiting_approval','paused')),
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

  CREATE TABLE IF NOT EXISTS agent_interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_agent_id TEXT NOT NULL,
    target_agent_id TEXT NOT NULL,
    interaction_type TEXT NOT NULL CHECK(interaction_type IN ('consult','delegate','tool_call')),
    task_id TEXT,
    payload TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_interactions_time ON agent_interactions(created_at);

  CREATE TABLE IF NOT EXISTS intel_items (
    id TEXT PRIMARY KEY,
    task_id TEXT REFERENCES tasks(id),
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    source_url TEXT DEFAULT '',
    confidence REAL DEFAULT 0.5,
    tags TEXT DEFAULT '[]',
    status TEXT DEFAULT 'new' CHECK(status IN ('new','bookmarked','sent_to_forge','dismissed')),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    version TEXT DEFAULT '1.0.0',
    author TEXT DEFAULT 'john',
    skill_md TEXT NOT NULL,
    tags TEXT DEFAULT '[]',
    source TEXT DEFAULT 'custom' CHECK(source IN ('custom','clawhub','marketplace')),
    requires_tools TEXT DEFAULT '[]',
    downloads INTEGER DEFAULT 0,
    is_published INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS agent_skills_v2 (
    agent_id TEXT NOT NULL,
    skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    enabled INTEGER DEFAULT 1,
    priority INTEGER DEFAULT 0,
    installed_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (agent_id, skill_id)
  );

  CREATE TABLE IF NOT EXISTS proposals (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('feature','design','code','prompt','workflow')),
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    code_diff TEXT DEFAULT '',
    proposed_by TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','implemented')),
    priority TEXT DEFAULT 'medium' CHECK(priority IN ('low','medium','high')),
    effort TEXT DEFAULT 'medium' CHECK(effort IN ('low','medium','high')),
    user_notes TEXT DEFAULT '',
    source_task_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
`)

// Knowledge base for RAG
db.exec(`
  CREATE TABLE IF NOT EXISTS knowledge_documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK(source_type IN ('text','url','file')),
    source_url TEXT DEFAULT '',
    content TEXT NOT NULL,
    chunk_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','processing','ready','failed')),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding TEXT DEFAULT '',
    chunk_index INTEGER DEFAULT 0,
    token_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_chunks_doc ON knowledge_chunks(document_id);
`)

// Scheduled agent jobs (user-configurable cron)
db.exec(`
  CREATE TABLE IF NOT EXISTS scheduled_jobs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    task_title TEXT NOT NULL,
    task_description TEXT DEFAULT '',
    cron_expression TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    last_run TEXT,
    next_run TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`)

// A2A Protocol — external agent registry
db.exec(`
  CREATE TABLE IF NOT EXISTS a2a_agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    url TEXT NOT NULL,
    agent_card TEXT DEFAULT '{}',
    enabled INTEGER DEFAULT 1,
    last_contacted TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`)

// Multi-user auth
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'viewer' CHECK(role IN ('admin','operator','viewer')),
    display_name TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    last_login TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`)

// Migration-safe column additions
try { db.exec(`ALTER TABLE tasks ADD COLUMN tokens_used INTEGER DEFAULT 0`) } catch (e) { /* already exists */ }
try { db.exec(`ALTER TABLE tasks ADD COLUMN estimated_cost REAL DEFAULT 0`) } catch (e) { /* already exists */ }
try { db.exec(`ALTER TABLE tasks ADD COLUMN token_budget INTEGER DEFAULT 0`) } catch (e) { /* already exists */ }
try { db.exec(`ALTER TABLE tasks ADD COLUMN requires_approval INTEGER DEFAULT 0`) } catch (e) { /* already exists */ }
try { db.exec(`ALTER TABLE tasks ADD COLUMN pipeline_id TEXT`) } catch (e) { /* already exists */ }
try { db.exec(`ALTER TABLE tasks ADD COLUMN pipeline_step INTEGER DEFAULT 0`) } catch (e) { /* already exists */ }
try { db.exec(`ALTER TABLE tasks ADD COLUMN nexus_score INTEGER`) } catch (e) { /* already exists */ }
try { db.exec(`ALTER TABLE strategies ADD COLUMN paper_start_date TEXT`) } catch (e) { /* already exists */ }
try { db.exec(`ALTER TABLE tasks ADD COLUMN spawned_by TEXT DEFAULT ''`) } catch (e) { /* already exists */ }
try { db.exec(`ALTER TABLE tasks ADD COLUMN evidence TEXT DEFAULT '{}'`) } catch (e) { /* already exists */ }

// ── Performance indexes ──
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
  CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(agent_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at);
  CREATE INDEX IF NOT EXISTS idx_task_logs_task ON task_logs(task_id);
  CREATE INDEX IF NOT EXISTS idx_task_traces_task ON task_traces(task_id);
  CREATE INDEX IF NOT EXISTS idx_spend_log_date ON spend_log(date);
  CREATE INDEX IF NOT EXISTS idx_spend_log_agent ON spend_log(agent_id);
  CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
  CREATE INDEX IF NOT EXISTS idx_intel_status ON intel_items(status);
  CREATE INDEX IF NOT EXISTS idx_spend_log_agent_date ON spend_log(agent_id, date);
  CREATE INDEX IF NOT EXISTS idx_tasks_agent_status ON tasks(agent_id, status);
  CREATE INDEX IF NOT EXISTS idx_task_logs_agent ON task_logs(agent_id);
  CREATE INDEX IF NOT EXISTS idx_proposals_proposed_by ON proposals(proposed_by);
`)

// ── Industry-grade upgrade tables ──

// Task checkpointing for pause/resume (LangGraph-style)
db.exec(`
  CREATE TABLE IF NOT EXISTS task_checkpoints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    step INTEGER NOT NULL,
    messages_json TEXT NOT NULL,
    tool_counts_json TEXT DEFAULT '{}',
    full_output TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_checkpoint_task ON task_checkpoints(task_id, step);
`)

// Guardrail event logging
db.exec(`
  CREATE TABLE IF NOT EXISTS guardrail_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT,
    agent_id TEXT,
    tool_name TEXT NOT NULL,
    rule TEXT NOT NULL,
    action TEXT NOT NULL CHECK(action IN ('blocked','warned')),
    details TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );
`)

// Evaluation harness
db.exec(`
  CREATE TABLE IF NOT EXISTS eval_cases (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    input_prompt TEXT NOT NULL,
    expected_tools TEXT DEFAULT '[]',
    expected_keywords TEXT DEFAULT '[]',
    max_cost REAL DEFAULT 0.50,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS eval_runs (
    id TEXT PRIMARY KEY,
    eval_case_id TEXT NOT NULL REFERENCES eval_cases(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','running','passed','failed')),
    actual_tools TEXT DEFAULT '[]',
    actual_output TEXT DEFAULT '',
    score REAL DEFAULT 0,
    cost REAL DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    failure_reason TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_eval_runs_case ON eval_runs(eval_case_id);
  CREATE INDEX IF NOT EXISTS idx_guardrail_task ON guardrail_events(task_id);
`)

// MCP server connections
db.exec(`
  CREATE TABLE IF NOT EXISTS mcp_servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    transport TEXT NOT NULL CHECK(transport IN ('stdio','sse')),
    command TEXT DEFAULT '',
    args TEXT DEFAULT '[]',
    url TEXT DEFAULT '',
    enabled INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );
`)

// Semantic memory embeddings
db.exec(`
  CREATE TABLE IF NOT EXISTS memory_embeddings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding TEXT NOT NULL,
    tags TEXT DEFAULT '[]',
    source_task_id TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_memory_agent ON memory_embeddings(agent_id);
  CREATE INDEX IF NOT EXISTS idx_memory_agent_created ON memory_embeddings(agent_id, created_at DESC);
`)

// OTLP trace columns
try { db.exec(`ALTER TABLE task_traces ADD COLUMN trace_id TEXT DEFAULT ''`) } catch (e) { /* already exists */ }
try { db.exec(`ALTER TABLE task_traces ADD COLUMN span_id TEXT DEFAULT ''`) } catch (e) { /* already exists */ }
try { db.exec(`ALTER TABLE task_traces ADD COLUMN parent_span_id TEXT DEFAULT ''`) } catch (e) { /* already exists */ }

// Strategy meta table for learning loop
db.exec(`
  CREATE TABLE IF NOT EXISTS strategy_meta (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    indicator_combo TEXT NOT NULL,
    strategy_type TEXT DEFAULT '',
    pass_count INTEGER DEFAULT 0,
    fail_count INTEGER DEFAULT 0,
    avg_sharpe REAL DEFAULT 0,
    avg_win_rate REAL DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_meta_combo ON strategy_meta(indicator_combo);
`)

// Projects + Roadmaps — goal-driven task planning
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    goal TEXT NOT NULL,
    status TEXT DEFAULT 'active' CHECK(status IN ('draft','active','paused','completed','archived')),
    pillar TEXT DEFAULT '' CHECK(pillar IN ('','ember','hive','trading')),
    target_date TEXT,
    progress REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS milestones (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    agent_id TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','in_progress','done','blocked','skipped')),
    sort_order INTEGER DEFAULT 0,
    depends_on TEXT DEFAULT '[]',
    acceptance_criteria TEXT DEFAULT '',
    task_id TEXT,
    completed_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id, sort_order);
`)

// Smoke test monitoring
db.exec(`
  CREATE TABLE IF NOT EXISTS smoke_test_runs (
    id TEXT PRIMARY KEY,
    suite_name TEXT NOT NULL,
    total INTEGER DEFAULT 0,
    passed INTEGER DEFAULT 0,
    failed INTEGER DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    trigger TEXT DEFAULT 'heartbeat' CHECK(trigger IN ('heartbeat','manual','deploy')),
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_smoke_runs_time ON smoke_test_runs(created_at);

  CREATE TABLE IF NOT EXISTS smoke_tests (
    id TEXT PRIMARY KEY,
    suite_name TEXT NOT NULL,
    test_name TEXT NOT NULL,
    url TEXT NOT NULL,
    method TEXT DEFAULT 'GET',
    expected_status INTEGER DEFAULT 200,
    actual_status INTEGER,
    response_time_ms INTEGER DEFAULT 0,
    passed INTEGER DEFAULT 0,
    error TEXT DEFAULT '',
    response_snippet TEXT DEFAULT '',
    run_id TEXT NOT NULL REFERENCES smoke_test_runs(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_smoke_run ON smoke_tests(run_id);
  CREATE INDEX IF NOT EXISTS idx_smoke_suite ON smoke_tests(suite_name, created_at);
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS dead_letters (
    id TEXT PRIMARY KEY,
    task_id TEXT,
    agent_id TEXT NOT NULL,
    error TEXT NOT NULL,
    retries INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
`)

// Migration: add project_id to tasks
try { db.exec(`ALTER TABLE tasks ADD COLUMN project_id TEXT DEFAULT ''`) } catch (e) { /* already exists */ }
try { db.exec(`ALTER TABLE tasks ADD COLUMN milestone_id TEXT DEFAULT ''`) } catch (e) { /* already exists */ }

// Migration: goal ancestry on tasks
try { db.exec(`ALTER TABLE tasks ADD COLUMN goal TEXT DEFAULT ''`) } catch (e) { /* already exists */ }
try { db.exec(`ALTER TABLE tasks ADD COLUMN parent_goal TEXT DEFAULT ''`) } catch (e) { /* already exists */ }
try { db.exec(`ALTER TABLE tasks ADD COLUMN company_mission TEXT DEFAULT ''`) } catch (e) { /* already exists */ }

// Migration: fix tasks CHECK constraint to include 'paused' status
// SQLite can't ALTER CHECK constraints, so we recreate the table
try {
  const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'").get();
  if (tableInfo && tableInfo.sql && !tableInfo.sql.includes("'paused'")) {
    db.exec(`
      CREATE TABLE tasks_new (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        status TEXT DEFAULT 'backlog' CHECK(status IN ('backlog','todo','in_progress','in_review','done','failed','awaiting_approval','paused')),
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
        completed_at TEXT,
        nexus_score INTEGER,
        spawned_by TEXT DEFAULT '',
        evidence TEXT DEFAULT '{}',
        project_id TEXT DEFAULT '',
        milestone_id TEXT DEFAULT '',
        goal TEXT DEFAULT '',
        parent_goal TEXT DEFAULT '',
        company_mission TEXT DEFAULT ''
      );
      INSERT INTO tasks_new SELECT id, title, description, status, priority, agent_id, output, error, retries,
        tokens_used, estimated_cost, token_budget, requires_approval, pipeline_id, pipeline_step,
        created_at, updated_at, started_at, completed_at, nexus_score, spawned_by, evidence,
        project_id, milestone_id, goal, parent_goal, company_mission FROM tasks;
      DROP TABLE tasks;
      ALTER TABLE tasks_new RENAME TO tasks;
    `);
    console.log('[migration] Rebuilt tasks table with updated CHECK constraint (added paused)');
  }
} catch (e) { console.error('[migration] tasks CHECK constraint fix failed:', e.message); }

// Knowledge graph relationships
db.exec(`
  CREATE TABLE IF NOT EXISTS memory_relationships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_memory_id INTEGER REFERENCES memory_embeddings(id),
    to_memory_id INTEGER REFERENCES memory_embeddings(id),
    relationship TEXT NOT NULL,
    strength REAL DEFAULT 1.0,
    created_at TEXT DEFAULT (datetime('now'))
  );
`)

// Agent governance voting
db.exec(`
  CREATE TABLE IF NOT EXISTS agent_proposals_votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proposal_id TEXT REFERENCES proposals(id),
    agent_id TEXT NOT NULL,
    vote TEXT CHECK(vote IN ('approve','reject','abstain')),
    reasoning TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );
`)

// Cleanup: delete garbage auto-generated tasks
try {
  db.exec(`DELETE FROM tasks WHERE status = 'backlog' AND title LIKE 'Build tool based on:%'`)
  db.exec(`DELETE FROM tasks WHERE status IN ('backlog', 'todo') AND created_at < datetime('now', '-7 days') AND spawned_by IS NOT NULL AND spawned_by != ''`)
} catch (e) { /* cleanup already ran */ }

// Default settings
const defaults = {
  daily_limit_usd: '5.00',
  monthly_limit_usd: '75.00',
  per_task_token_budget: '65536',
  max_concurrent_tasks: '4',
  pause_all_agents: 'false',
  qa_reviews_enabled: 'true',
  auto_tasks_enabled: 'true',
  approval_threshold_usd: '999',
  approval_keywords: 'withdraw funds,delete all,send email,email outreach,cold email,contact restaurant,live trade,real capital',
  trading_enabled: 'true',
  trading_mode: 'paper',
  max_position_size_usd: '1000',
  max_daily_trades: '20',
  max_portfolio_percent: '10',
  default_stop_loss_percent: '5',
  strategy_auto_deploy: 'false',
  min_backtest_sharpe: '1.0',
  min_backtest_win_rate: '55',
  notification_email: 'Johnmercurio151@gmail.com',
  email_enabled: 'true',
  email_on_completion: 'false',
  email_on_approval: 'true',
  email_on_proposal: 'true',
  email_weekly_summary: 'true',
  self_improvement_enabled: 'true',
  self_improvement_budget_percent: '20',
  max_react_steps: '6',
  step_timeout_ms: '300000',
  auto_chain_enabled: 'true',
  // Per-agent daily spend limits
  scout_daily_usd: '1.50',
  forge_daily_usd: '1.50',
  quill_daily_usd: '0.75',
  dealer_daily_usd: '0.50',
  oracle_daily_usd: '0.50',
  nexus_daily_usd: '0.75',
  sentinel_daily_usd: '0.25',
  // AI services activation
  ai_services_activated: 'false',
  agentforge_phase: '1',
  max_concurrent_per_agent: '2',
  // Digest tracking
  digest_last_sent: ''
}

const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
for (const [key, value] of Object.entries(defaults)) {
  insertSetting.run(key, value)
}

// Migration: make agents autonomous — remove overly aggressive approval gates
// Only gate real-money actions (live trading, withdrawals), not normal agent work
try {
  const currentKeywords = db.prepare("SELECT value FROM settings WHERE key = 'approval_keywords'").get()?.value || ''
  if (currentKeywords === 'deploy,publish,send,delete') {
    db.prepare("UPDATE settings SET value = 'live trade,real capital,withdraw funds', updated_at = datetime('now') WHERE key = 'approval_keywords'").run()
  }
  const currentThreshold = db.prepare("SELECT value FROM settings WHERE key = 'approval_threshold_usd'").get()?.value || '999'
  if (parseFloat(currentThreshold) <= 5) {
    db.prepare("UPDATE settings SET value = '999', updated_at = datetime('now') WHERE key = 'approval_threshold_usd'").run()
  }
  // Auto-approve all stuck tasks — move them back to todo so agents can run them
  const stuck = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status = 'awaiting_approval'").get().c
  if (stuck > 0) {
    db.prepare("UPDATE tasks SET status = 'todo', requires_approval = 0, updated_at = datetime('now') WHERE status = 'awaiting_approval'").run()
  }
} catch (e) { /* migration already applied */ }

// Migration: bump token budget from 16384 to 65536 — research tasks were hitting budget before producing output
try {
  const currentBudget = db.prepare("SELECT value FROM settings WHERE key = 'per_task_token_budget'").get()?.value
  if (currentBudget === '16384') {
    db.prepare("UPDATE settings SET value = '65536' WHERE key = 'per_task_token_budget'").run()
  }
} catch (e) { /* already migrated */ }

// Migration: bump monthly limit — internal tracker over-counts vs OpenRouter actual spend
try {
  const currentMonthly = db.prepare("SELECT value FROM settings WHERE key = 'monthly_limit_usd'").get()?.value
  if (parseFloat(currentMonthly) <= 100) {
    db.prepare("UPDATE settings SET value = '200.00' WHERE key = 'monthly_limit_usd'").run()
    console.log('[migration] Bumped monthly_limit_usd from', currentMonthly, 'to 200.00')
  }
} catch (e) { console.error('[migration] monthly limit bump failed:', e.message) }

export default db
