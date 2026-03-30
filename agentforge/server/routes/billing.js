import { Router } from 'express';
import Stripe from 'stripe';
import { query } from '../db.js';
import { addCredits } from '../middleware/credits.js';

const router = Router();

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const PLANS = {
  starter: { price: 1900, credits: 500 },
  pro:     { price: 4900, credits: 2000 },
  team:    { price: 14900, credits: 10000 },
};

// POST /api/billing/checkout — create Stripe checkout session
router.post('/checkout', async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Billing not configured' });

  const { plan } = req.body;
  if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan' });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: req.user.email,
      metadata: { workspace_id: req.workspaceId, plan },
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: PLANS[plan].price,
          recurring: { interval: 'month' },
          product_data: { name: `AgentForge ${plan.charAt(0).toUpperCase() + plan.slice(1)}` },
        },
        quantity: 1,
      }],
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/billing?success=true`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/billing?cancelled=true`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// GET /api/billing/status
router.get('/status', async (req, res) => {
  res.json({
    plan: req.workspace.plan,
    credits: req.workspace.credits,
    stripe_customer_id: req.workspace.stripe_customer_id,
  });
});

// POST /api/billing/credits — buy additional credits
router.post('/credits', async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Billing not configured' });

  const { amount } = req.body;
  const validAmounts = { 100: 500, 500: 2000, 1000: 3500 }; // cents -> credits
  if (!validAmounts[amount]) return res.status(400).json({ error: 'Invalid credit pack' });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: req.user.email,
      metadata: { workspace_id: req.workspaceId, credits: validAmounts[amount] },
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: amount,
          product_data: { name: `${validAmounts[amount]} AgentForge Credits` },
        },
        quantity: 1,
      }],
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/billing?credits=purchased`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/billing`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Credit purchase error:', err);
    res.status(500).json({ error: 'Failed to create purchase session' });
  }
});

export default router;
