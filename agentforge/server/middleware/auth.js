import jwt from 'jsonwebtoken';
import { query } from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

// Auth middleware — requires valid JWT (header or query param for SSE)
export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  const queryToken = req.query.token;
  const raw = header?.startsWith('Bearer ') ? header.slice(7) : queryToken;

  if (!raw) {
    return res.status(401).json({ error: 'Missing authorization' });
  }
  try {
    const payload = verifyToken(raw);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Workspace middleware — loads workspace and verifies membership
export async function requireWorkspace(req, res, next) {
  const workspaceId = req.headers['x-workspace-id'] || req.query.workspace_id;
  if (!workspaceId) {
    return res.status(400).json({ error: 'Missing workspace ID' });
  }

  try {
    const { rows } = await query(
      `SELECT w.*, wm.role as member_role
       FROM workspaces w
       JOIN workspace_members wm ON wm.workspace_id = w.id
       WHERE w.id = $1 AND wm.user_id = $2`,
      [workspaceId, req.user.id]
    );

    if (!rows[0]) {
      return res.status(403).json({ error: 'Not a member of this workspace' });
    }

    req.workspace = rows[0];
    req.workspaceId = workspaceId;
    req.memberRole = rows[0].member_role;
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load workspace' });
  }
}

// Combined middleware
export function auth() {
  return [requireAuth, requireWorkspace];
}
