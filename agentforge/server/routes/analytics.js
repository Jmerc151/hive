import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// GET /api/analytics/overview — dashboard stats
router.get('/overview', async (req, res) => {
  try {
    const wsId = req.workspaceId;

    const [
      { rows: [totalTasks] },
      { rows: [tasksToday] },
      { rows: [tasksWeek] },
      { rows: [creditsToday] },
      { rows: [creditsWeek] },
      { rows: [creditsMonth] },
      { rows: [agentCounts] },
      { rows: [avgCredits] },
    ] = await Promise.all([
      query('SELECT COUNT(*)::int as count FROM tasks WHERE workspace_id = $1', [wsId]),
      query('SELECT COUNT(*)::int as count FROM tasks WHERE workspace_id = $1 AND created_at >= CURRENT_DATE', [wsId]),
      query('SELECT COUNT(*)::int as count FROM tasks WHERE workspace_id = $1 AND created_at >= CURRENT_DATE - INTERVAL \'7 days\'', [wsId]),
      query('SELECT COALESCE(SUM(ABS(amount)), 0)::int as total FROM credit_transactions WHERE workspace_id = $1 AND type = \'usage\' AND created_at >= CURRENT_DATE', [wsId]),
      query('SELECT COALESCE(SUM(ABS(amount)), 0)::int as total FROM credit_transactions WHERE workspace_id = $1 AND type = \'usage\' AND created_at >= CURRENT_DATE - INTERVAL \'7 days\'', [wsId]),
      query('SELECT COALESCE(SUM(ABS(amount)), 0)::int as total FROM credit_transactions WHERE workspace_id = $1 AND type = \'usage\' AND created_at >= date_trunc(\'month\', CURRENT_DATE)', [wsId]),
      query('SELECT COUNT(*)::int as total, COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM tasks t WHERE t.agent_id = agents.id AND t.status = \'running\'))::int as active FROM agents WHERE workspace_id = $1', [wsId]),
      query('SELECT COALESCE(AVG(credits_used), 0)::numeric(10,1) as avg FROM tasks WHERE workspace_id = $1 AND credits_used > 0', [wsId]),
    ]);

    res.json({
      total_tasks: totalTasks.count,
      tasks_today: tasksToday.count,
      tasks_this_week: tasksWeek.count,
      credits_today: creditsToday.total,
      credits_this_week: creditsWeek.total,
      credits_this_month: creditsMonth.total,
      active_agents: agentCounts.active,
      total_agents: agentCounts.total,
      avg_credits_per_task: parseFloat(avgCredits.avg),
    });
  } catch (err) {
    console.error('Analytics overview error:', err);
    res.status(500).json({ error: 'Failed to load analytics overview' });
  }
});

// GET /api/analytics/daily?days=7 — daily credit usage
router.get('/daily', async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 7, 90);
    const { rows } = await query(
      `SELECT
         d::date as date,
         COALESCE(SUM(ABS(ct.amount)) FILTER (WHERE ct.type = 'usage'), 0)::int as credits_used,
         COALESCE(COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'completed'), 0)::int as tasks_completed,
         COALESCE(COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'failed'), 0)::int as tasks_failed
       FROM generate_series(CURRENT_DATE - $2::int * INTERVAL '1 day', CURRENT_DATE, '1 day') d
       LEFT JOIN credit_transactions ct ON ct.workspace_id = $1 AND ct.created_at::date = d::date
       LEFT JOIN tasks t ON t.workspace_id = $1 AND t.created_at::date = d::date
       GROUP BY d ORDER BY d`,
      [req.workspaceId, days - 1]
    );
    res.json(rows);
  } catch (err) {
    console.error('Analytics daily error:', err);
    res.status(500).json({ error: 'Failed to load daily analytics' });
  }
});

// GET /api/analytics/agents — per-agent breakdown
router.get('/agents', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT
         a.id as agent_id,
         a.name as agent_name,
         a.color as agent_color,
         COUNT(t.id)::int as tasks_run,
         COUNT(t.id) FILTER (WHERE t.status = 'completed')::int as tasks_completed,
         COUNT(t.id) FILTER (WHERE t.status = 'failed')::int as tasks_failed,
         COALESCE(SUM(t.credits_used), 0)::int as credits_used,
         CASE WHEN COUNT(t.id) > 0 THEN ROUND(SUM(t.credits_used)::numeric / COUNT(t.id), 1) ELSE 0 END as avg_credits_per_task
       FROM agents a
       LEFT JOIN tasks t ON t.agent_id = a.id AND t.workspace_id = a.workspace_id
       WHERE a.workspace_id = $1
       GROUP BY a.id, a.name, a.color
       ORDER BY credits_used DESC`,
      [req.workspaceId]
    );
    res.json(rows);
  } catch (err) {
    console.error('Analytics agents error:', err);
    res.status(500).json({ error: 'Failed to load agent analytics' });
  }
});

// GET /api/analytics/tasks — task status distribution
router.get('/tasks', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'pending')::int as pending,
         COUNT(*) FILTER (WHERE status = 'running')::int as running,
         COUNT(*) FILTER (WHERE status = 'completed')::int as completed,
         COUNT(*) FILTER (WHERE status = 'failed')::int as failed,
         COUNT(*) FILTER (WHERE status = 'paused')::int as paused,
         COUNT(*) FILTER (WHERE status = 'cancelled')::int as cancelled
       FROM tasks WHERE workspace_id = $1`,
      [req.workspaceId]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('Analytics tasks error:', err);
    res.status(500).json({ error: 'Failed to load task analytics' });
  }
});

export default router;
