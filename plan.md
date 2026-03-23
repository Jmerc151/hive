# DeerFlow-Inspired Features Plan

## Feature 1: Memory Confidence Scoring

### Problem
Agent memory is flat `.md` files. Last 2000 chars are injected into prompts — this is arbitrary and often includes stale/low-value entries.

### Solution
Add a `memory_facts` table with structured facts scored by confidence (0-1). During prompt injection, select top-N most relevant facts instead of raw text tail.

### Changes

**1a. New `memory_facts` table in `server/db.js`**
```sql
CREATE TABLE IF NOT EXISTS memory_facts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  fact TEXT NOT NULL,
  confidence REAL DEFAULT 0.5,
  category TEXT DEFAULT 'general',
  source_task_id TEXT,
  access_count INTEGER DEFAULT 0,
  last_accessed TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_facts_agent ON memory_facts(agent_id);
CREATE INDEX idx_facts_agent_conf ON memory_facts(agent_id, confidence DESC);
```

Categories: `strategy`, `pattern`, `gotcha`, `contact`, `revenue`, `technical`, `general`

**1b. Modify `updateAgentMemory()` in `server/index.js` (~line 2678)**
- After task completion, ask Claude to extract structured facts as JSON array
- Each fact: `{ fact, confidence, category }`
- Upsert into `memory_facts` (merge duplicates, boost confidence on re-discovery)
- Still append to .md file for backward compatibility

**1c. Modify memory injection (~line 4274)**
- Replace `agentMemory.slice(-2000)` with top-15 facts by confidence
- Format: `## Your Memory\n- [0.95] strategy: ...\n- [0.87] pattern: ...`
- Bump `access_count` and `last_accessed` on injected facts

**1d. Add memory decay**
- Facts older than 30 days without access lose 0.1 confidence
- Run during existing 7-day memory-compaction heartbeat

**1e. API endpoints**
- `GET /api/agents/:id/facts` — list facts with filters
- `DELETE /api/memory/facts/:id` — delete a fact

## Feature 2: Progressive Skill Loading

### Problem
ALL enabled skills for an agent are injected every step. With 5+ skills, this wastes 2000+ tokens on irrelevant instructions.

### Solution
Match skills against task context to only load relevant ones. Use skill tags + task title/description keyword matching.

### Changes

**2a. Add `relevance_keywords` to skills table (migration in db.js)**
```sql
ALTER TABLE skills ADD COLUMN relevance_keywords TEXT DEFAULT '[]';
```
Populated from existing `tags` field + extracted keywords from skill name/description.

**2b. New `selectRelevantSkills()` function in `server/index.js`**
- Input: agent_id, task title, task description
- Process:
  1. Get all enabled skills for agent
  2. Score each skill: keyword overlap between (skill tags + relevance_keywords) and (task title + description)
  3. Always include skills with priority < 3 (high-priority = always loaded)
  4. Return top 3 skills by relevance score (+ any always-on skills)
- Fallback: if no matches, load all (preserve current behavior)

**2c. Modify skill loading in ReAct loop (~line 4318)**
- Replace current "load all" with `selectRelevantSkills(agent.id, task.title, task.description)`
- Log which skills were selected for traceability

## Implementation Order
1. Memory facts table + schema (db.js)
2. Skills relevance_keywords migration (db.js)
3. updateAgentMemory → fact extraction (index.js)
4. Memory injection → top-N facts (index.js)
5. Memory decay in heartbeat (index.js)
6. selectRelevantSkills function (index.js)
7. Skill loading modification (index.js)
8. API endpoints for facts (index.js)
9. Syntax check + build verification
