import { Router } from 'express';
import { query } from '../db.js';
import { taskEvents } from '../engine/events.js';

const router = Router();

// GET /api/tasks
router.get('/', async (req, res) => {
  const { status, agent_id, limit = 50, offset = 0 } = req.query;
  try {
    let sql = 'SELECT t.*, a.name as agent_name FROM tasks t LEFT JOIN agents a ON a.id = t.agent_id WHERE t.workspace_id = $1';
    const params = [req.workspaceId];
    let idx = 2;

    if (status) { sql += ` AND t.status = $${idx++}`; params.push(status); }
    if (agent_id) { sql += ` AND t.agent_id = $${idx++}`; params.push(agent_id); }

    sql += ` ORDER BY t.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit), parseInt(offset));

    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load tasks' });
  }
});

// POST /api/tasks — create task
router.post('/', async (req, res) => {
  const { title, description, agent_id, priority } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });

  try {
    const { rows: [task] } = await query(
      `INSERT INTO tasks (workspace_id, agent_id, title, description, priority)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.workspaceId, agent_id, title, description, priority || 0]
    );
    res.status(201).json(task);
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// GET /api/tasks/:id/stream — SSE endpoint for real-time task execution
router.get('/:id/stream', async (req, res) => {
  const taskId = req.params.id;
  const workspaceId = req.workspaceId;

  // Verify task exists and belongs to workspace
  try {
    const { rows: [task] } = await query(
      'SELECT id, status FROM tasks WHERE id = $1 AND workspace_id = $2',
      [taskId, workspaceId]
    );
    if (!task) return res.status(404).json({ error: 'Task not found' });

    // If task is already done, send final status and close
    if (['completed', 'failed', 'cancelled'].includes(task.status)) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
      res.write(`data: ${JSON.stringify({ event: `task:${task.status === 'completed' ? 'complete' : 'error'}`, taskId, type: task.status, content: `Task already ${task.status}`, timestamp: new Date().toISOString() })}\n\n`);
      res.end();
      return;
    }
  } catch (err) {
    return res.status(500).json({ error: 'Failed to verify task' });
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ event: 'connected', taskId, timestamp: new Date().toISOString() })}\n\n`);

  // Subscribe to task events
  const unsubscribe = taskEvents.subscribe(taskId, (data) => {
    if (res.writableEnded) return;
    res.write(`data: ${JSON.stringify(data)}\n\n`);

    // Close connection after terminal events
    if (data.event === 'task:complete' || data.event === 'task:error') {
      clearInterval(keepalive);
      setTimeout(() => {
        if (!res.writableEnded) res.end();
      }, 500);
    }
  });

  // Keepalive every 15 seconds
  const keepalive = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(keepalive);
      return;
    }
    res.write(': keepalive\n\n');
  }, 15000);

  // Clean up on client disconnect
  req.on('close', () => {
    unsubscribe();
    clearInterval(keepalive);
  });
});

// GET /api/tasks/:id — task with logs
router.get('/:id', async (req, res) => {
  try {
    const { rows: [task] } = await query(
      'SELECT t.*, a.name as agent_name FROM tasks t LEFT JOIN agents a ON a.id = t.agent_id WHERE t.id = $1 AND t.workspace_id = $2',
      [req.params.id, req.workspaceId]
    );
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const { rows: logs } = await query(
      'SELECT * FROM task_logs WHERE task_id = $1 ORDER BY step, created_at',
      [task.id]
    );
    res.json({ ...task, logs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load task' });
  }
});

// POST /api/tasks/:id/run — execute task via ReAct loop
router.post('/:id/run', async (req, res) => {
  try {
    const { rows: [task] } = await query(
      'SELECT * FROM tasks WHERE id = $1 AND workspace_id = $2',
      [req.params.id, req.workspaceId]
    );
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.status === 'running') return res.status(409).json({ error: 'Task already running' });

    // Mark as running
    await query(
      "UPDATE tasks SET status = 'running', started_at = now() WHERE id = $1",
      [task.id]
    );

    // TODO: Trigger ReAct execution loop (engine/react-loop.js)
    // For now, return the task — the engine will be built in Phase 5
    res.json({ ...task, status: 'running', message: 'Task queued for execution' });
  } catch (err) {
    console.error('Run task error:', err);
    res.status(500).json({ error: 'Failed to run task' });
  }
});

// POST /api/tasks/:id/cancel
router.post('/:id/cancel', async (req, res) => {
  try {
    const { rows: [task] } = await query(
      "UPDATE tasks SET status = 'cancelled', completed_at = now() WHERE id = $1 AND workspace_id = $2 AND status IN ('pending', 'running') RETURNING *",
      [req.params.id, req.workspaceId]
    );
    if (!task) return res.status(404).json({ error: 'Task not found or not cancellable' });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel task' });
  }
});

export default router;
