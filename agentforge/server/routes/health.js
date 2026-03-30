import { Router } from 'express';
import { checkHealth } from '../db.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const dbOk = await checkHealth();
    res.json({
      status: 'ok',
      version: '0.1.0',
      db: dbOk ? 'connected' : 'error',
      uptime: process.uptime(),
    });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

export default router;
