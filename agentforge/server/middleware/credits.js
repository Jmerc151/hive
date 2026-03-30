import { query, transaction } from '../db.js';

const PLAN_LIMITS = {
  free:       { monthly: 50,    agents: 2,  pipelines: 1 },
  starter:    { monthly: 500,   agents: 4,  pipelines: 3 },
  pro:        { monthly: 2000,  agents: -1, pipelines: -1 },
  team:       { monthly: 10000, agents: -1, pipelines: -1 },
  enterprise: { monthly: -1,    agents: -1, pipelines: -1 },
};

// Check if workspace has enough credits before execution
export async function requireCredits(amount = 1) {
  return async (req, res, next) => {
    const ws = req.workspace;
    if (ws.credits < amount) {
      return res.status(402).json({
        error: 'Insufficient credits',
        credits: ws.credits,
        required: amount,
        plan: ws.plan,
      });
    }
    next();
  };
}

// Deduct credits after a successful agent step
export async function deductCredits(workspaceId, amount, taskId, description) {
  return transaction(async (client) => {
    // Deduct from workspace
    const { rows } = await client.query(
      'UPDATE workspaces SET credits = credits - $1, updated_at = now() WHERE id = $2 AND credits >= $1 RETURNING credits',
      [amount, workspaceId]
    );
    if (!rows[0]) {
      throw new Error('Insufficient credits');
    }

    // Log transaction
    await client.query(
      `INSERT INTO credit_transactions (workspace_id, amount, type, description, task_id)
       VALUES ($1, $2, 'usage', $3, $4)`,
      [workspaceId, -amount, description || 'Agent step', taskId]
    );

    return rows[0].credits;
  });
}

// Add credits (purchase, bonus)
export async function addCredits(workspaceId, amount, type, description, stripePaymentId) {
  return transaction(async (client) => {
    const { rows } = await client.query(
      'UPDATE workspaces SET credits = credits + $1, updated_at = now() WHERE id = $2 RETURNING credits',
      [amount, workspaceId]
    );

    await client.query(
      `INSERT INTO credit_transactions (workspace_id, amount, type, description, stripe_payment_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [workspaceId, amount, type, description, stripePaymentId]
    );

    return rows[0].credits;
  });
}

export function getPlanLimits(plan) {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}
