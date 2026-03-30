import { Router } from 'express';
import { query, transaction } from '../db.js';

const router = Router();

// GET /api/pipelines — list workspace pipelines
router.get('/', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM pipelines WHERE workspace_id = $1 ORDER BY created_at DESC',
      [req.workspaceId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load pipelines' });
  }
});

// POST /api/pipelines — create pipeline
router.post('/', async (req, res) => {
  const { name, description, steps, schedule } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });

  try {
    const { rows: [pipeline] } = await query(
      `INSERT INTO pipelines (workspace_id, name, description, steps, schedule)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.workspaceId, name, description || null, JSON.stringify(steps || []), schedule || null]
    );
    res.status(201).json(pipeline);
  } catch (err) {
    console.error('Create pipeline error:', err);
    res.status(500).json({ error: 'Failed to create pipeline' });
  }
});

// GET /api/pipelines/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows: [pipeline] } = await query(
      'SELECT * FROM pipelines WHERE id = $1 AND workspace_id = $2',
      [req.params.id, req.workspaceId]
    );
    if (!pipeline) return res.status(404).json({ error: 'Pipeline not found' });
    res.json(pipeline);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load pipeline' });
  }
});

// PUT /api/pipelines/:id
router.put('/:id', async (req, res) => {
  const { name, description, steps, schedule, enabled } = req.body;
  try {
    const { rows: [pipeline] } = await query(
      `UPDATE pipelines SET
        name = COALESCE($3, name),
        description = COALESCE($4, description),
        steps = COALESCE($5, steps),
        schedule = COALESCE($6, schedule),
        enabled = COALESCE($7, enabled)
       WHERE id = $1 AND workspace_id = $2 RETURNING *`,
      [req.params.id, req.workspaceId, name,
       description !== undefined ? description : null,
       steps ? JSON.stringify(steps) : null,
       schedule !== undefined ? schedule : null,
       enabled !== undefined ? enabled : null]
    );
    if (!pipeline) return res.status(404).json({ error: 'Pipeline not found' });
    res.json(pipeline);
  } catch (err) {
    console.error('Update pipeline error:', err);
    res.status(500).json({ error: 'Failed to update pipeline' });
  }
});

// DELETE /api/pipelines/:id
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await query(
      'DELETE FROM pipelines WHERE id = $1 AND workspace_id = $2',
      [req.params.id, req.workspaceId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Pipeline not found' });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete pipeline' });
  }
});

// POST /api/pipelines/:id/run — execute pipeline
router.post('/:id/run', async (req, res) => {
  try {
    const { rows: [pipeline] } = await query(
      'SELECT * FROM pipelines WHERE id = $1 AND workspace_id = $2',
      [req.params.id, req.workspaceId]
    );
    if (!pipeline) return res.status(404).json({ error: 'Pipeline not found' });

    const steps = pipeline.steps || [];
    if (!steps.length) return res.status(400).json({ error: 'Pipeline has no steps' });

    const result = await transaction(async (client) => {
      // Create parent task for the pipeline run
      const { rows: [parentTask] } = await client.query(
        `INSERT INTO tasks (workspace_id, title, description, status)
         VALUES ($1, $2, $3, 'running') RETURNING *`,
        [req.workspaceId, `Pipeline: ${pipeline.name}`, `Running pipeline "${pipeline.name}" with ${steps.length} steps`]
      );

      // Create child tasks for each step
      const childTasks = [];
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const dependsOnTask = step.depends_on !== null && step.depends_on !== undefined
          ? childTasks[step.depends_on] : null;

        const { rows: [childTask] } = await client.query(
          `INSERT INTO tasks (workspace_id, agent_id, title, description, status, parent_id, priority)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [
            req.workspaceId,
            step.agent_id,
            `Step ${i + 1}: ${step.prompt.slice(0, 80)}`,
            step.prompt,
            dependsOnTask ? 'paused' : 'pending',
            parentTask.id,
            i,
          ]
        );
        childTasks.push(childTask);
      }

      // Update last_run_at
      await client.query(
        'UPDATE pipelines SET last_run_at = now() WHERE id = $1',
        [pipeline.id]
      );

      return { pipeline: pipeline.id, parent_task: parentTask, child_tasks: childTasks };
    });

    res.json(result);
  } catch (err) {
    console.error('Run pipeline error:', err);
    res.status(500).json({ error: 'Failed to run pipeline' });
  }
});

export default router;
