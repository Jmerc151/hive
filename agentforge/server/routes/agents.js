import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// GET /api/agents — list workspace agents
router.get('/', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM agents WHERE workspace_id = $1 ORDER BY created_at',
      [req.workspaceId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load agents' });
  }
});

// POST /api/agents — create agent
router.post('/', async (req, res) => {
  const { name, role, avatar, color, model, system_prompt, tools, config } = req.body;
  if (!name || !role || !system_prompt) {
    return res.status(400).json({ error: 'name, role, and system_prompt required' });
  }

  try {
    const { rows: [agent] } = await query(
      `INSERT INTO agents (workspace_id, name, role, avatar, color, model, system_prompt, tools, config)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [req.workspaceId, name, role, avatar, color, model || 'anthropic/claude-haiku-4-5', system_prompt,
       JSON.stringify(tools || []), JSON.stringify(config || {})]
    );
    res.status(201).json(agent);
  } catch (err) {
    console.error('Create agent error:', err);
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

// GET /api/agents/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows: [agent] } = await query(
      'SELECT * FROM agents WHERE id = $1 AND workspace_id = $2',
      [req.params.id, req.workspaceId]
    );
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    res.json(agent);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load agent' });
  }
});

// PUT /api/agents/:id
router.put('/:id', async (req, res) => {
  const { name, role, avatar, color, model, system_prompt, tools, config } = req.body;
  try {
    const { rows: [agent] } = await query(
      `UPDATE agents SET
        name = COALESCE($3, name), role = COALESCE($4, role),
        avatar = COALESCE($5, avatar), color = COALESCE($6, color),
        model = COALESCE($7, model), system_prompt = COALESCE($8, system_prompt),
        tools = COALESCE($9, tools), config = COALESCE($10, config),
        updated_at = now()
       WHERE id = $1 AND workspace_id = $2 RETURNING *`,
      [req.params.id, req.workspaceId, name, role, avatar, color, model, system_prompt,
       tools ? JSON.stringify(tools) : null, config ? JSON.stringify(config) : null]
    );
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    res.json(agent);
  } catch (err) {
    console.error('Update agent error:', err);
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

// DELETE /api/agents/:id
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await query(
      'DELETE FROM agents WHERE id = $1 AND workspace_id = $2',
      [req.params.id, req.workspaceId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Agent not found' });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete agent' });
  }
});

export default router;
