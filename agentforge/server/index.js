import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { migrate } from './db.js';
import { requireAuth, requireWorkspace } from './middleware/auth.js';
import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import agentRoutes from './routes/agents.js';
import taskRoutes from './routes/tasks.js';
import workspaceRoutes from './routes/workspaces.js';
import billingRoutes from './routes/billing.js';
import pipelineRoutes from './routes/pipelines.js';
import templateRoutes from './routes/templates.js';
import analyticsRoutes from './routes/analytics.js';

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '1mb' }));

// Request timeout
app.use((req, res, next) => {
  const timeout = req.path.includes('/run') ? 300000 : 30000;
  req.setTimeout(timeout);
  res.setTimeout(timeout);
  next();
});

// Public routes
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);

// Protected routes (require auth + workspace)
app.use('/api/agents', requireAuth, requireWorkspace, agentRoutes);
app.use('/api/tasks', requireAuth, requireWorkspace, taskRoutes);
app.use('/api/workspaces', requireAuth, workspaceRoutes);
app.use('/api/billing', requireAuth, requireWorkspace, billingRoutes);
app.use('/api/pipelines', requireAuth, requireWorkspace, pipelineRoutes);
app.use('/api/templates', requireAuth, requireWorkspace, templateRoutes);
app.use('/api/analytics', requireAuth, requireWorkspace, analyticsRoutes);

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  const { join, dirname } = await import('path');
  const { fileURLToPath } = await import('url');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  app.use(express.static(join(__dirname, '..', 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(join(__dirname, '..', 'dist', 'index.html'));
  });
}

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start
async function start() {
  try {
    await migrate();
    console.log('Database ready');
  } catch (err) {
    console.error('Migration failed:', err.message);
    console.log('Continuing without DB — set DATABASE_URL to connect');
  }

  app.listen(PORT, () => {
    console.log(`AgentForge API running on port ${PORT}`);
  });
}

start();
