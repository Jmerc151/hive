import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { query, transaction } from '../db.js';
import { generateToken } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  const { email, password, name, workspaceName } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    const result = await transaction(async (client) => {
      // Check for existing user
      const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows[0]) {
        throw Object.assign(new Error('Email already registered'), { status: 409 });
      }

      // Create user
      const hash = await bcrypt.hash(password, 10);
      const { rows: [user] } = await client.query(
        'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name',
        [email, hash, name || email.split('@')[0]]
      );

      // Create default workspace
      const slug = (workspaceName || user.name).toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 40);
      const { rows: [workspace] } = await client.query(
        'INSERT INTO workspaces (name, slug) VALUES ($1, $2) RETURNING id, name, slug, plan, credits',
        [workspaceName || `${user.name}'s Workspace`, slug + '-' + Date.now().toString(36)]
      );

      // Add user as owner
      await client.query(
        'INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3)',
        [workspace.id, user.id, 'owner']
      );

      return { user, workspace };
    });

    const token = generateToken(result.user);
    res.status(201).json({ token, user: result.user, workspace: result.workspace });
  } catch (err) {
    if (err.status === 409) return res.status(409).json({ error: err.message });
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Signup failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const { rows: [user] } = await query(
      'SELECT id, email, name, password_hash FROM users WHERE email = $1',
      [email]
    );
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Get user's workspaces
    const { rows: workspaces } = await query(
      `SELECT w.id, w.name, w.slug, w.plan, w.credits, wm.role
       FROM workspaces w JOIN workspace_members wm ON wm.workspace_id = w.id
       WHERE wm.user_id = $1 ORDER BY wm.joined_at`,
      [user.id]
    );

    const token = generateToken(user);
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name },
      workspaces,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  // requireAuth is applied at the router level in index.js
  try {
    const { rows: [user] } = await query(
      'SELECT id, email, name, avatar_url, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { rows: workspaces } = await query(
      `SELECT w.id, w.name, w.slug, w.plan, w.credits, wm.role
       FROM workspaces w JOIN workspace_members wm ON wm.workspace_id = w.id
       WHERE wm.user_id = $1 ORDER BY wm.joined_at`,
      [user.id]
    );

    res.json({ user, workspaces });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Failed to load user' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const { rows: [user] } = await query('SELECT id FROM users WHERE email = $1', [email]);

    let token = null;
    if (user) {
      // Invalidate any existing unused tokens
      await query(
        'UPDATE password_reset_tokens SET used = true WHERE user_id = $1 AND used = false',
        [user.id]
      );

      // Generate reset token
      token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await query(
        'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
        [user.id, tokenHash, expiresAt]
      );
    }

    // Always return same message to prevent email enumeration
    // In production, send email here. For testing, include the token.
    const response = { message: "If an account exists with that email, we've sent a reset link." };
    if (token) response.token = token; // Remove this in production
    res.json(response);
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and password are required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const { rows: [resetToken] } = await query(
      `SELECT id, user_id FROM password_reset_tokens
       WHERE token_hash = $1 AND used = false AND expires_at > now()`,
      [tokenHash]
    );

    if (!resetToken) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const hash = await bcrypt.hash(password, 10);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, resetToken.user_id]);
    await query('UPDATE password_reset_tokens SET used = true WHERE id = $1', [resetToken.id]);

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

export default router;
