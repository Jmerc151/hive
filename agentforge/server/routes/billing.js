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

const PLAN_CREDITS = { starter: 500, pro: 2000, team: 10000 };

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

// POST /api/billing/portal — create Stripe billing portal session
router.post('/portal', async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Billing not configured' });

  const customerId = req.workspace.stripe_customer_id;
  if (!customerId) return res.status(400).json({ error: 'No active subscription found' });

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/billing`,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('Portal error:', err);
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});

// Stripe webhook handler — exported separately, needs raw body
export async function handleStripeWebhook(req, res) {
  if (!stripe) return res.status(503).json({ error: 'Billing not configured' });

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not set');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const { workspace_id, plan, credits } = session.metadata || {};

        if (session.mode === 'subscription' && workspace_id && plan) {
          // Subscription created — update workspace
          const monthlyCredits = PLAN_CREDITS[plan] || 0;
          await query(
            `UPDATE workspaces SET plan = $1, stripe_customer_id = $2, stripe_subscription_id = $3, updated_at = now()
             WHERE id = $4`,
            [plan, session.customer, session.subscription, workspace_id]
          );
          if (monthlyCredits > 0) {
            await addCredits(workspace_id, monthlyCredits, 'subscription', `${plan} plan monthly credits`, session.payment_intent);
          }
          console.log(`Workspace ${workspace_id} upgraded to ${plan}, +${monthlyCredits} credits`);
        } else if (session.mode === 'payment' && workspace_id && credits) {
          // Credit pack purchased
          const creditAmount = parseInt(credits, 10);
          await addCredits(workspace_id, creditAmount, 'purchase', `Purchased ${creditAmount} credits`, session.payment_intent);
          console.log(`Workspace ${workspace_id} purchased ${creditAmount} credits`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        // Downgrade workspace to free
        const { rows } = await query(
          `UPDATE workspaces SET plan = 'free', stripe_subscription_id = NULL, updated_at = now()
           WHERE stripe_customer_id = $1 RETURNING id`,
          [customerId]
        );
        if (rows[0]) {
          console.log(`Workspace ${rows[0].id} downgraded to free (subscription cancelled)`);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        console.warn(`Payment failed for customer ${invoice.customer}, invoice ${invoice.id}`);
        break;
      }

      default:
        // Unhandled event type — ignore
        break;
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook processing error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}

export default router;
