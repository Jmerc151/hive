import { Router } from 'express';
import { query } from '../db.js';
import { templates, getTemplate } from '../templates.js';

const router = Router();

// GET /api/templates — list all templates
router.get('/', (req, res) => {
  const summary = templates.map(t => ({
    id: t.id,
    name: t.name,
    description: t.description,
    icon: t.icon,
    agentCount: t.agents.length,
    agents: t.agents.map(a => ({ name: a.name, role: a.role, avatar: a.avatar, color: a.color })),
  }));
  res.json(summary);
});

// GET /api/templates/:id — get full template details
router.get('/:id', (req, res) => {
  const template = getTemplate(req.params.id);
  if (!template) return res.status(404).json({ error: 'Template not found' });
  res.json(template);
});

// POST /api/templates/:id/install — install template into workspace
router.post('/:id/install', async (req, res) => {
  const template = getTemplate(req.params.id);
  if (!template) return res.status(404).json({ error: 'Template not found' });
  if (template.agents.length === 0) return res.json({ installed: 0, agents: [] });

  try {
    const installed = [];
    for (const agent of template.agents) {
      const { rows: [created] } = await query(
        `INSERT INTO agents (workspace_id, name, role, avatar, color, model, system_prompt, tools)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [req.workspaceId, agent.name, agent.role, agent.avatar, agent.color,
         agent.model, agent.system_prompt, JSON.stringify(agent.tools)]
      );
      installed.push(created);
    }
    res.status(201).json({ installed: installed.length, agents: installed });
  } catch (err) {
    console.error('Template install error:', err);
    res.status(500).json({ error: 'Failed to install template' });
  }
});

export default router;
