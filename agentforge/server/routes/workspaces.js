import { Router } from 'express';
import { query } from '../db.js';
import { requireWorkspace } from '../middleware/auth.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const router = Router();

// GET /api/workspaces — list user's workspaces
router.get('/', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT w.*, wm.role as member_role
       FROM workspaces w JOIN workspace_members wm ON wm.workspace_id = w.id
       WHERE wm.user_id = $1 ORDER BY w.created_at`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load workspaces' });
  }
});

// PATCH /api/workspaces/:id — update workspace name/settings
router.patch('/:id', requireWorkspace, async (req, res) => {
  try {
    if (req.memberRole !== 'owner' && req.memberRole !== 'admin') {
      return res.status(403).json({ error: 'Only owners and admins can update workspace settings' });
    }
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Workspace name is required' });
    }
    const { rows } = await query(
      `UPDATE workspaces SET name = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [name.trim(), req.workspaceId]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update workspace' });
  }
});

// DELETE /api/workspaces/:id — delete workspace
router.delete('/:id', requireWorkspace, async (req, res) => {
  try {
    if (req.memberRole !== 'owner') {
      return res.status(403).json({ error: 'Only the owner can delete a workspace' });
    }
    await query('DELETE FROM workspaces WHERE id = $1', [req.workspaceId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete workspace' });
  }
});

// --- Team Members ---

// GET /api/workspaces/:id/members — list members
router.get('/:id/members', requireWorkspace, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.email, u.name, u.avatar_url, wm.role, wm.joined_at
       FROM workspace_members wm JOIN users u ON u.id = wm.user_id
       WHERE wm.workspace_id = $1 ORDER BY wm.joined_at`,
      [req.workspaceId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load members' });
  }
});

// POST /api/workspaces/:id/members — invite member by email
router.post('/:id/members', requireWorkspace, async (req, res) => {
  try {
    if (req.memberRole !== 'owner' && req.memberRole !== 'admin') {
      return res.status(403).json({ error: 'Only owners and admins can invite members' });
    }
    const { email, role } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const memberRole = role || 'member';
    if (!['admin', 'member', 'viewer'].includes(memberRole)) {
      return res.status(400).json({ error: 'Invalid role. Use admin, member, or viewer' });
    }

    // Find or create user
    let { rows } = await query('SELECT id, email, name FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    let user = rows[0];
    if (!user) {
      // Create a placeholder user with a random password (they'll need to reset)
      const placeholder = crypto.randomBytes(32).toString('hex');
      const hash = await bcrypt.hash(placeholder, 10);
      const result = await query(
        'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, name',
        [email.toLowerCase().trim(), hash]
      );
      user = result.rows[0];
    }

    // Check if already a member
    const { rows: existing } = await query(
      'SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
      [req.workspaceId, user.id]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'User is already a member of this workspace' });
    }

    await query(
      'INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3)',
      [req.workspaceId, user.id, memberRole]
    );

    res.status(201).json({ id: user.id, email: user.email, name: user.name, role: memberRole, joined_at: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to invite member' });
  }
});

// PATCH /api/workspaces/:id/members/:userId — update member role
router.patch('/:id/members/:userId', requireWorkspace, async (req, res) => {
  try {
    if (req.memberRole !== 'owner' && req.memberRole !== 'admin') {
      return res.status(403).json({ error: 'Only owners and admins can change roles' });
    }
    const { role } = req.body;
    if (!role || !['admin', 'member', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Can't change owner's role
    const { rows: target } = await query(
      'SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
      [req.workspaceId, req.params.userId]
    );
    if (!target[0]) return res.status(404).json({ error: 'Member not found' });
    if (target[0].role === 'owner') return res.status(403).json({ error: 'Cannot change the owner role' });

    await query(
      'UPDATE workspace_members SET role = $1 WHERE workspace_id = $2 AND user_id = $3',
      [role, req.workspaceId, req.params.userId]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update member role' });
  }
});

// DELETE /api/workspaces/:id/members/:userId — remove member
router.delete('/:id/members/:userId', requireWorkspace, async (req, res) => {
  try {
    if (req.memberRole !== 'owner' && req.memberRole !== 'admin') {
      return res.status(403).json({ error: 'Only owners and admins can remove members' });
    }
    // Can't remove owner
    const { rows: target } = await query(
      'SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
      [req.workspaceId, req.params.userId]
    );
    if (!target[0]) return res.status(404).json({ error: 'Member not found' });
    if (target[0].role === 'owner') return res.status(403).json({ error: 'Cannot remove the workspace owner' });

    await query(
      'DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
      [req.workspaceId, req.params.userId]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// --- API Keys ---

// GET /api/workspaces/:id/keys — list API keys (no key values)
router.get('/:id/keys', requireWorkspace, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, label, last_used_at, created_at FROM api_keys
       WHERE workspace_id = $1 ORDER BY created_at DESC`,
      [req.workspaceId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load API keys' });
  }
});

// POST /api/workspaces/:id/keys — create new API key
router.post('/:id/keys', requireWorkspace, async (req, res) => {
  try {
    if (req.memberRole !== 'owner' && req.memberRole !== 'admin') {
      return res.status(403).json({ error: 'Only owners and admins can create API keys' });
    }
    const { label } = req.body;
    const keyLabel = (label || 'default').trim();

    // Generate key: af_live_ + 32 hex chars
    const rawKey = `af_live_${crypto.randomBytes(16).toString('hex')}`;
    const keyHash = await bcrypt.hash(rawKey, 10);

    const { rows } = await query(
      `INSERT INTO api_keys (workspace_id, key_hash, label) VALUES ($1, $2, $3)
       RETURNING id, label, created_at`,
      [req.workspaceId, keyHash, keyLabel]
    );

    // Return the raw key ONCE
    res.status(201).json({ ...rows[0], key: rawKey });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

// DELETE /api/workspaces/:id/keys/:keyId — revoke API key
router.delete('/:id/keys/:keyId', requireWorkspace, async (req, res) => {
  try {
    if (req.memberRole !== 'owner' && req.memberRole !== 'admin') {
      return res.status(403).json({ error: 'Only owners and admins can revoke API keys' });
    }
    const { rowCount } = await query(
      'DELETE FROM api_keys WHERE id = $1 AND workspace_id = $2',
      [req.params.keyId, req.workspaceId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'API key not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

// GET /api/workspaces/:id/usage — credit usage stats
router.get('/:id/usage', requireWorkspace, async (req, res) => {
  try {
    // Today's usage
    const { rows: [today] } = await query(
      `SELECT COALESCE(SUM(ABS(amount)), 0) as credits_used
       FROM credit_transactions
       WHERE workspace_id = $1 AND type = 'usage' AND created_at >= CURRENT_DATE`,
      [req.workspaceId]
    );

    // This month's usage
    const { rows: [month] } = await query(
      `SELECT COALESCE(SUM(ABS(amount)), 0) as credits_used
       FROM credit_transactions
       WHERE workspace_id = $1 AND type = 'usage'
       AND created_at >= date_trunc('month', CURRENT_DATE)`,
      [req.workspaceId]
    );

    // Per-agent breakdown
    const { rows: agentBreakdown } = await query(
      `SELECT a.name, a.id, COUNT(t.id) as tasks_run, COALESCE(SUM(t.credits_used), 0) as credits_used
       FROM agents a LEFT JOIN tasks t ON t.agent_id = a.id AND t.workspace_id = a.workspace_id
       WHERE a.workspace_id = $1 GROUP BY a.id, a.name ORDER BY credits_used DESC`,
      [req.workspaceId]
    );

    res.json({
      credits_remaining: req.workspace.credits,
      plan: req.workspace.plan,
      today: parseInt(today.credits_used),
      month: parseInt(month.credits_used),
      agents: agentBreakdown,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load usage' });
  }
});

export default router;
