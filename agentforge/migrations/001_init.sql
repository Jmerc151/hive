-- AgentForge Multi-Tenant Schema
-- Every tenant-scoped table has workspace_id for isolation

-- Workspaces (tenants)
CREATE TABLE workspaces (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  plan          TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','starter','pro','team','enterprise')),
  credits       INTEGER NOT NULL DEFAULT 50,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Users
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Workspace membership
CREATE TABLE workspace_members (
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member','viewer')),
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

-- API keys per workspace
CREATE TABLE api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key_hash      TEXT NOT NULL,
  label         TEXT NOT NULL DEFAULT 'default',
  last_used_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agents
CREATE TABLE agents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL,
  avatar        TEXT,
  color         TEXT,
  model         TEXT NOT NULL DEFAULT 'anthropic/claude-haiku-4-5',
  system_prompt TEXT NOT NULL,
  tools         JSONB NOT NULL DEFAULT '[]',
  config        JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tasks
CREATE TABLE tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id      UUID REFERENCES agents(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed','paused','cancelled')),
  priority      INTEGER NOT NULL DEFAULT 0,
  result        TEXT,
  error         TEXT,
  credits_used  INTEGER NOT NULL DEFAULT 0,
  parent_id     UUID REFERENCES tasks(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ
);

-- Task execution logs (ReAct steps)
CREATE TABLE task_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  step          INTEGER NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('thought','action','observation','error')),
  content       TEXT NOT NULL,
  tool_name     TEXT,
  tool_input    JSONB,
  tool_output   JSONB,
  tokens_used   INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Credit transactions
CREATE TABLE credit_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  amount        INTEGER NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('purchase','usage','bonus','refund')),
  description   TEXT,
  task_id       UUID REFERENCES tasks(id) ON DELETE SET NULL,
  stripe_payment_id TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Spend tracking
CREATE TABLE spend_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id      UUID REFERENCES agents(id) ON DELETE SET NULL,
  task_id       UUID REFERENCES tasks(id) ON DELETE SET NULL,
  model         TEXT NOT NULL,
  tokens_in     INTEGER NOT NULL DEFAULT 0,
  tokens_out    INTEGER NOT NULL DEFAULT 0,
  cost_usd      NUMERIC(10,6) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pipelines (chained agent workflows)
CREATE TABLE pipelines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  steps         JSONB NOT NULL DEFAULT '[]',
  schedule      TEXT,
  enabled       BOOLEAN NOT NULL DEFAULT true,
  last_run_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Skills (reusable instruction packages)
CREATE TABLE skills (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  content       TEXT NOT NULL,
  category      TEXT,
  is_public     BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agent-skill assignments
CREATE TABLE agent_skills (
  agent_id      UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  skill_id      UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  PRIMARY KEY (agent_id, skill_id)
);

-- Agent memory
CREATE TABLE memories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id      UUID REFERENCES agents(id) ON DELETE CASCADE,
  content       TEXT NOT NULL,
  category      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for tenant isolation and performance
CREATE INDEX idx_agents_workspace ON agents(workspace_id);
CREATE INDEX idx_tasks_workspace ON tasks(workspace_id);
CREATE INDEX idx_tasks_status ON tasks(workspace_id, status);
CREATE INDEX idx_task_logs_task ON task_logs(task_id);
CREATE INDEX idx_credit_tx_workspace ON credit_transactions(workspace_id);
CREATE INDEX idx_spend_log_workspace ON spend_log(workspace_id);
CREATE INDEX idx_spend_log_created ON spend_log(workspace_id, created_at);
CREATE INDEX idx_pipelines_workspace ON pipelines(workspace_id);
CREATE INDEX idx_skills_workspace ON skills(workspace_id);
CREATE INDEX idx_memories_agent ON memories(workspace_id, agent_id);
CREATE INDEX idx_api_keys_workspace ON api_keys(workspace_id);
